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
  test('mounts canvas and loads mocked model successfully', async ({ page }) => {
    const bundle = inlineDist()
    const html = `<!DOCTYPE html><html><head><meta charset=\"utf-8\" />
    <title>Viewer Test</title></head><body>
    <div id=\"threedviewer\"></div>
    <script>window.__THREEDVIEWER_NO_AUTOMOUNT=true;</script>
    <script type=module>${bundle}\n;(function(){const origFetch=window.fetch;window.fetch=(url,opts={})=>{if(String(url).includes('/ocs/')){const headers={ 'Content-Length': String(triangleGltf.length), 'Content-Disposition': 'attachment; filename=triangle.gltf' };return Promise.resolve(new Response(new Blob([triangleGltf]),{status:200,headers}));}return origFetch(url,opts)};})();</script>
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

    // Wait for Vue root to mount and canvas element to appear
    await page.waitForFunction(() => {
      const rootEl = document.querySelector('#threedviewer')
      if (!rootEl || !rootEl.__vue__) return false
      return !!document.querySelector('canvas')
    }, { timeout: 5000 })

    // Now set a fileId to trigger mocked model load and wait for model-loaded emission
    await page.evaluate(() => {
      const rootEl = document.querySelector('#threedviewer')
      const vm = rootEl && rootEl.__vue__
      if (vm) {
        window.__modelLoaded = false
        vm.$on && vm.$on('model-loaded', () => { window.__modelLoaded = true })
        vm.fileId = 123
      }
    })

    await page.waitForFunction(() => window.__modelLoaded === true, { timeout: 5000 })
    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length)
    expect(canvasCount).toBeGreaterThan(0)
  })
})
