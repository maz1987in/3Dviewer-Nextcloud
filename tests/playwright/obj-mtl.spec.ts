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
  return `<!doctype html><html><head><meta charset="utf-8"><title>Viewer Test</title>
  <!-- templates/index.php adds this with Util::addStyle. The module loader injects the
       CSS of the chunks it imports but not the entry's, so without this link the design
       system's token layer never arrives and every measurement below is of an unstyled
       page that still mounts and still passes. -->
  <link rel="stylesheet" href="/css/threedviewer-main.css">
  <style>
    /*
     * Nextcloud's page header, and a viewer that fills what is left. Both matter to what
     * this file measures: the viewer's floating panels are positioned in viewport
     * coordinates and have to clear this header, so a fixture without it cannot see a
     * panel drawn across the top bar — which is a defect this suite had already been
     * passing over. #header is also the element the viewer itself measures when placing
     * its overlays.
     */
    html, body { margin: 0; height: 100%; }
    #header { height: 50px; background: #0082c9; }
    #content { position: relative; height: calc(100% - 50px); }
    #threedviewer { position: absolute; inset: 0; }

    /*
     * The button rules Nextcloud's server stylesheet applies to every page, trimmed to
     * their button arms. Without them this fixture measures an app that has the page to
     * itself, which no user ever sees — and the states are exactly where that difference
     * shows: Nextcloud styles hover, focus and active at a specificity a plain class does
     * not beat, so a control can look right at rest and be unreadable while in use.
     */
    button:not(.button-vue, [class^="vs__"]) {
      width: auto;
      min-height: var(--default-clickable-area, 34px);
      padding: 8px 12px;
      box-sizing: border-box;
      /* Both from core/css/inputs.css, and both were missing here. They are what turns a
         segmented control into three rounded chips floating inside their own track: every
         button on a Nextcloud page carries a radius and a 3px margin on three sides. A
         fixture without them renders the control the way the design mockup does and the
         way the instance never will. */
      border-radius: var(--border-radius, 8px);
      margin: 3px;
      margin-inline-start: 0;
      /* The instance's pale primary tint, which is what Nextcloud actually paints a button
         at rest — not the page background this fixture named for a while. */
      background-color: var(--color-primary-element-light, #e5eff5);
      color: var(--color-primary-element-light-text, #00293f);
      border: none;
    }
    button:not(.button-vue, [class^="vs__"]):hover,
    button:not(.button-vue, [class^="vs__"]):focus {
      background-color: var(--color-primary-element-light-hover, #d8eaf5);
    }
    button:not(.button-vue, [class^="vs__"]):not(:disabled, .primary):not(.app-navigation-entry-button):active {
      background-color: var(--color-main-background, #fff);
      color: var(--color-main-text, #222);
    }
  </style>
  </head><body>
  <!-- Simulated minimal Nextcloud layout -->
  <div id="body-user">
    <div id="header"></div>
    <div id="content">
      <div id="app-content">
        <div id="threedviewer"></div>
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
    // The Nextcloud vite config resolves every dynamic chunk through OC.filePath, so
    // without it the bundle's first import throws and nothing mounts — which is what
    // this spec was reporting as a mount failure. The static server serves the project
    // root, and \`type\` is empty for chunks, so the file path is the URL.
    window.OC.filePath = window.OC.filePath || function (_app, type, file) {
      return '/' + (type ? type + '/' : '') + file
    }
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
    // Monitor Vue 3 app mount via __THREEDVIEWER_APP global
    Object.defineProperty(window, '__mountPatched', { value: false, writable: true })
    const patchInterval = setInterval(() => {
      if (window.__mountPatched) return;
      if (window.__THREEDVIEWER_APP) {
        console.log('[mount] Vue 3 app instance detected')
        const el = document.getElementById('threedviewer')
        if (el) {
          console.log('[mount] post childElementCount', el.childElementCount)
          console.log('[mount] post child node types', Array.from(el.childNodes).map(n=>n.nodeType))
        }
        window.__mountPatched = true
        clearInterval(patchInterval)
        console.log('[mount] Vue 3 app mount detected for diagnostics')
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

  /*
   * Nothing in the top bar may be covered by another element.
   *
   * The tools panel floats over the viewer and is positioned in viewport coordinates, so
   * it has to clear both Nextcloud's header and the viewer's own bar. Clearing only the
   * first put the card over the right end of the bar — across the help button and the
   * Tools button itself, so the control that opens the panel sat underneath the panel and
   * the only way to close it was the Escape key.
   *
   * Nothing failed. Both elements rendered exactly as their own styles asked, at the
   * position their own styles asked for; the defect is entirely in the relationship
   * between them, which is the kind a test of either one alone cannot see.
   */
  test('no top bar control is covered by a floating panel', async ({ page }) => {
    await page.goto(server.url)
    await page.waitForSelector('.minimal-top-bar', { timeout: 20000 })
    /*
     * The bar exists, and reports sensible coordinates, before anything is painted there:
     * during mount the app's subtree is laid out but clipped, so every control hit-tests
     * as the page body. Waiting for the canvas is not enough — wait until the first
     * control is actually the thing at its own centre, which is the precondition this
     * assertion needs and a failure worth reporting on its own if it never arrives.
     */
    await page.waitForFunction(() => {
      const control = document.querySelector('.minimal-top-bar button')
      if (!control) return false
      const r = control.getBoundingClientRect()
      if (!r.width || !r.height) return false
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return !!hit && control.contains(hit)
    }, { timeout: 20000 })

    const covered = await page.evaluate(() => {
      const bar = document.querySelector('.minimal-top-bar')
      if (!bar) return ['no top bar']
      const controls = [...bar.querySelectorAll('button, label')]
      return controls.flatMap((control) => {
        const rect = control.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return []
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        if (hit && (hit === control || control.contains(hit))) return []
        const name = control.getAttribute('aria-label') || control.className
        const where = `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`
        const hitName = hit ? (typeof hit.className === 'string' && hit.className) || hit.tagName : 'nothing'
        return [`${name} at ${where} -> ${hitName}`]
      })
    })
    expect(covered).toEqual([])
  })

  /*
   * Every word in a floating panel has to be legible against what is behind it.
   *
   * The statistics panel was a dark overlay and became a light one, and three rules kept
   * their old colours through the change: the watertight badge, "No textures" and "+ N
   * more" were left as pale-on-pale or white-on-white. A section whose text is invisible
   * looks exactly like a section that rendered nothing, which is how it was reported — as
   * a blank gap, not as unreadable text.
   *
   * Checking the declared colours is what missed it the first time: each rule was fine in
   * isolation and wrong against the surface it ended up on. This asks the browser what
   * was actually painted, for every panel that floats on the canvas rather than only the
   * one that was reported.
   */
  /*
   * Each panel is checked in every palette the viewer can be in. The viewer's own theme
   * control now moves these surfaces as well as the scene, and a light palette is where a
   * colour left behind as a literal shows up — white-on-white is invisible in exactly the
   * theme it was written for and reviewed in.
   *
   * The palette is stamped rather than clicked through the control: what the control does
   * is settled in `themeSignal.test.js`, and what is at issue here is what gets painted
   * once a palette is in effect.
   */
  for (const theme of ['auto', 'light', 'dark'] as const) {
  for (const [label, open, selector, floats, painted] of [
    ['statistics', 'Model Statistics', '.model-stats-overlay', true, null],
    ['measurements', 'Measurement', '.measurement-overlay', true, null],
    ['annotations', 'Annotation', '.annotation-overlay', true, null],
    // Always on screen, so nothing to open. Its own root is transparent — the ring is the
    // surface, and the readout beside it is the text.
    ['controller', null, '.circular-controller', true, '.steer-ring'],
    // Not an overlay on the render but a dialog over the whole app, so it takes the theme
    // rather than the inverse of it — and it is here because it is the surface where a
    // half-converted palette last hid: a dark card that kept `#222` body text.
    ['slicer', 'Send to Slicer', '.slicer-modal', false, null],
  ] as const) {
  test(`every word in the ${label} panel is legible on the ${theme} palette`, async ({ page }) => {
    await page.goto(server.url)
    await page.waitForSelector('.minimal-top-bar', { timeout: 20000 })
    await page.waitForSelector('canvas', { timeout: 20000 })
    await page.click('[aria-label="Toggle tools panel"]')
    await page.waitForSelector('.slide-out-panel', { timeout: 5000 })
    if (!floats) {
      // Its row lives in a collapsed section.
      await page.getByText('Export', { exact: true }).first().click()
    }
    if (open) await page.getByText(open, { exact: true }).first().click()
    await page.waitForSelector(selector, { timeout: 5000 })
    if (theme !== 'auto') {
      // Both signals the app writes: the attribute that says a theme was chosen, and the
      // class that says what it resolved to. The panels key off the first, the canvas
      // chrome off the second.
      //
      // After the panel is open, not before: the app restores its stored preference during
      // startup, and on Auto that clears the attribute — a stamp applied earlier is wiped
      // by the app's own initialisation and the check silently measures the base palette.
      const stamp = async () => await page.evaluate((t) => {
        document.documentElement.setAttribute('data-tdv-theme', t)
        document.body.classList.remove('theme--light', 'theme--dark')
        document.body.classList.add(`theme--${t}`)
      }, theme)
      // Twice, with a beat between: the app restores its stored preference during startup,
      // and on Auto that clears both signals. A single stamp is a race — when it lost, the
      // check measured the base palette under the name of another one and passed.
      await stamp()
      await page.waitForTimeout(400)
      await stamp()
    }

    const unreadable = await page.evaluate((panelSelector) => {
      /*
       * `rgb(r, g, b)` and `rgba(...)` carry 0-255 channels; a `color-mix()` result comes
       * back from Chromium as `color(srgb 1 1 1 / 0.86)`, whose channels are 0-1. Reading
       * the numbers out and using them as they come makes an 86% white surface measure as
       * near-black, and every label on it "illegible" against a colour it is nowhere near.
       * The controller's ring and rail are the only color-mix surfaces in the app, which is
       * why this went unnoticed until they were checked.
       */
      const parse = (c: string) => {
        const n = (c.match(/[\d.]+/g) || []).map(Number)
        return c.startsWith('color(') ? [n[0] * 255, n[1] * 255, n[2] * 255, ...n.slice(3)] : n
      }
      const over = (c: number[], b: number[]) => {
        const a = c.length > 3 ? c[3] : 1
        return [0, 1, 2].map((i) => c[i] * a + b[i] * (1 - a))
      }
      const lum = ([r, g, b]: number[]) => {
        const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
      }
      const ratio = (x: number[], y: number[]) => {
        const [hi, lo] = [lum(x), lum(y)].sort((a, b) => b - a)
        return (hi + 0.05) / (lo + 0.05)
      }
      /*
       * The painted background behind an element: every translucent layer from the element
       * outwards, composited down onto the first opaque one.
       *
       * Taking the nearest opaque ancestor and ignoring what floats above it is close
       * enough while every layer is opaque, and reports the wrong colour entirely the
       * moment one is not — a panel drawn at 85% over a dark canvas would be measured as
       * the page behind it, and its light text called illegible against a background it is
       * nowhere near.
       */
      const backdrop = (el: Element): number[] => {
        const layers: number[][] = []
        for (let e: Element | null = el; e; e = e.parentElement) {
          const c = parse(getComputedStyle(e).backgroundColor)
          const a = c.length > 3 ? c[3] : 1
          if (c.length < 3 || a === 0) continue
          layers.push(c)
          if (a > 0.95) break
        }
        return layers.reduceRight((under, layer) => over(layer, under), [255, 255, 255])
      }

      const panel = document.querySelector(panelSelector)!
      const bad: string[] = []
      for (const el of panel.querySelectorAll('*')) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())
        if (!own) continue
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        /*
         * Text with no painted surface anywhere between it and the panel's root is drawn
         * straight on the render — the controller's readout is the only one. What is behind
         * it is a WebGL frame, which reports no background colour, so measuring it here
         * would compare it against this fixture's white page rather than the themed scene
         * and call it illegible on the dark theme, where it is white on near-black. Its
         * contrast is checked against the scene's own colour in `themeOverride.test.js`.
         */
        let surfaced = false
        for (let e: Element | null = el; e && e !== panel.parentElement; e = e.parentElement) {
          const c = parse(getComputedStyle(e).backgroundColor)
          if (c.length >= 3 && (c.length > 3 ? c[3] : 1) > 0) { surfaced = true; break }
        }
        if (!surfaced) continue
        const bg = backdrop(el)
        const fg = over(parse(getComputedStyle(el).color), bg)
        const c = ratio(fg, bg)
        // 3:1, and these are readouts rather than body copy.
        if (c < 3) bad.push(`"${el.textContent!.trim().slice(0, 30)}" ${c.toFixed(2)}:1 (${getComputedStyle(el).color} on rgb(${bg.join(', ')}))`)
      }
      return bad
    }, selector)
    expect(unreadable).toEqual([])

    /*
     * And the palette actually took. Without this, a stamp that changed nothing would run
     * the same check three times and report three passes — the panels would be legible, in
     * one theme, and the other two names in the report would be fiction.
     *
     * The ones that float on the render are drawn in the chrome palette, which is the
     * inverse of the theme: dark panels on the light theme, light panels on the dark one. A
     * panel that matched its theme would have no edge against the scene behind it. The
     * dialog is not on the render and follows the theme like the rest of the UI.
     */
    if (theme !== 'auto') {
      const surface = await page.evaluate((panelSelector) => {
        const declared = getComputedStyle(document.querySelector(panelSelector)!).backgroundColor
        const n = (declared.match(/[\d.]+/g) || []).map(Number)
        // `color(srgb 0.97 0.97 0.97 / 0.78)` carries 0-1 channels, `rgb()` carries 0-255.
        // Read as-is, every color-mix surface in the app measures as near-black.
        const c = declared.startsWith('color(') ? n.map((v) => v * 255) : n
        return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 128 ? 'light' : 'dark'
      }, painted ?? selector)
      expect(surface).toBe(floats ? (theme === 'light' ? 'dark' : 'light') : theme)
    }
  })
  }
  }

  /*
   * The format control is one control, not three buttons that happen to be adjacent.
   *
   * Nextcloud gives every button on the page a border radius and a 3px margin on three
   * sides, so the selected segment renders as a rounded chip floating inside the track with
   * a 5px gap above and below it — while the design mockup, which has no Nextcloud on the
   * page, shows it flush. Nothing about the rule looks wrong in this app's stylesheet,
   * because the declarations that break it are not in this app's stylesheet.
   */
  test('the format control\'s selected segment fills its slot', async ({ page }) => {
    await page.goto(server.url)
    await page.waitForSelector('.minimal-top-bar', { timeout: 20000 })
    await page.click('[aria-label="Toggle tools panel"]')
    await page.waitForSelector('.slide-out-panel', { timeout: 5000 })
    await page.getByText('Export', { exact: true }).first().click()
    await page.getByText('Send to Slicer', { exact: true }).first().click()
    await page.waitForSelector('.format-buttons', { timeout: 5000 })

    const fit = await page.evaluate(() => {
      const track = document.querySelector('.format-buttons')!
      const active = document.querySelector('.format-btn.active')!
      const t = track.getBoundingClientRect()
      const a = active.getBoundingClientRect()
      const border = parseFloat(getComputedStyle(track).borderTopWidth)
      return {
        top: a.top - t.top - border,
        bottom: t.bottom - a.bottom - border,
        start: a.left - t.left - border,
        margin: getComputedStyle(active).margin,
        radius: getComputedStyle(active).borderRadius,
      }
    })

    // Flush against the track's inner edge on the three sides it touches.
    expect(Math.abs(fit.top)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(fit.bottom)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(fit.start)).toBeLessThanOrEqual(0.5)
    // And square, so the track's own rounding is what shapes the ends.
    expect(fit.margin).toBe('0px')
    expect(fit.radius).toBe('0px')
  })

  /*
   * A panel opened from the tools panel is not hidden behind it.
   *
   * Measurement and annotation modes are switched on from a row in the tools panel, and
   * their panels floated at the same edge the tools panel occupies — at a lower z-index,
   * so turning measurement on put its readout underneath the card that turned it on. The
   * only sign anything had happened was the row's "Active" badge.
   *
   * Hit-testing rather than comparing rectangles: a panel can also be covered by something
   * that is not the tools panel, and the question is only ever whether the user can see
   * and click what they just opened.
   */
  for (const [label, open, selector] of [
    ['measurements', 'Measurement', '.measurement-overlay'],
    ['annotations', 'Annotation', '.annotation-overlay'],
  ] as const) {
    test(`the ${label} panel is not covered by the tools panel that opens it`, async ({ page }) => {
      await page.goto(server.url)
      await page.waitForSelector('.minimal-top-bar', { timeout: 20000 })
      await page.waitForSelector('canvas', { timeout: 20000 })
      await page.click('[aria-label="Toggle tools panel"]')
      await page.waitForSelector('.slide-out-panel', { timeout: 5000 })
      await page.getByText(open, { exact: true }).first().click()
      await page.waitForSelector(selector, { timeout: 5000 })

      const covered = await page.evaluate((panelSelector) => {
        const panel = document.querySelector(panelSelector)!
        const r = panel.getBoundingClientRect()
        // The four corners inset past the radius, and the middle.
        const probes: [string, number, number][] = [
          ['top-left', r.x + 12, r.y + 12],
          ['top-right', r.right - 12, r.y + 12],
          ['bottom-left', r.x + 12, r.bottom - 12],
          ['bottom-right', r.right - 12, r.bottom - 12],
          ['centre', r.x + r.width / 2, r.y + r.height / 2],
        ]
        return probes.flatMap(([where, x, y]) => {
          const hit = document.elementFromPoint(x, y)
          if (hit && (hit === panel || panel.contains(hit))) return []
          const name = hit ? (typeof hit.className === 'string' && hit.className) || hit.tagName : 'nothing'
          return [`${where} -> ${name}`]
        })
      }, selector)
      expect(covered).toEqual([])
    })
  }

  /*
   * The statistics panel is canvas chrome, so it is drawn like the rest of the canvas
   * chrome.
   *
   * It sits over the rendered model, next to the performance HUD, and for a while the two
   * were opposite colours: a light card and a dark card, a few hundred pixels apart, both
   * floating on the same scene. Neither is wrong read on its own, which is why the
   * disagreement survived — a light panel is right for content beside the viewer and wrong
   * for content on top of it, and only the pair on screen at once shows which this is.
   *
   * Compared against a live `.tdv-hud`, not against a colour written here: the point is
   * that the two surfaces cannot drift apart, not that either of them is any particular
   * shade today.
   */
  test('the statistics panel is drawn on the same surface as the performance HUD', async ({ page }) => {
    await page.goto(server.url)
    await page.waitForSelector('.minimal-top-bar', { timeout: 20000 })
    await page.waitForSelector('canvas', { timeout: 20000 })
    await page.click('[aria-label="Toggle tools panel"]')
    await page.waitForSelector('.slide-out-panel', { timeout: 5000 })
    await page.getByText('Model Statistics', { exact: false }).first().click()
    await page.waitForSelector('.model-stats-overlay', { timeout: 5000 })

    const { panel, hud } = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.className = 'tdv-hud'
      document.body.appendChild(probe)
      const read = (el: Element) => {
        const s = getComputedStyle(el)
        return { background: s.backgroundColor, color: s.color }
      }
      const result = { hud: read(probe), panel: read(document.querySelector('.model-stats-overlay')!) }
      probe.remove()
      return result
    })
    expect(panel).toEqual(hud)
  })

  test('the tools panel opens clear of the bar that opens it', async ({ page }) => {
    await page.goto(server.url)
    await page.waitForSelector('.minimal-top-bar', { timeout: 20000 })
    await page.waitForSelector('canvas', { timeout: 20000 })
    await page.click('[aria-label="Toggle tools panel"]')
    await page.waitForSelector('.slide-out-panel', { timeout: 5000 })

    const [bar, panel] = await Promise.all([
      page.locator('.minimal-top-bar').boundingBox(),
      page.locator('.slide-out-panel').boundingBox(),
    ])
    expect(panel!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height)
  })
})
