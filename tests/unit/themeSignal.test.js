/**
 * The theme the user picked is on the document, and "auto" is not a third palette.
 *
 * The viewer's own Light and Dark override Nextcloud's colours; Auto defers to them. That
 * distinction cannot be made from the resolved theme alone — "auto on a dark page" and
 * "dark chosen deliberately" resolve to the same word and must style differently, because
 * only one of them should stop reading the instance's variables. So the signal an explicit
 * choice writes is separate from the resolved-theme class the scene rules already use.
 *
 * Auto follows the page rather than the operating system. The panels have always taken
 * their colours from Nextcloud, and a viewer that reads `prefers-color-scheme` instead
 * would sit light inside a dark instance whenever the two disagree — which is the state
 * this whole change was reported from.
 */

const { useTheme } = require('../../src/composables/useTheme.js')

/**
 * Make the page report a Nextcloud background colour.
 *
 * @param {string} colour - what `--color-main-background` should resolve to
 */
function pageBackground(colour) {
	document.documentElement.style.setProperty('--color-main-background', colour)
}

describe('the theme signal', () => {
	beforeEach(() => {
		document.documentElement.removeAttribute('data-tdv-theme')
		document.documentElement.style.removeProperty('--color-main-background')
		document.body.className = ''
	})

	it.each(['light', 'dark'])('marks the document when %s is chosen', (mode) => {
		useTheme().setTheme(mode)
		expect(document.documentElement.getAttribute('data-tdv-theme')).toBe(mode)
	})

	it('leaves no mark for auto, so the instance keeps its own colours', () => {
		const theme = useTheme()
		theme.setTheme('dark')
		theme.setTheme('auto')
		expect(document.documentElement.getAttribute('data-tdv-theme')).toBeNull()
	})

	it.each([
		['a dark page', '#181818', 'dark'],
		['a light page', '#ffffff', 'light'],
	])('resolves auto from %s', (_label, background, expected) => {
		pageBackground(background)
		useTheme().setTheme('auto')
		expect(document.body.classList.contains(`theme--${expected}`)).toBe(true)
	})

	it('still marks the resolved theme on the body, which the scene rules read', () => {
		useTheme().setTheme('dark')
		expect(document.body.classList.contains('theme--dark')).toBe(true)
	})

	/*
	 * The path a returning user takes. Startup restores the preference without going
	 * through `setTheme`, so a mark applied only there would be missing on every load and
	 * present only after the control was touched — visible as a viewer that reverts to the
	 * instance's colours on refresh.
	 */
	it('marks the document for a preference restored at startup', () => {
		localStorage.setItem('threedviewer:theme', 'light')
		useTheme().initTheme()
		expect(document.documentElement.getAttribute('data-tdv-theme')).toBe('light')
		localStorage.removeItem('threedviewer:theme')
	})
})
