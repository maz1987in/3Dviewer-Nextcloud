import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distJs = path.resolve(__dirname, '../../js/threedviewer-main.mjs')

function inlineDist() {
  if (!fs.existsSync(distJs)) {
    test.skip(true, 'Built bundle not found; run npm run build first')
  }
  return fs.readFileSync(distJs, 'utf8')
}

// Minimal triangle glTF (same as fixture) used for mock fetch response
const triangleGltf = `{"asset":{"version":"2.0"},"buffers":[{"uri":"data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAA","byteLength":36}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36,"target":34962}],"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3","max":[1,1,0],"min":[0,0,0]}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"mode":4}]}],"nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],"scene":0}`

test.describe('ThreeDViewer basic mount', () => {
  test.fixme(true, 'Canvas detection under data URL harness is flaky; covered by other smoke tests')
  test('mounts canvas and loads mocked model successfully', async ({ page }) => {
    const bundle = inlineDist()
  const html = `<!DOCTYPE html><html><head><meta charset=\"utf-8\" />
    <base href=\"/\" />
    <title>Viewer Test</title></head><body>
    <div id=\"threedviewer\"></div>
    <script>window.__THREEDVIEWER_NO_AUTOMOUNT=true;</script>
    <script type=module>
      // Mock OCS fetch for model load
      const triangleGltf = ${JSON.stringify(triangleGltf)};
      const origFetch = window.fetch;
      window.fetch = (url, opts={}) => {
        if (String(url).includes('/ocs/')) {
          const headers = { 'Content-Length': String(triangleGltf.length), 'Content-Disposition': 'attachment; filename=triangle.gltf' };
          return Promise.resolve(new Response(new Blob([triangleGltf]), { status: 200, headers }));
        }
        return origFetch(url, opts);
      };
    </script>
    <script type=module src=\"/js/threedviewer-main.mjs\"></script>
    <script type=module>
      // Attempt bootstrap using global namespace attached in main.js
      (function boot(){
        if (window.ThreedViewer && window.ThreedViewer.bootstrapViewer) {
          try { window.__viewerRoot = window.ThreedViewer.bootstrapViewer(); } catch(e){ console.error('Bootstrap error', e); }
        } else if (window.bootstrapViewer) { // fall back if future code exposes directly
          try { window.__viewerRoot = window.bootstrapViewer(); } catch(e){ console.error('Bootstrap error', e); }
        } else {
          console.warn('bootstrapViewer not yet available, retrying...');
          setTimeout(boot, 10);
        }
      })();
    </script>
    </body></html>`

    await page.goto('data:text/html;base64,' + Buffer.from(html).toString('base64'))
    await page.waitForSelector('#threedviewer', { state: 'attached' })

    // Wait for canvas to appear (basic mount validation)
    await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 10000 })
    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length)
    expect(canvasCount).toBeGreaterThan(0)
  })
})
