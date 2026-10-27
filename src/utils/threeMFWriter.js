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
 * The file is in millimetres. A scene unit is however many millimetres the caller says
 * (utils/sourceUnits.js decides from the format the model was loaded from): 1 for an STL,
 * 1000 for a glTF, which is in metres.
 *
 * Vertices are welded: three.js keeps a separate copy of a vertex for every face that
 * meets at it (a box has 24 for its 8 corners, an STL three per triangle), and a 3MF
 * mesh whose triangles share no vertex has no shared edges, so a slicer reads it as a
 * heap of loose triangles rather than a closed solid. Corners at the same written
 * position become one vertex.
 */

import { Matrix4 } from 'three'
import { Zip, ZipDeflate, strToU8 } from 'three/examples/jsm/libs/fflate.module.js'
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

// Coordinates are written to six decimals, a nanometre at millimetre scale; more is
// noise that only adds bytes. Welding compares them as whole nanometres.
const QUANTUM = 1e6

// Characters XML 1.0 does not allow anywhere, not even escaped
// eslint-disable-next-line no-control-regex
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g

// Text is handed on in pieces about this long, so no string the size of the model is built
const CHUNK = 1 << 16

/**
 * Weld one placement of a mesh and list its triangles.
 *
 * Corners are compared as whole nanometres in an open-addressing hash table over typed
 * arrays, not as strings in a Map: for a million-triangle STL that is a few typed arrays
 * instead of three million short strings.
 *
 * @param {THREE.Mesh} mesh - the mesh
 * @param {THREE.Matrix4} placement - mesh space to the file's space
 * @return {?{ coords: Float64Array, vertexCount: number, triangles: Int32Array, triangleCount: number }}
 *   welded vertices (as nanometres) and triangles, or null when no triangle is left
 */
function weld(mesh, placement) {
	const position = mesh.geometry?.attributes?.position
	if (!position || position.count < 3) return null

	const n = position.count
	const e = placement.elements
	// A mirroring transform turns faces inside out; swap two corners to turn them back
	const flip = placement.determinant() < 0

	let size = 1
	while (size < n * 2) size <<= 1
	const mask = size - 1
	const slots = new Int32Array(size).fill(-1)
	const coords = new Float64Array(n * 3)
	const remap = new Int32Array(n)
	let vertexCount = 0

	for (let i = 0; i < n; i++) {
		const px = position.getX(i)
		const py = position.getY(i)
		const pz = position.getZ(i)
		const x = Math.round((e[0] * px + e[4] * py + e[8] * pz + e[12]) * QUANTUM)
		const y = Math.round((e[1] * px + e[5] * py + e[9] * pz + e[13]) * QUANTUM)
		const z = Math.round((e[2] * px + e[6] * py + e[10] * pz + e[14]) * QUANTUM)
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
			remap[i] = -1
			continue
		}
		// `| 0` keeps the low 32 bits, plenty to spread nanometre coordinates
		let h = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791)) & mask
		let found = -1
		while (slots[h] !== -1) {
			const k = slots[h] * 3
			if (coords[k] === x && coords[k + 1] === y && coords[k + 2] === z) {
				found = slots[h]
				break
			}
			h = (h + 1) & mask
		}
		if (found === -1) {
			found = vertexCount++
			slots[h] = found
			coords[found * 3] = x
			coords[found * 3 + 1] = y
			coords[found * 3 + 2] = z
		}
		remap[i] = found
	}

	const index = mesh.geometry.index
	const count = index ? index.count : n
	const triangles = new Int32Array(Math.floor(count / 3) * 3)
	let triangleCount = 0
	for (let i = 0; i + 2 < count; i += 3) {
		const a = remap[index ? index.getX(i) : i]
		const b = remap[index ? index.getX(i + 1) : i + 1]
		const c = remap[index ? index.getX(i + 2) : i + 2]
		if (a < 0 || b < 0 || c < 0) continue
		// 3MF forbids a triangle that uses a vertex twice, welded corners included
		if (a === b || b === c || a === c) continue
		const t = triangleCount++ * 3
		triangles[t] = a
		triangles[t + 1] = flip ? c : b
		triangles[t + 2] = flip ? b : c
	}
	if (triangleCount === 0) return null

	return { coords, vertexCount, triangles, triangleCount }
}

/**
 * Every placement of a mesh the viewer shows under `object`: a mesh inside a hidden group
 * is left out with it, and every copy an InstancedMesh draws is its own placement.
 * @param {THREE.Object3D} object - the model
 * @param {number} millimetresPerUnit - how many millimetres one scene unit is
 * @return {Array<{ mesh: THREE.Mesh, placement: THREE.Matrix4, name: string }>}
 */
function placements(object, millimetresPerUnit) {
	object.updateMatrixWorld(true)
	// Into the file's space: millimetres, Z up
	const toFile = new Matrix4().makeScale(millimetresPerUnit, millimetresPerUnit, millimetresPerUnit).premultiply(Y_UP_TO_Z_UP)
	const list = []
	const instance = new Matrix4()
	const add = (mesh, world, name) => {
		list.push({ mesh, placement: new Matrix4().multiplyMatrices(toFile, world), name: name.replace(NOT_XML, '') })
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
	return list
}

/**
 * The model XML, in pieces of about CHUNK characters, for every mesh the viewer shows.
 * `state` says how far it has got, counted in input corners, and how many objects it wrote.
 * @param {THREE.Object3D} object - the model
 * @param {number} millimetresPerUnit - how many millimetres one scene unit is
 * @param {{ done: number, total: number, objectCount: number }} state - filled in as it goes
 * @yields {string} the next piece of XML
 */
function* modelXml(object, millimetresPerUnit, state) {
	const list = placements(object, millimetresPerUnit)
	state.total = list.reduce((sum, { mesh }) => sum + (mesh.geometry?.attributes?.position?.count ?? 0), 0) || 1
	state.done = 0
	state.objectCount = 0

	let buffer = '<?xml version="1.0" encoding="UTF-8"?>\n'
		+ '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
		+ '<resources>'

	let before = 0
	for (const { mesh, placement, name } of list) {
		const corners = mesh.geometry?.attributes?.position?.count ?? 0
		// Welding is the first half of a mesh's share, its vertices and triangles the rest
		const progress = (fraction) => { state.done = before + corners * fraction }
		const welded = weld(mesh, placement)
		before += corners
		if (!welded) {
			state.done = before
			continue
		}
		const { coords, vertexCount, triangles, triangleCount } = welded
		const id = ++state.objectCount
		buffer += `<object id="${id}" type="model"${name ? ` name="${escapeXml(name)}"` : ''}><mesh><vertices>`
		for (let v = 0; v < vertexCount; v++) {
			const k = v * 3
			buffer += `<vertex x="${coords[k] / QUANTUM}" y="${coords[k + 1] / QUANTUM}" z="${coords[k + 2] / QUANTUM}"/>`
			if (buffer.length >= CHUNK) {
				progress(0.5 + 0.2 * (v / vertexCount))
				yield buffer
				buffer = ''
			}
		}
		buffer += '</vertices><triangles>'
		for (let t = 0; t < triangleCount * 3; t += 3) {
			buffer += `<triangle v1="${triangles[t]}" v2="${triangles[t + 1]}" v3="${triangles[t + 2]}"/>`
			if (buffer.length >= CHUNK) {
				progress(0.7 + 0.3 * (t / (triangleCount * 3)))
				yield buffer
				buffer = ''
			}
		}
		buffer += '</triangles></mesh></object>'
		state.done = before
	}

	buffer += '</resources><build>'
	for (let id = 1; id <= state.objectCount; id++) {
		buffer += `<item objectid="${id}"/>`
	}
	yield buffer + '</build></model>'
}

/**
 * The 3D model XML for every mesh under `object` that the viewer shows, as one string.
 * @param {THREE.Object3D} object - the model
 * @param {object} [options] - options
 * @param {number} [options.millimetresPerUnit] - how many millimetres one scene unit is
 * @return {{ xml: string, objectCount: number }}
 */
export function build3MFModelXml(object, { millimetresPerUnit = 1 } = {}) {
	const state = { done: 0, total: 1, objectCount: 0 }
	let xml = ''
	for (const piece of modelXml(object, millimetresPerUnit, state)) {
		xml += piece
	}
	return { xml, objectCount: state.objectCount }
}

// Let the page repaint (and the progress bar move) between pieces
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * A complete 3MF package for every visible mesh under `object`.
 *
 * The model XML is made and compressed a piece at a time, handing the browser back the
 * thread about every 50 ms, so a million-triangle export neither freezes the page nor
 * holds the whole XML in memory. fflate's async `zip` would compress in a Web Worker
 * made from a blob: URL, which a Content-Security-Policy without `blob:` in worker-src
 * refuses; its streaming `Zip` needs no worker.
 *
 * Says "nothing to write" by returning null rather than throwing the export's error: this
 * module is loaded on demand, and importing that error from the viewer's chunk would make
 * the chunk export it, which costs the app's entry bytes on every page.
 * @param {THREE.Object3D} object - the model
 * @param {object} [options] - options
 * @param {number} [options.millimetresPerUnit] - how many millimetres one scene unit is
 * @param {Function} [options.onProgress] - called with 0..1 as the model is written
 * @param {number} [options.sliceMs] - longest stretch of work between yields
 * @return {Promise<?Uint8Array>} the zipped package, or null when no mesh has a triangle to write
 */
export async function build3MF(object, { millimetresPerUnit = 1, onProgress = () => {}, sliceMs = 50 } = {}) {
	const out = []
	let failure = null
	const zip = new Zip((error, data) => {
		if (error) failure = error
		else out.push(data)
	})
	for (const [name, text] of [['[Content_Types].xml', CONTENT_TYPES], ['_rels/.rels', RELS]]) {
		const file = new ZipDeflate(name, { level: 6 })
		zip.add(file)
		file.push(bytes(text), true)
	}
	const model = new ZipDeflate('3D/3dmodel.model', { level: 6 })
	zip.add(model)

	const state = { done: 0, total: 1, objectCount: 0 }
	let sliceStart = performance.now()
	for (const piece of modelXml(object, millimetresPerUnit, state)) {
		model.push(bytes(piece))
		if (failure) throw failure
		if (performance.now() - sliceStart > sliceMs) {
			onProgress(Math.min(1, state.done / state.total))
			await nextTask()
			sliceStart = performance.now()
		}
	}
	model.push(new Uint8Array(0), true)
	zip.end()
	if (failure) throw failure
	onProgress(1)

	if (state.objectCount === 0) {
		return null
	}
	const file = new Uint8Array(out.reduce((sum, chunk) => sum + chunk.length, 0))
	let offset = 0
	for (const chunk of out) {
		file.set(chunk, offset)
		offset += chunk.length
	}
	return file
}
