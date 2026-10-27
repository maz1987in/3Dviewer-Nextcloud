/**
 * Models exported on Windows name their textures by a path on the author's machine, and
 * those directories do not exist here. Such a reference falls back to its bare file name
 * beside the model; a remote one stays excluded; a relative one keeps its rules.
 *
 * The table is shared with tests/unit/Service/ModelDependencyResolverTest.php, which
 * holds the server's resolver to the same answers: the client must ask for exactly the
 * names the server will serve.
 */
import table from '../../fixtures/texture-references.json'
import { isLocalAbsoluteRef, nameOnlyRef, normaliseRef } from '../../../src/loaders/textureReferences.js'

const cases = table.cases.map(({ ref, expected, why }) => [why, ref, expected])

describe('normaliseRef', () => {
	it.each(cases)('%s: %j → %j', (_, ref, expected) => {
		expect(normaliseRef(ref)).toBe(expected)
	})

	it('never keeps a directory of an absolute path', () => {
		for (const { ref, expected } of table.cases) {
			if (isLocalAbsoluteRef(ref) && expected !== null) {
				expect(expected).not.toMatch(/[/\\]/)
			}
		}
	})

	it.each([
		['a run of backslashes after a drive letter', `C:${'\\'.repeat(1_000_000)}wood.jpg`, 'wood.jpg'],
		['a run of slashes', `${'/'.repeat(1_000_000)}wood.jpg`, 'wood.jpg'],
		['a file: URL of stray percent signs', `file:///${'%'.repeat(1_000_000)}`, '%'.repeat(1_000_000)],
		['a file: URL of escapes', `file:///${'%41'.repeat(300_000)}.png`, `${'A'.repeat(300_000)}.png`],
		['a file: URL of query marks', `file:///wood.jpg${'?'.repeat(1_000_000)}`, 'wood.jpg'],
	])('reduces a crafted reference in linear time: %s', (_, ref, expected) => {
		const started = Date.now()

		expect(normaliseRef(ref)).toBe(expected)
		expect(Date.now() - started).toBeLessThan(500)
	})
})

describe('nameOnlyRef', () => {
	it('is only for absolute and file: references', () => {
		expect(nameOnlyRef('textures/wood.jpg')).toBeNull()
		expect(nameOnlyRef('https://example.invalid/wood.jpg')).toBeNull()
	})
})
