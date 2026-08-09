/**
 * Choosing a theme in the viewer themes the viewer.
 *
 * The control offers Auto, Light and Dark, and until now it set the scene's background and
 * grid and nothing else: the panels take their colours from Nextcloud's variables, so on a
 * dark instance the Tools panel stayed dark with the viewer set to Light, and the reported
 * symptom was "I changed the theme and the component is still dark". It was — the control
 * had never claimed it.
 *
 * Auto still means "match the page", so its tokens stay pointed at Nextcloud's variables and
 * a themed instance keeps its own colours. An explicit Light or Dark is a decision about the
 * viewer specifically, and has to override those variables rather than read them: on a dark
 * Nextcloud, `--color-main-background` is dark, so a "light" palette built from it is dark.
 * That is the same trap `darkThemeSurfaces` was written for, one layer further down.
 *
 * Two properties are checked here, and they are the two that broke last time a surface
 * changed theme:
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
const light = block('[data-tdv-theme="light"]')
const dark = block('[data-tdv-theme="dark"]')

/** Nextcloud variables whose value is the page's own theme, and so flips with it. */
const FOLLOWS_THE_PAGE = /var\(--color-(?:main-background|main-text|border|background-|text-)/

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

/** The palettes an explicit choice installs, and what each surface is. */
const PALETTES = [
	['light', light],
	['dark', dark],
]

describe('an explicit theme choice', () => {
	it('installs a palette for each of the two choices', () => {
		expect(base.size).toBeGreaterThan(20)
		expect(light.size).toBeGreaterThan(10)
		expect(dark.size).toBeGreaterThan(10)
	})

	it.each(PALETTES)('%s redefines every colour the base defines, so it cannot flip halfway', (_name, palette) => {
		const missing = [...base.keys()]
			.filter((token) => /color|hud|canvas/.test(token))
			// The accent stays the instance's own in every palette: it is picked to work on
			// either surface, and it is the one thing an admin sets deliberately.
			.filter((token) => !/primary|on-primary/.test(token))
			.filter((token) => !palette.has(token))
		expect(missing).toEqual([])
	})

	it.each(PALETTES)('%s sets its own surfaces rather than reading the page it overrides', (_name, palette) => {
		const borrowed = [...palette.entries()]
			.filter(([token]) => !/primary/.test(token))
			.filter(([, value]) => FOLLOWS_THE_PAGE.test(value))
			.map(([token, value]) => `${token}: ${value}`)
		expect(borrowed).toEqual([])
	})

	// Every pairing of text and the surface it is drawn on, in each palette. The HUD is
	// translucent, so it is measured against both extremes of what can be behind it.
	const PAIRS = [
		['--tdv-color-text', '--tdv-color-surface'],
		['--tdv-color-text-secondary', '--tdv-color-surface'],
		['--tdv-color-text', '--tdv-color-surface-sunken'],
		['--tdv-hud-text', '--tdv-hud-bg'],
		['--tdv-hud-text-secondary', '--tdv-hud-bg'],
		['--tdv-hud-chip-text', '--tdv-hud-bg'],
		['--tdv-hud-success', '--tdv-hud-bg'],
		['--tdv-hud-warning', '--tdv-hud-bg'],
		['--tdv-hud-error', '--tdv-hud-bg'],
	]

	const cases = PALETTES.flatMap(([name, palette]) =>
		PAIRS.flatMap(([fg, bg]) =>
			[['a black scene', [0, 0, 0, 1]], ['a white scene', [255, 255, 255, 1]]].map(
				([scene, behind]) => [`${name}: ${fg} on ${bg} over ${scene}`, palette, fg, bg, behind],
			),
		),
	)

	it.each(cases)('%s is legible', (_label, palette, fg, bg, behind) => {
		const text = parseColour(palette.get(fg) ?? base.get(fg))
		const surface = parseColour(palette.get(bg) ?? base.get(bg))
		expect(text).not.toBeNull()
		expect(surface).not.toBeNull()

		const drawn = over(surface, behind)
		expect(contrast(over(text, drawn), drawn)).toBeGreaterThanOrEqual(4.5)
	})
})
