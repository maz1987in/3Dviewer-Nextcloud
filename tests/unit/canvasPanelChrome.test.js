/**
 * The panels that float on the canvas are drawn from the design system, not from debug
 * colours.
 *
 * The measurement panel was a black box outlined in `#0f0` with `#0f0` headings; the
 * annotation panel the same in `#f00`, its rows tinted `rgb(255 0 0 / 10%)`. Both set
 * `font-family: Arial`. Those are the colours you reach for while getting an overlay to
 * appear at all — maximum contrast against anything, impossible to miss — and they are
 * the same decision as the fluorescent green the ground grid shipped with for years: a
 * value picked to be obvious during development and never revisited. See [[gridColour]].
 *
 * Nothing failed while they were there. Each panel rendered exactly as its own styles
 * asked, so the only thing that would ever have caught them is somebody opening the panel
 * and deciding it looked wrong.
 *
 * Scoped to the panel chrome on purpose. Pure red and pure green are deliberate in the
 * scene itself — axis helpers, measurement lines, the selection box — and banning the
 * literals outright would either fail on those or teach the next person to suppress the
 * guard.
 */

const { readFileSync } = require('fs')
const { join } = require('path')

const VIEWER = join(__dirname, '..', '..', 'src', 'components', 'ThreeViewer.vue')

/** The panels this guard covers, by the prefix their rules share. */
const PANELS = ['measurement', 'annotation', 'model-stats', 'stats', 'per-mesh', 'material']

/**
 * A saturated primary or secondary, in any of the notations a stylesheet uses for it.
 *
 * `#f00`, `#ff0000`, `rgb(255 0 0 / 10%)` and `rgb(255, 0, 0)` are the same colour and
 * only the first two look like a debug value at a glance, which is how the annotation
 * rows kept theirs through a sweep that rewrote the borders above them.
 */
const DEBUG_COLOUR = /#(?:f00|0f0|00f|ff0|0ff|f0f)\b|#(?:ff0000|00ff00|0000ff|ffff00|00ffff|ff00ff)\b|rgba?\(\s*(?:255[\s,]+0[\s,]+0|0[\s,]+255[\s,]+0|0[\s,]+0[\s,]+255)\b/i

/** Every CSS rule in the viewer, as [selector, body]. */
const rules = [...readFileSync(VIEWER, 'utf8').matchAll(/([^\n{}]+)\{([^{}]*)\}/g)]
	.map((m) => [m[1].trim(), m[2]])
	.filter(([selector]) => PANELS.some((p) => selector.includes(`-${p}`) || selector.includes(`.${p}`)))

describe('the panels that float on the canvas', () => {
	it('are found by this guard, so it cannot pass vacuously', () => {
		expect(rules.length).toBeGreaterThan(20)
	})

	it.each(rules.map(([selector]) => selector))('%s is not drawn in a debug colour', (selector) => {
		const offenders = rules
			.filter(([s]) => s === selector)
			.flatMap(([, body]) => body.split('\n').filter((line) => DEBUG_COLOUR.test(line)))
			.map((line) => line.trim())
		expect(offenders).toEqual([])
	})

	/*
	 * A panel that names its own font stops following the instance. Nextcloud publishes
	 * `--font-face`, and the design system passes it through as `--tdv-font`; a rule that
	 * says `Arial` renders in Arial on an instance whose whole interface is set in
	 * something else, and renders in Helvetica on a machine with no Arial installed.
	 *
	 * `inherit` passes. Form controls do not inherit the page's font on their own, so a
	 * button or an input inside a panel has to say so — and saying `inherit` is deferring
	 * to the token rather than making a second decision about which font to use.
	 */
	it.each(rules.map(([selector]) => selector))('%s does not name its own font', (selector) => {
		const offenders = rules
			.filter(([s]) => s === selector)
			.flatMap(([, body]) => [...body.matchAll(/font-family:\s*([^;]+)/g)].map((m) => m[1].trim()))
			.filter((value) => value !== 'inherit' && !value.startsWith('var(--tdv-font'))
		expect(offenders).toEqual([])
	})
})
