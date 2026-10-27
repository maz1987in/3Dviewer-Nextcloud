/**
 * An MTL's maps are relative to the MTL, not to the model. The server's resolver joins
 * each to the MTL's folder before it normalises it, so the client has to as well, or it
 * asks for files the server does not serve: `mats/chair.mtl` naming
 * `../textures/wood.png` means `textures/wood.png`, not `wood.png` beside the model.
 *
 * The table is shared with tests/unit/Service/ModelDependencyResolverTest.php.
 */
import table from '../../fixtures/texture-references.json'
import { parseMtlTexturePaths } from '../../../src/loaders/multiFileHelpers.js'
import { materialDirectory, normaliseRef } from '../../../src/loaders/textureReferences.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const rows = table.mtl.map(({ material, materialAt, map, expected, why }) => [why, material, materialAt, map, expected])

describe('parseMtlTexturePaths', () => {
	it.each(rows)('%s: %j naming %j', (_, material, materialAt, map, expected) => {
		expect(normaliseRef(material)).toBe(materialAt)
		expect(parseMtlTexturePaths(`newmtl seat\nmap_Kd ${map}\n`, material)).toEqual(expected === null ? [] : [expected])
	})

	it('reads every map statement, in order, once each', () => {
		const mtl = 'newmtl a\nmap_Kd wood.png\nbump ../maps/normal.png\nmap_Ks wood.png\nrefl ../../env.png\n'

		expect(parseMtlTexturePaths(mtl, 'mats/chair.mtl')).toEqual(['mats/wood.png', 'maps/normal.png', 'env.png'])
	})
})

describe('materialDirectory', () => {
	it.each([
		['mats/chair.mtl', 'mats'],
		['a/b/chair.mtl', 'a/b'],
		['chair.mtl', '.'],
		[null, '.'],
	])('%j is in %j', (path, directory) => {
		expect(materialDirectory(path)).toBe(directory)
	})
})

describe('normaliseRef relative to a folder', () => {
	it('joins a relative path to the folder before collapsing it', () => {
		expect(normaliseRef('../textures/wood.png', 'mats')).toBe('textures/wood.png')
		expect(normaliseRef('wood.png', 'mats')).toBe('mats/wood.png')
	})

	it('measures a climb from the model\'s folder', () => {
		expect(normaliseRef('../../textures/wood.png', 'mats')).toBe('wood.png')
		expect(normaliseRef('../../textures/wood.png', 'a/b')).toBe('textures/wood.png')
	})

	it('leaves an absolute path and a scheme out of the folder', () => {
		expect(normaliseRef('C:\\textures\\wood.png', 'mats')).toBe('wood.png')
		expect(normaliseRef('https://example.invalid/wood.png', 'mats')).toBeNull()
	})

	it('reads the model\'s folder by default', () => {
		expect(normaliseRef('wood.png')).toBe('wood.png')
		expect(normaliseRef('wood.png', '.')).toBe('wood.png')
	})
})
