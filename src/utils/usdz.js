/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Writing a model as USDZ at its real size, for the USDZ download and for AR Quick Look
 * (View in AR on an iPhone or iPad).
 */

import { Group } from 'three'
import { NothingToExportError } from './exportErrors.js'

/**
 * Whether anything under `object` that the viewer shows can go into a file of
 * surfaces: a mesh with at least one triangle's worth of vertices, or, for formats
 * that hold point clouds, a point.
 * @param {THREE.Object3D} object - The model
 * @param {object} [options] - Options
 * @param {boolean} [options.points] - Count point clouds too
 * @return {boolean}
 */
export function hasSurfaces(object, { points = false } = {}) {
	let found = false
	// What the viewer shows: a mesh inside a hidden group does not count
	const walk = typeof object.traverseVisible === 'function' ? 'traverseVisible' : 'traverse'
	object[walk]((child) => {
		const count = child.geometry?.attributes?.position?.count ?? 0
		if ((child.isMesh && count >= 3) || (points && child.isPoints && count > 0)) found = true
	})
	return found
}

/**
 * The USDZ file for a model, in metres.
 *
 * AR Quick Look shows a model at its real size, and three's exporter declares one
 * unit a metre (`metersPerUnit = 1`). A model in millimetres (an STL, say) goes in
 * under a 1/1000 scale, so a 100 mm part is 100 mm on the table, not 100 m; a glTF,
 * already in metres, goes in as it is.
 *
 * The exporter is loaded here, when the first file is made, so nothing that opens a
 * model carries it.
 *
 * @param {THREE.Object3D} object - The model
 * @param {object} [options] - Options
 * @param {number} [options.millimetresPerUnit] - Millimetres per scene unit, from the
 *   format the model was loaded from (utils/sourceUnits.js)
 * @return {Promise<Uint8Array>} The file's bytes
 * @throws {NothingToExportError} When the model has no triangles to write
 */
export async function buildUsdz(object, { millimetresPerUnit = 1 } = {}) {
	if (!hasSurfaces(object)) {
		throw new NothingToExportError('USDZ')
	}
	const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js')
	const metresPerUnit = millimetresPerUnit / 1000
	if (metresPerUnit === 1) {
		return new USDZExporter().parseAsync(object)
	}
	const inMetres = new Group()
	inMetres.name = 'Model'
	inMetres.scale.setScalar(metresPerUnit)
	inMetres.updateMatrix()
	// Listed as its child for the exporter only, which reads each object's local
	// matrix and its children; the model is not moved out of the scene.
	inMetres.children = [object]
	return new USDZExporter().parseAsync(inMetres)
}
