import { test, expect } from '@playwright/test'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/*
 * A model that names a texture none of its companions match makes no request for it in
 * the viewer. Its URL used to reach the browser as written: an `https://` image, or a UNC
 * path that a browser reads as `http://host/…`, made the viewer's browser contact a host
 * of the model author's choosing, with only Nextcloud's Content Security Policy in the
 * way, and this page has none. The app's own API is answered here; every request to any
 * other origin is recorded and refused.
 */

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * A triangle as COLLADA, mapped with the image `texture` names.
 *
 * @param texture - What <init_from> names
 */
function texturedDae(texture: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><up_axis>Y_UP</up_axis></asset>
<library_images><image id="img"><init_from>${texture}</init_from></image></library_images>
<library_effects><effect id="fx"><profile_COMMON><newparam sid="surf"><surface type="2D"><init_from>img</init_from></surface></newparam><newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam><technique sid="common"><lambert><diffuse><texture texture="samp" texcoord="UV"/></diffuse></lambert></technique></profile_COMMON></effect></library_effects>
<library_materials><material id="mat"><instance_effect url="#fx"/></material></library_materials>
<library_geometries><geometry id="tri"><mesh>
<source id="pos"><float_array id="pos-a" count="9">0 0 0 1 0 0 1 1 0</float_array><technique_common><accessor source="#pos-a" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<source id="uv"><float_array id="uv-a" count="6">0 0 1 0 1 1</float_array><technique_common><accessor source="#uv-a" count="3" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>
<vertices id="v"><input semantic="POSITION" source="#pos"/></vertices>
<triangles count="1" material="m"><input semantic="VERTEX" source="#v" offset="0"/><input semantic="TEXCOORD" source="#uv" offset="0" set="0"/><p>0 1 2</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="s"><node id="n"><instance_geometry url="#tri"><bind_material><technique_common><instance_material symbol="m" target="#mat"><bind_vertex_input semantic="UV" input_semantic="TEXCOORD" input_set="0"/></instance_material></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene>
</COLLADA>
`
}

/** The viewer, opened on file 42, room.dae in /scenes. */
function harness(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Viewer</title>
<link rel="stylesheet" href="/css/threedviewer-main.css">
<style>html, body, #content, #threedviewer { margin: 0; width: 100%; height: 100%; }</style>
</head><body>
<div id="content"><div id="threedviewer" data-file-id="42" data-filename="room.dae" data-dir="/scenes"></div></div>
<script>
  window.t = (_app, s) => s
  window.n = (_app, s) => s
  window.OC = { config: { version: 'test' }, filePath: (_app, type, file) => '/' + (type ? type + '/' : '') + file }
  window.OCA = {}
  window.OCP = {}
  window._oc_config = { session_lifetime: 0 }
  window._oc_webroot = ''
</script>
<!-- Mounts the viewer on #threedviewer, as the app's own page does -->
<script type="module" src="/js/threedviewer-main.mjs"></script>
</body></html>`
}

function startServer(model: { body: string }): Promise<{ origin: string, close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://localhost')
      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(harness())
        return
      }
      if (url.pathname.endsWith('/apps/threedviewer/api/file/42')) {
        res.writeHead(200, { 'Content-Type': 'model/vnd.collada+xml' })
        res.end(model.body)
        return
      }
      if (url.pathname.endsWith('/apps/threedviewer/api/files/list')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ files: [], folders: [] }))
        return
      }
      if (url.pathname.startsWith('/index.php') || url.pathname.startsWith('/ocs')) {
        // Any other API: nothing there, as for a file with no notes and no thumbnail
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end('{}')
        return
      }
      const filePath = path.join(PROJECT_ROOT, url.pathname.slice(1))
      if (!filePath.startsWith(PROJECT_ROOT)) {
        res.writeHead(403)
        res.end()
        return
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404)
          res.end()
          return
        }
        const ext = path.extname(filePath)
        res.writeHead(200, {
          'Content-Type': ext === '.css' ? 'text/css' : (ext === '.mjs' || ext === '.js' ? 'application/javascript' : 'application/octet-stream'),
        })
        res.end(data)
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise(r => server.close(() => r())) })
    })
  })
}

test.describe('a DAE texture none of the companions match, in the viewer', () => {
  const model = { body: '' }
  let server: { origin: string, close: () => Promise<void> }

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(PROJECT_ROOT, 'js', 'threedviewer-main.mjs'))) {
      throw new Error('Run `npm run build` first: js/threedviewer-main.mjs is missing')
    }
    server = await startServer(model)
  })

  test.afterAll(async () => {
    await server?.close()
  })

  for (const [label, texture, host] of [
    ['a remote URL', 'https://example.invalid/remote.png', 'example.invalid'],
    ['a UNC path', '\\\\evil-host\\share\\remote.png', 'evil-host'],
  ]) {
    test(`makes no request for ${label}`, async ({ page }) => {
      test.setTimeout(60000)
      model.body = texturedDae(texture)
      const elsewhere: string[] = []
      const requested: string[] = []
      await page.context().route(() => true, (route) => {
        const url = route.request().url()
        requested.push(url)
        if (!url.startsWith(server.origin)) {
          elsewhere.push(url)
          return route.abort()
        }
        return route.continue()
      })

      await page.goto(server.origin + '/')
      // The model was fetched and the viewer has drawn it
      await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 45000 })
      // Give a texture request that would follow the load the time to be made
      await page.waitForTimeout(1000)

      expect(requested.some(url => url.endsWith('/apps/threedviewer/api/file/42'))).toBe(true)
      expect(elsewhere).toEqual([])
      expect(requested.filter(url => url.includes(host))).toEqual([])
      expect(requested.filter(url => url.includes('remote.png'))).toEqual([])
    })
  }
})
