/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Which meshes are showing a stand-in material, and what their own material is.
 *
 * The viewer's render modes (Clay, Normals, X-ray) draw the live model with stand-ins
 * instead of its own materials. Anything that must see the model as it really is — the
 * thumbnail, which is shared with everyone who can see the file — renders inside
 * `withOwnMaterials`, whatever mode the viewer is in.
 *
 * Plain module, no Vue and no DOM: the thumbnail renderer that reads it also runs in a
 * Web Worker.
 */

// mesh -> its own material (or array of them)
const ownMaterials = new WeakMap()

/**
 * Show `standIn` on a mesh, remembering the mesh's own material the first time.
 *
 * @param {THREE.Mesh} mesh - The mesh
 * @param {THREE.Material|THREE.Material[]} standIn - What to draw it with instead
 */
export function showStandIn(mesh, standIn) {
	if (!ownMaterials.has(mesh)) {
		ownMaterials.set(mesh, mesh.material)
	}
	mesh.material = standIn
}

/**
 * The material a mesh really has, whether or not a stand-in is showing.
 *
 * @param {THREE.Mesh} mesh - The mesh
 * @return {THREE.Material|THREE.Material[]} Its own material
 */
export function ownMaterialOf(mesh) {
	return ownMaterials.has(mesh) ? ownMaterials.get(mesh) : mesh.material
}

/**
 * Give a mesh its own material back.
 *
 * @param {THREE.Mesh} mesh - The mesh
 */
export function restoreOwnMaterial(mesh) {
	if (!ownMaterials.has(mesh)) {
		return
	}
	mesh.material = ownMaterials.get(mesh)
	ownMaterials.delete(mesh)
}

/**
 * Run `fn` with every mesh under `root` drawn with its own material, then put back
 * whatever was showing. Synchronous, so nothing else can draw the model in between.
 *
 * @param {THREE.Object3D} root - The model
 * @param {Function} fn - Typically a single `renderer.render()`
 * @return {*} What `fn` returns
 */
export function withOwnMaterials(root, fn) {
	const swapped = []
	root.traverse((child) => {
		if (child.isMesh && ownMaterials.has(child)) {
			swapped.push([child, child.material])
			child.material = ownMaterials.get(child)
		}
	})
	try {
		return fn()
	} finally {
		for (const [mesh, shown] of swapped) {
			mesh.material = shown
		}
	}
}
