/**
 * Lighting presets composable
 * Quick-switch between predefined lighting setups
 */

import { ref } from 'vue'
import { logger } from '../utils/logger.js'
import { LIGHTING_PRESETS } from '../config/lightingPresets.js'

const PRESETS = LIGHTING_PRESETS

export { LIGHTING_PRESETS }

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
	 * @return {Array<{name: string, label: string}>}
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
