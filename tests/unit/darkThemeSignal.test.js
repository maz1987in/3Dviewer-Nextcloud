/**
 * The app has one name for "dark", and it is the one it actually sets.
 *
 * `useTheme` puts `theme--dark` on the body, and `ViewerModal` and `HelpPanel` style
 * against it. Four other components style against `dark-theme` instead — a name only
 * ever applied to the slicer dialog's own root element, which the toolbar, the viewer
 * and the toasts are not inside. Ten rules written for the dark theme therefore match
 * nothing at all, and always have.
 *
 * Nothing catches that on its own. A selector that matches no element throws no error,
 * fails no build and shows up in no test; the page simply renders as though the rule
 * were never written, which is exactly how it renders when the rule is working and the
 * theme is light. The only way to tell the two apart is to check that the name in the
 * stylesheet is the name the code applies.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')
const THEME = join(SRC, 'composables', 'useTheme.js')

/**
 * Every file under src that can name a theme class.
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
		return /\.(vue|css|js)$/.test(full) ? [full] : []
	})
}

/** The class names `applyThemeColors` swaps on the body — the app's actual signal. */
const applied = [...readFileSync(THEME, 'utf8')
	.matchAll(/classList\.remove\(([^)]*)\)/g)]
	.flatMap((m) => [...m[1].matchAll(/'(theme--[a-z]+)'/g)].map((n) => n[1]))

const files = sourcesUnder(SRC)
	.filter((f) => !f.includes('__tests__'))
	.map((f) => ({ name: relative(SRC, f), text: readFileSync(f, 'utf8') }))

describe('the dark theme signal', () => {
	it('is set by useTheme, which is where this guard reads it from', () => {
		expect(applied).toEqual(['theme--light', 'theme--dark'])
	})

	it('is styled against by more than one component, so this guard is not vacuous', () => {
		expect(files.filter((f) => f.text.includes('theme--dark')).length).toBeGreaterThan(1)
	})

	it.each(files.map((f) => f.name))('%s styles dark against the applied class', (name) => {
		const { text } = files.find((f) => f.name === name)
		expect([...text.matchAll(/\bdark-theme\b/g)].map((m) => m[0])).toEqual([])
	})

	/**
	 * The class sits on the body, so it can only ever be an ancestor. Written into a
	 * compound selector — `.slicer-modal.theme--dark` — it asks for one element carrying
	 * both classes, which no element does. That reads as a working rule and behaves as a
	 * deleted one, the same failure this whole guard exists for, so it is checked here
	 * rather than left to be discovered the same way.
	 */
	it.each(files.map((f) => f.name))('%s keeps the theme class out of a compound selector', (name) => {
		const { text } = files.find((f) => f.name === name)
		expect([...text.matchAll(/[\w\])]\.theme--(?:dark|light)\b/g)].map((m) => m[0])).toEqual([])
	})
})
