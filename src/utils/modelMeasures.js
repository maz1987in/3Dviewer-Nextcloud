/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What a loaded model is made of, counted off its scene graph: materials, textures,
 * vertices, faces, and a mesh's surface area, volume and watertightness. Shared by the
 * viewer's statistics panel (useModelStats) and by the measurement the Files sidebar's
 * "3D" tab stores (stats/extractStats.js), which also runs in the thumbnail worker, so
 * this is a plain module: no Vue and no DOM.
 */

import * as THREE from 'three'

// Skip watertightness detection above this triangle count per mesh (edge map is O(n))
export const WATERTIGHT_MAX_TRIANGLES = 500000

/**
 * Get unique materials from a 3D object
 * @param {THREE.Object3D} object3D - Object to analyze
 * @return {Array} Array of unique materials
 */
export const getMaterials = (object3D) => {
	const materials = new Map()

	object3D.traverse((child) => {
		// A splat's invisible bounds box (splats/loadSplat.js) is no part of the model
		if (child.isMesh && child.material && !child.userData?.tdvBoundsProxy) {
			const mats = Array.isArray(child.material) ? child.material : [child.material]
			mats.forEach((mat) => {
				if (!materials.has(mat.uuid)) {
					materials.set(mat.uuid, {
						uuid: mat.uuid,
						name: mat.name || 'Unnamed',
						type: mat.type || 'Unknown',
					})
				}
			})
		}
	})

	return Array.from(materials.values())
}

/**
 * Get textures and calculate memory usage
 * @param {THREE.Object3D} object3D - Object to analyze
 * @return {object} Texture information
 */
export const getTextures = (object3D) => {
	const textures = new Map()
	let totalMemory = 0
	let pendingCount = 0
	let missingCount = 0

	object3D.traverse((child) => {
		if (child.material && !child.userData?.tdvBoundsProxy) {
			const mats = Array.isArray(child.material) ? child.material : [child.material]
			mats.forEach((mat) => {
				// Check all material properties for textures
				Object.keys(mat).forEach((key) => {
					const value = mat[key]
					if (value && value.isTexture) {
						if (!textures.has(value.uuid)) {
							// Read real image dimensions. Loaders sometimes attach a
							// Texture with no image, or with an Image element that
							// failed to load, when a referenced file is missing (e.g.
							// FBX pointing to texture.png that isn't shipped alongside
							// the .fbx). Distinguish that from an image that is
							// genuinely mid-decode so the UI can say "missing" vs
							// "loading…" instead of reporting a fake 0 MB.
							const img = value.image
							const rawW = img?.width ?? 0
							const rawH = img?.height ?? 0
							const imageLoaded = rawW >= 4 && rawH >= 4
							// Multiple ways a reference "didn't resolve":
							// - no image attached at all
							// - HTMLImageElement without any src assigned
							// - HTMLImageElement that finished loading with naturalWidth 0 (broken image)
							// - 1×1 placeholder (our FBX loader substitutes a 1px base64
							//   PNG when a referenced texture file is missing). We can't
							//   distinguish this from a legit 1-pixel texture, but those
							//   essentially never ship in real models.
							const isHtmlImg = typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement
							const isPlaceholder = (rawW === 1 && rawH === 1)
								|| (img?.naturalWidth === 1 && img?.naturalHeight === 1)
							const isMissing = !img
								|| (isHtmlImg && !img.src)
								|| (isHtmlImg && img.complete && img.naturalWidth === 0)
								|| isPlaceholder
							const memory = imageLoaded ? rawW * rawH * 4 : 0 // RGBA bytes

							textures.set(value.uuid, {
								uuid: value.uuid,
								name: value.name || key,
								width: rawW || null,
								height: rawH || null,
								memory,
								pending: !imageLoaded && !isMissing,
								missing: isMissing,
							})

							if (imageLoaded) totalMemory += memory
							else if (isMissing) missingCount++
							else pendingCount++
						}
					}
				})
			})
		}
	})

	return {
		textures: Array.from(textures.values()),
		count: textures.size,
		pendingCount,
		missingCount,
		memoryBytes: totalMemory,
		memoryMB: totalMemory / (1024 * 1024),
	}
}

/**
 * Get geometry statistics
 * @param {THREE.Object3D} object3D - Object to analyze
 * @return {object} Geometry statistics
 */
export const getGeometryStats = (object3D) => {
	let vertices = 0
	let faces = 0
	let meshes = 0
	let points = 0

	object3D.traverse((child) => {
		if (child.userData?.tdvBoundsProxy) {
			// A splat's bounds box: measured for its extent, never counted
		} else if (child.isPoints) {
			// A scan: points, never faces
			points += child.geometry?.attributes.position?.count ?? 0
		} else if (child.isMesh) {
			meshes++
			if (child.geometry) {
				// Count vertices
				if (child.geometry.attributes.position) {
					vertices += child.geometry.attributes.position.count
				}

				// Count faces
				if (child.geometry.index) {
					faces += child.geometry.index.count / 3
				} else if (child.geometry.attributes.position) {
					faces += child.geometry.attributes.position.count / 3
				}
			}
		} else if (child.isLine) {
			// Count G-code or other line segments
			if (child.geometry && child.geometry.attributes.position) {
				vertices += child.geometry.attributes.position.count
			}
		}
	})

	return {
		vertices,
		faces: Math.floor(faces),
		meshes,
		points,
	}
}

/**
 * Compute surface area, volume, and watertightness for a single mesh.
 * Volume uses the signed tetrahedra method (divergence theorem);
 * watertightness uses edge-pair counting on indexed geometry.
 * @param {THREE.Mesh} mesh - Mesh to analyze
 * @return {object} { surfaceArea, volume, watertight, boundaryEdges, nonManifoldEdges }
 */
export const computeMeshStats = (mesh) => {
	const result = {
		surfaceArea: 0,
		volume: 0,
		watertight: null, // null = unknown (non-indexed or too large)
		boundaryEdges: 0,
		nonManifoldEdges: 0,
	}

	const geo = mesh.geometry
	const pos = geo?.attributes?.position
	if (!pos) return result

	mesh.updateWorldMatrix(true, false)
	const matrix = mesh.matrixWorld

	const index = geo.index
	const triCount = index ? index.count / 3 : pos.count / 3

	const vA = new THREE.Vector3()
	const vB = new THREE.Vector3()
	const vC = new THREE.Vector3()
	const ab = new THREE.Vector3()
	const ac = new THREE.Vector3()
	const cross = new THREE.Vector3()

	let area = 0
	let signedVolume = 0

	// Edge map for watertightness — only meaningful for indexed geometry
	// and only built when mesh is below the size cap.
	const canCheckWatertight = !!index && triCount <= WATERTIGHT_MAX_TRIANGLES
	const edgeMap = canCheckWatertight ? new Map() : null
	const addEdge = (u, v) => {
		const key = u < v ? `${u}|${v}` : `${v}|${u}`
		edgeMap.set(key, (edgeMap.get(key) || 0) + 1)
	}

	for (let i = 0; i < triCount; i++) {
		let iA, iB, iC
		if (index) {
			iA = index.getX(i * 3)
			iB = index.getX(i * 3 + 1)
			iC = index.getX(i * 3 + 2)
		} else {
			iA = i * 3
			iB = i * 3 + 1
			iC = i * 3 + 2
		}

		vA.fromBufferAttribute(pos, iA)
		vB.fromBufferAttribute(pos, iB)
		vC.fromBufferAttribute(pos, iC)
		vA.applyMatrix4(matrix)
		vB.applyMatrix4(matrix)
		vC.applyMatrix4(matrix)

		ab.subVectors(vB, vA)
		ac.subVectors(vC, vA)
		area += ab.cross(ac).length() * 0.5

		cross.crossVectors(vB, vC)
		signedVolume += vA.dot(cross) / 6

		if (edgeMap) {
			addEdge(iA, iB)
			addEdge(iB, iC)
			addEdge(iC, iA)
		}
	}

	result.surfaceArea = area
	result.volume = Math.abs(signedVolume)

	if (edgeMap) {
		let boundary = 0
		let nonManifold = 0
		for (const count of edgeMap.values()) {
			if (count === 1) boundary++
			else if (count > 2) nonManifold++
		}
		result.boundaryEdges = boundary
		result.nonManifoldEdges = nonManifold
		result.watertight = boundary === 0 && nonManifold === 0
	}

	return result
}
