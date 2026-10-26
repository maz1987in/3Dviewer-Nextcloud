/**
 * The FCSTD loader reads the geometry FreeCAD actually writes.
 *
 * An FCStd file is a ZIP holding Document.xml and one B-Rep file per body. FreeCAD saves
 * those bodies as `.brp` (for example `PartShape.brp`); the loader looked only for
 * `.brep`, so every real FreeCAD document failed with "contains no .brep geometry
 * entries", in the viewer and in the thumbnail worker alike. Both extensions are read now.
 *
 * The archives are made here with fflate, which three ships; OCCT itself is replaced by
 * a stand-in that records which entries it was asked to read.
 */

import { zipSync } from 'three/examples/jsm/libs/fflate.module.js'
import FcstdLoader from '../../../src/loaders/types/fcstd.js'

const mockReadBrepFile = jest.fn()

jest.mock('../../../src/loaders/occt-runtime.js', () => {
	const actual = jest.requireActual('../../../src/loaders/occt-runtime.js')
	return {
		...actual,
		getOcct: async () => ({ ReadBrepFile: mockReadBrepFile }),
	}
})

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

/** What OCCT returns for a body: one triangle. */
const ONE_TRIANGLE = {
	success: true,
	root: { name: 'body', meshes: [0], children: [] },
	meshes: [{
		name: 'tri',
		attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } },
		index: { array: [0, 1, 2] },
	}],
}

/**
 * @param {Record<string, string>} entries - Entry name to text content
 * @return {ArrayBuffer} The ZIP archive
 */
function fcstd(entries) {
	// Copied into this realm's Uint8Array: under jsdom, TextEncoder's arrays come from
	// another realm, and fflate takes anything that is not its own kind for a folder
	const encoded = Object.fromEntries(Object.entries(entries).map(([name, text]) => [name, new Uint8Array(Buffer.from(text, 'utf8'))]))
	const zip = zipSync(encoded)
	return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)
}

/**
 * @return {string[]} The text of every entry OCCT was asked to read, in order
 */
const readEntries = () => mockReadBrepFile.mock.calls.map(([bytes]) => Buffer.from(bytes).toString('utf8'))

beforeEach(() => {
	mockReadBrepFile.mockReset()
	mockReadBrepFile.mockReturnValue(ONE_TRIANGLE)
})

test('reads the .brp bodies FreeCAD saves', async () => {
	const archive = fcstd({
		'Document.xml': '<Document/>',
		'PartShape.brp': 'body one',
		'PartShape1.brp': 'body two',
	})

	const result = await new FcstdLoader().loadModel(archive, {})

	expect(readEntries()).toEqual(['body one', 'body two'])
	expect(result.object3D.children.map(group => group.name)).toEqual(['PartShape', 'PartShape1'])
})

test('still reads .brep bodies, and both kinds side by side', async () => {
	const archive = fcstd({
		'Document.xml': '<Document/>',
		'Old.brep': 'brep body',
		'New.BRP': 'brp body',
	})

	const result = await new FcstdLoader().loadModel(archive, {})

	expect(readEntries().sort()).toEqual(['brep body', 'brp body'])
	expect(result.object3D.children.map(group => group.name).sort()).toEqual(['New', 'Old'])
})

test('an archive with no B-Rep body at all is still an error', async () => {
	const archive = fcstd({ 'Document.xml': '<Document/>', 'GuiDocument.xml': '<GuiDocument/>' })

	await expect(new FcstdLoader().loadModel(archive, {})).rejects.toThrow(/no \.brep or \.brp geometry/)
	expect(mockReadBrepFile).not.toHaveBeenCalled()
})
