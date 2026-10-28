/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The printers, materials and defaults Print check offers. Build volumes are the makers'
 * published print areas in millimetres, width × depth × height.
 */

export const PRINTERS = Object.freeze([
	{ id: 'prusa-mk4', name: 'Prusa MK4S', width: 250, depth: 210, height: 220 },
	{ id: 'prusa-core-one', name: 'Prusa CORE One', width: 250, depth: 220, height: 270 },
	{ id: 'prusa-mini', name: 'Prusa MINI+', width: 180, depth: 180, height: 180 },
	{ id: 'bambu-x1', name: 'Bambu Lab X1 / P1 series', width: 256, depth: 256, height: 256 },
	{ id: 'bambu-a1', name: 'Bambu Lab A1', width: 256, depth: 256, height: 256 },
	{ id: 'bambu-a1-mini', name: 'Bambu Lab A1 mini', width: 180, depth: 180, height: 180 },
	{ id: 'creality-ender3-v3', name: 'Creality Ender-3 V3', width: 220, depth: 220, height: 250 },
	{ id: 'creality-k1', name: 'Creality K1', width: 220, depth: 220, height: 250 },
	{ id: 'anycubic-kobra3', name: 'Anycubic Kobra 3', width: 250, depth: 250, height: 260 },
	{ id: 'elegoo-neptune4-pro', name: 'Elegoo Neptune 4 Pro', width: 225, depth: 225, height: 265 },
])

/** Filament densities in g/cm³. */
export const MATERIALS = Object.freeze([
	{ id: 'pla', name: 'PLA', density: 1.24 },
	{ id: 'petg', name: 'PETG', density: 1.27 },
	{ id: 'abs', name: 'ABS', density: 1.04 },
	{ id: 'asa', name: 'ASA', density: 1.07 },
	{ id: 'tpu', name: 'TPU', density: 1.21 },
])

export const PRINT_CHECK_DEFAULTS = Object.freeze({
	printerId: 'prusa-mk4',
	custom: Object.freeze({ width: 220, depth: 220, height: 250 }),
	overhangAngle: 45,
	infill: 20,
	material: 'pla',
	minThickness: 0.8,
})

/** The overhang slider's range, in degrees from vertical. */
export const OVERHANG_ANGLE_RANGE = Object.freeze({ min: 20, max: 80 })

/** Walls up to this many times the minimum are shown as close to the limit. */
export const NEAR_THIN_FACTOR = 1.5

/** How deep the filament estimate counts walls and top and bottom as solid. */
export const SHELL_DEPTH_MM = 1.2

export const FILAMENT_DIAMETER_MM = 1.75

/** A surface this close to the bed is resting on it, not overhanging. */
export const BED_EPSILON_MM = 0.05
