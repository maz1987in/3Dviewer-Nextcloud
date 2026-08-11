/**
 * The design system's themed tokens must actually follow the instance theme.
 *
 * "Design System.dc.html" specifies a palette in hex — Primary #0082C9 and so on — while
 * also stating it is built on the Nextcloud design language with full theme support.
 * Those are only compatible if the hex is read as intent rather than as a value: on an
 * instance where the admin has set a custom colour, primary is not #0082C9.
 *
 * So every themed token resolves to a Nextcloud variable, with the specified hex as the
 * fallback. That is easy to undo by accident — pasting the literal from the design sheet
 * looks right in a default install and is wrong everywhere else, with nothing to say so
 * until someone with a themed instance notices their viewer is the wrong colour.
 *
 * The canvas chrome is exempt on purpose: those overlays sit on the rendered 3D scene and
 * are fixed dark here so they stay readable over a dark model.
 *
 * This is about the base palette — the one in effect when the viewer's own theme control is
 * on Auto, which is when "follow the instance" is what the viewer is trying to do. Choosing
 * Light or Dark installs a palette that deliberately stops following it, since a light
 * palette assembled from a dark instance's variables comes out dark; those blocks are held
 * to the opposite rule, in `themeOverride.test.js`.
 */

const { readFileSync } = require('fs')
const { join } = require('path')

const css = readFileSync(join(__dirname, '..', '..', 'src', 'css', 'design-system.css'), 'utf8')

/** The base palette, up to the first closing brace — everything after it overrides. */
const baseBlock = css.slice(css.indexOf(':root {'), css.indexOf('\n}'))

/** @return {Array<[string, string]>} custom property declarations as name/value pairs */
function declarations() {
	return [...baseBlock.matchAll(/(--tdv-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
}

describe('design system tokens', () => {
	const all = declarations()

	// Fixed by design: chrome and overlays drawn on top of the 3D canvas.
	const isCanvasChrome = (name) => name.startsWith('--tdv-canvas') || name.startsWith('--tdv-hud')

	/*
	 * Nextcloud publishes a variable for its error colour and none for the text drawn on
	 * top of it, so `--tdv-color-on-error` has nothing to follow. Writing
	 * `var(--color-error-text-on, #fff)` would satisfy this check by naming a variable that
	 * does not exist, which is worse than a literal: it reads as themed and never is.
	 */
	const hasNoNextcloudCounterpart = (name) => name === '--tdv-color-on-error'

	// Every colour token except the canvas chrome.
	const themed = all.filter(([name]) =>
		/color/.test(name) && !isCanvasChrome(name) && !hasNoNextcloudCounterpart(name))

	it('defines the palette the design sheet specifies', () => {
		const names = all.map(([n]) => n)
		for (const token of [
			'--tdv-color-primary', '--tdv-color-primary-hover', '--tdv-color-primary-light',
			'--tdv-color-text', '--tdv-color-text-secondary', '--tdv-color-border',
			'--tdv-color-hover-bg', '--tdv-color-success', '--tdv-color-warning', '--tdv-color-error',
			'--tdv-canvas-dark',
		]) {
			expect(names).toContain(token)
		}
	})

	it.each(themed)('%s follows the instance theme rather than a literal', (name, value) => {
		expect(value).toMatch(/var\(--color-/)
	})

	it.each(themed)('%s keeps the design sheet value as its fallback', (name, value) => {
		expect(value).toMatch(/var\(--color-[a-z-]+,\s*[^)]+\)/)
	})

	it('keeps the canvas chrome fixed, because it sits on the rendered scene', () => {
		const canvas = all.filter(([name]) => isCanvasChrome(name))
		expect(canvas.length).toBeGreaterThan(3)
		for (const [, value] of canvas) {
			expect(value).not.toMatch(/var\(--color-/)
		}
	})
})
