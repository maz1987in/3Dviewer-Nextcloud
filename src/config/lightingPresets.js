/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Lighting presets and the light layout shared by the viewer and the thumbnail
 * renderer. Plain data with no imports, so a Web Worker can load it: the Vue
 * composable and the viewer config both reach for DOM globals the worker lacks.
 */

/**
 * Colours and positions that the presets do not vary: only intensities (and the
 * directional light's position) differ between presets.
 */
export const LIGHT_LAYOUT = {
	ambientColor: 0x404040,
	directionalColor: 0xffffff,
	pointColor: 0xffffff,
	pointDistance: 100,
	pointPosition: { x: -10, y: 10, z: -10 },
}

/** Named lighting presets; `default` is the viewer's initial lighting. */
export const LIGHTING_PRESETS = {
	default: {
		label: 'Default',
		ambient: { intensity: 2.0 },
		directional: { intensity: 1.0, x: 10, y: 10, z: 5 },
		point: { intensity: 0.5 },
	},
	studio: {
		label: 'Studio',
		ambient: { intensity: 1.0 },
		directional: { intensity: 1.8, x: 5, y: 8, z: 3 },
		point: { intensity: 1.0 },
	},
	outdoor: {
		label: 'Outdoor',
		ambient: { intensity: 3.0 },
		directional: { intensity: 0.8, x: -5, y: 15, z: 10 },
		point: { intensity: 0.2 },
	},
	dramatic: {
		label: 'Dramatic',
		ambient: { intensity: 0.3 },
		directional: { intensity: 2.5, x: 8, y: 4, z: -2 },
		point: { intensity: 0.8 },
	},
	flat: {
		label: 'Flat',
		ambient: { intensity: 4.0 },
		directional: { intensity: 0.2, x: 0, y: 10, z: 0 },
		point: { intensity: 0.1 },
	},
}
