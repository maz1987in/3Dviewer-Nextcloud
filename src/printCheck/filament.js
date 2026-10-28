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

/**
 * The volume and surface area of some closed meshes, in the world, in millimetres.
 * Volume by the signed tetrahedra each triangle makes with the origin.
 *
 * @param {Array<object>} meshes - THREE.Mesh objects, world matrices up to date
 * @param {number} mmPerUnit - Millimetres per scene unit
 * @return {{volumeMm3: number, areaMm2: number}} The two
 */
export function modelVolumeAndArea(meshes, mmPerUnit) {
	let volume = 0
	let area = 0
	const p = [0, 0, 0, 0, 0, 0, 0, 0, 0]
	for (const mesh of meshes) {
		const position = mesh.geometry?.attributes?.position
		if (!position) {
			continue
		}
		const index = mesh.geometry.index
		const e = mesh.matrixWorld.elements
		const triangles = (index ? index.count : position.count) / 3
		let signed = 0
		for (let t = 0; t < triangles; t++) {
			for (let corner = 0; corner < 3; corner++) {
				const v = index ? index.getX(t * 3 + corner) : t * 3 + corner
				const x = position.getX(v)
				const y = position.getY(v)
				const z = position.getZ(v)
				p[corner * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]
				p[corner * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
				p[corner * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
			}
			const [ax, ay, az, bx, by, bz, cx, cy, cz] = p
			if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) {
				continue
			}
			// a · (b × c) / 6, and |(b − a) × (c − a)| / 2
			signed += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
			const ux = bx - ax
			const uy = by - ay
			const uz = bz - az
			const wx = cx - ax
			const wy = cy - ay
			const wz = cz - az
			area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2
		}
		volume += Math.abs(signed)
	}
	return { volumeMm3: volume * mmPerUnit ** 3, areaMm2: area * mmPerUnit ** 2 }
}
