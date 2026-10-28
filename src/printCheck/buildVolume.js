/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Whether a model fits a printer's build volume.
 *
 * The model is measured the way an export writes it: its parts together however Exploded
 * view has moved them, and placed as the user placed it with the transform gizmo. A slicer
 * gets that model, so that is the one that has to fit.
 */

import * as THREE from 'three'
import { withPartsTogether } from '../utils/viewerTransforms.js'

/**
 * The bed's axes in the scene, for the axis the user says is up.
 *
 * @param {'y'|'z'} up - `'y'` as the viewer shows models; `'z'` for a file drawn Z-up
 * @return {{up: THREE.Vector3, width: THREE.Vector3, depth: THREE.Vector3}} Unit vectors
 */
export function bedAxes(up) {
	return up === 'z'
		? { up: new THREE.Vector3(0, 0, 1), width: new THREE.Vector3(1, 0, 0), depth: new THREE.Vector3(0, 1, 0) }
		: { up: new THREE.Vector3(0, 1, 0), width: new THREE.Vector3(1, 0, 0), depth: new THREE.Vector3(0, 0, 1) }
}

/**
 * The model's size along the bed's axes, from its vertices in world space.
 *
 * @param {THREE.Object3D} root - The model
 * @param {{up: THREE.Vector3, width: THREE.Vector3, depth: THREE.Vector3}} axes - From bedAxes
 * @param {number} mmPerUnit - Millimetres per scene unit
 * @return {{width: number, depth: number, height: number, min: THREE.Vector3, max: THREE.Vector3}}
 *   Sizes in millimetres; `min` and `max` the lowest and highest points along each axis
 *   (x = width, y = up, z = depth), in scene units
 */
export function modelExtentMm(root, axes, mmPerUnit) {
	const min = new THREE.Vector3(Infinity, Infinity, Infinity)
	const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
	const vertex = new THREE.Vector3()

	withPartsTogether(root, () => {
		root.updateMatrixWorld(true)
		root.traverse((child) => {
			const position = child.geometry?.attributes?.position
			if (!(child.isMesh || child.isPoints || child.isLine) || !position || child.userData?.viewerOverlay) {
				return
			}
			for (let i = 0; i < position.count; i++) {
				vertex.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld)
				if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y) || !Number.isFinite(vertex.z)) {
					continue
				}
				const along = [vertex.dot(axes.width), vertex.dot(axes.up), vertex.dot(axes.depth)]
				min.set(Math.min(min.x, along[0]), Math.min(min.y, along[1]), Math.min(min.z, along[2]))
				max.set(Math.max(max.x, along[0]), Math.max(max.y, along[1]), Math.max(max.z, along[2]))
			}
		})
	})

	if (!Number.isFinite(min.x)) {
		return { width: 0, depth: 0, height: 0, min: new THREE.Vector3(), max: new THREE.Vector3() }
	}
	return {
		width: (max.x - min.x) * mmPerUnit,
		depth: (max.z - min.z) * mmPerUnit,
		height: (max.y - min.y) * mmPerUnit,
		min,
		max,
	}
}

/**
 * How a model of `size` sits in a build `volume`.
 *
 * @param {{width: number, depth: number, height: number}} size - The model, in mm
 * @param {{width: number, depth: number, height: number}} volume - The printer, in mm
 * @return {{fits: boolean, over: {width: number, depth: number, height: number}, fitsTurned: boolean}}
 *   `over` is how far each side sticks out (0 inside); `fitsTurned` whether it fits with
 *   width and depth swapped
 */
export function fitReport(size, volume) {
	const over = {
		width: Math.max(0, size.width - volume.width),
		depth: Math.max(0, size.depth - volume.depth),
		height: Math.max(0, size.height - volume.height),
	}
	const fits = over.width === 0 && over.depth === 0 && over.height === 0
	const fitsTurned = size.height <= volume.height && size.depth <= volume.width && size.width <= volume.depth
	return { fits, over, fitsTurned }
}
