#!/usr/bin/env node
/**
 * Checks that the circular navigation controller sits on the 3D scene rather than
 * underneath Nextcloud's app navigation, against a running dev container.
 *
 * The controller used to be `position: fixed` with a 20px left offset, which anchors
 * to the viewport — so on any normal desktop, where the navigation is docked and owns
 * the left 300px, the controller lived permanently behind it. The navigation is frosted
 * glass in Nextcloud 28+, so it did not vanish; it showed through, washed out, which
 * reads as a rendering fault rather than a placement one.
 *
 * Usage: `node scripts/live-controller-check.mjs`
 * Requires: docker compose up -d (container on :8080), and a build of the frontend.
 */
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:8080'
const USER = 'admin'
const PASS = 'admin'

let failures = 0
const log = (...a) => console.log('[controller]', ...a)
const pass = (n, d) => console.log(`  ✓ ${n}${d ? `  (${d})` : ''}`)
const fail = (n, d) => { failures++; console.error(`  ✗ ${n}\n      ${d}`) }

/**
 * Geometry of the controller, the navigation and the viewer, plus what actually
 * paints on top at the controller's centre.
 *
 * @param {import('@playwright/test').Page} page - page showing the viewer
 * @return {Promise<object|null>} measurements, or null if the controller is absent
 */
async function measure(page) {
	return page.evaluate(() => {
		const rect = (sel) => {
			const el = document.querySelector(sel)
			if (!el) return null
			const r = el.getBoundingClientRect()
			return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
		}
		const controller = rect('.circular-controller')
		if (!controller) return null
		const nav = rect('.app-navigation')
		const viewer = rect('.three-viewer')

		const overlaps = (a, b) => !!a && !!b
			&& !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)

		const centre = document.elementFromPoint(
			controller.left + controller.width / 2,
			controller.top + controller.height / 2,
		)

		return {
			controller,
			nav,
			viewer,
			overlapsNav: overlaps(controller, nav),
			insideViewer: !!viewer
				&& controller.left >= viewer.left - 1 && controller.top >= viewer.top - 1
				&& controller.right <= viewer.right + 1 && controller.bottom <= viewer.bottom + 1,
			// Whether the navigation, rather than the controller, is what a click lands on.
			coveredByNav: !!centre && !!centre.closest && !!centre.closest('.app-navigation'),
		}
	})
}

async function main() {
	const browser = await chromium.launch()
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
	const page = await ctx.newPage()

	try {
		await page.goto(`${BASE}/login`)
		await page.fill('#user', USER)
		await page.fill('#password', PASS)
		await page.press('#password', 'Enter')
		await page.waitForLoadState('networkidle')

		await page.goto(`${BASE}/apps/threedviewer`)
		await page.waitForLoadState('networkidle')
		await new Promise((r) => setTimeout(r, 5000))

		// --- 1. docked navigation: the everyday desktop layout --------------
		const desktop = await measure(page)
		if (!desktop) {
			fail('controller is present in the standalone viewer', 'no .circular-controller in the DOM')
		} else {
			log(`controller ${JSON.stringify(desktop.controller)}`)
			log(`navigation ${JSON.stringify(desktop.nav)}`)

			desktop.overlapsNav
				? fail('controller clears the docked navigation',
					`controller x=${Math.round(desktop.controller.left)}..${Math.round(desktop.controller.right)} `
					+ `overlaps navigation x=${Math.round(desktop.nav.left)}..${Math.round(desktop.nav.right)}`)
				: pass('controller clears the docked navigation')

			desktop.coveredByNav
				? fail('controller is the thing you click at its own centre',
					'the navigation paints over it, so its buttons are unreachable')
				: pass('controller is the thing you click at its own centre')

			desktop.insideViewer
				? pass('controller sits inside the 3D scene')
				: fail('controller sits inside the 3D scene',
					`controller ${JSON.stringify(desktop.controller)} not within viewer ${JSON.stringify(desktop.viewer)}`)
		}

		// --- 2. dragging cannot push it back out ----------------------------
		const handle = page.locator('.drag-handle').first()
		if (await handle.count()) {
			const box = await handle.boundingBox()
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
			await page.mouse.down()
			// Aim well outside the viewer, into the navigation column.
			await page.mouse.move(5, 400, { steps: 12 })
			await page.mouse.up()
			await new Promise((r) => setTimeout(r, 600))

			const dragged = await measure(page)
			dragged && !dragged.overlapsNav && dragged.insideViewer
				? pass('dragging towards the navigation stops at the scene edge')
				: fail('dragging towards the navigation stops at the scene edge',
					`ended at ${JSON.stringify(dragged?.controller)}; overlapsNav=${dragged?.overlapsNav}`)
		} else {
			fail('drag handle is present', 'no .drag-handle to drag')
		}

		// --- 3. a narrower window, navigation still docked -------------------
		await page.setViewportSize({ width: 1100, height: 900 })
		await new Promise((r) => setTimeout(r, 1500))
		const narrow = await measure(page)
		narrow && !narrow.overlapsNav
			? pass('controller clears the navigation at a narrower width')
			: fail('controller clears the navigation at a narrower width',
				`controller ${JSON.stringify(narrow?.controller)} vs nav ${JSON.stringify(narrow?.nav)}`)
	} finally {
		await browser.close()
	}

	log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
	process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('[controller] FATAL:', e); process.exit(1) })
