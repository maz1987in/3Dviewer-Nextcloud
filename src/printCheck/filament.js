/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Roughly how much filament a closed model takes to print.
 *
 * A slicer knows exactly; this does not slice, so it uses one simple rule and says it is
 * an estimate: the walls and the top and bottom are solid to a fixed depth (the surface
 * area times that depth, never more than the whole volume), and the inside is filled at
 * the infill percentage. See docs/TECHNICAL.md ("Print Check").
 */

import { SHELL_DEPTH_MM, FILAMENT_DIAMETER_MM } from './printers.js'

/**
 * @param {object} model - The model and the print settings
 * @param {number} model.volumeMm3 - Its volume
 * @param {number} model.areaMm2 - Its surface area
 * @param {number} model.infillPercent - 0 to 100
 * @param {number} model.density - The material's density in g/cm³
 * @param {number} [model.shellDepthMm] - How deep the solid shell is
 * @param {number} [model.diameterMm] - The filament's diameter
 * @return {{grams: number, metres: number}} The filament it takes
 */
export function estimateFilament({ volumeMm3, areaMm2, infillPercent, density, shellDepthMm = SHELL_DEPTH_MM, diameterMm = FILAMENT_DIAMETER_MM }) {
	const shell = Math.min(volumeMm3, areaMm2 * shellDepthMm)
	const material = shell + (volumeMm3 - shell) * (infillPercent / 100)
	const crossSection = Math.PI * (diameterMm / 2) ** 2
	return {
		grams: (material / 1000) * density,
		metres: material / crossSection / 1000,
	}
}
