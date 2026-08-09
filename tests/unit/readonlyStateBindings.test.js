/**
 * Nothing writes into state a composable exposes as read-only.
 *
 * The annotation panel's note field was `v-model="annotation.text"`, over a `v-for` across
 * `annotations` — which `useAnnotation` returns as `readonly(annotations)`. Writing through
 * a readonly proxy is a no-op: Vue warns in a development build, says nothing in a
 * production one, and in both cases re-renders the field back to its stored value on the
 * next tick. The note could not be typed into.
 *
 * The blur handler beside it then passed `annotation.text` — the same unchanged value — to
 * the composable, so the round trip was broken at both ends and neither end could be
 * observed from the other. Reading the code, both halves look right; they are only wrong
 * about the thing between them.
 *
 * This is a static check because the browser suite cannot reach it: placing an annotation
 * needs a click on model geometry, and in the static fixture that click does not arrive at
 * the viewer's own canvas handler. So the property is checked where it is decidable — a
 * `v-model` whose target came from a collection the composable made read-only is wrong on
 * sight, whatever it is bound to.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, relative } = require('path')

const SRC = join(__dirname, '..', '..', 'src')

/**
 * Every file under a directory matching an extension.
 *
 * @param {string} dir - directory to walk
 * @param {RegExp} pattern - which files to keep
 * @return {string[]} absolute file paths
 */
function filesUnder(dir, pattern) {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			return entry === '__tests__' ? [] : filesUnder(full, pattern)
		}
		return pattern.test(full) ? [full] : []
	})
}

/** Names the composables hand out through `readonly()`, as the templates would see them. */
const readonlyNames = new Set(
	filesUnder(join(SRC, 'composables'), /\.js$/)
		.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/(\w+):\s*readonly\(/g)])
		.map((m) => m[1]),
)

/** Every template, with the aliases it binds over a read-only collection. */
const templates = filesUnder(join(SRC, 'components'), /\.vue$/).map((f) => {
	const text = readFileSync(f, 'utf8')
	const aliases = [...text.matchAll(/v-for="\(?\s*(\w+)[^"]*\bin\s+(\w+)/g)]
		.filter(([, , collection]) => readonlyNames.has(collection))
		.map(([, alias]) => alias)
	return { name: relative(SRC, f), text, aliases }
})

describe('read-only composable state', () => {
	it('finds the collections the composables protect, so this guard cannot pass vacuously', () => {
		expect(readonlyNames.size).toBeGreaterThan(5)
	})

	it('is iterated by at least one template, so the check below has something to check', () => {
		expect(templates.some((t) => t.aliases.length > 0)).toBe(true)
	})

	it.each(templates.map((t) => t.name))('%s does not v-model into it', (name) => {
		const { text, aliases } = templates.find((t) => t.name === name)
		const offenders = aliases.flatMap((alias) =>
			[...text.matchAll(new RegExp(`v-model="${alias}\\.[\\w.]+`, 'g'))].map((m) => m[0]),
		)
		expect(offenders).toEqual([])
	})
})
