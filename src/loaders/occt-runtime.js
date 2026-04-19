import * as THREE from 'three'
import occtimportjs from 'occt-import-js'
import { logger } from '../utils/logger.js'

/**
 * Shared OCCT (OpenCascade Technology) runtime for the STEP, IGES, BREP,
 * and FCSTD loaders.
 *
 * All four formats come from the same family of NURBS/B-Rep CAD files and
 * all four are handled by `occt-import-js` — Viktor Kovacs's purpose-built
 * emscripten port of OCCT's import + tessellation routines. Sharing one
 * module instance across loaders avoids re-downloading the 7 MB WASM for
 * each format.
 *
 * The module is fetched once on first call and the returned promise is
 * memoized, so subsequent loads reuse the same WASM instance.
 */

let modulePromise = null

/**
 * Resolve the occt-import-js module, loading its WASM from the app's
 * bundled copy at `/apps/threedviewer/occt/` so air-gapped installs work.
 *
 * @return {Promise<object>} the emscripten module with Read*File methods
 */
export function getOcct() {
	if (!modulePromise) {
		modulePromise = occtimportjs({
			locateFile(name) {
				if (name.endsWith('.wasm')) {
					return '/apps/threedviewer/occt/' + name
				}
				return name
			},
		})
	}
	return modulePromise
}

/**
 * Convert an occt-import-js result document into a THREE.Group.
 *
 * Schema (see https://github.com/kovacsv/occt-import-js#processing-the-result):
 *   result = { success, root: { name, meshes, children }, meshes: [Mesh] }
 *   Mesh  = { name, color?, attributes: { position: {array}, normal?: {array} },
 *             index: { array } }
 *
 * OCCT bakes node transforms into vertex positions during tessellation, so
 * we don't need to walk `root.children` — every mesh is pre-transformed to
 * world space. We do walk the tree to preserve the naming hierarchy on
 * THREE.Object3D, which lets future inspection tooling surface the CAD
 * assembly structure.
 *
 * @param {object} result - The OCCT result JSON
 * @param {string} loaderName - For log scoping
 * @return {THREE.Group} root group
 */
export function buildGroupFromOccResult(result, loaderName) {
	if (!result || !result.success) {
		throw new Error('OCCT reported import failure')
	}
	if (!Array.isArray(result.meshes) || result.meshes.length === 0) {
		throw new Error('OCCT returned no tessellated meshes')
	}

	const meshes = result.meshes.map((m, i) => buildMesh(m, i, loaderName))
	const root = new THREE.Group()
	root.name = result.root?.name || 'OCCT'
	attachNode(root, result.root, meshes)
	return root
}

/**
 * Recursively attach a node's meshes + children onto a THREE.Group.
 */
function attachNode(parent, node, meshes) {
	if (!node) return

	// Attach this node's meshes directly (transforms are baked in).
	if (Array.isArray(node.meshes)) {
		for (const idx of node.meshes) {
			const m = meshes[idx]
			if (m) parent.add(m.clone()) // clone so the same mesh can appear in multiple nodes
		}
	}

	// Recurse into children as grouped sub-trees to preserve assembly names.
	if (Array.isArray(node.children)) {
		for (const child of node.children) {
			const childGroup = new THREE.Group()
			childGroup.name = child.name || 'Node'
			parent.add(childGroup)
			attachNode(childGroup, child, meshes)
		}
	}
}

function buildMesh(occMesh, index, loaderName) {
	const posArr = occMesh.attributes?.position?.array
	const idxArr = occMesh.index?.array
	if (!posArr || posArr.length === 0) {
		logger.warn(loaderName, `Mesh #${index} has no position data; skipping`)
		return null
	}

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3))

	const normArr = occMesh.attributes?.normal?.array
	if (normArr && normArr.length === posArr.length) {
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3))
	}

	if (idxArr) geometry.setIndex(idxArr)
	if (!normArr) geometry.computeVertexNormals()
	geometry.computeBoundingBox()

	// OCCT color is [r, g, b] in 0..1 floats, or absent for default gray.
	const color = Array.isArray(occMesh.color) && occMesh.color.length >= 3
		? new THREE.Color(occMesh.color[0], occMesh.color[1], occMesh.color[2])
		: new THREE.Color(0x888888)

	const material = new THREE.MeshStandardMaterial({
		color,
		metalness: 0.1,
		roughness: 0.8,
		side: THREE.DoubleSide,
	})

	const mesh = new THREE.Mesh(geometry, material)
	mesh.name = occMesh.name || `Mesh_${index}`
	return mesh
}
