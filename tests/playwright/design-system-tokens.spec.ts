import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Does the design system actually resolve in a browser?
//
// The unit guards read `src/css/design-system.css` as text. They can tell that a token
// is written as `var(--color-primary-element, #0082c9)` and not as a pasted literal, and
// that no component reaches past the token layer. What they cannot tell is whether the
// chain a token is written as produces a colour when a browser evaluates it.
//
// That gap is not hypothetical. A help icon in this app was tinted from
// `--color-primary-element-rgb`, a variable Nextcloud does not publish, and an
// unresolvable var() takes its whole declaration with it — so the element had no tint at
// all, for as long as the rule existed, while reading in the file as though it did. Text
// cannot catch that. A computed style can: an unresolved background computes transparent.
//
// So this spec loads the real sheet into a bare page and asks the browser what each token
// is worth, first with Nextcloud's variables absent — which is the fallback path, and the
// only state a static fixture can honestly reproduce — and then with a primary colour set
// on the root, which is what a themed instance looks like from the sheet's point of view.

const __dirname = dirname(fileURLToPath(import.meta.url))
const DESIGN_SYSTEM_CSS = readFileSync(
	resolve(__dirname, '../../src/css/design-system.css'),
	'utf-8',
)

/** Token declarations in the sheet, as [name, value]. */
const tokens = [...DESIGN_SYSTEM_CSS.matchAll(/(--tdv-[a-z0-9-]+)\s*:\s*([^;]+);/g)]
	.map((m) => [m[1], m[2].trim()] as [string, string])

/** The ones that hold a colour, which is what a computed background can be read back from. */
const colourTokens = tokens
	.filter(([name, value]) => /^#|^rgb|^color-mix|var\(--color-/.test(value) && !/font|size|weight|radius|shadow|target/.test(name))
	.map(([name]) => name)

/*
 * The rules Nextcloud's server stylesheet applies to every button on the page, read off
 * a running Nextcloud 34 with the DevTools protocol rather than transcribed from memory.
 *
 * The selector is the whole point: `button:not(.button-vue, [class^="vs__"])` scores
 * (0,1,1), which beats a bare `.tdv-btn` at (0,1,0). So Nextcloud, not the design system,
 * decides `width` and `padding` for every button in this app — and it sets `width: auto`.
 * An icon button is sized entirely by those two properties, so it renders 44x34 on a real
 * instance while measuring perfectly square in any fixture that leaves this stylesheet
 * out. Three earlier attempts at this fixture did exactly that, each reproducing a little
 * more of the real page and still passing.
 *
 * A fourth attempt left out the rest-state colours below, keeping only the geometry and
 * the states — so a control that Nextcloud repainted the moment it appeared measured
 * correct at rest here and was a pale blue pill on the instance. A stand-in that is more
 * permissive than the thing it stands in for reports a pass it has not earned, and does it
 * silently.
 */
const NEXTCLOUD_BUTTON_CSS = `
	select, button:not(.button-vue, [class^="vs__"]), input, textarea,
	div[contenteditable="true"], div[contenteditable="false"] {
		width: 130px;
		min-height: var(--default-clickable-area);
		box-sizing: border-box;
	}
	input[type="submit"], input[type="button"], input[type="reset"],
	button:not(.button-vue, [class^="vs__"]), .button, .pager li a {
		padding: 7px 14px;
		background-color: var(--color-main-background);
		color: var(--color-main-text);
		border: 1px solid var(--color-border-dark);
	}
	select, button:not(.button-vue, [class^="vs__"]), .button,
	input[type="button"], input[type="submit"], input[type="reset"] {
		padding: calc((var(--default-clickable-area) - 1lh) / 2) calc(3 * var(--default-grid-baseline));
		width: auto;
		min-height: var(--default-clickable-area);
		box-sizing: border-box;

		/* The declaration the mode chip lost. Every button on a Nextcloud page starts out
		   painted in the instance's pale primary tint, not in the page background. */
		color: var(--color-primary-element-light-text);
		background-color: var(--color-primary-element-light);
		border: none;
	}

	/*
	 * And the stateful half, trimmed to the button arms of two very long selector lists.
	 * These are the ones that matter: the first scores (0,2,1) and the second (0,4,1), so
	 * a design system whose own states sit at (0,3,0) loses hover, focus and click on
	 * every button in the app — which is what a themed instance showed, the primary
	 * button turning pale with white text the moment it was pressed.
	 */
	button:not(.button-vue, [class^="vs__"]):hover,
	button:not(.button-vue, [class^="vs__"]):focus {
		background-color: var(--color-primary-element-light-hover);
	}
	button:not(.button-vue, [class^="vs__"]):not(:disabled, .primary):not(.app-navigation-entry-button):active {
		background-color: var(--color-main-background);
		color: var(--color-main-text);
	}
`

function fixture(rootStyle = '') {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Design system fixture</title>
	<style>${NEXTCLOUD_BUTTON_CSS}</style>
	<style>${DESIGN_SYSTEM_CSS}</style>
	<style>
		:root { ${rootStyle} }
		.probe { width: 20px; height: 20px; }

		/* The bar the icon buttons actually sit in, and the icon's own no-shrink rule.
		   Both matter: a flex item's automatic minimum size is its content, so an icon
		   that cannot shrink turns stray padding into extra width instead of a clipped
		   glyph — which is how a button ends up wider than it is tall. */
		* { box-sizing: border-box; }
		.cluster { display: flex; align-items: center; }
		.viewer-icon { display: block; flex-shrink: 0; }
	</style>
</head>
<body>
	${colourTokens.map((n) => `<div class="probe" id="probe${n}" style="background-color: var(${n})"></div>`).join('\n\t')}
	<button class="tdv-btn tdv-btn--primary" id="primary">Tools</button>
	<div class="cluster"><button class="tdv-btn tdv-btn--icon tdv-btn--on-canvas" id="canvasBtn"><svg class="viewer-icon" width="20" height="20" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg></button></div>
	<div class="cluster"><button class="tdv-btn tdv-btn--icon" id="iconBtn"><svg class="viewer-icon" width="20" height="20" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg></button></div>
	<div class="tdv-hud" id="hud"><span class="tdv-hud-value">60 fps</span></div>
	<div class="tdv-hud"><span class="tdv-hud-chip" id="chipSpan">AUTO</span><button class="tdv-hud-chip" id="chipButton">AUTO</button></div>
</body>
</html>`
}

const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/** WCAG relative luminance of an `rgb(r, g, b)` string. */
function luminance(colour: string): number {
	const [r, g, b] = colour.match(/[\d.]+/g)!.slice(0, 3).map(Number)
	const channel = (v: number) => {
		const s = v / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * Flatten a possibly-translucent colour onto an opaque backdrop.
 *
 * The canvas chrome's hover state is white at 12%, which is a perfectly readable surface
 * over near-black and an unreadable one measured as if it were opaque. Measuring the
 * declared colour rather than the rendered one is its own way of being wrong.
 */
function over(colour: string, backdrop: string): string {
	const c = colour.match(/[\d.]+/g)!.map(Number)
	const b = backdrop.match(/[\d.]+/g)!.map(Number)
	const a = c.length > 3 ? c[3] : 1
	return `rgb(${[0, 1, 2].map((i) => Math.round(c[i] * a + b[i] * (1 - a))).join(', ')})`
}

/** WCAG contrast ratio between two opaque colours. */
function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

test.describe('design system tokens in a browser', () => {
	test('every colour token resolves to a colour with Nextcloud absent', async ({ page }) => {
		await page.setContent(fixture())

		// Guard the guard: a filter that selected nothing would pass every assertion below.
		expect(colourTokens.length).toBeGreaterThan(10)

		const unresolved: string[] = []
		for (const name of colourTokens) {
			const computed = await page.locator(`#probe${name}`).evaluate(
				(el) => getComputedStyle(el).backgroundColor,
			)
			if (computed === TRANSPARENT || computed === '') {
				unresolved.push(`${name} → ${computed || '(empty)'}`)
			}
		}
		expect(unresolved).toEqual([])
	})

	test('the themed tokens follow the instance primary colour', async ({ page }) => {
		await page.setContent(fixture('--color-primary-element: rgb(200, 0, 0); --color-primary-element-text: rgb(255, 255, 255);'))

		const background = await page.locator('#primary').evaluate(
			(el) => getComputedStyle(el).backgroundColor,
		)
		expect(background).toBe('rgb(200, 0, 0)')
	})

	/*
	 * The design system carries two greens on purpose: --tdv-color-success is dark enough
	 * to read on a white panel, and --tdv-hud-success is light enough to read on the near
	 * black HUD. Each fails on the other's surface, and both look plausible in a diff —
	 * this is what makes the pair a decision rather than a duplicate. It is also the
	 * mistake a panel makes when it stops being a dark overlay and keeps its light text.
	 */
	/*
	 * Read off a running Nextcloud 34. These are the values that matter: Nextcloud's
	 * `--color-warning` is a pale *background* tint and the readable colour is
	 * `--color-warning-text`, which is the opposite of what the fallbacks in this design
	 * system imply. A contrast check run without them tests the fallbacks and nothing
	 * else — which is how a badge shipped as pale amber text on a pale amber background.
	 */
	const NEXTCLOUD_STATUS = [
		'--color-success: #D8F3DA', '--color-success-text: #2C5D30',
		'--color-warning: #FFEEC5', '--color-warning-text: #664700',
		'--color-error: #FFE7E7', '--color-error-text: #A82C2C',
		'--color-main-background: #ffffff', '--color-main-text: #222222',
		'--color-text-maxcontrast: #6b6b6b',
	].join('; ')

	// Playwright has no describe.each; a plain loop does the same job.
	for (const [label, rootStyle] of [
		['with Nextcloud absent, on the sheet\'s own fallbacks', ''],
		['on a real Nextcloud palette', NEXTCLOUD_STATUS],
	]) {
	test(`each status colour is readable on the surface it belongs to, ${label}`, async ({ page }) => {
		await page.setContent(fixture(rootStyle))

		const pairs = [
			// Each status colour against the surface it is drawn on: the panel, or the
			// status tint of its own kind, which is what a badge uses.
			{ text: '--tdv-color-success', on: '--tdv-color-surface' },
			{ text: '--tdv-color-warning', on: '--tdv-color-surface' },
			{ text: '--tdv-color-error', on: '--tdv-color-surface' },
			{ text: '--tdv-color-success', on: '--tdv-color-success-surface' },
			{ text: '--tdv-color-warning', on: '--tdv-color-warning-surface' },
			{ text: '--tdv-color-error', on: '--tdv-color-error-surface' },
			{ text: '--tdv-color-text', on: '--tdv-color-surface' },
			{ text: '--tdv-color-text-secondary', on: '--tdv-color-surface' },
			{ text: '--tdv-hud-success', on: '--tdv-canvas-dark' },
			{ text: '--tdv-hud-warning', on: '--tdv-canvas-dark' },
			{ text: '--tdv-hud-error', on: '--tdv-canvas-dark' },
			{ text: '--tdv-hud-text', on: '--tdv-canvas-dark' },
			{ text: '--tdv-hud-text-secondary', on: '--tdv-canvas-dark' },
		]

		const failures: string[] = []
		for (const { text, on } of pairs) {
			const [fg, bg] = await Promise.all([
				page.locator(`#probe${text}`).evaluate((el) => getComputedStyle(el).backgroundColor),
				page.locator(`#probe${on}`).evaluate((el) => getComputedStyle(el).backgroundColor),
			])
			const ratio = contrast(fg, bg)
			// 3:1, the WCAG minimum for large text and for a non-text indicator. These are
			// readouts and badges, not body copy.
			if (ratio < 3) {
				failures.push(`${text} on ${on}: ${ratio.toFixed(2)}:1`)
			}
		}
		expect(failures).toEqual([])
	})
	}

	/*
	 * An icon button is square. It is the design system's only fixed-size control and the
	 * whole reason --tdv-hit-target exists, and Nextcloud's global button padding —
	 * twelve pixels each side, at a specificity the primitive did not beat — pushed it
	 * wider than tall on every real page while measuring perfectly square in every
	 * fixture that left that stylesheet out.
	 */
	test('an icon button stays square under Nextcloud\'s own button styles', async ({ page }) => {
		await page.setContent(fixture('--default-clickable-area: 34px; --default-grid-baseline: 4px;'))

		const size = await page.locator('#iconBtn').evaluate((el) => {
			const r = el.getBoundingClientRect()
			return { w: Math.round(r.width), h: Math.round(r.height) }
		})
		expect(size.w).toBe(size.h)
		// And it follows the instance's density rather than a hardcoded 44.
		expect(size.h).toBe(34)
	})

	/*
	 * A button keeps its own colours while it is being used.
	 *
	 * Nextcloud paints every button's hover, focus and active states, and its selectors
	 * outrank a plain class — so the app's primary button went pale-on-white the moment
	 * it was clicked, and the controls on the dark canvas chrome lit up in a light theme
	 * colour against near-black. Every one of those states looks correct at rest, which
	 * is the only state a screenshot or a default-state assertion ever sees.
	 */
	for (const [label, id, backdrop] of [
		['primary', '#primary', 'rgb(255, 255, 255)'],
		['on-canvas', '#canvasBtn', 'rgb(23, 23, 23)'],
	] as const) {
		test(`the ${label} button keeps its colours through hover, focus and click`, async ({ page }) => {
			await page.setContent(fixture('--default-clickable-area: 34px; --default-grid-baseline: 4px; --color-primary-element: rgb(0, 130, 201); --color-primary-element-light-hover: rgb(216, 234, 245); --color-main-background: rgb(255, 255, 255); --color-main-text: rgb(34, 34, 34);'))

			const cdp = await page.context().newCDPSession(page)
			await cdp.send('DOM.enable')
			await cdp.send('CSS.enable')
			const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
			const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: id })

			const failures: string[] = []
			/*
			 * `focus` alone is the state a button is left in after a mouse click: browsers
			 * withhold `focus-visible` for pointer input. Bundling the two hides the whole
			 * defect, because a rule written for `:focus-visible` then covers for one that
			 * should have said `:focus` — which is exactly what it was doing here.
			 */
			for (const state of [[], ['hover'], ['focus'], ['focus', 'focus-visible'], ['active']]) {
				await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: state })
				const { fg, bg } = await page.locator(id).evaluate((el) => {
					const cs = getComputedStyle(el)
					return { fg: cs.color, bg: cs.backgroundColor }
				})
				// 3:1, the WCAG minimum for a user interface component.
				const ratio = contrast(over(fg, over(bg, backdrop)), over(bg, backdrop))
				if (ratio < 3) {
					failures.push(`${state.join(',') || 'rest'}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1`)
				}
			}
			expect(failures).toEqual([])
		})
	}

	/*
	 * A chip on the HUD looks the same whether or not it happens to be a button.
	 *
	 * The performance HUD's mode chip is a button, and every other chip in the app is a
	 * span. The primitive says translucent white on the dark surface; on a real instance
	 * the mode chip rendered as a pale blue pill with near-black text, because Nextcloud's
	 * `button:not(...)` rule outscores the single class and was deciding both. Nothing in
	 * the app's own stylesheet mentions that colour, so reading the CSS suggests the chip
	 * is fine — the disagreement only exists once the page it ships on is present.
	 *
	 * Compared against the span rather than against a colour: the two are meant to be the
	 * same thing, and that is the property worth holding.
	 */
	test('a chip on the HUD looks the same whether or not it is a button', async ({ page }) => {
		await page.setContent(fixture('--default-clickable-area: 34px; --color-primary-element: rgb(0, 130, 201); --color-primary-element-light-hover: rgb(216, 234, 245); --color-main-background: rgb(255, 255, 255); --color-main-text: rgb(34, 34, 34);'))

		const paint = (id: string) => page.locator(id).evaluate((el) => {
			const cs = getComputedStyle(el)
			return { background: cs.backgroundColor, color: cs.color }
		})
		const expected = await paint('#chipSpan')

		const cdp = await page.context().newCDPSession(page)
		await cdp.send('DOM.enable')
		await cdp.send('CSS.enable')
		const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
		const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#chipButton' })

		const differs: string[] = []
		// `focus` without `focus-visible` is where a mouse click leaves the chip.
		for (const state of [[], ['hover'], ['focus'], ['focus', 'focus-visible'], ['active']]) {
			await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: state })
			const actual = await paint('#chipButton')
			if (actual.background !== expected.background || actual.color !== expected.color) {
				differs.push(`${state.join(',') || 'rest'}: ${actual.color} on ${actual.background}`)
			}
		}
		expect(differs).toEqual([])
	})

	test('the canvas chrome stays dark when the instance primary changes', async ({ page }) => {
		await page.setContent(fixture('--color-primary-element: rgb(200, 0, 0); --color-main-background: rgb(255, 255, 255);'))

		// The HUD sits on the rendered 3D scene; a themed light surface there would put
		// the readouts on top of the model rather than on a panel behind them.
		const background = await page.locator('#hud').evaluate(
			(el) => getComputedStyle(el).backgroundColor,
		)
		const [r, g, b] = background.match(/\d+/g)!.map(Number)
		expect(Math.max(r, g, b)).toBeLessThan(64)
	})
})
