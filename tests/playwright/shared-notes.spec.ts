import { test, expect } from '@playwright/test'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { lookup as mimeLookup } from 'mime-types'

const FIXTURE = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/triangle.gltf'), 'utf8')
const FILE_ID = 4242

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="requesttoken" content="test-token"></head>
<body><div id="threedviewer" style="height:100vh"></div>
<script>
  window.OCA = { Viewer: { handlers: {}, registerHandler(h) { this.handlers[h.id || 'threedviewer'] = h }, open() {} } };
  window.OC = { webroot: '', appswebroots: {}, filePath: (a, t, p) => '/' + String(p).replace(/^\\//, ''),
    linkTo: (a, f) => '/' + String(f).replace(/^\\//, ''), generateUrl: (u) => String(u), requestToken: 'test-token' };
  window.history.replaceState({}, '', '?fileId=${FILE_ID}&filename=triangle.gltf');
</script>
<script type="module" src="/js/threedviewer-main.mjs"></script></body></html>`

let server: http.Server
let baseURL: string

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0]
    if (urlPath === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(HTML)
      return
    }
    const filePath = path.join(process.cwd(), urlPath.replace(/^\//, ''))
    if (filePath.startsWith(process.cwd()) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': String(mimeLookup(path.extname(filePath)) || 'application/octet-stream') })
      fs.createReadStream(filePath).pipe(res)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const addr = server.address()
  baseURL = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

test.afterAll(() => server?.close())

async function mockBackend(page, notesBody: object) {
  const seen = { notesGets: 0, writes: 0 }
  await page.route(`**/apps/threedviewer/api/file/${FILE_ID}**`, route => route.fulfill({
    status: 200,
    body: FIXTURE,
    headers: { 'Content-Type': 'model/gltf+json', 'Content-Disposition': 'inline; filename="triangle.gltf"' },
  }))
  await page.route(`**/apps/threedviewer/api/notes/${FILE_ID}**`, route => {
    if (route.request().method() === 'GET') {
      seen.notesGets++
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notesBody) })
    }
    seen.writes++
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 999, author: null }) })
  })
  return seen
}

async function openAnnotationPanel(page) {
  await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 20000 })
  await page.getByRole('button', { name: /tools/i }).first().click()
  await page.getByRole('button', { name: /^Annotation/ }).first().click()
  await expect(page.locator('.annotation-overlay')).toBeVisible()
}

test('shared notes appear on load, with their author', async ({ page }) => {
  const seen = await mockBackend(page, {
    canEdit: true,
    notes: [{ id: 1, type: 'annotation', payload: { space: 'model', point: { x: 0, y: 0, z: 0 }, text: 'Check this hole' }, author: { uid: 'bob', displayName: 'Bob' }, createdAt: 1, updatedAt: 1 }],
    private: [],
  })
  await page.goto(baseURL + '/')
  await openAnnotationPanel(page)

  await expect(page.locator('.annotation-text-input').first()).toHaveValue('Check this hole')
  await expect(page.locator('.annotation-overlay')).toContainText('Bob')
  expect(seen.notesGets).toBe(1)
  expect(seen.writes).toBe(0)
})

test('view-only: adding is disabled and notes are read-only', async ({ page }) => {
  await mockBackend(page, {
    canEdit: false,
    notes: [{ id: 1, type: 'annotation', payload: { space: 'model', point: { x: 0, y: 0, z: 0 }, text: 'Shared' }, author: null, createdAt: 1, updatedAt: 1 }],
    private: [],
  })
  await page.goto(baseURL + '/')
  await openAnnotationPanel(page)

  await expect(page.locator('.annotation-overlay')).toContainText('view-only')
  await expect(page.locator('.annotation-text-input').first()).toHaveAttribute('readonly', '')
  await expect(page.locator('.annotation-overlay .canvas-panel-delete')).toHaveCount(0)
})
