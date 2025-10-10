/**
 * Camera and controls management composable
 * Handles camera setup, controls, animations, and view management
 */

import { ref } from 'vue'
import * as THREE from 'three'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { logger } from '../utils/logger.js'
import { throttle } from '../utils/mathHelpers.js'

export function useCamera() {
	// Camera and controls state
	const camera = ref(null)
	const controls = ref(null)
	const initialCameraPos = ref(null)
	const baselineCameraPos = ref(null)
	const baselineTarget = ref(null)
	const initialTarget = ref(new THREE.Vector3(0, 0, 0))
	const manuallyPositioned = ref(false)

	// Custom camera controls state
	const isMouseDown = ref(false)
	const mouseX = ref(0)
	const mouseY = ref(0)
	const rotationX = ref(0)
	const rotationY = ref(0)
	const distance = ref(23.35)
	const modelCenter = ref(new THREE.Vector3(0, 0, 0))

	// Auto-rotate state
	const autoRotateEnabled = ref(false)
	const autoRotateSpeed = ref(0.5)

	// Animation state
	const isAnimating = ref(false)
	const animationFrameId = ref(null)

	// Mobile state
	const isMobile = ref(false)

	// Animation presets
	const animationPresets = ref([
		{
			name: 'front',
			label: 'Front View',
			position: { x: 0, y: 0, z: 5 },
			target: { x: 0, y: 0, z: 0 },
		},
		{
			name: 'back',
			label: 'Back View',
			position: { x: 0, y: 0, z: -5 },
			target: { x: 0, y: 0, z: 0 },
		},
		{
			name: 'left',
			label: 'Left View',
			position: { x: -5, y: 0, z: 0 },
			target: { x: 0, y: 0, z: 0 },
		},
		{
			name: 'right',
			label: 'Right View',
			position: { x: 5, y: 0, z: 0 },
			target: { x: 0, y: 0, z: 0 },
		},
		{
			name: 'top',
			label: 'Top View',
			position: { x: 0, y: 5, z: 0 },
			target: { x: 0, y: 0, z: 0 },
		},
		{
			name: 'orbit',
			label: 'Orbit View',
			position: { x: 4, y: 2, z: 4 },
			target: { x: 0, y: 0, z: 0 },
		},
	])

	/**
	 * Initialize camera with appropriate settings
	 * @param {number} width - Viewport width
	 * @param {number} height - Viewport height
	 * @param {boolean} mobile - Whether this is a mobile device
	 */
	const initCamera = (width, height, mobile = false) => {
		try {
			isMobile.value = mobile
			const fov = mobile ? 75 : VIEWER_CONFIG.camera.fov

			camera.value = new THREE.PerspectiveCamera(fov, width / height, VIEWER_CONFIG.camera.near, VIEWER_CONFIG.camera.far)
			camera.value.position.set(2, 2, 2)
			initialCameraPos.value = camera.value.position.clone()

			logger.info('useCamera', 'Camera initialized', { fov, width, height, mobile })
		} catch (error) {
			logger.error('useCamera', 'Failed to initialize camera', error)
			throw error
		}
	}

	/**
	 * Setup OrbitControls for camera interaction
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 */
	const setupControls = async (renderer) => {
		try {
			const mod = await import('three/examples/jsm/controls/OrbitControls.js')
			const OrbitControls = mod.OrbitControls || mod.default

			controls.value = new OrbitControls(camera.value, renderer.domElement)

			// Basic controls setup (keep it simple like ViewerComponent)
			controls.value.enableDamping = true
			controls.value.enableZoom = true
			controls.value.enableRotate = true
			controls.value.enablePan = true
			controls.value.zoomSpeed = 1.0
			controls.value.rotateSpeed = 1.0

			controls.value.update()

			// Monitor camera target to prevent off-center viewing
			controls.value.addEventListener('change', onControlsChange)
			controls.value.addEventListener('end', onControlsEnd)

			// Disable user interaction until camera is fully stable
			controls.value.addEventListener('start', () => {
				// Don't reset the flag - keep manual positioning active
			})

			// Setup mobile-specific controls
			if (isMobile.value) {
				setupMobileControls()
			}

			logger.info('useCamera', 'Controls initialized successfully')
		} catch (error) {
			logger.error('useCamera', 'Failed to setup controls', error)
			throw error
		}
	}

	/**
	 * Setup mobile-specific controls
	 */
	const setupMobileControls = () => {
		if (!isMobile.value || !controls.value) return

		controls.value.enableDamping = true
		controls.value.dampingFactor = 0.1
		controls.value.screenSpacePanning = true
		controls.value.touches = {
			ONE: THREE.TOUCH.ROTATE,
			TWO: THREE.TOUCH.DOLLY_PAN,
		}

		logger.info('useCamera', 'Mobile controls configured')
	}

	/**
	 * Handle controls change event
	 */
	const onControlsChange = () => {
		if (!controls.value || !camera.value || manuallyPositioned.value) return
		
		if (autoRotateEnabled.value) return

		// Check if camera target is off-center and reset if needed
		const target = controls.value.target
		const threshold = VIEWER_CONFIG.camera.targetResetThreshold

		if (Math.abs(target.x) > threshold || Math.abs(target.z) > threshold) {
			logger.warn('useCamera', 'Camera target drifted off-center, resetting to origin', {
				target: { x: target.x, y: target.y, z: target.z },
				threshold,
			})

			controls.value.target.set(0, 0, 0)
			controls.value.update()
			camera.value.lookAt(0, 0, 0)
		}
	}

	/**
	 * Handle controls end event
	 */
	const onControlsEnd = () => {
		if (controls.value && !manuallyPositioned.value) {
			controls.value.update()
		}
	}

	/**
	 * Fit camera to an object
	 * @param {THREE.Object3D} obj - Object to fit camera to
	 * @throws {Error} If camera or controls not initialized
	 */
	const fitCameraToObject = (obj) => {
		// Input validation
		if (!camera.value) {
			logger.error('useCamera', 'Camera not initialized')
			throw new Error('Camera must be initialized before fitting to object')
		}
		if (!controls.value) {
			logger.error('useCamera', 'Controls not initialized')
			throw new Error('Controls must be initialized before fitting to object')
		}
		if (!obj) {
			logger.warn('useCamera', 'No object provided to fit camera to')
			return
		}

		try {
			const box = new THREE.Box3().setFromObject(obj)
			if (box.isEmpty()) {
				logger.warn('useCamera', 'Object has empty bounding box, cannot fit camera')
				return
			}

			const size = box.getSize(new THREE.Vector3())
			const center = box.getCenter(new THREE.Vector3())
			const maxDim = Math.max(size.x, size.y, size.z)
			
			// Calculate optimal camera distance based on FOV and model size
			const fov = camera.value.fov * (Math.PI / 180)
			const cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.75
			
			// Set camera position at a good angle (offset from center)
			camera.value.position.set(
				center.x + cameraDistance * 0.5,
				center.y + cameraDistance * 0.5,
				center.z + cameraDistance
			)
			
			// Look at center
			camera.value.lookAt(center)
			
			// Update controls target and controls
			if (controls.value) {
				controls.value.target.copy(center)
				controls.value.update()
				controls.value.enabled = true
			}
			
			// Update camera near/far planes
			camera.value.near = cameraDistance / 100
			camera.value.far = cameraDistance * 100
			camera.value.updateProjectionMatrix()
			
			// Update model center for camera controls
			modelCenter.value.copy(center)
			
			// Update distance value
			distance.value = camera.value.position.distanceTo(center)
			
			// Save this as the baseline position for reset
			baselineCameraPos.value = camera.value.position.clone()
			baselineTarget.value = controls.value.target.clone()

			logger.info('useCamera', 'Camera fitted to object', {
				center: { x: center.x, y: center.y, z: center.z },
				size: { x: size.x, y: size.y, z: size.z },
				cameraDistance,
			})
		} catch (error) {
			logger.error('useCamera', 'Failed to fit camera to object', error)
		}
	}

	/**
	 * Fit camera to view both models (comparison mode)
	 * @param {THREE.Object3D} model1 - First model
	 * @param {THREE.Object3D} model2 - Second model
	 * @throws {Error} If camera or controls not initialized, or if models are invalid
	 */
	const fitBothModelsToView = (model1, model2) => {
		// Input validation
		if (!camera.value || !controls.value) {
			logger.error('useCamera', 'Camera or controls not initialized')
			throw new Error('Camera and controls must be initialized')
		}
		if (!model1 || !model2) {
			logger.error('useCamera', 'Both models must be provided for comparison view')
			throw new Error('Both models are required for comparison view')
		}

		try {
			const box1 = new THREE.Box3().setFromObject(model1)
			const box2 = new THREE.Box3().setFromObject(model2)
			const combinedBox = box1.union(box2)

			const center = combinedBox.getCenter(new THREE.Vector3())
			const size = combinedBox.getSize(new THREE.Vector3())
			const maxDim = Math.max(size.x, size.y, size.z)

			// Center both models at origin
			const tolerance = 0.1
			const isAlreadyCentered = Math.abs(center.x) < tolerance
				&& Math.abs(center.y) < tolerance
				&& Math.abs(center.z) < tolerance

			if (!isAlreadyCentered) {
				model1.position.sub(center)
				model2.position.sub(center)
			}

			// Position camera to look at origin with better distance
			const distance = maxDim * 1.5
			const cameraDistance = Math.max(distance * 1.5, 30)
			camera.value.position.set(cameraDistance, cameraDistance * 0.3, cameraDistance * 0.7)
			camera.value.lookAt(0, 0, 0)

			// Update controls target to origin
			controls.value.target.set(0, 0, 0)
			controls.value.update()

			// Force the camera to look at origin immediately
			camera.value.lookAt(0, 0, 0)

			logger.info('useCamera', 'Camera fitted to both models', {
				center: { x: center.x, y: center.y, z: center.z },
				size: { x: size.x, y: size.y, z: size.z },
				cameraDistance,
			})
		} catch (error) {
			logger.error('useCamera', 'Failed to fit camera to both models', error)
		}
	}

	/**
	 * Reset camera to initial position
	 */
	const resetView = () => {
		if (!camera.value || !controls.value) return

		try {
			if (baselineCameraPos.value && baselineTarget.value) {
				camera.value.position.copy(baselineCameraPos.value)
				controls.value.target.copy(baselineTarget.value)
			} else if (initialCameraPos.value) {
				camera.value.position.copy(initialCameraPos.value)
				controls.value.target.copy(initialTarget.value)
			}

			controls.value.update()
			logger.info('useCamera', 'View reset to baseline/initial position')
		} catch (error) {
			logger.error('useCamera', 'Failed to reset view', error)
		}
	}

	/**
	 * Fit camera to view with padding
	 * @param {THREE.Object3D} obj - Object to fit to
	 * @param {number} padding - Padding factor
	 */
	const fitToView = (obj, padding = 1.2) => {
		if (!camera.value || !controls.value || !obj) return

		try {
			const box = new THREE.Box3().setFromObject(obj)
			if (box.isEmpty()) return

			const size = box.getSize(new THREE.Vector3())
			const maxDim = Math.max(size.x, size.y, size.z)
			const fov = camera.value.fov * (Math.PI / 180)
			const distance = Math.abs(maxDim / Math.sin(fov / 2)) * padding

			const direction = camera.value.position.clone().sub(controls.value.target).normalize()
			camera.value.position.copy(controls.value.target).add(direction.multiplyScalar(distance))
			controls.value.update()

			logger.info('useCamera', 'Camera fitted to view', { distance, padding })
		} catch (error) {
			logger.error('useCamera', 'Failed to fit to view', error)
		}
	}

	/**
	 * Animate camera to preset position
	 * @param {string} presetName - Name of the preset
	 * @param {number} duration - Animation duration in ms
	 */
	const animateToPreset = (presetName, duration = 1000) => {
		if (!controls.value) return

		const preset = animationPresets.value.find(p => p.name === presetName)
		if (!preset) return

		isAnimating.value = true
		const startTime = Date.now()

		const startPosition = camera.value.position.clone()
		const startTarget = controls.value.target.clone()
		const endPosition = new THREE.Vector3(preset.position.x, preset.position.y, preset.position.z)
		const endTarget = new THREE.Vector3(preset.target.x, preset.target.y, preset.target.z)

		const animate = () => {
			const elapsed = Date.now() - startTime
			const progress = Math.min(elapsed / duration, 1)

			// Easing function (ease-in-out)
			const easeProgress = progress < 0.5
				? 2 * progress * progress
				: 1 - Math.pow(-2 * progress + 2, 2) / 2

			// Interpolate position and target
			camera.value.position.lerpVectors(startPosition, endPosition, easeProgress)
			controls.value.target.lerpVectors(startTarget, endTarget, easeProgress)
			controls.value.update()

			if (progress < 1) {
				animationFrameId.value = requestAnimationFrame(animate)
			} else {
				isAnimating.value = false
				animationFrameId.value = null
				logger.info('useCamera', 'Preset animation completed', { preset: presetName })
			}
		}

		animate()
	}

	/**
	 * Smooth zoom to target distance
	 * @param {number} targetDistance - Target zoom distance
	 * @param {number} duration - Animation duration in ms
	 */
	const smoothZoom = (targetDistance, duration = 500) => {
		if (!controls.value) return

		const startDistance = camera.value.position.distanceTo(controls.value.target)
		const startTime = Date.now()

		const animate = () => {
			const elapsed = Date.now() - startTime
			const progress = Math.min(elapsed / duration, 1)

			// Easing function (ease-out)
			const easeProgress = 1 - Math.pow(1 - progress, 3)

			const currentDistance = startDistance + (targetDistance - startDistance) * easeProgress
			const direction = camera.value.position.clone().sub(controls.value.target).normalize()
			camera.value.position.copy(controls.value.target).add(direction.multiplyScalar(currentDistance))
			controls.value.update()

			if (progress < 1) {
				animationFrameId.value = requestAnimationFrame(animate)
			} else {
				animationFrameId.value = null
			}
		}

		animate()
	}

	/**
	 * Update camera on window resize
	 * @param {number} width - New viewport width
	 * @param {number} height - New viewport height
	 */
	const onWindowResize = (width, height) => {
		if (!camera.value) return

		camera.value.aspect = width / height
		camera.value.updateProjectionMatrix()
		logger.info('useCamera', 'Camera updated for resize', { width, height })
	}

	/**
	 * Throttled version of window resize handler
	 * Limits resize updates to prevent excessive camera matrix recalculations
	 */
	const throttledResize = throttle(onWindowResize, 100)

	/**
	 * Update controls
	 */
	const updateControls = () => {
		// Always update controls if they exist (same as ViewerComponent)
		if (controls.value) {
			controls.value.update()
		}
	}

	/**
	 * Setup custom camera controls (mouse events)
	 * @param {HTMLElement} domElement - DOM element to attach events to
	 * @param {Function} measurementHandler - Callback for measurement clicks
	 */
	const setupCustomControls = (domElement, measurementHandler = null) => {
		if (!domElement || !camera.value) return

		const onMouseDown = (event) => {
			isMouseDown.value = true
			mouseX.value = event.clientX
			mouseY.value = event.clientY
		}

		const onMouseMove = (event) => {
			if (!isMouseDown.value || !camera.value) return

			const deltaX = event.clientX - mouseX.value
			const deltaY = event.clientY - mouseY.value

			rotationY.value -= deltaX * 0.005 // Invert horizontal rotation, more sensitive
			rotationX.value += deltaY * 0.005 // Keep vertical rotation normal (not inverted)

			// Clamp rotationX to prevent flipping
			rotationX.value = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationX.value))

			// Update camera position based on rotation around model center
			const x = modelCenter.value.x + Math.sin(rotationY.value) * Math.cos(rotationX.value) * distance.value
			const y = modelCenter.value.y + Math.sin(rotationX.value) * distance.value
			const z = modelCenter.value.z + Math.cos(rotationY.value) * Math.cos(rotationX.value) * distance.value

			camera.value.position.set(x, y, z)
			camera.value.lookAt(modelCenter.value)

			mouseX.value = event.clientX
			mouseY.value = event.clientY
		}

		const onMouseUp = () => {
			isMouseDown.value = false
		}

		const onWheel = (event) => {
			if (!camera.value) return

			// Prevent default browser zoom behavior
			event.preventDefault()
			event.stopPropagation()

			distance.value += event.deltaY * 0.05
			distance.value = Math.max(1, distance.value)

			// Update camera position based on current rotation and new distance around model center
			const x = modelCenter.value.x + Math.sin(rotationY.value) * Math.cos(rotationX.value) * distance.value
			const y = modelCenter.value.y + Math.sin(rotationX.value) * distance.value
			const z = modelCenter.value.z + Math.cos(rotationY.value) * Math.cos(rotationX.value) * distance.value

			camera.value.position.set(x, y, z)
			camera.value.lookAt(modelCenter.value)
		}

		const onClick = (event) => {
			// Only handle clicks if measurement handler is provided and not dragging
			if (measurementHandler && !isMouseDown.value) {
				// Get scene from the measurement handler's context
				measurementHandler(event, camera.value)
			}
		}

		// Add event listeners
		domElement.addEventListener('mousedown', onMouseDown)
		domElement.addEventListener('mousemove', onMouseMove)
		domElement.addEventListener('mouseup', onMouseUp)
		domElement.addEventListener('wheel', onWheel)
		domElement.addEventListener('click', onClick)

		// Return cleanup function
		return () => {
			domElement.removeEventListener('mousedown', onMouseDown)
			domElement.removeEventListener('mousemove', onMouseMove)
			domElement.removeEventListener('mouseup', onMouseUp)
			domElement.removeEventListener('wheel', onWheel)
			domElement.removeEventListener('click', onClick)
		}
	}

	/**
	 * Render the scene
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 * @param {THREE.Scene} scene - Three.js scene
	 */
	const render = (renderer, scene) => {
		if (renderer && scene && camera.value) {
			try {
				// Custom auto-rotate functionality (uses manual camera positioning instead of OrbitControls.autoRotate)
				if (autoRotateEnabled.value && !isMouseDown.value) {
					rotationY.value += autoRotateSpeed.value * 0.01

					// Update camera position based on current rotation around model center
					const x = modelCenter.value.x + Math.sin(rotationY.value) * Math.cos(rotationX.value) * distance.value
					const y = modelCenter.value.y + Math.sin(rotationX.value) * distance.value
					const z = modelCenter.value.z + Math.cos(rotationY.value) * Math.cos(rotationX.value) * distance.value

					camera.value.position.set(x, y, z)
					camera.value.lookAt(modelCenter.value)
				}

				renderer.render(scene, camera.value)
			} catch (error) {
				console.error('[useCamera] Render error:', error)
			}
		}
	}

	/**
	 * Toggle auto-rotate
	 */
	const toggleAutoRotate = () => {
		autoRotateEnabled.value = !autoRotateEnabled.value
		logger.info('useCamera', 'Auto-rotate toggled', { enabled: autoRotateEnabled.value })
	}

	/**
	 * Set auto-rotate speed
	 * @param {number} speed - Rotation speed (default: 2.0)
	 */
	const setAutoRotateSpeed = (speed) => {
		autoRotateSpeed.value = speed
		logger.info('useCamera', 'Auto-rotate speed set', { speed })
	}

	/**
	 * Cancel ongoing animations
	 */
	const cancelAnimations = () => {
		if (animationFrameId.value) {
			cancelAnimationFrame(animationFrameId.value)
			animationFrameId.value = null
		}
		isAnimating.value = false
		logger.info('useCamera', 'Animations cancelled')
	}

	/**
	 * Dispose of camera and controls
	 */
	const dispose = () => {
		// Cancel any ongoing animations
		cancelAnimations()

		if (controls.value) {
			controls.value.dispose()
			controls.value = null
		}

		camera.value = null
		initialCameraPos.value = null
		baselineCameraPos.value = null
		baselineTarget.value = null

		logger.info('useCamera', 'Camera and controls disposed')
	}

	return {
		// State - these are mutable by the composable's own methods, so don't use readonly
		camera,
		controls,
		isAnimating,
		autoRotate: autoRotateEnabled,
		autoRotateSpeed,
		isMobile,
		animationPresets,

		// Methods
		initCamera,
		setupControls,
		setupCustomControls,
		setupMobileControls,
		fitCameraToObject,
		fitBothModelsToView,
		resetView,
		fitToView,
		toggleAutoRotate,
		setAutoRotateSpeed,
		animateToPreset,
		smoothZoom,
		onWindowResize,
		throttledResize,
		updateControls,
		render,
		cancelAnimations,
		dispose,
	}
}
