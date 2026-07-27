#!/usr/bin/env node
/**
 * Checks that the viewer's floating overlays sit on the 3D scene rather than
 * underneath Nextcloud's app navigation, against a running dev container.
 *
 * The controller used to be `position: fixed` with a 20px left offset, which anchors
 * to the viewport — so on any normal desktop, where the navigation is docked and owns
 * the left 300px, the controller lived permanently behind it. The navigation is frosted
 * glass in Nextcloud 28+, so it did not vanish; it showed through, washed out, which
 * reads as a rendering fault rather than a placement one.
 *
 * The top bar had the same defect from a different direction: it is absolutely
 * positioned but #viewer-wrapper was static, so it resolved against a far wider
 * ancestor and stretched under the navigation, which swallowed its clicks — Reset and
 * Fit could not be pressed at all on a docked-navigation layout.
 *
 * Usage: `node scripts/live-viewer-overlay-check.mjs`
 * Requires: docker compose up -d (container on :8080), and a build of the frontend.
 */
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:8080'
const USER = 'admin'
const PASS = 'admin'

let failures = 0
const log = (...a) => console.log('[overlay]', ...a)
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

		const topBar = rect('.minimal-top-bar')
		const quickButtons = [...document.querySelectorAll('.minimal-top-bar .quick-btn')].map((el) => {
			const b = el.getBoundingClientRect()
			const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
			return {
				label: el.textContent.replace(/\s+/g, ' ').trim(),
				// Whether a click at the button's own centre would actually reach it.
				reachable: !!hit && (hit === el || el.contains(hit)),
				coveredBy: hit && !(hit === el || el.contains(hit)) ? (hit.className || hit.tagName) : null,
			}
		})

		return {
			controller,
			nav,
			viewer,
			topBar,
			quickButtons,
			topBarOverlapsNav: overlaps(topBar, nav),
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

			// The viewer's own top bar is absolutely positioned too, and shares the
			// controller's original defect: without a positioned ancestor it resolves
			// against the whole app and stretches underneath the docked navigation.
			desktop.topBarOverlapsNav
				? fail('viewer top bar clears the docked navigation',
					`top bar ${JSON.stringify(desktop.topBar)} overlaps navigation ${JSON.stringify(desktop.nav)}`)
				: pass('viewer top bar clears the docked navigation')

			const unreachable = desktop.quickButtons.filter((b) => !b.reachable)
			unreachable.length
				? fail('Reset and Fit are clickable',
					unreachable.map((b) => `"${b.label}" is covered by ${b.coveredBy}`).join('; '))
				: pass(`Reset and Fit are clickable (${desktop.quickButtons.length} buttons)`)
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

		// --- 3. the Split console's own behaviours ---------------------------
		{
			const ring = page.locator('.steer-ring').first()
			const readout = page.locator('.readout').first()

			if (!(await ring.count())) {
				fail('steering ring is present', 'no .steer-ring in the DOM')
			} else {
				// Keyboard steering: the eight arrow glyphs used to be aria-hidden
				// decoration, so the ring had no keyboard path at all.
				await ring.focus()
				await page.keyboard.down('ArrowUp')
				await new Promise((r) => setTimeout(r, 400))
				const steering = (await readout.textContent()).trim()
				await page.keyboard.up('ArrowUp')
				await new Promise((r) => setTimeout(r, 300))
				const idleText = (await readout.textContent()).trim()

				const steersUp = new RegExp('0\\s*°').test(steering)
				const hasStrength = new RegExp('\\d+\\s*%').test(steering)

				steersUp && hasStrength
					? pass(`arrow keys steer the ring ("${steering}")`)
					: fail('arrow keys steer the ring',
						`readout after ArrowUp was "${steering}", expected a 0° bearing and a strength`)

				idleText.includes('%')
					? fail('releasing the key stops the camera', `readout stayed at "${idleText}"`)
					: pass('releasing the key stops the camera')
			}

			// Idle fade: back to 40% after a spell untouched, restored on pointer-enter.
			await page.mouse.move(5, 5)
			await new Promise((r) => setTimeout(r, 3200))
			const faded = await page.locator('.circular-controller').first()
				.evaluate((el) => parseFloat(getComputedStyle(el).opacity))

			faded < 0.6
				? pass(`controller fades when left alone (opacity ${faded})`)
				: fail('controller fades when left alone', `opacity stayed at ${faded}`)

			const gizmo = await page.locator('.gizmo').first().boundingBox()
			await page.mouse.move(gizmo.x + gizmo.width / 2, gizmo.y + gizmo.height / 2)
			await new Promise((r) => setTimeout(r, 500))
			const restored = await page.locator('.circular-controller').first()
				.evaluate((el) => parseFloat(getComputedStyle(el).opacity))

			restored > 0.9
				? pass('pointing at it brings it back')
				: fail('pointing at it brings it back', `opacity only recovered to ${restored}`)

			// Hiding has to beat the idle fade. Both are single extra classes on the same
			// element, so whichever rule comes last in the sheet wins — and a controller
			// left alone for a few seconds is the normal case, not the edge case.
			const toggle = page.locator('button[aria-label="3D Controller"]').first()
			if (!(await toggle.count())) {
				fail('the 3D Controller button is present', 'no button with that label')
			} else {
				await page.mouse.move(5, 5)
				await new Promise((r) => setTimeout(r, 3200))
				await toggle.click()
				await new Promise((r) => setTimeout(r, 600))

				const hidden = await page.locator('.circular-controller').first()
					.evaluate((el) => parseFloat(getComputedStyle(el).opacity))

				hidden === 0
					? pass('hiding an idle controller actually hides it')
					: fail('hiding an idle controller actually hides it',
						`opacity is ${hidden}; the idle fade is overriding the hidden state`)

				await toggle.click()
				await new Promise((r) => setTimeout(r, 600))
				const back = await page.locator('.circular-controller').first()
					.evaluate((el) => parseFloat(getComputedStyle(el).opacity))

				// Not full opacity: the pointer is on the toolbar, not the controller, so
				// the idle fade legitimately applies again. It just has to be visible.
				back >= 0.4
					? pass('showing it again brings it back')
					: fail('showing it again brings it back', `opacity is ${back}`)
			}
		}

		// --- 4. a narrower window, navigation still docked -------------------
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

main().catch((e) => { console.error('[overlay] FATAL:', e); process.exit(1) })
