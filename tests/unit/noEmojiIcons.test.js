/**
 * Emoji are not icons.
 *
 * The viewer draws its controls with emoji — 🔄 for reset, 📷 for screenshot, 🎮 for the
 * controller. Four things are wrong with that, and none of them show up on the machine
 * the code was written on:
 *
 * - They are font, not artwork. Every platform draws its own, so the toolbar is a
 *   different set of pictures on Windows, on Android and on a Linux desktop with no emoji
 *   font at all, where it is a row of tofu boxes.
 * - They ignore `currentColor`, so an emoji in a dark toolbar stays whatever colour the
 *   font vendor chose, and cannot indicate a disabled or active state.
 * - A screen reader announces the character's Unicode name, not the action. `aria-hidden`
 *   would fix that, and none of these have it.
 * - They ignore the design system entirely. The mockup draws every control as a 20px
 *   Material Design icon inheriting the button's colour, which is what `--tdv-icon-size`
 *   is for.
 *
 * Conversion is one component at a time, so this carries the list of files still to do.
 * The second test is the one that keeps the list honest: a file that has been converted
 * has to come off it. Without that, the list only ever grows, and a baseline nobody can
 * shrink is a permanent exemption wearing a to-do list's clothes.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')

/**
 * Components not yet converted to the icon set.
 *
 * Remove a file when its emoji are gone. Never add one.
 */
const PENDING = [
	'components/CircularController.vue',
	'components/HelpPanel.vue',
	'components/SlicerModal.vue',
	'components/SlideOutToolPanel.vue',
	'components/ThreeViewer.vue',
	'components/ViewerToolbar.vue',
	'views/ViewerComponent.vue',
]

/**
 * Pictographs and the dingbat ranges emoji are drawn from.
 *
 * Deliberately not every symbol block: `·` and `×` are typography, and the arrows in a
 * keyboard-shortcut list are text about keys rather than pictures standing in for words.
 */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu

/**
 * Every component under src.
 *
 * @param {string} dir - directory to walk
 * @return {string[]} absolute file paths
 */
function componentsUnder(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			return componentsUnder(full)
		}
		return full.endsWith('.vue') ? [full] : []
	})
}

const components = componentsUnder(SRC).map((f) => ({
	name: relative(SRC, f).split('\\').join('/'),
	text: readFileSync(f, 'utf8'),
}))

const emojiIn = (text) => [...new Set(text.match(EMOJI) ?? [])]

describe('emoji are not icons', () => {
	it('scans the components, so this guard cannot pass vacuously', () => {
		expect(components.length).toBeGreaterThan(10)
	})

	it.each(components.filter((c) => !PENDING.includes(c.name)).map((c) => c.name))(
		'%s draws its controls with the icon set',
		(name) => {
			expect(emojiIn(components.find((c) => c.name === name).text)).toEqual([])
		},
	)

	it.each(PENDING)('%s is still listed as pending for a reason', (name) => {
		const component = components.find((c) => c.name === name)
		expect(component).toBeDefined()
		// Converted, but still exempted: the list has to shrink or it means nothing.
		expect(emojiIn(component.text).length).toBeGreaterThan(0)
	})
})
