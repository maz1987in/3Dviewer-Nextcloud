/**
 * Minimal 3MF writer.
 *
 * Three.js ships no 3MF exporter. A 3MF file is a zip holding an XML mesh description
 * and two small packaging files; this writes the core spec's required parts — one
 * object per mesh, geometry only, no materials — which is what a slicer needs.
 *
 * Three.js is Y-up and 3MF, like every slicer, is Z-up, so vertices are turned onto
 * their back on the way out: (x, y, z) → (x, −z, y). That is a rotation, not a mirror,
 * so triangle winding (which way a face points) is preserved.
 *
 * One scene unit is written as one millimetre, the unit the viewer's measurements read.
 *
 * Vertices are welded: three.js keeps a separate copy of a vertex for every face that
 * meets at it (a box has 24 for its 8 corners, an STL three per triangle), and a 3MF
 * mesh whose triangles share no vertex has no shared edges, so a slicer reads it as a
 * heap of loose triangles rather than a closed solid. Corners at the same written
 * position become one vertex.
 */

import { Matrix4, Vector3 } from 'three'
import { zipSync, strToU8 } from 'three/examples/jsm/libs/fflate.module.js'

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>\n'
	+ '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
	+ '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
	+ '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
	+ '</Types>'

const RELS = '<?xml version="1.0" encoding="UTF-8"?>\n'
	+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
	+ '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
	+ '</Relationships>'

// Y-up → Z-up
const Y_UP_TO_Z_UP = new Matrix4().set(
	1, 0, 0, 0,
	0, 0, -1, 0,
	0, 1, 0, 0,
	0, 0, 0, 1,
)

const escapeXml = (text) => String(text)
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;')

/*
 * Text as bytes, viewed through this realm's Uint8Array. fflate tells a file from a
 * folder with `instanceof Uint8Array`, and a TextEncoder from another realm (a test
 * environment's, say) returns one that fails that check — so the file would be read as
 * a folder of numbered entries. Viewing the same buffer costs no copy.
 */
const bytes = (text) => {
	const encoded = strToU8(text)
	return new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength)
}

// Six decimals is a nanometre at millimetre scale; more is noise that only adds bytes
const num = (value) => String(Math.round(value * 1e6) / 1e6)

// Characters XML 1.0 does not allow anywhere, not even escaped
// eslint-disable-next-line no-control-regex
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

/**
 * The `<object>` element for one placement of a mesh, or null when it has no triangle.
 * @param {THREE.Mesh} mesh - the mesh
 * @param {THREE.Matrix4} placement - mesh space to 3MF build space
 * @param {number} id - the object id to write
 * @param {string} name - the object name, or '' for none
 * @return {string|null}
 */
function meshObject(mesh, placement, id, name) {
	const position = mesh.geometry?.attributes?.position
	if (!position || position.count < 3) return null

	// A mirroring transform turns faces inside out; swap two corners to turn them back
	const flip = placement.determinant() < 0
	const v = new Vector3()

	// Weld corners that land on the same written position into one vertex
	const vertices = []
	const welded = new Map() // written "x y z" -> vertex index
	const remap = new Int32Array(position.count)
	for (let i = 0; i < position.count; i++) {
		v.fromBufferAttribute(position, i).applyMatrix4(placement)
		if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
			remap[i] = -1
			continue
		}
		const x = num(v.x)
		const y = num(v.y)
		const z = num(v.z)
		const key = `${x} ${y} ${z}`
		let index = welded.get(key)
		if (index === undefined) {
			index = vertices.length
			welded.set(key, index)
			vertices.push(`<vertex x="${x}" y="${y}" z="${z}"/>`)
		}
		remap[i] = index
	}

	const index = mesh.geometry.index
	const count = index ? index.count : position.count
	const corner = index ? (i) => remap[index.getX(i)] : (i) => remap[i]
	const triangles = []
	for (let i = 0; i + 2 < count; i += 3) {
		const a = corner(i)
		const b = corner(i + 1)
		const c = corner(i + 2)
		if (a < 0 || b < 0 || c < 0) continue
		// 3MF forbids a triangle that uses a vertex twice, welded corners included
		if (a === b || b === c || a === c) continue
		triangles.push(flip
			? `<triangle v1="${a}" v2="${c}" v3="${b}"/>`
			: `<triangle v1="${a}" v2="${b}" v3="${c}"/>`)
	}
	if (triangles.length === 0) return null

	const nameAttr = name ? ` name="${escapeXml(name)}"` : ''
	return `<object id="${id}" type="model"${nameAttr}><mesh>`
		+ `<vertices>${vertices.join('')}</vertices>`
		+ `<triangles>${triangles.join('')}</triangles>`
		+ '</mesh></object>'
}

/**
 * The 3D model XML for every mesh under `object` that the viewer shows: a mesh inside a
 * hidden group is left out with it, and every copy an InstancedMesh draws is written.
 * @param {THREE.Object3D} object - the model
 * @return {{ xml: string, objectCount: number }}
 */
export function build3MFModelXml(object) {
	object.updateMatrixWorld(true)

	const objects = []
	const instance = new Matrix4()
	const add = (mesh, world, name) => {
		const placement = new Matrix4().multiplyMatrices(Y_UP_TO_Z_UP, world)
		const xml = meshObject(mesh, placement, objects.length + 1, name.replace(NOT_XML, ''))
		if (xml) objects.push(xml)
	}
	object.traverseVisible((child) => {
		if (!child.isMesh) return
		if (child.isInstancedMesh) {
			for (let i = 0; i < child.count; i++) {
				child.getMatrixAt(i, instance)
				add(child, new Matrix4().multiplyMatrices(child.matrixWorld, instance), child.name ? `${child.name} ${i + 1}` : '')
			}
			return
		}
		add(child, child.matrixWorld, child.name || '')
	})

	const items = objects.map((_, i) => `<item objectid="${i + 1}"/>`).join('')
	const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
		+ '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
		+ `<resources>${objects.join('')}</resources>`
		+ `<build>${items}</build>`
		+ '</model>'

	return { xml, objectCount: objects.length }
}

/**
 * A complete 3MF package for every visible mesh under `object`.
 * @param {THREE.Object3D} object
 * @return {Uint8Array} the zipped package
 */
export function build3MF(object) {
	const { xml, objectCount } = build3MFModelXml(object)
	if (objectCount === 0) {
		throw new Error('Model has no triangle meshes to export as 3MF')
	}
	return zipSync({
		'[Content_Types].xml': bytes(CONTENT_TYPES),
		'_rels/.rels': bytes(RELS),
		'3D/3dmodel.model': bytes(xml),
	}, { level: 6 })
}
