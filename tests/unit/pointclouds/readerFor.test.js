/**
 * @jest-environment node
 */
/**
 * Each scan extension finds its reader, and nothing else does: a name that is also a
 * property of every object, such as `constructor`, is not a scan.
 */
import { readerFor, ScanError } from '../../../src/pointclouds/scanFormats.js'

test('a scan extension finds its reader, whatever its case', async () => {
	expect(await readerFor('XYZ')).toBe(await import('../../../src/pointclouds/readers/xyz.js'))
	expect(await readerFor('laz')).toBe(await import('../../../src/pointclouds/readers/las.js'))
})

test.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'stl'])('.%s has no reader', async (ext) => {
	await expect(readerFor(ext)).rejects.toBeInstanceOf(ScanError)
})
