/**
 * Small model files written in a given unit, for the unit tests: a 3MF tetrahedron and
 * an ASCII FBX tetrahedron.
 */
import { zipSync, strToU8 } from 'three/examples/jsm/libs/fflate.module.js'

// fflate tells a file from a folder with `instanceof Uint8Array`; the test realm's
// TextEncoder returns another realm's (see threeMFWriter.js)
export const bytes = (text) => {
	const encoded = strToU8(text)
	return new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength)
}

export const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>'
	+ '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
	+ '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
	+ '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
	+ '</Types>'

/**
 * The package relationships, naming one part as the 3D model.
 * @param {string} [target] - the model part's path
 * @return {string} the _rels/.rels XML
 */
export const rels = (target = '/3D/3dmodel.model') => '<?xml version="1.0" encoding="UTF-8"?>'
	+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
	+ `<Relationship Target="${target}" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>`
	+ '</Relationships>'

export const RELS = rels()

/**
 * A 3MF model part holding one tetrahedron with legs `leg` long, in the given unit.
 * @param {?string} unit - the `unit` attribute, or null to leave it out
 * @param {object} [options]
 * @param {string} [options.prefix] - a namespace prefix for the elements
 * @param {string} [options.padding] - text between the XML declaration and <model>
 * @param {number} [options.leg] - leg length
 * @param {number} [options.id] - the object's id
 * @return {string} the model XML
 */
export function modelXml(unit, { prefix = '', padding = '', leg = 2, id = 1 } = {}) {
	const p = prefix ? `${prefix}:` : ''
	const ns = prefix ? `xmlns:${prefix}` : 'xmlns'
	const unitAttribute = unit === null ? '' : ` unit="${unit}"`
	return '<?xml version="1.0" encoding="UTF-8"?>' + padding
		+ `<${p}model${unitAttribute} xml:lang="en-US" ${ns}="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">`
		+ `<${p}resources><${p}object id="${id}" type="model"><${p}mesh><${p}vertices>`
		+ `<${p}vertex x="0" y="0" z="0"/><${p}vertex x="${leg}" y="0" z="0"/><${p}vertex x="0" y="${leg}" z="0"/><${p}vertex x="0" y="0" z="${leg}"/>`
		+ `</${p}vertices><${p}triangles>`
		+ `<${p}triangle v1="0" v2="2" v3="1"/><${p}triangle v1="0" v2="1" v3="3"/><${p}triangle v1="0" v2="3" v3="2"/><${p}triangle v1="1" v2="2" v3="3"/>`
		+ `</${p}triangles></${p}mesh></${p}object></${p}resources>`
		+ `<${p}build><${p}item objectid="${id}"/></${p}build></${p}model>`
}

/**
 * A 3MF holding one tetrahedron with legs 2 long, in the given unit.
 * @param {?string} unit - the `unit` attribute, or null to leave it out
 * @param {object} [options] - modelXml's options, and `level`: deflate level, 0 to store
 * @return {Uint8Array} the archive
 */
export function threeMF(unit, { level = 6, ...options } = {}) {
	return zipSync({
		'[Content_Types].xml': bytes(CONTENT_TYPES),
		'_rels/.rels': bytes(RELS),
		'3D/3dmodel.model': bytes(modelXml(unit, options)),
	}, { level })
}

/**
 * An ASCII FBX holding one tetrahedron, its legs `leg` file units long.
 * @param {number} leg - leg length, in file units
 * @param {?number|string} unitScaleFactor - centimetres per unit, or null to leave it out
 * @return {ArrayBuffer} the file
 */
export function asciiFbx(leg, unitScaleFactor) {
	const unit = unitScaleFactor === null ? '' : `\t\tP: "UnitScaleFactor", "double", "Number", "",${unitScaleFactor}\n`
	const text = '; FBX 7.4.0 project file\n'
		+ 'FBXHeaderExtension:  {\n\tFBXHeaderVersion: 1003\n\tFBXVersion: 7400\n}\n'
		+ 'GlobalSettings:  {\n\tVersion: 1000\n\tProperties70:  {\n'
		+ '\t\tP: "UpAxis", "int", "Integer", "",1\n'
		+ unit
		+ '\t}\n}\n'
		+ 'Objects:  {\n'
		+ '\tGeometry: 1000, "Geometry::tetra", "Mesh" {\n'
		+ `\t\tVertices: *12 {\n\t\t\ta: 0,0,0,${leg},0,0,0,${leg},0,0,0,${leg}\n\t\t}\n`
		+ '\t\tPolygonVertexIndex: *12 {\n\t\t\ta: 0,2,-2,0,1,-4,0,3,-3,1,2,-4\n\t\t}\n'
		+ '\t\tGeometryVersion: 124\n'
		+ '\t}\n'
		+ '\tModel: 2000, "Model::tetra", "Mesh" {\n\t\tVersion: 232\n\t}\n'
		+ '}\n'
		+ 'Connections:  {\n\tC: "OO",2000,0\n\tC: "OO",1000,2000\n}\n'
	const encoded = new TextEncoder().encode(text)
	return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
}
