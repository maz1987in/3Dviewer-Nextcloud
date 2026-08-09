/**
 * Choosing a theme in the viewer themes the viewer — and the overlays go the other way.
 *
 * Two palettes move independently, because they are drawn on different things.
 *
 * The panels are UI: the tools panel, the dialogs, the rows. On Auto they take Nextcloud's
 * colours, so a themed instance keeps its own; on an explicit Light or Dark they override
 * those variables rather than read them, because a "light" palette assembled from a dark
 * instance's `--color-main-background` comes out dark. That is the trap `darkThemeSurfaces`
 * guards one layer up.
 *
 * The canvas chrome — the viewer's header, the performance HUD, the statistics and
 * measurement and annotation panels — is drawn on the rendered scene, and the scene is the
 * theme. Matching it makes a light HUD on a white render and a dark HUD on a dark one, which
 * is a panel you cannot find; so the chrome is the inverse of the resolved theme, whichever
 * way that resolves. It keys off the resolved theme rather than the chosen one for exactly
 * that reason: on Auto there is no chosen theme, and the scene still has a colour.
 *
 * Two properties are checked, and they are the two that broke last time a surface changed
 * theme:
 *
 *   - a palette flips whole. Half a panel keeping its old colours is how the statistics
 *     panel ended up with white text on white; every colour the base defines is redefined.
 *   - text stays readable on the surface it is drawn on, in each palette, with the
 *     translucent overlays composited over both a black and a white scene.
 */

const { readFileSync } = require('fs')
const { join } = require('path')

const CSS = readFileSync(join(__dirname, '..', '..', 'src', 'css', 'design-system.css'), 'utf8')

/**
 * The custom properties one selector's block declares.
 *
 * @param {string} selector - the selector, matched literally
 * @return {Map<string, string>} property name to value
 */
function block(selector) {
	const at = CSS.indexOf(`\n${selector} {`)
	if (at === -1) return new Map()
	const body = CSS.slice(at, CSS.indexOf('\n}', at))
	return new Map([...body.matchAll(/(--tdv-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const base = block(':root')

/** The panels, on an explicit choice. */
const panels = {
	light: block('[data-tdv-theme="light"]'),
	dark: block('[data-tdv-theme="dark"]'),
}

/** The canvas chrome, keyed on the theme the scene resolved to and inverted against it. */
const chrome = {
	light: block('body.theme--dark'),
	dark: block('body.theme--light'),
}

/** Nextcloud variables whose value is the page's own theme, and so flips with it. */
const FOLLOWS_THE_PAGE = /var\(--color-(?:main-background|main-text|border|background-|text-)/

/** A token drawn on the rendered scene rather than on the page. */
const isChrome = (token) => token.startsWith('--tdv-hud') || token.startsWith('--tdv-canvas')

/**
 * A colour token resolved to something a contrast check can read.
 *
 * Values are `#rgb`, `#rrggbb`, `rgb(r, g, b)` or `rgb(r, g, b, a)`; a `var(--x, fallback)`
 * resolves to its fallback, which is what a browser renders when Nextcloud is absent.
 *
 * @param {string} value - the declared value
 * @return {?number[]} [r, g, b, a] or null if it is not a colour
 */
function parseColour(value) {
	const fallback = /var\([^,]+,\s*(.+)\)\s*$/.exec(value)
	const text = (fallback ? fallback[1] : value).trim()

	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
	if (hex) {
		const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d) : hex[1].match(/../g)
		return [...digits.map((d) => parseInt(d, 16)), 1]
	}

	const rgb = /^rgba?\(([^)]+)\)$/.exec(text)
	if (rgb) {
		const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number)
		if (parts.length >= 3 && parts.slice(0, 3).every((n) => !isNaN(n))) {
			return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1]
		}
	}
	return null
}

/**
 * One colour over another.
 *
 * @param {number[]} top - [r, g, b, a]
 * @param {number[]} bottom - [r, g, b, a], treated as opaque
 * @return {number[]} the composited colour
 */
function over(top, bottom) {
	return [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1)
}

/**
 * WCAG relative luminance.
 *
 * @param {number[]} colour - [r, g, b, a]
 * @return {number} luminance
 */
function luminance([r, g, b]) {
	const [rl, gl, bl] = [r, g, b].map((c) => {
		const s = c / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

/**
 * WCAG contrast ratio.
 *
 * @param {number[]} a - one colour
 * @param {number[]} b - the other
 * @return {number} the ratio, 1 to 21
 */
function contrast(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

describe('the panel palette', () => {
	it('has a block for each of the two choices', () => {
		expect(base.size).toBeGreaterThan(20)
		expect(panels.light.size).toBeGreaterThan(10)
		expect(panels.dark.size).toBeGreaterThan(10)
	})

	it.each(Object.entries(panels))('%s redefines every panel colour the base defines', (_name, palette) => {
		const missing = [...base.keys()]
			.filter((token) => /color/.test(token) && !isChrome(token))
			// The accent stays the instance's own in every palette: it is picked to work on
			// either surface, and it is the one thing an admin sets deliberately.
			.filter((token) => !/primary|on-primary/.test(token))
			.filter((token) => !palette.has(token))
		expect(missing).toEqual([])
	})

	it.each(Object.entries(panels))('%s sets its own surfaces rather than reading the page it overrides', (_name, palette) => {
		const borrowed = [...palette.entries()]
			.filter(([token]) => !/primary/.test(token))
			.filter(([, value]) => FOLLOWS_THE_PAGE.test(value))
			.map(([token, value]) => `${token}: ${value}`)
		expect(borrowed).toEqual([])
	})
})

describe('the canvas chrome', () => {
	it('has a block for each way the theme can resolve', () => {
		expect(chrome.light.size).toBeGreaterThan(8)
		expect(chrome.dark.size).toBeGreaterThan(8)
	})

	it.each(Object.entries(chrome))('%s redefines every chrome colour the base defines', (_name, palette) => {
		const missing = [...base.keys()].filter(isChrome).filter((token) => !palette.has(token))
		expect(missing).toEqual([])
	})

	/*
	 * The point of the whole arrangement. These overlays float on the render, and the render
	 * is whatever the theme says — so a chrome that matches the theme is a panel with no edge
	 * against the thing behind it, which is what a light HUD on a white scene looked like.
	 */
	it('is the inverse of the scene it floats on', () => {
		const surface = (palette) => luminance(parseColour(palette.get('--tdv-hud-bg')))
		expect(surface(chrome.dark)).toBeLessThan(surface(chrome.light))
	})

	it('is darker than the panels when the viewer is light, and lighter when it is dark', () => {
		const lum = (palette, token) => luminance(parseColour(palette.get(token)))
		expect(lum(chrome.dark, '--tdv-hud-bg')).toBeLessThan(lum(panels.light, '--tdv-color-surface'))
		expect(lum(chrome.light, '--tdv-hud-bg')).toBeGreaterThan(lum(panels.dark, '--tdv-color-surface'))
	})
})

describe('every palette', () => {
	// Every pairing of text and the surface it is drawn on. The HUD is translucent, so it is
	// measured against both extremes of what can be behind it.
	const PANEL_PAIRS = [
		['--tdv-color-text', '--tdv-color-surface'],
		['--tdv-color-text-secondary', '--tdv-color-surface'],
		['--tdv-color-text', '--tdv-color-surface-sunken'],
	]
	const CHROME_PAIRS = [
		['--tdv-hud-text', '--tdv-hud-bg'],
		['--tdv-hud-text-secondary', '--tdv-hud-bg'],
		['--tdv-hud-chip-text', '--tdv-hud-bg'],
		['--tdv-hud-success', '--tdv-hud-bg'],
		['--tdv-hud-warning', '--tdv-hud-bg'],
		['--tdv-hud-error', '--tdv-hud-bg'],
	]

	const cases = [
		...Object.entries(panels).flatMap(([name, palette]) =>
			PANEL_PAIRS.map(([fg, bg]) => [`panels ${name}`, palette, fg, bg])),
		...Object.entries(chrome).flatMap(([name, palette]) =>
			CHROME_PAIRS.map(([fg, bg]) => [`chrome ${name}`, palette, fg, bg])),
	].flatMap(([label, palette, fg, bg]) =>
		[['a black scene', [0, 0, 0, 1]], ['a white scene', [255, 255, 255, 1]]].map(
			([scene, behind]) => [`${label}: ${fg} on ${bg} over ${scene}`, palette, fg, bg, behind],
		))

	it.each(cases)('%s is legible', (_label, palette, fg, bg, behind) => {
		const text = parseColour(palette.get(fg) ?? base.get(fg))
		const surface = parseColour(palette.get(bg) ?? base.get(bg))
		expect(text).not.toBeNull()
		expect(surface).not.toBeNull()

		const drawn = over(surface, behind)
		expect(contrast(over(text, drawn), drawn)).toBeGreaterThanOrEqual(4.5)
	})
})
