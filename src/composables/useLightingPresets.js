/**
 * Lighting presets composable
 * Quick-switch between predefined lighting setups
 */

import { ref } from 'vue'
import { logger } from '../utils/logger.js'

const PRESETS = {
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

export function useLightingPresets() {
	const currentPreset = ref('default')
	const lightsRef = ref([])

	/**
	 * Store references to existing scene lights
	 * Expects lights array from useScene: [ambient, directional, point?, ...]
	 * @param {Array<THREE.Light>} lights
	 */
	const init = (lights) => {
		lightsRef.value = lights
		logger.info('useLightingPresets', 'Initialized', { lightCount: lights.length })
	}

	/**
	 * Apply a named preset to the stored lights
	 * @param {string} presetName
	 */
	const applyPreset = (presetName) => {
		const preset = PRESETS[presetName]
		if (!preset) {
			logger.warn('useLightingPresets', 'Unknown preset', { presetName })
			return
		}

		const lights = lightsRef.value
		if (!lights || lights.length === 0) {
			logger.warn('useLightingPresets', 'No lights available')
			return
		}

		// lights[0] = ambient, lights[1] = directional, lights[2] = point (optional)
		if (lights[0] && preset.ambient) {
			lights[0].intensity = preset.ambient.intensity
		}
		if (lights[1] && preset.directional) {
			lights[1].intensity = preset.directional.intensity
			if (preset.directional.x !== undefined) {
				lights[1].position.set(preset.directional.x, preset.directional.y, preset.directional.z)
			}
		}
		if (lights[2] && preset.point) {
			lights[2].intensity = preset.point.intensity
		}

		currentPreset.value = presetName
		logger.info('useLightingPresets', 'Preset applied', { preset: presetName })
	}

	/**
	 * Cycle to the next preset
	 */
	const cyclePreset = () => {
		const names = Object.keys(PRESETS)
		const idx = names.indexOf(currentPreset.value)
		const next = names[(idx + 1) % names.length]
		applyPreset(next)
	}

	/**
	 * Get all preset names and labels
	 * @returns {Array<{name: string, label: string}>}
	 */
	const getPresets = () => {
		return Object.entries(PRESETS).map(([name, p]) => ({ name, label: p.label }))
	}

	const dispose = () => {
		lightsRef.value = []
		currentPreset.value = 'default'
		logger.info('useLightingPresets', 'Disposed')
	}

	return {
		currentPreset,
		init,
		applyPreset,
		cyclePreset,
		getPresets,
		dispose,
	}
}
