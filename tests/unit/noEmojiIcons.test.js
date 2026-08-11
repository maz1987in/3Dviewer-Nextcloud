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
 * This carried a list of components still to convert, plus a second test that failed if a
 * converted file stayed on it — a baseline nobody can shrink is a permanent exemption
 * wearing a to-do list's clothes. The list is empty now, so both are gone: every
 * component is checked, and there is nowhere to put a new exemption.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')

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

	it.each(components.map((c) => c.name))(
		'%s draws its controls with the icon set',
		(name) => {
			expect(emojiIn(components.find((c) => c.name === name).text)).toEqual([])
		},
	)
})

/**
 * An arrow is in the ranges this file deliberately leaves alone, because an arrow in a
 * keyboard-shortcut list is text about a key rather than a picture standing in for a word.
 *
 * In a label it is the picture, and it carries every one of the problems above: "Open in 3D
 * Viewer ↗" ended in whatever U+2197 looks like in the user's font, at whatever colour and
 * weight that font gives it — beside a Material Design icon set drawn at 20px in
 * `currentColor` — and a screen reader read it out as "north east arrow".
 *
 * Only what a template renders is checked. `→` is the clearest thing to write in a comment
 * describing a pipeline, and there are a dozen of those.
 */
describe('an arrow in a label', () => {
	const ARROWS = /[\u{2190}-\u{21FF}\u{2794}-\u{27BF}]/gu

	/**
	 * The text a template renders: what sits between its tags, plus the attributes that
	 * become visible words.
	 *
	 * @param {string} text - the component's source
	 * @return {string} the rendered text, concatenated
	 */
	const rendered = (text) => {
		const template = /<template>([\s\S]*)<\/template>/.exec(text)?.[1] ?? ''

		/*
		 * Until it stops changing, rather than once: cutting one comment out can splice what
		 * surrounded it into another. `<<!-- -->!-- x -->` reduces to `<!-- x -->` in a
		 * single pass and to nothing here.
		 *
		 * CodeQL reports the single pass as incomplete multi-character sanitization, and it
		 * is right that the code does not do what its name says — though what is read here
		 * is this repository's own components rather than anything a user sends, so nothing
		 * was exposed by it.
		 */
		let withoutComments = template
		for (let previous = null; previous !== withoutComments;) {
			previous = withoutComments
			withoutComments = withoutComments.replace(/<!--[\s\S]*?-->/g, '')
		}

		const betweenTags = withoutComments.replace(/<[^>]*>/g, '\n')
		const visibleAttributes = [...withoutComments
			.matchAll(/\b(?:title|aria-label|placeholder)="([^"]*)"/g)].map((m) => m[1])
		return [betweenTags, ...visibleAttributes].join('\n')
	}

	it.each(components.map((c) => c.name))('is drawn from the icon set in %s', (name) => {
		const found = rendered(components.find((c) => c.name === name).text).match(ARROWS) ?? []
		expect([...new Set(found)]).toEqual([])
	})
})
