/**
 * Controller state and camera manipulation composable
 * Manages the circular 3D controller state and provides camera control methods
 */

import { ref } from 'vue'
import { logger } from '../utils/logger.js'

export function useController() {
	// Controller visibility and position state
	const controllerVisible = ref(true)
	const controllerPosition = ref({ x: 20, y: 80 }) // offset from top-left

	/**
	 * Rotate camera around the model center
	 * @param {number} deltaX - Horizontal rotation delta
	 * @param {number} deltaY - Vertical rotation delta
	 * @param {THREE.Camera} camera - Main camera
	 * @param {OrbitControls} controls - Orbit controls
	 * @param {THREE.Vector3} center - Model center point
	 */
	const rotateCamera = (deltaX, deltaY, camera, controls, center) => {
		if (!camera || !controls) {
			logger.warn('useController', 'Camera or controls not available for rotation')
			return
		}

		try {
			// Get current camera position relative to center
			const offset = camera.position.clone().sub(center)
			const distance = offset.length()

			// Calculate spherical coordinates
			const phi = Math.atan2(offset.x, offset.z)
			const theta = Math.acos(Math.max(-1, Math.min(1, offset.y / distance)))

			// Apply rotation deltas
			const newPhi = phi - deltaX
			const newTheta = Math.max(0.01, Math.min(Math.PI - 0.01, theta + deltaY))

			// Convert back to cartesian
			const newX = center.x + distance * Math.sin(newTheta) * Math.sin(newPhi)
			const newY = center.y + distance * Math.cos(newTheta)
			const newZ = center.z + distance * Math.sin(newTheta) * Math.cos(newPhi)

			// Update camera position
			camera.position.set(newX, newY, newZ)
			camera.lookAt(center)
			controls.update()
		} catch (error) {
			logger.error('useController', 'Error rotating camera', error)
		}
	}

	/**
	 * Snap camera to a named canonical view with animation
	 * @param {string} viewName - Name of the view (FRONT, TOP, etc.)
	 * @param {THREE.Camera} camera - Main camera
	 * @param {OrbitControls} controls - Orbit controls
	 * @param {THREE.Vector3} center - Model center point
	 * @param {number} distance - Camera distance from center
	 * @param {number} duration - Animation duration in ms
	 */
	const snapToView = (viewName, camera, controls, center, distance, duration = 800) => {
		if (!camera || !controls) {
			logger.warn('useController', 'Camera or controls not available for snap')
			return
		}

		const viewMap = {
			FRONT: { x: 0, y: 0, z: 1 },
			BACK: { x: 0, y: 0, z: -1 },
			LEFT: { x: -1, y: 0, z: 0 },
			RIGHT: { x: 1, y: 0, z: 0 },
			TOP: { x: 0, y: 1, z: 0 },
			BOTTOM: { x: 0, y: -1, z: 0 },
		}

		const view = viewMap[viewName]
		if (!view) {
			logger.warn('useController', 'Unknown view name', { viewName })
			return
		}

		try {
			// Calculate target position
			const targetPos = {
				x: center.x + view.x * distance,
				y: center.y + view.y * distance,
				z: center.z + view.z * distance,
			}

			// Animate to target
			const startPos = camera.position.clone()
			const startTime = Date.now()

			const animate = () => {
				const elapsed = Date.now() - startTime
				const progress = Math.min(elapsed / duration, 1)

				// Ease-in-out function
				const easeProgress = progress < 0.5
					? 2 * progress * progress
					: 1 - Math.pow(-2 * progress + 2, 2) / 2

				// Interpolate position
				camera.position.lerpVectors(
					startPos,
					{ x: targetPos.x, y: targetPos.y, z: targetPos.z },
					easeProgress,
				)
				camera.lookAt(center)
				controls.update()

				if (progress < 1) {
					requestAnimationFrame(animate)
				} else {
					logger.info('useController', 'Snap to view completed', { viewName })
				}
			}

			animate()
		} catch (error) {
			logger.error('useController', 'Error snapping to view', error)
		}
	}

	/**
	 * Nudge camera in a specific direction
	 * @param {string} direction - Direction name (up, down, left, right, etc.)
	 * @param {THREE.Camera} camera - Main camera
	 * @param {OrbitControls} controls - Orbit controls
	 * @param {THREE.Vector3} center - Model center point
	 * @param {number} nudgeAmount - Amount to nudge (radians)
	 */
	const nudgeCamera = (direction, camera, controls, center, nudgeAmount = 0.1) => {
		if (!camera || !controls) {
			logger.warn('useController', 'Camera or controls not available for nudge')
			return
		}

		const deltaMap = {
			up: { x: 0, y: -nudgeAmount },
			down: { x: 0, y: nudgeAmount },
			left: { x: nudgeAmount, y: 0 },
			right: { x: -nudgeAmount, y: 0 },
			'up-left': { x: nudgeAmount * 0.707, y: -nudgeAmount * 0.707 },
			'up-right': { x: -nudgeAmount * 0.707, y: -nudgeAmount * 0.707 },
			'down-left': { x: nudgeAmount * 0.707, y: nudgeAmount * 0.707 },
			'down-right': { x: -nudgeAmount * 0.707, y: nudgeAmount * 0.707 },
		}

		const delta = deltaMap[direction]
		if (!delta) {
			logger.warn('useController', 'Unknown direction', { direction })
			return
		}

		rotateCamera(delta.x, delta.y, camera, controls, center)
	}

	/**
	 * Zoom camera in or out
	 * @param {number} delta - Zoom delta (positive = zoom in, negative = zoom out)
	 * @param {THREE.Camera} camera - Main camera
	 * @param {OrbitControls} controls - Orbit controls
	 * @param {THREE.Vector3} center - Model center point
	 * @param {number} zoomStep - Zoom step multiplier
	 */
	const zoomCamera = (delta, camera, controls, center, zoomStep = 0.1) => {
		if (!camera || !controls) {
			logger.warn('useController', 'Camera or controls not available for zoom')
			return
		}

		try {
			// Get current distance from center
			const offset = camera.position.clone().sub(center)
			const currentDistance = offset.length()

			// Calculate new distance
			const zoomFactor = 1 - delta * zoomStep
			const newDistance = Math.max(1, currentDistance * zoomFactor)

			// Update camera position maintaining direction
			const direction = offset.normalize()
			camera.position.copy(center).add(direction.multiplyScalar(newDistance))
			camera.lookAt(center)
			controls.update()
		} catch (error) {
			logger.error('useController', 'Error zooming camera', error)
		}
	}

	/**
	 * Load controller position from localStorage
	 */
	const loadPosition = () => {
		try {
			const saved = localStorage.getItem('threedviewer:controller-position')
			if (saved) {
				const pos = JSON.parse(saved)
				if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
					controllerPosition.value = pos
					logger.info('useController', 'Controller position loaded', pos)
				}
			}
		} catch (error) {
			logger.warn('useController', 'Failed to load controller position', error)
		}
	}

	/**
	 * Save controller position to localStorage
	 * @param position
	 */
	const savePosition = (position) => {
		try {
			localStorage.setItem('threedviewer:controller-position', JSON.stringify(position))
			logger.info('useController', 'Controller position saved', position)
		} catch (error) {
			logger.warn('useController', 'Failed to save controller position', error)
		}
	}

	/**
	 * Load controller visibility from localStorage
	 */
	const loadVisibility = () => {
		try {
			const saved = localStorage.getItem('threedviewer:controller-visible')
			if (saved !== null) {
				controllerVisible.value = saved === 'true'
				logger.info('useController', 'Controller visibility loaded', { visible: controllerVisible.value })
			}
		} catch (error) {
			logger.warn('useController', 'Failed to load controller visibility', error)
		}
	}

	/**
	 * Save controller visibility to localStorage
	 * @param visible
	 */
	const saveVisibility = (visible) => {
		try {
			localStorage.setItem('threedviewer:controller-visible', visible.toString())
			logger.info('useController', 'Controller visibility saved', { visible })
		} catch (error) {
			logger.warn('useController', 'Failed to save controller visibility', error)
		}
	}

	return {
		// State
		controllerVisible,
		controllerPosition,

		// Methods
		rotateCamera,
		snapToView,
		nudgeCamera,
		zoomCamera,
		loadPosition,
		savePosition,
		loadVisibility,
		saveVisibility,
	}
}
