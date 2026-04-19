import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Forced-colors audit for our custom badges, chips, and focus states.
//
// We can't boot the full Nextcloud app inside Playwright here (the smoke
// suite already exercises the live bundle), so this spec loads the real
// src/css/forced-colors.css into a static fixture that mirrors the DOM
// shapes from the components. That's enough to validate the sheet's
// selectors match and that the system-color fallbacks take effect under
// `forcedColors: active`.
//
// What this cannot verify:
//   - How Windows HC themes map Canvas/CanvasText/Highlight in practice
//     (Playwright's forced-colors emulation uses a neutral palette).
//   - Visual regressions that only show up with real GPU compositing.
// Those still require the interactive Windows HC walkthrough noted in
// TODO.md — this spec closes the gap for keyboard/CSS correctness.

const __dirname = dirname(fileURLToPath(import.meta.url))
const FORCED_COLORS_CSS = readFileSync(
	resolve(__dirname, '../../src/css/forced-colors.css'),
	'utf-8',
)

function buildFixture(body: string) {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Forced-colors fixture</title>
	<style>
		body { margin: 16px; font-family: sans-serif; background: #1a1a1a; color: #eee; }
		.row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
		.stats-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
		.stats-badge-ok { background: rgb(76 175 80 / 18%); color: #8fe2a3; }
		.stats-badge-warn { background: rgb(255 152 0 / 22%); color: #ffb74d; }
		.stats-badge-unknown { background: rgb(255 255 255 / 8%); color: rgb(255 255 255 / 70%); }
		.fps-badge { padding: 2px 5px; background: #0082c9; color: #fff; border-radius: 6px; font-size: 10px; }
		.active-badge { padding: 2px 8px; background: #0082c9; color: #fff; border-radius: 10px; font-size: 11px; font-weight: 600; }
		.last-used-badge { display: inline-block; padding: 2px 8px; background: #0082c9; color: #fff; border-radius: 10px; font-size: 11px; font-weight: 600; }
		.file-filter-toolbar .filter-format-chip {
			padding: 3px 10px; border: 1px solid #c0c0c0; border-radius: 12px;
			background: transparent; color: #222; font-size: 11px; cursor: pointer;
		}
		.file-filter-toolbar .filter-format-chip.active {
			background: #0082c9; border-color: #0082c9; color: #fff;
		}
		.export-select {
			padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px;
			background: #fff; color: #222;
		}
		.export-select:focus {
			outline: none;
			border-color: #0082c9;
			box-shadow: 0 0 0 2px rgba(0, 130, 201, 0.25);
		}
		.annotation-text-input {
			padding: 4px 6px; border: 1px solid #888; background: rgba(0,0,0,0.5);
			color: #fff;
		}
		.annotation-text-input:focus {
			outline: none;
			border-color: #f00;
		}
		.skip-to-viewer {
			position: absolute; inset-inline-start: 8px; top: -40px; z-index: 10001;
			padding: 8px 16px; background: #0082c9; color: #fff; text-decoration: none;
			font-weight: 600; transition: top 0.15s ease;
		}
		.skip-to-viewer:focus, .skip-to-viewer:focus-visible { top: 0; }
	</style>
	<style id="forced-colors-sheet">${FORCED_COLORS_CSS}</style>
</head>
<body>${body}</body>
</html>`
}

test.describe('Forced-colors (Windows HC) accessibility', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ forcedColors: 'active' })
	})

	test('stats badges gain a system-color border so they stay visible', async ({ page }) => {
		await page.setContent(buildFixture(`
			<div class="row">
				<span id="ok" class="stats-badge stats-badge-ok">Watertight</span>
				<span id="warn" class="stats-badge stats-badge-warn">Open edges</span>
				<span id="unknown" class="stats-badge stats-badge-unknown">Skipped</span>
			</div>
		`))

		// Each badge must have a non-zero border width in forced-colors mode.
		// (Default rendering has 0-width border — the HC sheet adds 1px.)
		for (const id of ['ok', 'warn', 'unknown']) {
			const width = await page.locator(`#${id}`).evaluate(el => {
				return parseFloat(getComputedStyle(el).borderTopWidth)
			})
			expect(width, `${id} badge border`).toBeGreaterThan(0)
		}
	})

	test('fps / active / last-used badges gain a visible border', async ({ page }) => {
		await page.setContent(buildFixture(`
			<div class="row">
				<span id="fps" class="fps-badge">60</span>
				<span id="active" class="active-badge">Active</span>
				<span id="last" class="last-used-badge">Last used</span>
			</div>
		`))

		for (const id of ['fps', 'active', 'last']) {
			const width = await page.locator(`#${id}`).evaluate(el => {
				return parseFloat(getComputedStyle(el).borderTopWidth)
			})
			expect(width, `${id} badge border`).toBeGreaterThan(0)
		}
	})

	test('active filter chip stays visually distinct from inactive chips', async ({ page }) => {
		await page.setContent(buildFixture(`
			<div class="file-filter-toolbar row">
				<button id="inactive" class="filter-format-chip">GLB</button>
				<button id="active" class="filter-format-chip active">STL</button>
			</div>
		`))

		// Inactive uses ButtonFace/ButtonText; active uses Highlight/HighlightText.
		// forced-color-adjust: none on .active lets those explicit system-colors
		// take precedence over the UA's remap, so the two states must end up
		// with distinct background colors.
		const inactiveBg = await page.locator('#inactive').evaluate(el => getComputedStyle(el).backgroundColor)
		const activeBg = await page.locator('#active').evaluate(el => getComputedStyle(el).backgroundColor)

		expect(inactiveBg).not.toBe('')
		expect(activeBg).not.toBe('')
		expect(activeBg).not.toBe(inactiveBg)
	})

	test('export select and annotation input show a focus outline in HC mode', async ({ page }) => {
		await page.setContent(buildFixture(`
			<div class="row">
				<select id="sel" class="export-select"><option>STL</option><option>OBJ</option></select>
				<input id="ann" class="annotation-text-input" type="text" />
			</div>
		`))

		for (const id of ['sel', 'ann']) {
			await page.locator(`#${id}`).focus()
			const outlineWidth = await page.locator(`#${id}`).evaluate(el => {
				return parseFloat(getComputedStyle(el).outlineWidth)
			})
			expect(outlineWidth, `${id} focus outline`).toBeGreaterThan(0)
		}
	})

	test('skip link keeps a focus outline and readable surface in HC mode', async ({ page }) => {
		await page.setContent(buildFixture(`
			<a id="skip" class="skip-to-viewer" href="#x">Skip to 3D viewer</a>
			<div id="x" tabindex="-1">Viewer</div>
		`))

		const skip = page.locator('#skip')
		await skip.focus()

		// Slide-in transition settles.
		await expect.poll(() => skip.evaluate(el => getComputedStyle(el).top)).toBe('0px')

		const focusOutlineWidth = await skip.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth))
		expect(focusOutlineWidth).toBeGreaterThan(0)

		// Border comes from forced-colors.css — verifies the selector matched.
		const borderWidth = await skip.evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth))
		expect(borderWidth).toBeGreaterThan(0)
	})
})
