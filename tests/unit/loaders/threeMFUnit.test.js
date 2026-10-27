/**
 * A 3MF file says what unit it is written in, on its <model> element. three's
 * ThreeMFLoader reads the attribute and never applies it, so a file in metres opened a
 * thousandth of its size, measured wrong and exported wrong. The app's loader records the
 * unit on the model, without rescaling the scene, and utils/sourceUnits.js converts.
 */
import * as THREE from 'three'
import { zipSync, strToU8, unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js'
import { ThreeMfLoader, read3MFUnit } from '../../../src/loaders/types/threeMF.js'
import { millimetresPerUnit, threeMFUnit } from '../../../src/utils/sourceUnits.js'
import { build3MF } from '../../../src/utils/threeMFWriter.js'

jest.mock('@nextcloud/router', () => ({
	generateFilePath: (app, type, file) => `/custom_apps/${app}/${type}/${file}`,
	imagePath: (app, p) => `/custom_apps/${app}/img/${p}`,
}))

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>'
	+ '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
	+ '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
	+ '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
	+ '</Types>'
const RELS = '<?xml version="1.0" encoding="UTF-8"?>'
	+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
	+ '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
	+ '</Relationships>'

// fflate tells a file from a folder with `instanceof Uint8Array`; the test realm's
// TextEncoder returns another realm's (see threeMFWriter.js)
const bytes = (text) => {
	const encoded = strToU8(text)
	return new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength)
}

/**
 * A 3MF holding one tetrahedron with legs 2 long, in the given unit.
 * @param {?string} unit - the `unit` attribute, or null to leave it out
 * @param {object} [options]
 * @param {string} [options.prefix] - a namespace prefix for the elements
 * @param {number} [options.level] - deflate level; 0 stores the parts uncompressed
 * @param {string} [options.padding] - text between the XML declaration and <model>
 * @return {Uint8Array} the archive
 */
function fixture(unit, { prefix = '', level = 6, padding = '' } = {}) {
	const p = prefix ? `${prefix}:` : ''
	const ns = prefix ? `xmlns:${prefix}` : 'xmlns'
	const unitAttribute = unit === null ? '' : ` unit="${unit}"`
	const model = '<?xml version="1.0" encoding="UTF-8"?>' + padding
		+ `<${p}model${unitAttribute} xml:lang="en-US" ${ns}="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">`
		+ `<${p}resources><${p}object id="1" type="model"><${p}mesh><${p}vertices>`
		+ `<${p}vertex x="0" y="0" z="0"/><${p}vertex x="2" y="0" z="0"/><${p}vertex x="0" y="2" z="0"/><${p}vertex x="0" y="0" z="2"/>`
		+ `</${p}vertices><${p}triangles>`
		+ `<${p}triangle v1="0" v2="2" v3="1"/><${p}triangle v1="0" v2="1" v3="3"/><${p}triangle v1="0" v2="3" v3="2"/><${p}triangle v1="1" v2="2" v3="3"/>`
		+ `</${p}triangles></${p}mesh></${p}object></${p}resources>`
		+ `<${p}build><${p}item objectid="1"/></${p}build></${p}model>`
	return zipSync({
		'[Content_Types].xml': bytes(CONTENT_TYPES),
		'_rels/.rels': bytes(RELS),
		'3D/3dmodel.model': bytes(model),
	}, { level })
}

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

	it('reads the start tag past a long preamble', () => {
		const padding = `<!-- ${'x'.repeat(200000)} -->`
		expect(read3MFUnit(fixture('centimeter', { padding }))).toBe('centimeter')
	})

	it('reads a file whose parts are streamed with data descriptors, as the 3MF export writes them', async () => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
		expect(read3MFUnit(await build3MF(mesh))).toBe('millimeter')
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
