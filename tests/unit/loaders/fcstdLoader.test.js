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

/*
 * FreeCAD stores a shape for every feature, not only the visible result: a PartDesign
 * Body with a Pad and a Pocket stores the Pad's solid, the Pocket's result, the tool the
 * Pocket cut away and the Body's own copy of its tip. Drawing every entry put them all
 * on top of each other, with the cutting tool sticking out of the part. Only what
 * GuiDocument.xml shows is drawn now, matched to its file through Document.xml.
 */

/**
 * A Document.xml in FreeCAD's layout: the object list with types, then each object's
 * properties, its `Shape` (and any other shape property) naming a file in the archive.
 *
 * @param {Array<{name: string, type: string, shapes: Record<string, string>}>} objects - Each object and its shape properties
 * @return {string} The document
 */
function documentXml(objects) {
	const list = objects.map(({ name, type }) => `<Object type="${type}" name="${name}" id="1"/>`).join('')
	const data = objects.map(({ name, shapes }) => `<Object name="${name}"><Properties Count="1">${
		Object.entries(shapes).map(([property, file]) => `<Property name="${property}" type="Part::PropertyPartShape"><Part file="${file}"/></Property>`).join('')
	}<Property name="Label" type="App::PropertyString"><String value="${name}"/></Property></Properties></Object>`).join('')
	return `<?xml version='1.0' encoding='utf-8'?>
<Document SchemaVersion="4"><Properties Count="0"/><Objects Count="${objects.length}">${list}</Objects><ObjectData Count="${objects.length}">${data}</ObjectData></Document>`
}

/**
 * A GuiDocument.xml in FreeCAD's layout: one view provider per object.
 *
 * @param {Record<string, {visible?: boolean, bodyMode?: number}>} providers - By object name
 * @return {string} The document
 */
function guiDocumentXml(providers) {
	const body = Object.entries(providers).map(([name, { visible, bodyMode }]) => `<ViewProvider name="${name}" expanded="0"><Properties Count="2">${
		bodyMode === undefined ? '' : `<Property name="DisplayModeBody" type="App::PropertyEnumeration" status="1"><Integer value="${bodyMode}"/></Property>`
	}${visible === undefined ? '' : `<Property name="Visibility" type="App::PropertyBool" status="1"><Bool value="${visible}"/></Property>`}</Properties></ViewProvider>`).join('')
	return `<?xml version='1.0' encoding='utf-8'?>
<Document SchemaVersion="1"><ViewProviderData Count="${Object.keys(providers).length}">${body}</ViewProviderData></Document>`
}

/** A Body whose Pocket is its tip, as PartDesign saves it. */
const PART_DESIGN = documentXml([
	{ name: 'Body', type: 'PartDesign::Body', shapes: { Shape: 'Body.Shape.brp' } },
	{ name: 'Sketch', type: 'Sketcher::SketchObject', shapes: { Shape: 'Sketch.Shape.brp' } },
	{ name: 'Pad', type: 'PartDesign::Pad', shapes: { AddSubShape: 'Pad.AddSubShape.brp', Shape: 'Pad.Shape.brp' } },
	{ name: 'Pocket', type: 'PartDesign::Pocket', shapes: { AddSubShape: 'Pocket.AddSubShape.brp', Shape: 'Pocket.Shape.brp' } },
])

const PART_DESIGN_BODIES = {
	'Body.Shape.brp': 'body copy of the tip',
	'Sketch.Shape.brp': 'sketch wire',
	'Pad.AddSubShape.brp': 'pad tool',
	'Pad.Shape.brp': 'pad solid',
	'Pocket.AddSubShape.brp': 'pocket tool',
	'Pocket.Shape.brp': 'pocket result',
}

/** As FreeCAD leaves it: the Body and its tip shown, every earlier feature hidden. */
const PART_DESIGN_GUI = guiDocumentXml({
	Body: { visible: true, bodyMode: 0 },
	Sketch: { visible: false },
	Pad: { visible: false },
	Pocket: { visible: true },
})

describe('FreeCAD visibility', () => {
	test('draws only the shown result, not the earlier features, the tools or the Body\'s copy', async () => {
		const archive = fcstd({ 'Document.xml': PART_DESIGN, 'GuiDocument.xml': PART_DESIGN_GUI, ...PART_DESIGN_BODIES })

		const result = await new FcstdLoader().loadModel(archive, {})

		expect(readEntries()).toEqual(['pocket result'])
		expect(result.object3D.children.map(group => group.name)).toEqual(['Pocket.Shape'])
	})

	test('a hidden body is left out and a visible one drawn, with two bodies side by side', async () => {
		const archive = fcstd({
			'Document.xml': documentXml([
				{ name: 'Box', type: 'Part::Box', shapes: { Shape: 'PartShape.brp' } },
				{ name: 'Cylinder', type: 'Part::Cylinder', shapes: { Shape: 'PartShape1.brp' } },
			]),
			'GuiDocument.xml': guiDocumentXml({ Box: { visible: true }, Cylinder: { visible: false } }),
			'PartShape.brp': 'box',
			'PartShape1.brp': 'cylinder',
		})

		await new FcstdLoader().loadModel(archive, {})

		expect(readEntries()).toEqual(['box'])
	})

	test('a Body in Tip mode draws its own shape', async () => {
		const gui = guiDocumentXml({ Body: { visible: true, bodyMode: 1 }, Sketch: { visible: false }, Pad: { visible: false }, Pocket: { visible: false } })
		const archive = fcstd({ 'Document.xml': PART_DESIGN, 'GuiDocument.xml': gui, ...PART_DESIGN_BODIES })

		await new FcstdLoader().loadModel(archive, {})

		expect(readEntries()).toEqual(['body copy of the tip'])
	})

	test('an object without a saved Visibility, or without a view provider, counts as shown', async () => {
		const archive = fcstd({
			'Document.xml': documentXml([
				{ name: 'Box', type: 'Part::Box', shapes: { Shape: 'Box.Shape.brp' } },
				{ name: 'Cut', type: 'Part::Cut', shapes: { Shape: 'Cut.Shape.brp' } },
				{ name: 'Tool', type: 'Part::Box', shapes: { Shape: 'Tool.Shape.brp' } },
			]),
			'GuiDocument.xml': guiDocumentXml({ Box: {}, Tool: { visible: false } }),
			'Box.Shape.brp': 'box',
			'Cut.Shape.brp': 'cut',
			'Tool.Shape.brp': 'tool',
		})

		await new FcstdLoader().loadModel(archive, {})

		expect(readEntries()).toEqual(['box', 'cut'])
	})

	describe('falls back to drawing every entry', () => {
		const everything = Object.values(PART_DESIGN_BODIES)

		test('when there is no GuiDocument.xml, as FreeCADCmd saves none', async () => {
			const archive = fcstd({ 'Document.xml': PART_DESIGN, ...PART_DESIGN_BODIES })

			await new FcstdLoader().loadModel(archive, {})

			expect(readEntries()).toEqual(everything)
		})

		test('when GuiDocument.xml or Document.xml cannot be parsed', async () => {
			for (const broken of [
				{ 'Document.xml': PART_DESIGN, 'GuiDocument.xml': '<Document><ViewProviderData>' },
				{ 'Document.xml': '<Document><Objects></Document>', 'GuiDocument.xml': PART_DESIGN_GUI },
			]) {
				mockReadBrepFile.mockClear()
				await new FcstdLoader().loadModel(fcstd({ ...broken, ...PART_DESIGN_BODIES }), {})
				expect(readEntries()).toEqual(everything)
			}
		})

		test('when everything is hidden', async () => {
			const gui = guiDocumentXml({ Body: { visible: false }, Sketch: { visible: false }, Pad: { visible: false }, Pocket: { visible: false } })

			await new FcstdLoader().loadModel(fcstd({ 'Document.xml': PART_DESIGN, 'GuiDocument.xml': gui, ...PART_DESIGN_BODIES }), {})

			expect(readEntries()).toEqual(everything)
		})

		test('when the shown shapes are not among the entries', async () => {
			const archive = fcstd({ 'Document.xml': PART_DESIGN, 'GuiDocument.xml': PART_DESIGN_GUI, 'Renamed.brep': 'renamed' })

			await new FcstdLoader().loadModel(archive, {})

			expect(readEntries()).toEqual(['renamed'])
		})

		test('when no shown shape can be tessellated, as with only a sketch shown', async () => {
			const gui = guiDocumentXml({ Body: { visible: false }, Sketch: { visible: true }, Pad: { visible: false }, Pocket: { visible: false } })
			mockReadBrepFile.mockImplementation(bytes => (Buffer.from(bytes).toString('utf8') === 'sketch wire'
				? { success: true, meshes: [] }
				: ONE_TRIANGLE))

			const result = await new FcstdLoader().loadModel(fcstd({ 'Document.xml': PART_DESIGN, 'GuiDocument.xml': gui, ...PART_DESIGN_BODIES }), {})

			expect(readEntries()).toEqual(['sketch wire', ...everything.filter(text => text !== 'sketch wire')])
			expect(result.object3D.children).toHaveLength(5)
		})
	})

	test('reads the same with the thumbnail worker\'s parser', async () => {
		const { WorkerDOMParser } = await import('../../../src/thumbnails/workerDomParser.js')
		const original = global.DOMParser
		global.DOMParser = WorkerDOMParser
		try {
			const archive = fcstd({ 'Document.xml': PART_DESIGN, 'GuiDocument.xml': PART_DESIGN_GUI, ...PART_DESIGN_BODIES })

			await new FcstdLoader().loadModel(archive, {})

			expect(readEntries()).toEqual(['pocket result'])
		} finally {
			global.DOMParser = original
		}
	})
})
