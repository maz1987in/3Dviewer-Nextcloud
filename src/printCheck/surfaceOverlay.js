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
 *
 * An overlay's shader is compiled before it is first drawn (`compileQuietly`), and the
 * overlay is held out of sight until then: drawing a shader the moment it is made stops
 * the page until it is compiled, which on a software renderer takes most of a second.
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
 * @param {boolean} [held] - Kept out of sight until `hold(false)`
 * @return {{object: THREE.Mesh, sync: function(): void, hold: function(boolean): void, dispose: function(): void}} The overlay
 */
export function createSurfaceOverlay(scene, source, material, extraAttributes = {}, held = false) {
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

	const follow = () => {
		object.matrix.copy(source.matrixWorld)
		object.matrixWorld.copy(source.matrixWorld)
	}
	const sync = () => {
		follow()
		object.visible = !held && visibleInWorld(source)
	}
	const hold = (value) => {
		held = value
		sync()
	}
	// The renderer brings world matrices up to date before it draws, and calls this just
	// before drawing the overlay: a part moved since the last frame is followed at once
	object.onBeforeRender = follow
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
	return { object, sync, hold, dispose }
}

/**
 * Overlays for every visible mesh of a model.
 *
 * @param {THREE.Scene} scene - Where the overlays go
 * @param {THREE.Object3D} root - The model
 * @param {function(THREE.Mesh): THREE.Material} makeMaterial - The material for one part
 * @param {function(THREE.Mesh): Object<string, THREE.BufferAttribute>} [attributesFor] -
 *   Per-vertex data for one part
 * @param {object} [options] - Options
 * @param {boolean} [options.held] - Every overlay kept out of sight until `hold(false)`
 * @return {{overlays: Array, sync: function(): void, hold: function(boolean): void, dispose: function(): void}} The set
 */
export function createOverlaySet(scene, root, makeMaterial, attributesFor = () => ({}), { held = false } = {}) {
	const meshes = []
	root.traverse((child) => {
		if (child.isMesh && child.geometry?.attributes?.position && !child.userData?.viewerOverlay) {
			meshes.push(child)
		}
	})
	const overlays = meshes.map((mesh) => createSurfaceOverlay(scene, mesh, makeMaterial(mesh), attributesFor(mesh), held))
	return {
		overlays,
		sync: () => overlays.forEach((overlay) => overlay.sync()),
		hold: (value) => overlays.forEach((overlay) => overlay.hold(value)),
		dispose: () => {
			const materials = new Set(overlays.map((overlay) => overlay.object.material))
			overlays.forEach((overlay) => overlay.dispose())
			materials.forEach((material) => material.dispose())
		},
	}
}

// Without KHR_parallel_shader_compile there is no way to ask whether a compile has
// finished without waiting for it. Software renderers lack it; on one, a compile started
// this long before is done, measured on SwiftShader with 240,000 triangles on screen
// (300 ms was too short, 1.5 s and 2 s were not)
const SETTLE_MS = 1500

/**
 * Compile the shaders of some objects without stopping the page, before they are first
 * drawn. With KHR_parallel_shader_compile (most desktop GPUs) the driver compiles them in
 * the background and this settles when they are ready. Without it, the compile is started
 * and this settles after SETTLE_MS. The first frame that draws them still waits once
 * for a software renderer to finish the frames before it.
 *
 * @param {?THREE.WebGLRenderer} renderer - The renderer that will draw them
 * @param {?THREE.Camera} camera - The camera they will be drawn with
 * @param {THREE.Scene} scene - The scene they are in, for its lights and fog
 * @param {THREE.Object3D[]} objects - The objects, which may be out of sight meanwhile
 * @return {Promise<void>} Settled when they can be drawn; never rejects
 */
export function compileQuietly(renderer, camera, scene, objects) {
	if (typeof renderer?.compile !== 'function' || !camera || !objects.length) {
		return Promise.resolve()
	}
	// Overlays that differ only in what they cover share one shader: compiling one does for
	// all, and compiling each would go through the scene's lights once per part
	const kinds = new Map()
	for (const object of objects) {
		const material = object.material
		const key = `${material?.type}:${material?.vertexShader ?? ''}:${material?.fragmentShader ?? ''}:${material?.clippingPlanes?.length ?? 0}`
		if (!kinds.has(key)) {
			kinds.set(key, object)
		}
	}
	objects = [...kinds.values()]
	try {
		if (typeof renderer.compileAsync === 'function' && renderer.extensions?.has?.('KHR_parallel_shader_compile')) {
			return Promise.all(objects.map((object) => renderer.compileAsync(object, camera, scene))).then(() => {}, () => {})
		}
		objects.forEach((object) => renderer.compile(object, camera, scene))
	} catch {
		// Drawing will compile them, as it would have anyway
		return Promise.resolve()
	}
	return new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
}
