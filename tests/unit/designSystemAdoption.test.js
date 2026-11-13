/**
 * The primary colour is decided in one place.
 *
 * Nextcloud publishes two different primary colours. `--color-primary` is the raw colour
 * the admin picked; `--color-primary-element` is that colour corrected until it passes
 * contrast against the page background. They are the same on a default install, which is
 * why reaching for the wrong one is invisible here and only shows up on an instance
 * themed pale — where a border drawn in `--color-primary` disappears into the surface it
 * is supposed to divide. The official component library uses the `-element` family for
 * every interactive element and never the raw one; so should this app.
 *
 * The second rule is about where colour comes from at all. Reaching for a Nextcloud
 * variable directly means every use site also decides the fallback, and the copies drift:
 * this codebase carried #0082c9, #64b5f6 and #0d47a1 as the default for one variable, and
 * both #000 and #fff as the default for another, so what an unthemed instance rendered
 * depended on which rule an element landed on. Nothing reconciles copies of a value that
 * are never compared. Colour now enters through the token layer, once, where the mapping
 * from Nextcloud's palette to this app's is a decision that can be read.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')

/** The token layer is where the fallbacks are allowed to live. */
const TOKEN_LAYER = join(SRC, 'css', 'design-system.css')

/**
 * The link preview card's stylesheet. It is drawn in other apps' pages (Talk, Text), where
 * the token layer is not loaded and must not be: it would put 11 KB of the viewer's styles on
 * every chat page. So the card maps the few Nextcloud colours it uses itself, in one palette
 * block, and the test below holds each of those to the token layer's fallback for the same
 * variable, so the two cannot drift apart.
 */
const CARD_LAYER = join(SRC, 'css', 'reference-card.css')

/** `--name: var(--color-x, fallback)` declarations, as [nextcloud variable, fallback] pairs. */
function mappings(text) {
	return [...text.matchAll(/--[a-z-]+:\s*var\(\s*(--color-[a-z-]+)\s*,\s*([^)]+)\)/g)].map((m) => [m[1], m[2].trim()])
}

/**
 * Every file under src that can carry a style, minus the token layer itself.
 *
 * @param {string} dir - directory to walk
 * @return {string[]} absolute file paths
 */
function styleFilesUnder(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			return styleFilesUnder(full)
		}
		return /\.(vue|css|js)$/.test(full) && full !== TOKEN_LAYER && full !== CARD_LAYER ? [full] : []
	})
}

const files = styleFilesUnder(SRC)
	.filter((f) => !f.includes('__tests__'))
	.map((f) => ({ name: relative(SRC, f), text: readFileSync(f, 'utf8') }))

/** `--color-primary`, `-light`, `-text`, `-hover` — everything but the `-element` family. */
const RAW_PRIMARY = /--color-primary(?!-element)[a-z-]*/g

/** Any Nextcloud colour variable reached for outside the token layer. */
const DIRECT_REFERENCE = /var\(\s*--color-[a-z-]+[^)]*\)/g

describe('design system adoption', () => {
	it('scans the components, so this guard cannot pass vacuously', () => {
		expect(files.length).toBeGreaterThan(10)
	})

	it.each(files.map((f) => f.name))(
		'%s asks for the contrast-corrected primary, not the raw one',
		(name) => {
			const { text } = files.find((f) => f.name === name)
			expect([...text.matchAll(RAW_PRIMARY)].map((m) => m[0])).toEqual([])
		},
	)

	describe('the link preview card', () => {
		const card = readFileSync(CARD_LAYER, 'utf8')
		const tokens = new Map(mappings(readFileSync(TOKEN_LAYER, 'utf8')))
		const palette = mappings(card)

		it('maps its colours in its palette and nowhere else', () => {
			expect(palette.length).toBeGreaterThan(0)
			expect([...card.matchAll(DIRECT_REFERENCE)].length).toBe(palette.length)
		})

		it.each(palette)('falls back for %s as the token layer does', (variable, fallback) => {
			expect(tokens.has(variable)).toBe(true)
			expect(fallback).toBe(tokens.get(variable))
		})

		it('asks for the contrast-corrected primary, not the raw one', () => {
			expect([...card.matchAll(RAW_PRIMARY)].map((m) => m[0])).toEqual([])
		})
	})

	it.each(files.map((f) => f.name))(
		'%s takes its colours from the token layer',
		(name) => {
			const { text } = files.find((f) => f.name === name)
			expect([...text.matchAll(DIRECT_REFERENCE)].map((m) => m[0])).toEqual([])
		},
	)
})
