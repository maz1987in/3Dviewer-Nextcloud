import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import http from 'http'
import { lookup as mimeLookup } from 'mime-types'
// Capture browser console and page errors to help diagnose mount failures
test.beforeEach(async ({ page }) => {
  // Ensure Nextcloud globals exist before any module executes
  await page.addInitScript(() => {
    // Minimal OCA.Viewer stub
    window.OCA = window.OCA || {}
    window.OCA.Viewer = window.OCA.Viewer || {
      handlers: {},
      registerHandler: function (h) { this.handlers[h.id || 'threedviewer'] = h },
      open: function () {}
    }
    // Minimal OC.filePath resolver for assets
    window.OC = window.OC || {}
    window.OC.filePath = function (app, type, p) { return '/' + String(p).replace(/^\//, '') }
    // Basic Nextcloud environment shims used by router/initial-state
    window.settings = window.settings || {}
    window._oc_capabilities = window._oc_capabilities || {}
    window.OC.webroot = window.OC.webroot || ''
    window.OC.appswebroots = window.OC.appswebroots || {}
    window.OC.linkTo = window.OC.linkTo || function (app, file) { return '/' + String(file).replace(/^\//, '') }
    window.OC.generateUrl = window.OC.generateUrl || function (url) { return String(url) }
  })
  page.on('console', (msg) => {
    // Log only text to keep output concise
    console.log('PAGE:', msg.text())
  })
  page.on('pageerror', (err) => {
    console.error('PAGE ERROR:', err)
  })
})

// Serve a minimal HTML via data URL that loads the built bundle.
// We mock the OCS file endpoint to return our tiny triangle.gltf fixture.

function buildHtml() {
  const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/triangle.gltf')
  const fixtureContent = fs.readFileSync(fixturePath, 'utf8')
  return `<!DOCTYPE html><html><head><meta charset='utf-8'><title>Viewer Smoke</title><style>html, body { height: 100%; margin: 0; padding: 0; }</style></head>
  <body>
  <div id="threedviewer" style="height: 100vh;"></div>
  <script>
  const FIXTURE = ${JSON.stringify(fixtureContent)};
  const blob = new Blob([FIXTURE], { type: 'model/gltf+json' });
  const buffer = new TextEncoder().encode(FIXTURE);
  window.__TEST_FILE_ID = 12345;
  const origFetch = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    if (url.includes('/ocs/v2.php/apps/threedviewer/file/')) {
      return new Response(blob, { status: 200, headers: { 'Content-Length': String(buffer.length), 'Content-Disposition': 'inline; filename="triangle.gltf"' } });
    }
    return origFetch(url, opts);
  };
  window.history.replaceState({}, '', '?fileId=' + window.__TEST_FILE_ID);
  </script>
  <script>
  // Minimal Nextcloud OCA Viewer stub for smoke environment
  window.OCA = window.OCA || {};
  // Ensure global identifier OCA resolves in module scope
  var OCA = window.OCA;
  window.OCA.Viewer = window.OCA.Viewer || {
    handlers: {},
    registerHandler: function(h) { this.handlers[h.id || 'threedviewer'] = h; },
    open: function() {}
  };
  // Minimal Nextcloud OC filePath resolver for assets
  window.OC = window.OC || {};
  // Ensure global identifier OC resolves in module scope
  var OC = window.OC;
  window.OC.filePath = function(app, type, p) { return '/' + p.replace(/^\//, ''); };
  </script>
  <script type="module" src="/js/threedviewer-main.mjs"></script>
  </body></html>`
}

// The build output is expected at project root /js after `npm run build`.
// Write a temporary HTML file at project root so absolute /js path resolves.
const TEMP_HTML = path.resolve(process.cwd(), 'smoke-temp.html')

let server: http.Server;
let baseURL: string;

declare global {
  interface Window { __ABORTED?: boolean }
}

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const rawUrl = req.url || '/'
      const urlPath = rawUrl.split('?')[0]
      // Simulated slow streaming endpoint for abort test
      if (urlPath.startsWith('/ocs/v2.php/apps/threedviewer/file/777')) {
        const total = 400000; // 400 KB simulated
        const chunk = Buffer.alloc(8000, 'a') // 8 KB
        let sent = 0
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(total),
          'Content-Disposition': 'inline; filename="slow.glb"'
        })
        const interval = setInterval(() => {
          if (sent >= total) { clearInterval(interval); res.end(); return }
          res.write(chunk)
          sent += chunk.length
        }, 50)
        req.on('close', () => { clearInterval(interval) })
        return
      }
      if (urlPath === '/' || urlPath === '/smoke-temp.html') {
        const html = fs.readFileSync(TEMP_HTML, 'utf8')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
        return
      }
      const filePath = path.join(process.cwd(), urlPath.replace(/^\//, ''))
      if (!filePath.startsWith(process.cwd())) { res.writeHead(403); res.end(); return }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const mime = (mimeLookup(path.extname(filePath)) || 'application/octet-stream').toString()
        res.writeHead(200, { 'Content-Type': mime })
        fs.createReadStream(filePath).pipe(res)
      } else {
        res.writeHead(404); res.end('Not found')
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr !== 'string') {
        baseURL = `http://127.0.0.1:${addr.port}`
      } else {
        baseURL = 'http://127.0.0.1'
      }
      resolve(baseURL)
    })
  })
}

test.beforeAll(async () => {
  fs.writeFileSync(TEMP_HTML, buildHtml(), 'utf8')
  await startServer()
})

test.afterAll(() => {
  if (server) server.close()
  if (fs.existsSync(TEMP_HTML)) fs.unlinkSync(TEMP_HTML)
})

test('canvas mounts & model loads', async ({ page }) => {
  await page.goto(baseURL + '/smoke-temp.html')
  await page.waitForSelector('canvas', { timeout: 10000 })
  await page.waitForTimeout(300) // allow parse
  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length)
  expect(canvasCount).toBeGreaterThan(0)
})

// DRACO fixture test (only meaningful if decoder assets copied during build)
test('draco gltf loads when decoder present (soft)', async ({ page }) => {
  // If decoder wasm absent, skip softly
  const dracoWasmPath = path.resolve(process.cwd(), 'draco', 'draco_decoder.wasm')
  if (!fs.existsSync(dracoWasmPath)) test.skip()
  const dracoFixture = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/triangle-draco.gltf'), 'utf8')
  const html = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>DRACO Test</title><style>html, body { height: 100%; margin: 0; padding: 0; }</style></head><body><div id="threedviewer" style="height: 100vh;"></div>
  <script>
  const FIXTURE = ${JSON.stringify(dracoFixture)};
  const blob = new Blob([FIXTURE], { type: 'model/gltf+json' });
  const buffer = new TextEncoder().encode(FIXTURE);
  window.__TEST_FILE_ID = 54321;
  const origFetch = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    if (url.includes('/ocs/v2.php/apps/threedviewer/file/')) {
      return new Response(blob, { status: 200, headers: { 'Content-Length': String(buffer.length), 'Content-Disposition': 'inline; filename="triangle-draco.gltf"' } });
    }
    return origFetch(url, opts);
  };
  window.history.replaceState({}, '', '?fileId=' + window.__TEST_FILE_ID);
  </script>
  <script>
  // Minimal Nextcloud OCA Viewer stub for smoke environment
  window.OCA = window.OCA || {};
  var OCA = window.OCA;
  window.OCA.Viewer = window.OCA.Viewer || {
    handlers: {},
    registerHandler: function(h) { this.handlers[h.id || 'threedviewer'] = h; },
    open: function() {}
  };
  // Minimal Nextcloud OC filePath resolver for assets
  window.OC = window.OC || {};
  var OC = window.OC;
  window.OC.filePath = function(app, type, p) { return '/' + p.replace(/^\//, ''); };
  </script>
  <script type="module" src="/js/threedviewer-main.mjs"></script></body></html>`
  fs.writeFileSync(TEMP_HTML, html, 'utf8')
  await page.goto(baseURL + '/smoke-temp.html')
  await page.waitForSelector('canvas', { timeout: 10000 })
  // Allow extra time for dynamic DRACO + glTF parse
  await page.waitForTimeout(600)
  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length)
  expect(canvasCount).toBeGreaterThan(0)
})

// Abort test: simulate slow fetch and cancel

test('abort cancels load (stable)', async ({ page }) => {
  const html = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>Abort Test</title><style>html, body { height: 100%; margin: 0; padding: 0; }</style></head><body><div id="threedviewer" style="height: 100vh;"></div>
  <script>
  window.__TEST_FILE_ID = 777;
  window.__ABORTED = false;
  window.__LOAD_STARTED = false;
  document.addEventListener('threedviewer:load-start', () => { window.__LOAD_STARTED = true; });
  document.addEventListener('threedviewer:model-aborted', () => { window.__ABORTED = true; });
  window.history.replaceState({}, '', '?fileId=' + window.__TEST_FILE_ID);
  </script>
  <script>
  // Minimal Nextcloud OCA Viewer stub for smoke environment
  window.OCA = window.OCA || {};
  var OCA = window.OCA;
  window.OCA.Viewer = window.OCA.Viewer || {
    handlers: {},
    registerHandler: function(h) { this.handlers[h.id || 'threedviewer'] = h; },
    open: function() {}
  };
  // Minimal Nextcloud OC filePath resolver for assets
  window.OC = window.OC || {};
  var OC = window.OC;
  window.OC.filePath = function(app, type, p) { return '/' + p.replace(/^\//, ''); };
  </script>
  <script type="module" src="/js/threedviewer-main.mjs"></script></body></html>`
  fs.writeFileSync(TEMP_HTML, html, 'utf8')
  await page.goto(baseURL + '/smoke-temp.html')
  await page.waitForSelector('#threedviewer', { timeout: 8000 })
  // Wait for component and load-start event bubbling to document
  await page.waitForFunction(() => (window as any).__LOAD_STARTED === true, { timeout: 8000 })
  // Cancel shortly after start to ensure some chunks still pending
  await page.evaluate(() => { (window as any).__THREEDVIEWER_VIEWER.cancelLoad() })
  await page.waitForFunction(() => (window as any).__ABORTED === true, { timeout: 8000 })
  const aborted = await page.evaluate(() => (window as any).__ABORTED)
  expect(aborted).toBe(true)
})

// Retry-after-cancel test: start a slow load, cancel it, then call retryLoad().
// The second fetch is intercepted by page.route() and served the fixture, so the
// retry succeeds and the viewer reports __LOAD_COMPLETE. This verifies that the
// retry path correctly re-runs loadModel after an abort left state dirty.
test('retry succeeds after user cancel', async ({ page }) => {
  const triangleFixture = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/triangle.gltf'), 'utf8')

  let fetchCallCount = 0
  // Match both primary (/apps/threedviewer/api/file/N) and fallback
  // (/ocs/v2.php/apps/threedviewer/api/file/N) URLs that the loader tries.
  await page.route(/\/apps\/threedviewer\/api\/file\/4242(\?.*)?$/, async (route) => {
    fetchCallCount++
    if (fetchCallCount === 1) {
      // First call: hang forever. The test will cancel mid-flight.
      // Playwright leaves the request pending until the page navigates or aborts.
      return
    }
    // Retry: fulfill with the real fixture.
    await route.fulfill({
      status: 200,
      contentType: 'model/gltf+json',
      headers: {
        'Content-Length': String(triangleFixture.length),
        'Content-Disposition': 'inline; filename="triangle.gltf"',
      },
      body: triangleFixture,
    })
  })

  const html = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>Retry Test</title><style>html, body { height: 100%; margin: 0; padding: 0; }</style></head><body><div id="threedviewer" style="height: 100vh;"></div>
  <script>
  window.__TEST_FILE_ID = 4242;
  window.history.replaceState({}, '', '?fileId=' + window.__TEST_FILE_ID);
  window.OCA = window.OCA || {}; var OCA = window.OCA;
  window.OCA.Viewer = window.OCA.Viewer || { handlers: {}, registerHandler: function(h) { this.handlers[h.id || 'threedviewer'] = h; }, open: function() {} };
  window.OC = window.OC || {}; var OC = window.OC;
  window.OC.filePath = function(app, type, p) { return '/' + p.replace(/^\\//, ''); };
  </script>
  <script type="module" src="/js/threedviewer-main.mjs"></script></body></html>`
  fs.writeFileSync(TEMP_HTML, html, 'utf8')
  await page.goto(baseURL + '/smoke-temp.html')
  await page.waitForSelector('#threedviewer', { timeout: 8000 })
  await page.waitForFunction(() => (window as any).__LOAD_STARTED === true, { timeout: 8000 })

  // Cancel the first (hanging) fetch.
  await page.evaluate(() => { (window as any).__THREEDVIEWER_VIEWER.cancelLoad() })
  await page.waitForFunction(() => (window as any).__ABORTED === true, { timeout: 8000 })

  // Retry — the second fetch should go through and succeed.
  await page.evaluate(() => { (window as any).__THREEDVIEWER_VIEWER.retryLoad() })
  await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, { timeout: 10000 })

  expect(fetchCallCount).toBeGreaterThanOrEqual(2)
  const complete = await page.evaluate(() => (window as any).__LOAD_COMPLETE)
  expect(complete).toBe(true)
})

// Network-drop test: Playwright aborts the fetch at the network layer so the
// viewer's fetch() rejects with a network error. The loader's error handler
// should set window.__LOAD_ERROR rather than __LOAD_COMPLETE or __ABORTED
// (which is reserved for user-initiated cancellations).
test('network drop surfaces a load error', async ({ page }) => {
  // Intercept both primary and fallback paths so the loader can't recover via the fallback.
  await page.route(/\/apps\/threedviewer\/api\/file\/9999(\?.*)?$/, async (route) => {
    await route.abort('failed')
  })

  const html = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>Network Drop Test</title><style>html, body { height: 100%; margin: 0; padding: 0; }</style></head><body><div id="threedviewer" style="height: 100vh;"></div>
  <script>
  window.__TEST_FILE_ID = 9999;
  window.history.replaceState({}, '', '?fileId=' + window.__TEST_FILE_ID);
  window.OCA = window.OCA || {}; var OCA = window.OCA;
  window.OCA.Viewer = window.OCA.Viewer || { handlers: {}, registerHandler: function(h) { this.handlers[h.id || 'threedviewer'] = h; }, open: function() {} };
  window.OC = window.OC || {}; var OC = window.OC;
  window.OC.filePath = function(app, type, p) { return '/' + p.replace(/^\\//, ''); };
  </script>
  <script type="module" src="/js/threedviewer-main.mjs"></script></body></html>`
  fs.writeFileSync(TEMP_HTML, html, 'utf8')
  await page.goto(baseURL + '/smoke-temp.html')
  await page.waitForSelector('#threedviewer', { timeout: 8000 })

  // Either __LOAD_ERROR becomes truthy, or the error path didn't fire (test fails).
  await page.waitForFunction(() => typeof (window as any).__LOAD_ERROR === 'string' && (window as any).__LOAD_ERROR.length > 0, { timeout: 10000 })

  const errorMessage = await page.evaluate(() => (window as any).__LOAD_ERROR)
  expect(errorMessage).toBeTruthy()

  // Must NOT be treated as a user cancellation.
  const aborted = await page.evaluate(() => (window as any).__ABORTED === true)
  expect(aborted).toBe(false)
  // Must NOT report a successful load.
  const complete = await page.evaluate(() => (window as any).__LOAD_COMPLETE === true)
  expect(complete).toBe(false)
})
