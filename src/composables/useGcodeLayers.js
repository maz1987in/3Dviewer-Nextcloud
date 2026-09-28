/**
 * G-code layer slider composable
 * Shows a G-code toolpath up to a chosen layer, or that layer on its own, so a print
 * can be stepped through the way a slicer's preview does.
 */

import { ref, computed } from 'vue'
import { logger } from '../utils/logger.js'

// Heights closer than this are the same layer; slicers write Z to 3 decimals at most
const Z_EPSILON = 1e-4

/**
 * Group a toolpath's line objects into layers.
 *
 * The loader starts a new object at every Z change, so a Z-hop splits one layer into
 * several objects at the same height, one after another. Those are merged back into a
 * single layer here; the slider then counts layers the way a slicer does.
 *
 * @param {THREE.Object3D} model - the loaded model
 * @return {Array<{ z: number|null, objects: THREE.Object3D[] }>} layers in print order
 */
export function collectGcodeLayers(model) {
	const layers = []
	if (!model) return layers

	model.traverse((child) => {
		if (!child.isLine || !('gcodeLayerZ' in child.userData)) return
		const z = child.userData.gcodeLayerZ
		const last = layers[layers.length - 1]
		if (last && last.z !== null && z !== null && Math.abs(last.z - z) < Z_EPSILON) {
			last.objects.push(child)
		} else {
			layers.push({ z, objects: [child] })
		}
	})

	return layers
}

export function useGcodeLayers() {
	// Plain array rather than reactive state: it holds scene objects
	let layers = []
	const layerCount = ref(0)
	const currentLayer = ref(0) // 1-based; the highest layer shown
	const singleLayer = ref(false) // show only the current layer

	const isAvailable = computed(() => layerCount.value > 1)
	const currentZ = computed(() => layers[currentLayer.value - 1]?.z ?? null)

	const apply = () => {
		layers.forEach((layer, index) => {
			const n = index + 1
			const visible = singleLayer.value ? n === currentLayer.value : n <= currentLayer.value
			layer.objects.forEach((object) => { object.visible = visible })
		})
	}

	/**
	 * Collect the layers of a newly loaded model, showing all of them.
	 * @param {THREE.Object3D} model
	 */
	const init = (model) => {
		dispose()
		layers = collectGcodeLayers(model)
		layerCount.value = layers.length
		currentLayer.value = layers.length
		if (layers.length > 0) {
			logger.info('useGcodeLayers', 'Initialized', { layers: layers.length })
		}
	}

	/**
	 * Show layers up to and including `n` (1-based), clamped to the toolpath.
	 * @param {number} n
	 */
	const setLayer = (n) => {
		if (layerCount.value === 0) return
		const value = Math.round(Number(n))
		if (!Number.isFinite(value)) return
		currentLayer.value = Math.min(Math.max(value, 1), layerCount.value)
		apply()
	}

	const step = (delta) => setLayer(currentLayer.value + delta)

	/**
	 * Show only the current layer, or every layer up to it.
	 * @param {boolean} value
	 */
	const setSingleLayer = (value) => {
		singleLayer.value = Boolean(value)
		apply()
	}

	/**
	 * Show the whole toolpath again and forget it.
	 */
	const dispose = () => {
		layers.forEach((layer) => layer.objects.forEach((object) => { object.visible = true }))
		layers = []
		layerCount.value = 0
		currentLayer.value = 0
		singleLayer.value = false
	}

	return {
		layerCount,
		currentLayer,
		currentZ,
		singleLayer,
		isAvailable,
		init,
		setLayer,
		step,
		setSingleLayer,
		dispose,
	}
}
