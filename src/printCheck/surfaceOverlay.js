/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Meshes that draw over a model's surface without being part of the model.
 *
 * Print check colours overhangs and thin walls. It does so with an overlay mesh per part,
 * added to the scene rather than under the model: it shares the part's geometry and copies
 * the part's world matrix each frame, so it sits exactly on the surface and follows the
 * transform gizmo and Exploded view. Exports read the model, thumbnails render the model
 * in a scene of their own, and render modes swap the model's materials, so none of them
 * can see an overlay, and none needs to know about one.
 */

import * as THREE from 'three'

/**
 * Whether an object and every ancestor are visible.
 *
 * @param {THREE.Object3D} object - The object
 * @return {boolean} Visible in the scene
 */
function visibleInWorld(object) {
	for (let node = object; node; node = node.parent) {
		if (!node.visible) {
			return false
		}
	}
	return true
}

/**
 * Draw `material` over one mesh.
 *
 * @param {THREE.Scene} scene - Where the overlay goes
 * @param {THREE.Mesh} source - The part it covers
 * @param {THREE.Material} material - What it is drawn with
 * @param {Object<string, THREE.BufferAttribute>} [extraAttributes] - Per-vertex data the
 *   material reads, kept on the overlay's geometry so the model's stays as it is
 * @return {{object: THREE.Mesh, sync: function(): void, dispose: function(): void}} The overlay
 */
export function createSurfaceOverlay(scene, source, material, extraAttributes = {}) {
	const geometry = new THREE.BufferGeometry()
	for (const name of ['position', 'normal']) {
		if (source.geometry.attributes[name]) {
			geometry.setAttribute(name, source.geometry.attributes[name])
		}
	}
	if (source.geometry.index) {
		geometry.setIndex(source.geometry.index)
	}
	for (const [name, attribute] of Object.entries(extraAttributes)) {
		geometry.setAttribute(name, attribute)
	}

	// An open cross-section cuts the model; the overlay is cut the same way
	const sourceMaterial = Array.isArray(source.material) ? source.material[0] : source.material
	if (sourceMaterial?.clippingPlanes?.length && !material.clippingPlanes?.length) {
		material.clippingPlanes = sourceMaterial.clippingPlanes
		material.clipping = true
	}

	const object = new THREE.Mesh(geometry, material)
	object.matrixAutoUpdate = false
	object.renderOrder = (source.renderOrder || 0) + 1
	object.userData.viewerOverlay = true
	object.name = `${source.name || 'part'} (print check)`

	const sync = () => {
		object.matrix.copy(source.matrixWorld)
		object.matrixWorld.copy(source.matrixWorld)
		object.visible = visibleInWorld(source)
	}
	sync()
	scene.add(object)

	const dispose = () => {
		object.removeFromParent()
		// Disposing frees the GPU buffer of every attribute still attached, so the model's
		// own come off first: only what the overlay made is freed
		for (const name of Object.keys(geometry.attributes)) {
			if (!(name in extraAttributes)) {
				geometry.deleteAttribute(name)
			}
		}
		geometry.setIndex(null)
		geometry.dispose()
	}
	return { object, sync, dispose }
}

/**
 * Overlays for every visible mesh of a model.
 *
 * @param {THREE.Scene} scene - Where the overlays go
 * @param {THREE.Object3D} root - The model
 * @param {function(THREE.Mesh): THREE.Material} makeMaterial - The material for one part
 * @param {function(THREE.Mesh): Object<string, THREE.BufferAttribute>} [attributesFor] -
 *   Per-vertex data for one part
 * @return {{overlays: Array, sync: function(): void, dispose: function(): void}} The set
 */
export function createOverlaySet(scene, root, makeMaterial, attributesFor = () => ({})) {
	const meshes = []
	root.traverse((child) => {
		if (child.isMesh && child.geometry?.attributes?.position && !child.userData?.viewerOverlay) {
			meshes.push(child)
		}
	})
	const overlays = meshes.map((mesh) => createSurfaceOverlay(scene, mesh, makeMaterial(mesh), attributesFor(mesh)))
	return {
		overlays,
		sync: () => overlays.forEach((overlay) => overlay.sync()),
		dispose: () => {
			const materials = new Set(overlays.map((overlay) => overlay.object.material))
			overlays.forEach((overlay) => overlay.dispose())
			materials.forEach((material) => material.dispose())
		},
	}
}
