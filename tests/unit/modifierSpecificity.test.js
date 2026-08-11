/**
 * A modifier has to outrank the base class it modifies.
 *
 * Nextcloud paints every `<button>` on the page at a specificity a single class does not
 * beat, so the base rules in this app are written as doubled classes — `.rail-btn.rail-btn`,
 * `.tool-btn.tool-btn` — which is what `buttonSpecificity.test.js` requires. Doubling the
 * base also raises it above every modifier written beside it: `.rail-wide { width: 100% }`
 * scores (0,1,0) and `.rail-btn.rail-btn { width: 32px }` scores (0,2,0), so the rail's
 * full-width items kept the 32px box, and an explicit width cancels a grid item's stretch —
 * the drag handle and the recentre button sat 17px left of the column pair above them,
 * inside a rail whose dividers spanned it correctly.
 *
 * It reads as an alignment bug and it is a specificity bug, which is why it survived being
 * looked at: the modifier is right there in the file saying `width: 100%`.
 *
 * So: for every pair of classes a template puts on the same element, a declaration in the
 * second cannot be outranked by the same declaration in the first.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')

/**
 * Every stylesheet-bearing file under a directory.
 *
 * @param {string} dir - directory to walk
 * @return {string[]} absolute file paths
 */
function sourcesUnder(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : sourcesUnder(full)
		return /\.(vue|css)$/.test(full) ? [full] : []
	})
}

const files = sourcesUnder(SRC).map((f) => [relative(SRC, f).split('\\').join('/'), readFileSync(f, 'utf8')])
const everything = files.map(([, text]) => text).join('\n')

/** Class names that appear together on one element, as unordered pairs keyed `a\u0000b`. */
const coOccurring = new Set(
	[...everything.matchAll(/\bclass="([^"{}]+)"/g)]
		.map((m) => m[1].split(/\s+/).filter((name) => /^[\w-]+$/.test(name)))
		.flatMap((names) => names.flatMap((a) => names.map((b) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`))))
		.filter((pair) => !pair.startsWith('\u0000') && pair.split('\u0000')[0] !== pair.split('\u0000')[1]),
)

/**
 * Rules whose selector is one class, repeated or not, with no other constraint.
 *
 * Anything else — a descendant, a state, an attribute — is answering a different question
 * and is out of scope: this is only about two classes on one element.
 *
 * @return {Array<{file: string, name: string, score: number, declarations: Map<string, boolean>}>} one entry per rule
 */
function singleClassRules() {
	return files.flatMap(([file, text]) =>
		[...text.matchAll(/([^\n{}]+)\{([^{}]*)\}/g)].flatMap((rule) => {
			const [, selectors, body] = rule
			return selectors.split(',').flatMap((selector) => {
				const sel = selector.trim()
				const parts = sel.match(/^(\.[\w-]+)+$/) ? sel.split('.').filter(Boolean) : null
				if (!parts || new Set(parts).size !== 1) return []
				const declarations = new Map(
					[...body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:([^;]*)/g)]
						.map((d) => [d[1], d[2].includes('!important')]),
				)
				if (!declarations.size) return []
				return [{ file, name: parts[0], score: parts.length, declarations }]
			})
		}),
	)
}

/**
 * Every declaration a modifier makes that its base already makes at a higher rank.
 *
 * @return {string[]} one entry per losing declaration
 */
function unreachableModifiers() {
	const rules = singleClassRules()
	return rules.flatMap((modifier) => rules.flatMap((base) => {
		if (base.name === modifier.name || base.file !== modifier.file) return []
		const pair = base.name < modifier.name
			? `${base.name}\u0000${modifier.name}`
			: `${modifier.name}\u0000${base.name}`
		if (!coOccurring.has(pair)) return []

		return [...modifier.declarations].flatMap(([property, important]) => {
			if (!base.declarations.has(property) || important) return []
			/*
			 * Equal scores are how a modifier normally works — `.bar-cluster--end` beside
			 * `.bar-cluster`, settled by which is written second, which is a decision the
			 * author made and can see. Only a rule that can never win is a defect, and
			 * within one file that means strictly fewer classes than what it modifies.
			 */
			if (modifier.score >= base.score) return []
			return [`${modifier.file} — .${modifier.name} (${modifier.score}) cannot set ${property}`
				+ ` over .${base.name} (${base.score})`]
		})
	}))
}

describe('a class that modifies another', () => {
	it('finds classes sharing an element, so this guard cannot pass vacuously', () => {
		expect(coOccurring.size).toBeGreaterThan(20)
	})

	it('outranks it, so the declaration it makes is the one that applies', () => {
		expect(unreachableModifiers()).toEqual([])
	})
})
