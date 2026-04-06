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
	const mode = ref('plane') // 'plane' = single cross-section plane (default, backward-compatible)
	//                           'box' = six-plane clipping box enclosing a slab of the model
	const axis = ref('y') // 'x' | 'y' | 'z' — used by plane mode only
	const position = ref(0) // -1 to 1 normalised — used by plane mode only
	const flipped = ref(false) // plane mode only
	const plane = shallowRef(null)
	const rendererRef = shallowRef(null)
	const sceneRef = shallowRef(null)
	const modelBounds = ref({ min: -1, max: 1 })
	const originalSides = new WeakMap() // track original material.side values

	// Box-mode state.
	// Each face has an offset in [0, 1]:
	//   0 = clipping plane sits at that face (no geometry removed from this side)
	//   1 = clipping plane sits at the opposite face (everything removed on this axis from this side)
	// A slab with all six offsets at 0 renders the full model.
	// A slab with xMin=0.3 and xMax=0.2 removes the leftmost 30% and rightmost 20% along X.
	const boxOffsets = ref({
		xMin: 0,
		xMax: 0,
		yMin: 0,
		yMax: 0,
		zMin: 0,
		zMax: 0,
	})
	// Stable Plane instances reused across renders to avoid churn in
	// renderer.clippingPlanes. Order matches the boxOffsets keys above.
	const boxPlanes = shallowRef(null)

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

		// Create the single cross-section plane (plane mode, inactive initially)
		plane.value = new Plane(new Vector3(0, -1, 0), 0)

		// Pre-allocate the 6 box-mode planes with inward-pointing normals.
		// Three.js keeps points where (normal · point + constant) >= 0, so the
		// intersection of all 6 "keep" half-spaces is the slab between them.
		// Constants start at 0; the real values are set by applyBoxClipping()
		// once modelBounds is known.
		boxPlanes.value = [
			new Plane(new Vector3(1, 0, 0), 0), // xMin face → keeps p.x ≥ threshold
			new Plane(new Vector3(-1, 0, 0), 0), // xMax face → keeps p.x ≤ threshold
			new Plane(new Vector3(0, 1, 0), 0), // yMin face
			new Plane(new Vector3(0, -1, 0), 0), // yMax face
			new Plane(new Vector3(0, 0, 1), 0), // zMin face
			new Plane(new Vector3(0, 0, -1), 0), // zMax face
		]

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

		// If box mode is currently live, re-map the offsets onto the new bounds
		// so loading a different model doesn't leave the old slab thresholds
		// pointing at stale world-space coordinates.
		if (isActive.value && mode.value === 'box') {
			updateBoxPlaneConstants()
		}
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
	 * Recompute the 6 box-mode plane constants from the current bounds +
	 * boxOffsets. Mutates the existing Plane instances so the reference in
	 * `renderer.clippingPlanes` stays valid.
	 *
	 * For each axis pair, the "min" plane has a +axis normal so it keeps
	 * everything with coordinate ≥ threshold, and the "max" plane has a −axis
	 * normal so it keeps everything ≤ threshold. The intersection is the slab.
	 */
	const updateBoxPlaneConstants = () => {
		if (!boxPlanes.value) return
		const b = modelBounds.value
		const xMin = b.xMin ?? b.min
		const xMax = b.xMax ?? b.max
		const yMin = b.yMin ?? b.min
		const yMax = b.yMax ?? b.max
		const zMin = b.zMin ?? b.min
		const zMax = b.zMax ?? b.max

		const xSize = xMax - xMin
		const ySize = yMax - yMin
		const zSize = zMax - zMin

		// Add a small margin so a 0-offset plane sits slightly outside the
		// actual face — otherwise the default position can still clip the
		// extreme triangle due to floating-point rounding.
		const mx = xSize * 0.01
		const my = ySize * 0.01
		const mz = zSize * 0.01

		const o = boxOffsets.value
		// xMin plane: keeps p.x ≥ xMin + offset * xSize
		//   normal=(1,0,0), constant = -(threshold)
		const xMinThresh = xMin + o.xMin * xSize - mx
		const xMaxThresh = xMax - o.xMax * xSize + mx
		const yMinThresh = yMin + o.yMin * ySize - my
		const yMaxThresh = yMax - o.yMax * ySize + my
		const zMinThresh = zMin + o.zMin * zSize - mz
		const zMaxThresh = zMax - o.zMax * zSize + mz

		boxPlanes.value[0].set(new Vector3(1, 0, 0), -xMinThresh)
		boxPlanes.value[1].set(new Vector3(-1, 0, 0), xMaxThresh)
		boxPlanes.value[2].set(new Vector3(0, 1, 0), -yMinThresh)
		boxPlanes.value[3].set(new Vector3(0, -1, 0), yMaxThresh)
		boxPlanes.value[4].set(new Vector3(0, 0, 1), -zMinThresh)
		boxPlanes.value[5].set(new Vector3(0, 0, -1), zMaxThresh)
	}

	/**
	 * Apply the current clipping state to the renderer.
	 * Branches on `mode`: plane mode sets a single plane; box mode sets all 6.
	 */
	const applyClipping = () => {
		if (!rendererRef.value || !plane.value) return

		if (mode.value === 'plane') {
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
		} else {
			// box mode
			updateBoxPlaneConstants()
			if (isActive.value) {
				rendererRef.value.clippingPlanes = boxPlanes.value
				enableDoubleSide()
			} else {
				rendererRef.value.clippingPlanes = []
				restoreSides()
			}
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
	 * Switch between single-plane cross-section and 6-plane clipping box.
	 * Plane state (axis, position, flipped) and box state (boxOffsets) are
	 * preserved independently, so toggling back and forth is non-destructive.
	 * @param {'plane'|'box'} newMode
	 */
	const setMode = (newMode) => {
		if (newMode !== 'plane' && newMode !== 'box') return
		if (mode.value === newMode) return
		mode.value = newMode
		if (isActive.value) applyClipping()
		logger.info('useClippingPlane', 'Clipping mode changed', { mode: newMode })
	}

	/**
	 * Set a single box-mode face offset.
	 * @param {'xMin'|'xMax'|'yMin'|'yMax'|'zMin'|'zMax'} face
	 * @param {number} value - 0..1, clamped
	 */
	const setBoxOffset = (face, value) => {
		if (!(face in boxOffsets.value)) return
		const v = Math.max(0, Math.min(1, value))
		boxOffsets.value = { ...boxOffsets.value, [face]: v }
		if (isActive.value && mode.value === 'box') applyClipping()
	}

	/**
	 * Reset all 6 box offsets to 0 (no clipping from any face).
	 * Does NOT disable clipping — caller is responsible for toggling off.
	 */
	const resetBoxOffsets = () => {
		boxOffsets.value = { xMin: 0, xMax: 0, yMin: 0, yMax: 0, zMin: 0, zMax: 0 }
		if (isActive.value && mode.value === 'box') applyClipping()
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
		mode,
		axis,
		position,
		flipped,
		boxOffsets,

		// Computed
		hasClipping,

		// Methods
		init,
		updateBounds,
		toggle,
		setMode,
		setAxis,
		setPosition,
		toggleFlip,
		setBoxOffset,
		resetBoxOffsets,
		dispose,
	}
}
