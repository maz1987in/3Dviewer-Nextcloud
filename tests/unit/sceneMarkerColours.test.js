/**
 * What the viewer draws *into the scene* follows the design system too.
 *
 * The panels were redesigned and the markers they describe were not, so a measurement
 * rendered as a fluorescent green bar between two pure yellow spheres, and an annotation
 * as a pure red dot beside red text in a black box — beneath a panel drawn entirely in the
 * app's own palette. `#00ff00`, `#ffff00` and `#ff0000` are the same choice the ground grid
 * shipped with for years: values picked to be unmissable during development and never
 * revisited. See [[gridColour]], which removed six copies of one of them.
 *
 * Scene chrome cannot use the CSS tokens — these are WebGL materials and 2D canvas fills,
 * not stylesheet rules — so it takes its colours from one exported table instead, holding
 * the same canvas-chrome values the HUD uses. That is the whole point of the table: the
 * alternative is what was there, where the line, the marker and the label each chose for
 * themselves and no two agreed.
 *
 * Deliberately not a blanket ban on saturated colour. The axis helper is red/green/blue
 * because those axes are conventionally red, green and blue, and a guard that failed on it
 * would teach the next person to switch the guard off.
 */

const { readFileSync } = require('fs')
const { join } = require('path')
const { MARKER_COLORS } = require('../../src/config/viewer-config.js')

const SRC = join(__dirname, '..', '..', 'src')

/** The files that draw a measurement or an annotation into the scene. */
const FILES = [
	join('composables', 'useMeasurement.js'),
	join('composables', 'useAnnotation.js'),
	join('utils', 'modelScaleUtils.js'),
].map((rel) => ({ name: rel, text: readFileSync(join(SRC, rel), 'utf8') }))

/** A saturated primary or secondary, in the notations a Three.js material uses. */
const DEBUG_COLOUR = /0x(?:ff0000|00ff00|0000ff|ffff00|00ffff|ff00ff)\b|#(?:f00|0f0|00f|ff0|0ff|f0f)\b|#(?:ff0000|00ff00|0000ff|ffff00|00ffff|ff00ff)\b/i

describe('the markers the viewer draws into the scene', () => {
	it('reads the files that draw them, so this guard cannot pass vacuously', () => {
		expect(FILES.every((f) => f.text.length > 500)).toBe(true)
	})

	it.each(FILES.map((f) => f.name))('%s uses no debug colour', (name) => {
		const { text } = FILES.find((f) => f.name === name)
		const offenders = text
			.split('\n')
			.map((line, i) => [i + 1, line])
			.filter(([, line]) => !/^\s*(\/\/|\/?\*)/.test(line))
			.filter(([, line]) => DEBUG_COLOUR.test(line))
			.map(([n, line]) => `${name}:${n} ${line.trim()}`)
		expect(offenders).toEqual([])
	})

	/*
	 * A label that names its own font renders in that font on an instance whose interface
	 * is set in something else, and in whatever the canvas falls back to on a machine
	 * without it. These are drawn into a 2D canvas, so they cannot inherit — which is
	 * exactly why the value has to come from one place rather than from each call site.
	 */
	it.each(FILES.map((f) => f.name))('%s names no font of its own', (name) => {
		const { text } = FILES.find((f) => f.name === name)
		const offenders = [...text.matchAll(/font(?:Family)?\s*[:=]\s*'([^']+)'/g)]
			.map((m) => m[1])
			.filter((value) => !value.startsWith('var(') && value !== MARKER_COLORS.font)
		expect(offenders).toEqual([])
	})

	describe('the marker colour table', () => {
		it('gives measurement and annotation different colours, so the two modes are told apart', () => {
			expect(MARKER_COLORS.measurement).not.toBe(MARKER_COLORS.annotation)
		})

		it('is legible on the surface its labels are drawn on', () => {
			// WCAG relative luminance, against the HUD's own near-black.
			const lum = (hex) => {
				const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
				const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
				return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
			}
			const surface = lum(MARKER_COLORS.labelSurface)
			for (const key of ['measurement', 'annotation']) {
				const ratio = (lum(MARKER_COLORS[key]) + 0.05) / (surface + 0.05)
				expect(ratio).toBeGreaterThanOrEqual(4.5)
			}
		})
	})
})
