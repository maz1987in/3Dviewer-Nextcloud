/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The file for a repaired model: the repaired meshes handed to the exporters Export uses
 * (three's STLExporter, and the 3MF writer), so the file is written the way Export writes
 * it and keeps the model's real size and unit. The repaired meshes are already in the world,
 * where Export puts them, so they sit under a group that does not move them.
 *
 * Loaded when someone asks for the file, not with Print check.
 */

import * as THREE from 'three'

/**
 * @param {Array<{positions: Float32Array, index: Uint32Array}>} parts - The repaired meshes, placed
 * @return {THREE.Group} Them as a model
 */
function modelOf(parts) {
	const group = new THREE.Group()
	for (const { positions, index } of parts) {
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
		geometry.setIndex(new THREE.BufferAttribute(index, 1))
		group.add(new THREE.Mesh(geometry))
	}
	group.updateMatrixWorld(true)
	return group
}

/**
 * Write the repaired model as a file.
 *
 * @param {Array<{positions: Float32Array, index: Uint32Array}>} parts - The repaired meshes
 * @param {string} format - 'stl' (binary) or '3mf'
 * @param {object} [options] - Options
 * @param {number} [options.millimetresPerUnit] - Millimetres per scene unit, which a 3MF
 *   records (an STL has no unit, and keeps the scene's)
 * @param {function(number): void} [options.onProgress] - Called with 0 to 1 while a 3MF is written
 * @return {Promise<?{blob: Blob, extension: string}>} The file, or null when the repaired
 *   model has no triangle to write
 */
export async function buildRepairedFile(parts, format, { millimetresPerUnit = 1, onProgress } = {}) {
	const usable = parts.filter((part) => part.index.length >= 3)
	if (!usable.length) {
		return null
	}
	const model = modelOf(usable)
	try {
		if (format === '3mf') {
			const { build3MF } = await import('../utils/threeMFWriter.js')
			const file = await build3MF(model, { millimetresPerUnit, onProgress })
			return file ? { blob: new Blob([file], { type: 'model/3mf' }), extension: '3mf' } : null
		}
		const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js')
		return { blob: new Blob([new STLExporter().parse(model, { binary: true })], { type: 'model/stl' }), extension: 'stl' }
	} finally {
		model.children.forEach((mesh) => mesh.geometry.dispose())
	}
}
