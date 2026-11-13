/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The tint on the part chosen in the Parts panel.
 *
 * Nothing on the model changes. For each mesh of the chosen part, a second mesh that
 * shares its geometry is drawn over it in a translucent accent colour, in the scene and
 * not under the model, so it is never exported, measured, counted or picked. It follows
 * its mesh by copying the mesh's world matrix as it is drawn, which keeps it on the part
 * when Exploded view or an animation moves it, and a render mode (which swaps the mesh's
 * material) cannot touch it.
 *
 * Skinned and instanced meshes draw from more than their geometry and are left untinted;
 * the row in the panel and the camera still find them.
 */

import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three'

/** More meshes than this and the tint is drawn on the first of them only. */
export const MAX_TINTED = 400

const DEFAULT_COLOUR = '#0082c9'
const OPACITY = 0.45

/**
 * @param {Element} [element] - Where the accent colour is read from
 * @return {Color} The accent colour of the theme in use
 */
function accentColour(element = typeof document !== 'undefined' ? document.documentElement : null) {
	const colour = new Color()
	try {
		const css = element ? getComputedStyle(element).getPropertyValue('--tdv-color-primary').trim() : ''
		colour.set(css || DEFAULT_COLOUR)
	} catch {
		colour.set(DEFAULT_COLOUR)
	}
	return colour
}

/**
 * @param {THREE.Object3D} node - A node
 * @return {boolean} Whether it and every node above it is shown
 */
function isShown(node) {
	for (let current = node; current; current = current.parent) {
		if (!current.visible) {
			return false
		}
	}
	return true
}

/**
 * @param {THREE.Scene} scene - Where the tint is drawn
 * @return {object} See the methods below
 */
export function createPartHighlight(scene) {
	const group = new Group()
	group.name = 'parts-highlight'
	group.userData.tdvHelper = true
	group.matrixAutoUpdate = false
	let material = null
	let tinted = []

	const clear = () => {
		group.removeFromParent()
		group.clear()
		tinted = []
	}

	return {
		/**
		 * Tint these meshes, and nothing else.
		 *
		 * @param {THREE.Object3D[]} nodes - The meshes of the chosen part
		 * @return {number} How many were tinted
		 */
		show(nodes) {
			clear()
			if (!material) {
				material = new MeshBasicMaterial({
					color: accentColour(),
					transparent: true,
					opacity: OPACITY,
					depthWrite: false,
					// Over the surface it covers, not fighting it
					polygonOffset: true,
					polygonOffsetFactor: -2,
					polygonOffsetUnits: -2,
					side: DoubleSide,
				})
			}
			material.color.copy(accentColour())
			nodes
				.filter((node) => node.isMesh && !node.isSkinnedMesh && !node.isInstancedMesh && node.geometry)
				.slice(0, MAX_TINTED)
				.forEach((source) => {
					const overlay = new Mesh(source.geometry, material)
					overlay.name = 'parts-highlight-mesh'
					overlay.userData.tdvHelper = true
					overlay.matrixAutoUpdate = false
					// Copied from the part as each frame is drawn, not recomputed from a parent
					overlay.matrixWorldAutoUpdate = false
					overlay.matrixWorld.copy(source.matrixWorld)
					overlay.frustumCulled = false
					overlay.renderOrder = 1
					overlay.raycast = () => {}
					overlay.onBeforeRender = () => {
						overlay.matrixWorld.copy(source.matrixWorld)
					}
					overlay.visible = isShown(source)
					group.add(overlay)
					tinted.push({ overlay, source })
				})
			if (tinted.length > 0) {
				scene.add(group)
			}
			return tinted.length
		},

		/** Hide the tint of a part that has been hidden, and show it again with the part. */
		refresh() {
			tinted.forEach(({ overlay, source }) => {
				overlay.visible = isShown(source)
			})
		},

		/** @return {number} How many meshes are tinted */
		get count() {
			return tinted.length
		},

		clear,

		dispose() {
			clear()
			material?.dispose()
			material = null
		},
	}
}
