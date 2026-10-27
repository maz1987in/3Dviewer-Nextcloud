/**
 * An MTL's maps are relative to the MTL, not to the model. The server's resolver joins
 * each to the MTL's folder before it normalises it, so the client has to as well, or it
 * asks for files the server does not serve: `mats/chair.mtl` naming
 * `../textures/wood.png` means `textures/wood.png`, not `wood.png` beside the model.
 *
 * The table is shared with tests/unit/Service/ModelDependencyResolverTest.php.
 */
import table from '../../fixtures/texture-references.json'
import { parseMtlTexturePaths, parseObjMaterialFiles } from '../../../src/loaders/multiFileHelpers.js'
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

/**
 * An OBJ or MTL is whatever the uploader wrote, and the background queue parses every
 * one in a folder on the Files page. A statement pattern that let its leading blanks run
 * across newlines retried from every line, so a file of blank lines took quadratic time.
 */
describe('reading an OBJ or MTL made to stall the parser', () => {
	const crafted = [
		['five million newlines', '\n'.repeat(5_000_000)],
		['CRLF line ends', '\r\n'.repeat(2_500_000)],
		['lines of a blank each', ' \n'.repeat(2_500_000)],
		['blank lines between statements', `${'\n'.repeat(5_000_000)}mtllib chair.mtl\nmap_Kd wood.png\n`],
	]

	it.each(crafted)('reads mtllib statements in linear time: %s', (_, text) => {
		const started = Date.now()

		const found = parseObjMaterialFiles(text)

		expect(Date.now() - started).toBeLessThan(1000)
		expect(found).toEqual(text.includes('mtllib') ? ['chair.mtl'] : [])
	})

	it.each(crafted)('reads map statements in linear time: %s', (_, text) => {
		const started = Date.now()

		const found = parseMtlTexturePaths(text, 'chair.mtl')

		expect(Date.now() - started).toBeLessThan(1000)
		expect(found).toEqual(text.includes('map_Kd') ? ['wood.png'] : [])
	})

	it('still reads a statement indented with blanks', () => {
		expect(parseObjMaterialFiles(' \t mtllib chair.mtl\n')).toEqual(['chair.mtl'])
		expect(parseMtlTexturePaths('newmtl a\n\t map_Kd wood.png\n', 'chair.mtl')).toEqual(['wood.png'])
	})
})
