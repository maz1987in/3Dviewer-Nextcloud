/**
 * The grid under the model is one colour, and it follows the theme.
 *
 * It was fluorescent green — `#00ff00` — on every theme, and had five separate
 * declarations saying so: `GRID_SETTINGS.color`, `.colorCenterLine` and `.colorGrid`,
 * both themes' `gridColor` in `THEME_SETTINGS`, a `grid.material.color.setHex(0x00ff00)`
 * written straight into the scene code, and `|| 0x00ff00` as the last fallback at each of
 * the two places the helper is built.
 *
 * The settings panel disagreed with all of them. Its swatch read `#888888` from a
 * defaults map of its own, so the control that is supposed to show the grid's colour
 * showed grey while the grid was green — which is how this was noticed at all.
 *
 * A default duplicated six times is not a default, it is six independent decisions that
 * were never compared. These tests hold them to one source.
 */

const { GRID_SETTINGS, THEME_SETTINGS } = require('../../src/config/viewer-config.js')
const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')

/**
 * Every source file under src.
 *
 * @param {string} dir - directory to walk
 * @return {string[]} absolute file paths
 */
function sourcesUnder(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			return sourcesUnder(full)
		}
		return /\.(js|vue)$/.test(full) && !full.includes('__tests__') ? [full] : []
	})
}

describe('the grid colour', () => {
	it('is a theme setting, so the two themes do not agree on it', () => {
		expect(THEME_SETTINGS.light.gridColor).not.toBe(THEME_SETTINGS.dark.gridColor)
	})

	it('is legible against each theme background rather than shouting over both', () => {
		// Pure green on white and pure green on near-black is the signature of a value
		// picked to be obvious during development and never revisited.
		for (const theme of ['light', 'dark']) {
			expect(THEME_SETTINGS[theme].gridColor.toLowerCase()).not.toBe('#00ff00')
		}
	})

	it('has one value for the unthemed default, not one per call site', () => {
		const light = THEME_SETTINGS.light.gridColor.toLowerCase()
		expect(GRID_SETTINGS.color.toLowerCase()).toBe(light)
		expect(GRID_SETTINGS.colorGrid.toLowerCase()).toBe(light)
		expect(GRID_SETTINGS.colorCenterLine.toLowerCase()).toBe(light)
	})

	/*
	 * Scoped to the grid on purpose. The same green is a deliberate highlight elsewhere —
	 * measurement lines, face-label borders, the selection box — and banning the literal
	 * outright would either fail on those or teach the next person to suppress the guard.
	 */
	it('is never written as a literal in the code that draws the grid', () => {
		const offenders = sourcesUnder(SRC)
			.filter((f) => !f.endsWith(join('config', 'viewer-config.js')))
			.flatMap((f) => readFileSync(f, 'utf8')
				.split('\n')
				.map((line, i) => [i + 1, line])
				// Comments may name the value — this one's own explanation does.
				.filter(([, line]) => !/^\s*(\/\/|\/?\*)/.test(line))
				.filter(([, line]) => /grid/i.test(line) && /0x00ff00|#00ff00/i.test(line))
				.map(([n, line]) => `${relative(SRC, f)}:${n} ${line.trim()}`))
		expect(offenders).toEqual([])
	})
})
