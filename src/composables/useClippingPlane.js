/**
 * Clipping plane composable
 * Provides an interactive cross-section plane to slice through 3D models
 */

import { ref, shallowRef, computed } from 'vue'
import { Plane, Vector3, DoubleSide } from 'three'
import { logger } from '../utils/logger.js'

export function useClippingPlane() {
	// State
	const isActive = ref(false)
	const axis = ref('y') // 'x' | 'y' | 'z'
	const position = ref(0) // -1 to 1 normalised
	const flipped = ref(false)
	const plane = shallowRef(null)
	const rendererRef = shallowRef(null)
	const sceneRef = shallowRef(null)
	const modelBounds = ref({ min: -1, max: 1 })
	const originalSides = new WeakMap() // track original material.side values

	// Computed
	const hasClipping = computed(() => plane.value !== null && isActive.value)

	// Axis normals
	const AXIS_NORMALS = {
		x: new Vector3(1, 0, 0),
		y: new Vector3(0, 1, 0),
		z: new Vector3(0, 0, 1),
	}

	/**
	 * Initialize clipping plane system
	 * @param {THREE.WebGLRenderer} renderer
	 * @param {THREE.Scene} scene
	 */
	const init = (renderer, scene) => {
		rendererRef.value = renderer
		sceneRef.value = scene

		// Enable clipping on the renderer
		renderer.clippingPlanes = []
		renderer.localClippingEnabled = true

		// Create the clipping plane (inactive initially)
		plane.value = new Plane(new Vector3(0, -1, 0), 0)

		logger.info('useClippingPlane', 'Clipping plane system initialized')
	}

	/**
	 * Update model bounds so the slider maps to actual geometry range
	 * @param {THREE.Box3} boundingBox
	 */
	const updateBounds = (boundingBox) => {
		if (!boundingBox) return
		modelBounds.value = {
			min: Math.min(boundingBox.min.x, boundingBox.min.y, boundingBox.min.z),
			max: Math.max(boundingBox.max.x, boundingBox.max.y, boundingBox.max.z),
		}
		// Store per-axis bounds for precise mapping
		modelBounds.value.xMin = boundingBox.min.x
		modelBounds.value.xMax = boundingBox.max.x
		modelBounds.value.yMin = boundingBox.min.y
		modelBounds.value.yMax = boundingBox.max.y
		modelBounds.value.zMin = boundingBox.min.z
		modelBounds.value.zMax = boundingBox.max.z
	}

	/**
	 * Get the world-space constant for the current axis and normalised position
	 */
	const getConstant = () => {
		const bounds = modelBounds.value
		const t = (position.value + 1) / 2 // map [-1,1] → [0,1]
		let min, max
		if (axis.value === 'x') { min = bounds.xMin ?? bounds.min; max = bounds.xMax ?? bounds.max }
		else if (axis.value === 'y') { min = bounds.yMin ?? bounds.min; max = bounds.yMax ?? bounds.max }
		else { min = bounds.zMin ?? bounds.min; max = bounds.zMax ?? bounds.max }
		// Add 5% margin beyond model bounds to avoid Z-fighting at extremes
		const margin = (max - min) * 0.05
		return (min - margin) + t * ((max + margin) - (min - margin))
	}

	/**
	 * Set materials to DoubleSide so the interior is visible at the cut
	 */
	const enableDoubleSide = () => {
		if (!sceneRef.value) return
		sceneRef.value.traverse((child) => {
			if (child.isMesh && child.material) {
				const mats = Array.isArray(child.material) ? child.material : [child.material]
				mats.forEach((mat) => {
					if (!originalSides.has(mat)) {
						originalSides.set(mat, mat.side)
					}
					mat.side = DoubleSide
				})
			}
		})
	}

	/**
	 * Restore original material side values
	 */
	const restoreSides = () => {
		if (!sceneRef.value) return
		sceneRef.value.traverse((child) => {
			if (child.isMesh && child.material) {
				const mats = Array.isArray(child.material) ? child.material : [child.material]
				mats.forEach((mat) => {
					if (originalSides.has(mat)) {
						mat.side = originalSides.get(mat)
					}
				})
			}
		})
	}

	/**
	 * Apply the current clipping state to the renderer
	 */
	const applyClipping = () => {
		if (!rendererRef.value || !plane.value) return

		const normal = AXIS_NORMALS[axis.value].clone()
		if (flipped.value) normal.negate()
		const constant = getConstant()

		// Plane equation: normal · point + constant = 0
		// Negate constant because Three.js Plane uses opposite sign convention
		plane.value.set(normal, flipped.value ? constant : -constant)

		if (isActive.value) {
			rendererRef.value.clippingPlanes = [plane.value]
			enableDoubleSide()
		} else {
			rendererRef.value.clippingPlanes = []
			restoreSides()
		}
	}

	/**
	 * Toggle clipping on/off
	 */
	const toggle = () => {
		isActive.value = !isActive.value
		applyClipping()
		logger.info('useClippingPlane', 'Clipping toggled', { active: isActive.value })
	}

	/**
	 * Set the clipping axis
	 * @param {'x'|'y'|'z'} newAxis
	 */
	const setAxis = (newAxis) => {
		if (!AXIS_NORMALS[newAxis]) return
		axis.value = newAxis
		if (isActive.value) applyClipping()
	}

	/**
	 * Set the normalised clipping position (-1 to 1)
	 * @param {number} newPosition
	 */
	const setPosition = (newPosition) => {
		position.value = Math.max(-1, Math.min(1, newPosition))
		if (isActive.value) applyClipping()
	}

	/**
	 * Flip the clipping direction
	 */
	const toggleFlip = () => {
		flipped.value = !flipped.value
		if (isActive.value) applyClipping()
	}

	/**
	 * Clean up resources
	 */
	const dispose = () => {
		restoreSides()
		if (rendererRef.value) {
			rendererRef.value.clippingPlanes = []
		}
		plane.value = null
		rendererRef.value = null
		sceneRef.value = null
		isActive.value = false
		logger.info('useClippingPlane', 'Clipping plane disposed')
	}

	return {
		// State
		isActive,
		axis,
		position,
		flipped,

		// Computed
		hasClipping,

		// Methods
		init,
		updateBounds,
		toggle,
		setAxis,
		setPosition,
		toggleFlip,
		dispose,
	}
}
