import { test, expect } from '@playwright/test'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// This is a placeholder test. A true integration would require a running Nextcloud server.
// For now we simply verify the built bundle can be loaded in a blank HTML shell and the Vue root mounts.
// Future work: spin up a minimal PHP built-in server pointing to templates/index.php with proper env.

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Workspace root (where js/ directory lives) is two levels up from test file (tests/playwright)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

function startStaticServer(): Promise<{url: string, close: () => Promise<void>}> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url || '/'
      if (reqPath === '/') {
        // serve test harness html
        const html = buildHtmlWrapper()
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
        return
      }
      // prevent query strings
      reqPath = reqPath.split('?')[0]
      const filePath = path.join(PROJECT_ROOT, reqPath.startsWith('/') ? reqPath.slice(1) : reqPath)
      // eslint-disable-next-line no-console
      console.log('[server] request', reqPath, '->', filePath)
      if (!filePath.startsWith(PROJECT_ROOT)) {
        res.writeHead(403); res.end('Forbidden'); return
      }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return }
        const ext = path.extname(filePath)
        const ctype = ext === '.css' ? 'text/css' : (ext === '.mjs' || ext === '.js' ? 'application/javascript' : 'application/octet-stream')
        res.writeHead(200, { 'Content-Type': ctype })
        res.end(data)
      })
    })
    server.listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        resolve({ url: `http://127.0.0.1:${addr.port}/`, close: () => new Promise(r => server.close(() => r())) })
      } else {
        reject(new Error('No address'))
      }
    })
  })
}

function buildHtmlWrapper() {
  const mainScript = '/js/threedviewer-main.mjs'
  return `<!doctype html><html><head><meta charset="utf-8"><title>Viewer Test</title></head><body>
  <!-- Simulated minimal Nextcloud layout -->
  <div id="body-user">
    <div id="content">
      <div id="app-content">
        <div id="threedviewer" style="width:600px;height:400px;"></div>
      </div>
    </div>
  </div>
  <script>\n// Minimal global translation shims expected by bundle\nwindow.t = function(_app, s, vars){ if(vars){ for(const k in vars){ s = s.replace('{' + k + '}', vars[k]); } } return s; };\nwindow.n = function(_app, s, n){ return n + ' ' + s; };\n</script>
  <script>
    // Add enhanced diagnostics and mount instrumentation
    // Inject BEFORE loading the main script
    // NOTE: This code is injected by the test harness for diagnostics; it should not be needed in production.
    // Stub out minimal Nextcloud-like globals to avoid reference errors
    window.OC = window.OC || { config: { version: 'test' } }
    window.OCA = window.OCA || {}
    window.OCP = window.OCP || {}
    window._oc_config = window._oc_config || { session_lifetime: 0 }
    window.__NEXTCLOUD__ = { testing: { mount: { enabled: true, id: 'threedviewer', log: console.log.bind(console, '[mount]') } } }
    ;(function(){
      const origLog = console.log;
      console.log = function(...args){ origLog.apply(this, ['[console]', ...args]) }
      const origError = console.error;
      console.error = function(...args){ origError.apply(this, ['[console.error]', ...args]) }
    })();
    window.addEventListener('error', (ev) => { console.error('[global error]', ev.error || ev.message || ev); }, true)
    window.addEventListener('unhandledrejection', (ev) => { console.error('[global promise rejection]', ev.reason); }, true)
    // Monkeypatch Vue mount if/when Vue prototype becomes available
    Object.defineProperty(window, '__mountPatched', { value: false, writable: true })
    const patchInterval = setInterval(() => {
      if (window.__mountPatched) return;
      const VueGlobal = window.Vue || (window.__VUE_DEVTOOLS_GLOBAL_HOOK__ && window.__VUE_DEVTOOLS_GLOBAL_HOOK__.Vue);
      if (VueGlobal && VueGlobal.prototype && VueGlobal.prototype.$mount) {
        const orig = VueGlobal.prototype.$mount;
        VueGlobal.prototype.$mount = function(sel){
          console.log('[mount] about to mount selector', sel)
            ;(function(){ try { const el = document.querySelector(sel); if(el){ console.log('[mount] pre children', el.childNodes.length) } } catch(e){} })();
          const r = orig.call(this, sel)
          try {
            const el = document.querySelector(sel)
            if (el) {
              console.log('[mount] post innerHTML length', el.innerHTML.length)
              console.log('[mount] post childElementCount', el.childElementCount)
              console.log('[mount] post child node types', Array.from(el.childNodes).map(n=>n.nodeType))
            } else {
              console.log('[mount] selector not found after mount')
            }
          } catch(e){ console.error('[mount patch error]', e) }
          window.__mountPatched = true
          return r
        }
        clearInterval(patchInterval)
        console.log('[mount] Vue $mount patched for diagnostics')
      }
    }, 50);
    // Dynamically import main bundle so we can catch errors
    window.__THREEDVIEWER_NO_AUTOMOUNT = true
    ;(async () => {
      try {
        console.log('[loader] importing bundle...')
        const mod = await import('${mainScript}')
        console.log('[loader] bundle imported keys', Object.keys(mod))
        let bootstrapFn = null
        if ('bootstrapViewer' in mod) {
          bootstrapFn = mod.bootstrapViewer
        } else if (window.ThreedViewer && typeof window.ThreedViewer.bootstrapViewer === 'function') {
          console.log('[loader] using global window.ThreedViewer.bootstrapViewer')
          bootstrapFn = window.ThreedViewer.bootstrapViewer
        } else {
          console.error('[loader] bootstrapViewer not exported (esm or global)')
        }
        if (bootstrapFn) {
          await Promise.resolve(bootstrapFn('#threedviewer'))
        }
      } catch (e) {
        console.error('[loader] dynamic import failed', e)
      }
    })()
    // Light probe for viewer wrapper existence
    setInterval(() => {
      const wrapper = document.getElementById('viewer-wrapper')
      console.log('[probe] wrapper?', !!wrapper, 'canvas?', !!document.querySelector('#viewer-wrapper canvas'))
    }, 1000)
   </script>
  </body></html>`
}

// Note: Avoid using __dirname (ESM) until needed; fixtures not yet required.

// Minimal OBJ+MTL pair inline (cube) to simulate parsing path.
const OBJ_CONTENT = `mtllib cube.mtl\no cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nusemtl Blue\nf 1 2 3 4\nusemtl Red\nf 5 6 7 8\n`
const MTL_CONTENT = `newmtl Blue\nKd 0 0 1\nnewmtl Red\nKd 1 0 0\n`

// We cannot invoke backend streaming here; future enhancement will mock or serve endpoints.
// Current test just ensures the application script executes without runtime error mounting the app root.

test.describe('Viewer smoke', () => {
  let server: {url: string, close: () => Promise<void>}
  test.beforeAll(async () => {
    server = await startStaticServer()
  })
  test.afterAll(async () => {
    await server.close()
  })
  test('mounts Vue root', async ({ page }) => {
    page.on('console', msg => {
      // Echo browser console to test runner for debugging
      // eslint-disable-next-line no-console
      console.log('[browser]', msg.type(), msg.text())
    })
    page.on('pageerror', err => {
      // eslint-disable-next-line no-console
      console.error('[pageerror]', err?.message, err)
    })
    // Install a mutation observer early to help debug why children might not appear
    await page.addInitScript(() => {
      const target = document.getElementById('threedviewer')
      if (target) {
        const obs = new MutationObserver(muts => {
          // @ts-ignore
          console.log('[observer] mutations', muts.map(m => ({ added: m.addedNodes.length, removed: m.removedNodes.length })))
        })
        obs.observe(target, { childList: true, subtree: true })
        // @ts-ignore
        window.__viewerObserver = obs
      }
    })
    await page.goto(server.url)
  // Wait for Vue root mount or canvas creation
    try {
    await page.waitForFunction(() => !!document.querySelector('#threedviewer') && (document.querySelector('#viewer-wrapper canvas') || document.querySelector('#threedviewer canvas')), { timeout: 20000 })
    } catch (e) {
      // Dump diagnostics before failing
      const html = await page.evaluate(() => {
        const el = document.getElementById('threedviewer')
        return el ? {innerHTML: el.innerHTML, childTypes: Array.from(el.childNodes).map(n=>n.nodeType)} : null
      })
      // eslint-disable-next-line no-console
      console.error('Mount wait failed. Diagnostics:', html)
      throw e
    }
  // Ensure a canvas eventually appears (viewer component mounted)
  const canvas = page.locator('canvas')
  await expect(canvas.first()).toBeVisible({ timeout: 5000 })
  })
})
