/**
 * The copied icon paths still match the package they were copied from.
 *
 * `src/config/icon-paths.js` holds Material Design path data lifted out of
 * vue-material-design-icons, because a compiled icon component costs about 0.95 KB raw
 * where its path costs a few hundred bytes, and the redesign needs roughly thirty of
 * them. Ten imported as components put the app chunk over budget on their own.
 *
 * A copy nothing compares against is a copy that drifts. When the package updates an
 * icon — Material redraws them — the viewer keeps the old shape and slowly stops matching
 * the iconography around it, with nothing to say so: a stale path is still a valid path,
 * and it renders a perfectly good picture of the wrong thing.
 *
 * So this reads the package back. It is the check that makes the copy safe to keep.
 */

const { readFileSync } = require('fs')
const { join } = require('path')

const ROOT = join(__dirname, '..', '..')
const PACKAGE = join(ROOT, 'node_modules', 'vue-material-design-icons')

/** Parse the two source files without importing ESM into Jest's CommonJS. */
const declaredPaths = () => Object.fromEntries(
	[...readFileSync(join(ROOT, 'src', 'config', 'icon-paths.js'), 'utf8')
		.matchAll(/^\t([a-zA-Z]+): '([^']+)',$/gm)]
		.map((m) => [m[1], m[2]]),
)

const declaredSources = () => Object.fromEntries(
	[...readFileSync(join(ROOT, 'scripts', 'sync-icon-paths.mjs'), 'utf8')
		.matchAll(/^\t([a-zA-Z]+): '([A-Za-z0-9]+)',$/gm)]
		.map((m) => [m[1], m[2]]),
)

const paths = declaredPaths()
const sources = declaredSources()

describe('icon paths', () => {
	it('parses both files, so this guard cannot pass vacuously', () => {
		expect(Object.keys(paths).length).toBeGreaterThan(5)
		// Sorted: the generated file orders alphabetically, the source map does not.
		expect(Object.keys(sources).sort()).toEqual(Object.keys(paths).sort())
	})

	it.each(Object.keys(paths))('%s is the package\'s current path', (name) => {
		const source = readFileSync(join(PACKAGE, `${sources[name]}.vue`), 'utf8')
		const packagePaths = [...source.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1])

		// More than one path means the generator picked arbitrarily and the copy is not
		// the icon; it is part of one.
		expect(packagePaths).toHaveLength(1)
		expect(paths[name]).toBe(packagePaths[0])
	})
})
