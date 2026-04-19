import { test, expect } from '@playwright/test'

// Static fixture that mirrors the skip-link pattern from src/App.vue.
// This isolates the CSS + focus behavior from the full app bundle so the
// test is deterministic and doesn't depend on Three.js / Nextcloud mounts.
const SKIP_LINK_FIXTURE = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Skip-to-viewer test</title>
	<style>
		body { margin: 0; font-family: sans-serif; }
		.skip-to-viewer {
			position: absolute;
			inset-inline-start: 8px;
			top: -40px;
			z-index: 10001;
			padding: 8px 16px;
			background: #0082c9;
			color: #fff;
			text-decoration: none;
			font-weight: 600;
			transition: top 0.15s ease;
		}
		.skip-to-viewer:focus,
		.skip-to-viewer:focus-visible {
			top: 0;
			outline: 2px solid #fff;
			outline-offset: 2px;
		}
		#viewer-wrapper {
			width: 100%;
			height: 400px;
			background: #222;
			color: #fff;
			padding: 16px;
		}
		#viewer-wrapper:focus { outline: none; }
		nav button { margin: 8px; }
	</style>
</head>
<body>
	<a id="skip" class="skip-to-viewer" href="#viewer-wrapper">Skip to 3D viewer</a>
	<nav>
		<button id="nav-a">Nav A</button>
		<button id="nav-b">Nav B</button>
	</nav>
	<div id="viewer-wrapper" tabindex="-1">
		<button id="viewer-btn">Viewer button</button>
	</div>
	<script>
		document.getElementById('skip').addEventListener('click', (e) => {
			e.preventDefault()
			const wrapper = document.getElementById('viewer-wrapper')
			wrapper.focus()
		})
	</script>
</body>
</html>`

test.describe('Skip-to-viewer accessibility', () => {
	test('skip link is visually hidden until focused, then slides into view', async ({ page }) => {
		await page.setContent(SKIP_LINK_FIXTURE)

		const skip = page.locator('#skip')

		// Hidden off-screen (top: -40px).
		const offscreenTop = await skip.evaluate(el => getComputedStyle(el).top)
		expect(offscreenTop).toBe('-40px')

		// Focus the link (simulating first Tab on page load).
		await skip.focus()

		// Wait for the 150ms slide-in transition to finish.
		await expect.poll(() => skip.evaluate(el => getComputedStyle(el).top)).toBe('0px')
	})

	test('activating the skip link moves focus to #viewer-wrapper', async ({ page }) => {
		await page.setContent(SKIP_LINK_FIXTURE)

		await page.locator('#skip').focus()
		await page.keyboard.press('Enter')

		const activeId = await page.evaluate(() => document.activeElement?.id)
		expect(activeId).toBe('viewer-wrapper')
	})

	test('skip link remains usable in forced-colors (high-contrast) mode', async ({ page }) => {
		// Simulates Windows High Contrast / forced-colors user setting.
		await page.emulateMedia({ forcedColors: 'active' })
		await page.setContent(SKIP_LINK_FIXTURE)

		const skip = page.locator('#skip')
		await skip.focus()

		// The link must still be discoverable once the slide-in transition settles.
		await expect.poll(() => skip.evaluate(el => getComputedStyle(el).top)).toBe('0px')

		const info = await skip.evaluate(el => {
			const cs = getComputedStyle(el)
			return { visibility: cs.visibility, display: cs.display }
		})
		expect(info.visibility).not.toBe('hidden')
		expect(info.display).not.toBe('none')
	})
})
