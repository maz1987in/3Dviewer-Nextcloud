import * as THREE from 'three'
import { BaseLoader } from '../BaseLoader.js'

/**
 * dotbim (.bim) loader.
 *
 * dotbim is a JSON-based interchange format for BIM geometry authored by
 * Paireks (github.com/paireks/dotbim). The spec is simple enough that a
 * third-party loader isn't warranted:
 *
 *   {
 *     schema_version: "1.0.0" | "1.1.0",
 *     meshes:   [{ mesh_id, coordinates: [x,y,z,...], indices: [i,i,i,...] }],
 *     elements: [{ mesh_id, vector{x,y,z}, rotation{qx,qy,qz,qw},
 *                  guid, type, color{r,g,b,a}, info, face_colors? }],
 *     info: { ... }
 *   }
 *
 * Element colors and face_colors are RGBA bytes (0-255) — we normalise to
 * Three.js floats. Rotations are unit quaternions; older exports may omit
 * the field or set it to null, in which case we treat the element as
 * identity-rotated.
 *
 * Instancing (multiple elements sharing a mesh_id) is handled by cloning
 * the shared BufferGeometry once per element so each can carry its own
 * color attribute. Sharing a geometry object across meshes is safe in
 * Three.js, but face_colors (v1.1.0) are per-element-per-face, which
 * would need per-element geometry anyway.
 */
class DotBimLoader extends BaseLoader {

	constructor() {
		super('DotBimLoader', ['bim'])
	}

	async loadModel(arrayBuffer, context) {
		const text = new TextDecoder('utf-8').decode(arrayBuffer)
		let doc
		try {
			doc = JSON.parse(text)
		} catch (e) {
			throw new Error(`Not a valid dotbim (.bim) file — JSON parse failed: ${e.message}`)
		}

		if (!doc || !Array.isArray(doc.meshes) || !Array.isArray(doc.elements)) {
			throw new Error('dotbim file missing required `meshes` or `elements` arrays')
		}

		const { group, meshCount, elementCount } = this.build(doc)

		if (elementCount === 0) {
			throw new Error('dotbim file contains no renderable elements')
		}

		this.logInfo('dotbim model loaded successfully', {
			schemaVersion: doc.schema_version,
			meshCount,
			elementCount,
		})

		return this.processModel(group, context)
	}

	/**
	 * Build a THREE.Group from a parsed dotbim document.
	 * @param {object} doc - Parsed dotbim JSON
	 * @return {{ group: THREE.Group, meshCount: number, elementCount: number }}
	 */
	build(doc) {
		// Build a mesh_id → base geometry map. Duplicate mesh_id entries are
		// common in buggy exports; last-wins matches other dotbim viewers.
		const baseGeoms = new Map()
		for (const m of doc.meshes) {
			if (typeof m?.mesh_id !== 'number') continue
			if (!Array.isArray(m.coordinates) || !Array.isArray(m.indices)) continue
			const geom = new THREE.BufferGeometry()
			geom.setAttribute('position', new THREE.Float32BufferAttribute(m.coordinates, 3))
			geom.setIndex(m.indices)
			geom.computeVertexNormals()
			baseGeoms.set(m.mesh_id, geom)
		}

		const group = new THREE.Group()
		let elementCount = 0

		for (const el of doc.elements) {
			const base = baseGeoms.get(el?.mesh_id)
			if (!base) continue

			// Clone so each element can carry its own face_colors without
			// clobbering siblings that reference the same mesh_id.
			const geometry = base.clone()

			if (Array.isArray(el.face_colors) && el.face_colors.length > 0) {
				this.applyFaceColors(geometry, el.face_colors)
			}

			const material = this.createMaterial({
				color: this.rgbaToHex(el.color),
				vertexColors: !!geometry.attributes.color,
				transparent: this.alphaFromRgba(el.color) < 1,
				opacity: this.alphaFromRgba(el.color),
				side: THREE.DoubleSide,
			})

			const mesh = new THREE.Mesh(geometry, material)

			// Translation
			const v = el.vector || {}
			mesh.position.set(v.x || 0, v.y || 0, v.z || 0)

			// Rotation — quaternion, but tolerate missing/null/partial
			const q = el.rotation
			if (q && typeof q === 'object') {
				const qw = typeof q.qw === 'number' ? q.qw : 1
				mesh.quaternion.set(q.qx || 0, q.qy || 0, q.qz || 0, qw)
			}

			if (el.guid) mesh.name = `${el.type || 'Element'}_${el.guid.slice(0, 8)}`
			mesh.userData.dotbim = {
				guid: el.guid,
				type: el.type,
				info: el.info,
			}

			group.add(mesh)
			elementCount++
		}

		return { group, meshCount: baseGeoms.size, elementCount }
	}

	/**
	 * Expand a flat [r,g,b,a,r,g,b,a,...] face_colors array (one RGBA tuple
	 * per triangle face) into a per-vertex color attribute, since Three.js
	 * doesn't ship face-color support directly.
	 *
	 * Requires an indexed geometry; un-indexes the geometry in place so each
	 * face's three vertices can carry the face's color.
	 */
	applyFaceColors(geometry, faceColors) {
		const index = geometry.getIndex()
		if (!index) return
		const triCount = index.count / 3

		// Silently clamp if the exporter got the count wrong.
		const expected = triCount * 4
		if (faceColors.length < expected) {
			this.logWarning('dotbim face_colors shorter than expected', {
				got: faceColors.length,
				expected,
			})
			return
		}

		// Un-index so we can assign per-vertex colors that differ per face.
		const nonIndexed = geometry.toNonIndexed()
		const colors = new Float32Array(nonIndexed.attributes.position.count * 3)
		for (let t = 0; t < triCount; t++) {
			const r = faceColors[t * 4] / 255
			const g = faceColors[t * 4 + 1] / 255
			const b = faceColors[t * 4 + 2] / 255
			// Three verts per triangle each get the face color.
			for (let v = 0; v < 3; v++) {
				const o = (t * 3 + v) * 3
				colors[o] = r
				colors[o + 1] = g
				colors[o + 2] = b
			}
		}
		nonIndexed.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

		// Copy attributes back onto the input geometry for the caller.
		geometry.deleteAttribute('position')
		geometry.deleteAttribute('normal')
		geometry.setIndex(null)
		geometry.setAttribute('position', nonIndexed.attributes.position)
		geometry.setAttribute('normal', nonIndexed.attributes.normal)
		geometry.setAttribute('color', nonIndexed.attributes.color)
	}

	rgbaToHex(c) {
		if (!c || typeof c !== 'object') return 0xcccccc
		const r = Math.max(0, Math.min(255, c.r | 0))
		const g = Math.max(0, Math.min(255, c.g | 0))
		const b = Math.max(0, Math.min(255, c.b | 0))
		return (r << 16) | (g << 8) | b
	}

	alphaFromRgba(c) {
		if (!c || typeof c.a !== 'number') return 1
		return Math.max(0, Math.min(255, c.a)) / 255
	}

}

export default DotBimLoader
