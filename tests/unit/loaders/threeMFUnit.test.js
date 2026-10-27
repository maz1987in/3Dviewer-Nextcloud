/**
 * A 3MF file says what unit it is written in, on its <model> element. three's
 * ThreeMFLoader reads the attribute and never applies it, so a file in metres opened a
 * thousandth of its size, measured wrong and exported wrong. The app's loader records the
 * unit on the model, without rescaling the scene, and utils/sourceUnits.js converts.
 */
import * as THREE from 'three'
import { zipSync, unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js'
import { bytes, CONTENT_TYPES, RELS, modelXml, rels, threeMF } from './fixtures/unitFixtures.js'
import { ThreeMfLoader, read3MFUnit } from '../../../src/loaders/types/threeMF.js'
import { millimetresPerUnit, threeMFUnit } from '../../../src/utils/sourceUnits.js'
import { build3MF } from '../../../src/utils/threeMFWriter.js'

jest.mock('@nextcloud/router', () => ({
	generateFilePath: (app, type, file) => `/custom_apps/${app}/${type}/${file}`,
	imagePath: (app, p) => `/custom_apps/${app}/img/${p}`,
}))

const fixture = threeMF

const UNITS = [
	['micron', 0.001],
	['millimeter', 1],
	['centimeter', 10],
	['inch', 25.4],
	['foot', 304.8],
	['meter', 1000],
]

const load = async (bytes) => (await new ThreeMfLoader().loadModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { filename: 'part.3mf' })).object3D

const sizeOf = (object) => {
	object.updateMatrixWorld(true)
	return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
}

describe('read3MFUnit', () => {
	it.each(UNITS)('reads a file in %s', (unit) => {
		expect(read3MFUnit(fixture(unit))).toBe(unit)
	})

	it('takes a file without the attribute as millimetres, as the spec says', () => {
		expect(read3MFUnit(fixture(null))).toBe('millimeter')
	})

	it('reads a model whose elements carry a namespace prefix', () => {
		expect(read3MFUnit(fixture('inch', { prefix: 'm' }))).toBe('inch')
	})

	it('reads a stored (uncompressed) part as well as a deflated one', () => {
		expect(read3MFUnit(fixture('foot', { level: 0 }))).toBe('foot')
	})

	it('reads the start tag past a preamble of comments', () => {
		const padding = `<!-- ${'x'.repeat(20000)} --><!-- a second one -->`
		expect(read3MFUnit(fixture('centimeter', { padding }))).toBe('centimeter')
	})

	it('reads the root element, not a <model> written in a comment before it', () => {
		const padding = '<!-- <model unit="meter"> -->'
		expect(read3MFUnit(fixture('inch', { padding }))).toBe('inch')
	})

	it('gives up on a preamble longer than the head it reads', () => {
		const padding = `<!-- ${'x'.repeat(100000)} -->`
		expect(read3MFUnit(fixture('meter', { padding }))).toBeNull()
	})

	it('reads a file whose parts are streamed with data descriptors, as the 3MF export writes them', async () => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
		expect(read3MFUnit(await build3MF(mesh))).toBe('millimeter')
	})

	describe('in a package with more than one model part', () => {
		// Two top-level parts, in metres and in inches, the metre one first in the archive
		const twoModels = (relsXml) => {
			const files = {
				'[Content_Types].xml': bytes(CONTENT_TYPES),
				'3D/a.model': bytes(modelXml('meter')),
				'3D/z.model': bytes(modelXml('inch')),
			}
			if (relsXml) files['_rels/.rels'] = bytes(relsXml)
			return zipSync(files)
		}

		it('reads the part the package relationships name, which three builds the scene from', () => {
			expect(read3MFUnit(twoModels(rels('/3D/a.model')))).toBe('meter')
			expect(read3MFUnit(twoModels(rels('/3D/z.model')))).toBe('inch')
		})

		it('records the unit of the part three built the model from', async () => {
			expect((await load(twoModels(rels('/3D/z.model')))).userData.threeMFUnit).toBe('inch')
			// three parses only the last top-level part and those in folders under 3D/; a
			// package that names one in a folder is built from it
			const nested = zipSync({
				'[Content_Types].xml': bytes(CONTENT_TYPES),
				'_rels/.rels': bytes(rels('/3D/Objects/part.model')),
				'3D/3dmodel.model': bytes(modelXml('inch')),
				'3D/Objects/part.model': bytes(modelXml('meter', { leg: 5, id: 2 })),
			})
			const object = await load(nested)
			expect(object.userData.threeMFUnit).toBe('meter')
			object.updateMatrixWorld(true)
			const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
			expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(5, 6)
		})

		it('reads the part three takes as its root, the last, when the relationships name none there', () => {
			expect(read3MFUnit(twoModels(rels('/3D/missing.model')))).toBe('inch')
			expect(read3MFUnit(twoModels(null))).toBe('inch')
		})

		it('prefers the 3D model relationship to another that names a .model', () => {
			const relsXml = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
				+ '<Relationship Target="/3D/a.model" Id="r1" Type="http://example.com/other"/>'
				+ '<Relationship Target="/3D/z.model" Id="r2" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
				+ '</Relationships>'
			expect(read3MFUnit(twoModels(relsXml))).toBe('inch')
		})
	})

	it('gives null when the root element is not <model>', () => {
		const archive = zipSync({ '3D/3dmodel.model': bytes('<?xml version="1.0"?><models unit="meter"/>') })
		expect(read3MFUnit(archive)).toBeNull()
	})

	/*
	 * A crafted file must not make the reader do more than linear work: a match rerun
	 * over the whole text read so far, on every piece that arrives, is quadratic in it.
	 */
	describe('on a crafted file, finishes in linear time', () => {
		const MEGABYTE = 1024 * 1024
		const timed = (text) => {
			const archive = zipSync({ '_rels/.rels': bytes(RELS), '3D/3dmodel.model': bytes(text) })
			const started = performance.now()
			const unit = read3MFUnit(archive)
			return { unit, ms: performance.now() - started }
		}

		it.each([
			['a megabyte of <model with no >', '<model'.repeat(MEGABYTE / 6)],
			['a megabyte-long unterminated start tag', `<model unit="meter" ${'a'.repeat(MEGABYTE)}`],
			['a megabyte of unterminated comment', `<!--${'<model '.repeat(MEGABYTE / 7)}`],
			['a megabyte of declarations with no root', '<?x?>'.repeat(MEGABYTE / 5)],
			['a megabyte of < with nothing after', '<'.repeat(MEGABYTE)],
		])('%s', (_name, text) => {
			const { unit, ms } = timed(text)
			expect(unit).toBeNull()
			expect(ms).toBeLessThan(250)
		})
	})

	it('gives null for something that is not a 3MF archive', () => {
		expect(read3MFUnit(new Uint8Array([1, 2, 3, 4]))).toBeNull()
		expect(read3MFUnit(zipSync({ 'readme.txt': bytes('hello') }))).toBeNull()
	})
})

describe('ThreeMfLoader', () => {
	it.each(UNITS)('records a file in %s on the model, and the source unit follows it', async (unit, millimetres) => {
		const object = await load(fixture(unit))
		expect(object.userData.threeMFUnit).toBe(unit)
		expect(threeMFUnit(object)).toBeCloseTo(millimetres, 9)
		expect(millimetresPerUnit('part.3mf', object)).toBeCloseTo(millimetres, 9)
	})

	it('records millimetres for a file without the attribute', async () => {
		const object = await load(fixture(null))
		expect(object.userData.threeMFUnit).toBe('millimeter')
		expect(millimetresPerUnit('part.3mf', object)).toBe(1)
	})

	it('does not rescale the scene: framing and thumbnails see the file\'s own numbers', async () => {
		const inMillimetres = sizeOf(await load(fixture('millimeter')))
		const inMetres = sizeOf(await load(fixture('meter')))
		expect(inMetres.x).toBeCloseTo(inMillimetres.x, 9)
		expect(inMetres.y).toBeCloseTo(inMillimetres.y, 9)
		expect(inMetres.z).toBeCloseTo(inMillimetres.z, 9)
		expect(Math.max(inMetres.x, inMetres.y, inMetres.z)).toBeCloseTo(2, 6)
	})

	it('re-exports a file in metres at its real size, in millimetres', async () => {
		const object = await load(fixture('meter'))
		const file = await build3MF(object, { millimetresPerUnit: millimetresPerUnit('part.3mf', object) })
		const xml = strFromU8(unzipSync(file)['3D/3dmodel.model'])
		expect(xml).toContain('unit="millimeter"')
		// 2 m legs are 2000 mm (the loader centres the model, so it is the span that counts)
		const along = (axis) => [...xml.matchAll(new RegExp(` ${axis}="(-?[\\d.e+-]+)"`, 'g'))].map((m) => Number(m[1]))
		for (const axis of ['x', 'y', 'z']) {
			expect(Math.max(...along(axis)) - Math.min(...along(axis))).toBeCloseTo(2000, 3)
		}

		// And opened again, it is the same size: 2000 units of a millimetre
		const reopened = await load(file)
		const size = sizeOf(reopened)
		expect(Math.max(size.x, size.y, size.z) * millimetresPerUnit('part.3mf', reopened)).toBeCloseTo(2000, 3)
	})
})
