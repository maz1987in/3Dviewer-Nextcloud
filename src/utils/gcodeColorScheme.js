/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The viewer's G-code colour setting, shown over the toolpath's own colouring.
 *
 * A toolpath is always loaded in its own colouring, a gradient from the first move to
 * the last, which is also what a background thumbnail draws. "Single colour" is a
 * viewer setting, so it goes through the registry of what viewer tools change on the
 * model (viewerMaterialProps), and a thumbnail made in the viewer draws the gradient too.
 *
 * Plain module, no Vue and no DOM.
 */

import { Color } from 'three'
import { restoreOwn, setForViewer } from './viewerMaterialProps.js'

/**
 * Show a toolpath in one colour, or in its own gradient.
 *
 * @param {THREE.Object3D} toolpath - The `GCodeToolpath` group the G-code loader makes
 * @param {'single'|'gradient'} mode - The viewer's colour mode
 * @param {string} color - The colour for 'single', as CSS
 */
export function applyGcodeColorScheme(toolpath, mode, color) {
	for (const layer of toolpath.children || []) {
		const material = layer.material
		if (!material) {
			continue
		}
		if (mode === 'single') {
			// One uniform colour, with the vertex colours off
			setForViewer(material, 'color', new Color(color))
			setForViewer(material, 'vertexColors', false)
		} else {
			// The gradient set during loading, under the material's own white, so a single
			// colour picked before no longer tints it
			restoreOwn(material, 'color')
			restoreOwn(material, 'vertexColors')
		}
		// vertexColors is compiled into the shader
		material.needsUpdate = true
	}
}
