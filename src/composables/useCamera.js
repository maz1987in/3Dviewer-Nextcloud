/**
 * Camera and controls management composable
 * Handles camera setup, controls, animations, and view management
 */

import { ref, shallowRef, markRaw } from 'vue'
import * as THREE from 'three'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { logger } from '../utils/logger.js'
import { throttle } from '../utils/mathHelpers.js'

// CRITICAL FIX: Patch Object3D.updateMatrixWorld to prevent crashes from undefined matrices
// This handles cases where objects might be missing matrixWorld properties which causes
// "Cannot read properties of undefined (reading 'multiplyMatrices')" errors during rendering
// This is a safety net that catches objects even if they were missed by validation traversals
if (THREE.Object3D && THREE.Object3D.prototype && !THREE.Object3D.prototype._origUpdateMatrixWorld) {
	THREE.Object3D.prototype._origUpdateMatrixWorld = THREE.Object3D.prototype.updateMatrixWorld
	THREE.Object3D.prototype.updateMatrixWorld = function(force) {
		try {
			// Ensure matrixWorld exists on THIS instance
			if (!this.matrixWorld || !(this.matrixWorld instanceof THREE.Matrix4)) {
				this.matrixWorld = new THREE.Matrix4()
				this.matrixWorld.identity()
			}
			
			// Ensure matrix exists (used as second argument in multiplyMatrices)
			if (!this.matrix || !(this.matrix instanceof THREE.Matrix4)) {
				this.matrix = new THREE.Matrix4()
				this.matrix.identity()
			}
			
			// Ensure parent matrixWorld exists (used as first argument in multiplyMatrices)
			if (this.parent && (!this.parent.matrixWorld || !(this.parent.matrixWorld instanceof THREE.Matrix4))) {
				this.parent.matrixWorld = new THREE.Matrix4()
				this.parent.matrixWorld.identity()
			}
			
			// Call original method
			this._origUpdateMatrixWorld(force)
		} catch (e) {
			// If it still crashes, swallow error to prevent app crash
			// This usually means internal Three.js state is corrupted
			if (e.message && e.message.includes('multiplyMatrices')) {
				// Silent recovery
				return
			}
			// Re-throw other errors
			throw e
		}
	}
}

export function useCamera() {
	// Camera and controls state
	const camera = shallowRef(null)
	const controls = shallowRef(null)
	const initialCameraPos = ref(null)
	const baselineCameraPos = ref(null)
	const baselineTarget = ref(null)
	const initialTarget = ref(new THREE.Vector3(0, 0, 0))
	const manuallyPositioned = ref(false)

	// Camera projection state
	const cameraType = ref(VIEWER_CONFIG.camera.defaultProjection || 'perspective')
	const perspectiveCamera = shallowRef(null)
	const orthographicCamera = shallowRef(null)

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

	// Flag to prevent OrbitControls update during external camera positioning
	const isPositioningCamera = ref(false)

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
	 * Initialize orthographic camera
	 * @param {number} width - Viewport width
	 * @param {number} height - Viewport height
	 * @return {THREE.OrthographicCamera} Orthographic camera
	 */
	const initOrthographicCamera = (width, height) => {
		const aspect = width / height
		const frustumSize = VIEWER_CONFIG.camera.orthographic.frustumSize

		const orthoCamera = new THREE.OrthographicCamera(
			frustumSize * aspect / -2,
			frustumSize * aspect / 2,
			frustumSize / 2,
			frustumSize / -2,
			VIEWER_CONFIG.camera.near,
			VIEWER_CONFIG.camera.far,
		)

		orthoCamera.zoom = VIEWER_CONFIG.camera.orthographic.zoom
		orthoCamera.position.set(2, 2, 2)
		orthoCamera.updateProjectionMatrix()

		return orthoCamera
	}

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

			logger.info('useCamera', 'Initializing camera with settings', {
				fov,
				near: VIEWER_CONFIG.camera.near,
				far: VIEWER_CONFIG.camera.far,
				isMobile: mobile,
				configFov: VIEWER_CONFIG.camera.fov,
			})

			// Create perspective camera
			perspectiveCamera.value = markRaw(new THREE.PerspectiveCamera(fov, width / height, VIEWER_CONFIG.camera.near, VIEWER_CONFIG.camera.far))
			perspectiveCamera.value.position.set(2, 2, 2)

			// Create orthographic camera
			orthographicCamera.value = markRaw(initOrthographicCamera(width, height))
			orthographicCamera.value.position.copy(perspectiveCamera.value.position)

			// Set active camera based on type
			camera.value = cameraType.value === 'orthographic' ? orthographicCamera.value : perspectiveCamera.value
			initialCameraPos.value = camera.value.position.clone()

			logger.info('useCamera', 'Camera initialized', { fov, width, height, mobile, type: cameraType.value })
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

			controls.value = markRaw(new OrbitControls(camera.value, renderer.domElement))

			// Basic controls setup (keep it simple like ViewerComponent)
			controls.value.enableDamping = true
			controls.value.enableZoom = true
			// Enable rotate/pan only if auto-rotate is not active
			controls.value.enableRotate = !autoRotateEnabled.value
			controls.value.enablePan = !autoRotateEnabled.value
			controls.value.zoomSpeed = 1.0
			controls.value.rotateSpeed = 1.0

			controls.value.update()

			// Log control states for debugging
			logger.info('useCamera', 'OrbitControls initialized', {
				enableZoom: controls.value.enableZoom,
				enableRotate: controls.value.enableRotate,
				enablePan: controls.value.enablePan,
				autoRotateActive: autoRotateEnabled.value,
			})

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
	 * @param {THREE.Vector3} [forcedCenter] - Optional forced center to look at (skips bounding box center calculation for target)
	 * @throws {Error} If camera or controls not initialized
	 */
	const fitCameraToObject = (obj, forcedCenter = null) => {
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
			const center = forcedCenter ? forcedCenter.clone() : box.getCenter(new THREE.Vector3())
			const maxDim = Math.max(size.x, size.y, size.z)

			// Calculate optimal camera distance based on camera type
			let cameraDistance
			if (cameraType.value === 'perspective' && perspectiveCamera.value) {
				const fov = perspectiveCamera.value.fov * (Math.PI / 180)
				cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.75
			} else {
				// For orthographic, use a fixed distance relationship
				cameraDistance = maxDim * 2
			}

			// Set camera position at a good angle (offset from center)
			camera.value.position.set(
				center.x + cameraDistance * 0.5,
				center.y + cameraDistance * 0.5,
				center.z + cameraDistance,
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

			// Handle orthographic zoom
			if (cameraType.value === 'orthographic' && orthographicCamera.value) {
				orthographicCamera.value.zoom = VIEWER_CONFIG.camera.orthographic.frustumSize / maxDim
			}

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
				type: cameraType.value,
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
			// Ensure both models have valid matrices before proceeding
			if (model1.matrix && model2.matrix) {
				model1.updateMatrixWorld(true)
				model2.updateMatrixWorld(true)
			}

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

			// Update matrices after positioning to ensure they're valid
			model1.updateMatrixWorld(true)
			model2.updateMatrixWorld(true)

			// Position camera to look at origin with better distance
			const distance = maxDim * 1.5
			const cameraDistance = Math.max(distance * 1.5, 30)
			camera.value.position.set(cameraDistance, cameraDistance * 0.3, cameraDistance * 0.7)
			camera.value.lookAt(0, 0, 0)

			// Update controls target to origin
			controls.value.target.set(0, 0, 0)

			// Update camera matrix before updating controls to prevent matrix errors
			camera.value.updateMatrixWorld(false)

			// Update controls with error handling
			try {
				controls.value.update()
			} catch (controlsError) {
				logger.warn('useCamera', 'Controls update failed, continuing without update', controlsError)
			}

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

			let distance
			if (cameraType.value === 'perspective' && perspectiveCamera.value) {
				const fov = perspectiveCamera.value.fov * (Math.PI / 180)
				distance = Math.abs(maxDim / Math.sin(fov / 2)) * padding
			} else {
				// For orthographic, adjust zoom instead
				distance = maxDim * padding
				if (orthographicCamera.value) {
					orthographicCamera.value.zoom = VIEWER_CONFIG.camera.orthographic.frustumSize / (maxDim * padding)
					orthographicCamera.value.updateProjectionMatrix()
				}
			}

			const direction = camera.value.position.clone().sub(controls.value.target).normalize()
			camera.value.position.copy(controls.value.target).add(direction.multiplyScalar(distance))
			controls.value.update()

			logger.info('useCamera', 'Camera fitted to view', { distance, padding, type: cameraType.value })
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

		const aspect = width / height

		// Update both cameras
		if (perspectiveCamera.value) {
			perspectiveCamera.value.aspect = aspect
			perspectiveCamera.value.updateProjectionMatrix()
		}

		if (orthographicCamera.value) {
			const frustumSize = VIEWER_CONFIG.camera.orthographic.frustumSize
			orthographicCamera.value.left = frustumSize * aspect / -2
			orthographicCamera.value.right = frustumSize * aspect / 2
			orthographicCamera.value.top = frustumSize / 2
			orthographicCamera.value.bottom = frustumSize / -2
			orthographicCamera.value.updateProjectionMatrix()
		}

		logger.info('useCamera', 'Camera updated for resize', { width, height, type: cameraType.value })
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
	 * Ensure all objects in a scene hierarchy have valid matrices
	 * Recursively traverses the object tree and initializes matrices if missing
	 * This prevents "Cannot read properties of undefined (reading 'multiplyMatrices')" errors
	 * @param {THREE.Object3D} object - Root object to validate (can be Scene, Object3D, etc.)
	 * @param {number} depth - Current recursion depth (prevents infinite loops)
	 * @param {Set} visited - Set of visited objects to prevent cycles
	 */
	const ensureSceneMatricesValid = (object, depth = 0, visited = new Set()) => {
		// Prevent infinite recursion (increased limit for deep hierarchies like rigged models)
		if (!object || depth > 5000) return
		
		// Skip if already validated in this validation pass
		if (visited.has(object)) return
		visited.add(object)
		
		try {
			// CRITICAL: Validate parent matrices FIRST before validating this object
			// updateMatrixWorld multiplies child.matrix with parent.matrixWorld
			// So parent matrices MUST be valid before we can safely update child matrices
			if (object.parent && depth < 100) {
				ensureSceneMatricesValid(object.parent, depth + 1, visited)
			}

			// Only validate Object3D instances (not materials, geometries, etc.)
			// We use isObject3D flag which is standard in Three.js
			if (object.isObject3D) {
				// Ensure matrix exists and is valid Matrix4 instance
				if (!object.matrix || !(object.matrix instanceof THREE.Matrix4)) {
					object.matrix = new THREE.Matrix4()
					object.matrix.identity()
				}
				// Also ensure it's not corrupted (has valid elements array)
				else if (!object.matrix.elements || !Array.isArray(object.matrix.elements) || object.matrix.elements.length !== 16) {
					object.matrix = new THREE.Matrix4()
					object.matrix.identity()
				}

				// Ensure matrixWorld exists and is valid Matrix4 instance
				if (!object.matrixWorld || !(object.matrixWorld instanceof THREE.Matrix4)) {
					object.matrixWorld = new THREE.Matrix4()
					object.matrixWorld.identity()
				}
				// Also ensure it's not corrupted (has valid elements array)
				else if (!object.matrixWorld.elements || !Array.isArray(object.matrixWorld.elements) || object.matrixWorld.elements.length !== 16) {
					object.matrixWorld = new THREE.Matrix4()
					object.matrixWorld.identity()
				}

				// Ensure modelViewMatrix exists (used by renderer)
				if (!object.modelViewMatrix || !(object.modelViewMatrix instanceof THREE.Matrix4)) {
					object.modelViewMatrix = new THREE.Matrix4()
				}
				// Ensure normalMatrix exists (used for lighting calculations)
				if (!object.normalMatrix || !(object.normalMatrix instanceof THREE.Matrix3)) {
					object.normalMatrix = new THREE.Matrix3()
				}
			} else {
				// Also check if it has matrix properties or updateMatrixWorld method
				const hasMatrix = typeof object.matrix !== 'undefined'
				const hasMatrixWorld = typeof object.matrixWorld !== 'undefined'
				const hasUpdateMethod = typeof object.updateMatrixWorld === 'function'
				
				if (hasMatrix || hasMatrixWorld || hasUpdateMethod) {
					// Ensure matrix exists and is valid Matrix4 instance
					if (!object.matrix || !(object.matrix instanceof THREE.Matrix4)) {
						object.matrix = new THREE.Matrix4()
						object.matrix.identity()
					}
					// Ensure matrixWorld exists and is valid Matrix4 instance
					if (!object.matrixWorld || !(object.matrixWorld instanceof THREE.Matrix4)) {
						object.matrixWorld = new THREE.Matrix4()
						object.matrixWorld.identity()
					}
				} else {
					return
				}
			}

			// Recursively validate children (with depth limit)
			if (object.children && Array.isArray(object.children) && object.children.length > 0) {
				for (const child of object.children) {
					ensureSceneMatricesValid(child, depth + 1, visited)
				}
			}

			// SPECIAL CASE: Validate Skeleton bones for SkinnedMesh
			// Bones might not be direct children but are accessed during render
			if (object.isSkinnedMesh && object.skeleton && Array.isArray(object.skeleton.bones)) {
				for (const bone of object.skeleton.bones) {
					ensureSceneMatricesValid(bone, depth + 1, visited)
				}
			}

			// SPECIAL CASE: Validate Light Shadow Camera
			if (object.isLight && object.shadow && object.shadow.camera) {
				ensureSceneMatricesValid(object.shadow.camera, depth + 1, visited)
			}
		} catch (error) {
			// Silently skip objects that can't be validated - don't log to avoid spam
			// Non-Object3D objects in the hierarchy (materials, geometries) will trigger this
		}
	}

	// Helper function for quick validation
	const quickValidateHierarchy = (obj, depth = 0) => {
		if (!obj || depth > 5000) return
		try {
			// Check if it's an Object3D or has matrices
			if (obj.isObject3D) {
				if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
					obj.matrix = new THREE.Matrix4()
					obj.matrix.identity()
				}
				if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
					obj.matrixWorld = new THREE.Matrix4()
					obj.matrixWorld.identity()
				}
				// Ensure modelViewMatrix exists (used by renderer)
				if (!obj.modelViewMatrix || !(obj.modelViewMatrix instanceof THREE.Matrix4)) {
					obj.modelViewMatrix = new THREE.Matrix4()
				}
				// Ensure normalMatrix exists (used for lighting calculations)
				if (!obj.normalMatrix || !(obj.normalMatrix instanceof THREE.Matrix3)) {
					obj.normalMatrix = new THREE.Matrix3()
				}
			} else {
				// Fallback checks
				const hasMatrix = typeof obj.matrix !== 'undefined'
				const hasMatrixWorld = typeof obj.matrixWorld !== 'undefined'
				const hasUpdateMethod = typeof obj.updateMatrixWorld === 'function'

				if (hasMatrix || hasMatrixWorld || hasUpdateMethod) {
					if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
						obj.matrix = new THREE.Matrix4()
						obj.matrix.identity()
					}
					if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
						obj.matrixWorld = new THREE.Matrix4()
						obj.matrixWorld.identity()
					}
				}
			}
			
			// Validate parent matrices FIRST (critical for updateMatrixWorld)
			if (obj.parent) {
				if (obj.parent.isObject3D) {
					if (!obj.parent.matrixWorld || !(obj.parent.matrixWorld instanceof THREE.Matrix4)) {
						obj.parent.matrixWorld = new THREE.Matrix4()
						obj.parent.matrixWorld.identity()
					}
				} else if (typeof obj.parent.matrixWorld !== 'undefined' && (!obj.parent.matrixWorld || !(obj.parent.matrixWorld instanceof THREE.Matrix4))) {
					obj.parent.matrixWorld = new THREE.Matrix4()
					obj.parent.matrixWorld.identity()
				}
			}

			// Recursively validate children
			if (obj.children && Array.isArray(obj.children)) {
				for (const child of obj.children) {
					quickValidateHierarchy(child, depth + 1)
				}
			}

			// SPECIAL CASE: Validate Skeleton bones
			if (obj.isSkinnedMesh && obj.skeleton && Array.isArray(obj.skeleton.bones)) {
				for (const bone of obj.skeleton.bones) {
					quickValidateHierarchy(bone, depth + 1)
				}
			}

			// SPECIAL CASE: Validate Light Shadow Camera
			if (obj.isLight && obj.shadow && obj.shadow.camera) {
				quickValidateHierarchy(obj.shadow.camera, depth + 1)
			}
		} catch (e) {
			// Skip objects that can't be validated
		}
	}

	// Helper function for full matrix validation
	const validateAllMatrices = (obj, visited = new Set(), depth = 0) => {
		if (!obj || depth > 5000 || visited.has(obj)) return
		visited.add(obj)
		
		try {
			// Validate this object's matrices
			if (obj.isObject3D) {
				if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
					obj.matrix = new THREE.Matrix4()
					obj.matrix.identity()
				}
				if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
					obj.matrixWorld = new THREE.Matrix4()
					obj.matrixWorld.identity()
				}
				// Ensure modelViewMatrix exists (used by renderer)
				if (!obj.modelViewMatrix || !(obj.modelViewMatrix instanceof THREE.Matrix4)) {
					obj.modelViewMatrix = new THREE.Matrix4()
				}
				// Ensure normalMatrix exists (used for lighting calculations)
				if (!obj.normalMatrix || !(obj.normalMatrix instanceof THREE.Matrix3)) {
					obj.normalMatrix = new THREE.Matrix3()
				}
			} else {
							const hasMatrix = typeof obj.matrix !== 'undefined'
							const hasMatrixWorld = typeof obj.matrixWorld !== 'undefined'
							const hasUpdateMethod = typeof obj.updateMatrixWorld === 'function'

							if (hasMatrix || hasMatrixWorld || hasUpdateMethod) {
								if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
									obj.matrix = new THREE.Matrix4()
									obj.matrix.identity()
								}
								if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
									obj.matrixWorld = new THREE.Matrix4()
									obj.matrixWorld.identity()
								}
							}
						}
			
			// Validate parent matrices FIRST (critical for updateMatrixWorld)
			if (obj.parent && !visited.has(obj.parent)) {
				validateAllMatrices(obj.parent, visited, depth + 1)
			}
			
			// Then validate children
			if (obj.children && Array.isArray(obj.children)) {
				for (const child of obj.children) {
					if (!visited.has(child)) {
						validateAllMatrices(child, visited, depth + 1)
					}
				}
			}

			// SPECIAL CASE: Validate Skeleton bones
			if (obj.isSkinnedMesh && obj.skeleton && Array.isArray(obj.skeleton.bones)) {
				for (const bone of obj.skeleton.bones) {
					if (!visited.has(bone)) {
						validateAllMatrices(bone, visited, depth + 1)
					}
				}
			}

			// SPECIAL CASE: Validate Light Shadow Camera
			if (obj.isLight && obj.shadow && obj.shadow.camera) {
				if (!visited.has(obj.shadow.camera)) {
					validateAllMatrices(obj.shadow.camera, visited, depth + 1)
				}
			}
		} catch (e) {
			// Skip objects that can't be validated
		}
	}

	// Helper function for updating local matrices
	const updateLocalMatrices = (obj, depth = 0) => {
		if (!obj || depth > 5000) return
		try {
			// Check if this is an Object3D-like object that has matrices
			const hasMatrix = typeof obj.matrix !== 'undefined'
			const hasMatrixWorld = typeof obj.matrixWorld !== 'undefined'
			
			if (obj.isObject3D) {
				if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
					obj.matrix = new THREE.Matrix4()
					obj.matrix.identity()
				}
				if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
					obj.matrixWorld = new THREE.Matrix4()
					obj.matrixWorld.identity()
				}
				// Ensure modelViewMatrix exists (used by renderer)
				if (!obj.modelViewMatrix || !(obj.modelViewMatrix instanceof THREE.Matrix4)) {
					obj.modelViewMatrix = new THREE.Matrix4()
				}
				// Only call updateMatrix() if it exists and object is Object3D-like
				if (typeof obj.updateMatrix === 'function' && obj.isObject3D !== false) {
					obj.updateMatrix()
				}
			} else if (hasMatrix || hasMatrixWorld || typeof obj.updateMatrixWorld === 'function') {
							// Ensure matrices exist and are valid before calling updateMatrix()
							if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
								obj.matrix = new THREE.Matrix4()
								obj.matrix.identity()
							}
							if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
								obj.matrixWorld = new THREE.Matrix4()
								obj.matrixWorld.identity()
							}
							
							// Only call updateMatrix() if it exists and object is Object3D-like
							if (typeof obj.updateMatrix === 'function' && obj.isObject3D !== false) {
								obj.updateMatrix()
							}
						}
			
			// Recursively process children
			if (obj.children && Array.isArray(obj.children)) {
				for (const child of obj.children) {
					updateLocalMatrices(child, depth + 1)
				}
			}

			// SPECIAL CASE: Validate Skeleton bones
			if (obj.isSkinnedMesh && obj.skeleton && Array.isArray(obj.skeleton.bones)) {
				for (const bone of obj.skeleton.bones) {
					updateLocalMatrices(bone, depth + 1)
				}
			}

			// SPECIAL CASE: Validate Light Shadow Camera
			if (obj.isLight && obj.shadow && obj.shadow.camera) {
				updateLocalMatrices(obj.shadow.camera, depth + 1)
			}
		} catch (e) {
			// Skip objects that can't be updated (materials, geometries, etc.)
		}
	}

	// Helper function for ensuring parent matrices
	const ensureAllParentMatrices = (obj, visited = new Set()) => {
		if (!obj || visited.has(obj)) return
		visited.add(obj)
		
		// Validate this object
		if (obj.isObject3D) {
			if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
				obj.matrix = new THREE.Matrix4()
				obj.matrix.identity()
			}
			if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
				obj.matrixWorld = new THREE.Matrix4()
				obj.matrixWorld.identity()
			}
			// Ensure modelViewMatrix exists (used by renderer)
			if (!obj.modelViewMatrix || !(obj.modelViewMatrix instanceof THREE.Matrix4)) {
				obj.modelViewMatrix = new THREE.Matrix4()
			}
		} else {
							const hasMatrix = typeof obj.matrix !== 'undefined'
							const hasMatrixWorld = typeof obj.matrixWorld !== 'undefined'
							const hasUpdateMethod = typeof obj.updateMatrixWorld === 'function'

							if (hasMatrix || hasMatrixWorld || hasUpdateMethod) {
								if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
									obj.matrix = new THREE.Matrix4()
									obj.matrix.identity()
								}
								if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
									obj.matrixWorld = new THREE.Matrix4()
									obj.matrixWorld.identity()
								}
							}
						}
		
		// Recursively validate all parents up to root
		let current = obj.parent
		let depth = 0
		while (current && depth < 100 && !visited.has(current)) {
			visited.add(current)
			if (current.isObject3D) {
				if (!current.matrix || !(current.matrix instanceof THREE.Matrix4)) {
					current.matrix = new THREE.Matrix4()
					current.matrix.identity()
				}
				if (!current.matrixWorld || !(current.matrixWorld instanceof THREE.Matrix4)) {
					current.matrixWorld = new THREE.Matrix4()
					current.matrixWorld.identity()
				}
			} else {
				if (typeof current.matrix !== 'undefined' && (!current.matrix || !(current.matrix instanceof THREE.Matrix4))) {
					current.matrix = new THREE.Matrix4()
					current.matrix.identity()
				}
				if (typeof current.matrixWorld !== 'undefined' && (!current.matrixWorld || !(current.matrixWorld instanceof THREE.Matrix4))) {
					current.matrixWorld = new THREE.Matrix4()
					current.matrixWorld.identity()
				}
				// Also check if object has updateMatrixWorld method
				if (typeof current.updateMatrixWorld === 'function') {
					if (!current.matrix || !(current.matrix instanceof THREE.Matrix4)) {
						current.matrix = new THREE.Matrix4()
						current.matrix.identity()
					}
					if (!current.matrixWorld || !(current.matrixWorld instanceof THREE.Matrix4)) {
						current.matrixWorld = new THREE.Matrix4()
						current.matrixWorld.identity()
					}
				}
			}
			current = current.parent
			depth++
		}
		
		// Validate children
		if (obj.children && Array.isArray(obj.children)) {
			for (const child of obj.children) {
				ensureAllParentMatrices(child, visited)
			}
		}

		// SPECIAL CASE: Validate Skeleton bones
		if (obj.isSkinnedMesh && obj.skeleton && Array.isArray(obj.skeleton.bones)) {
			for (const bone of obj.skeleton.bones) {
				ensureAllParentMatrices(bone, visited)
			}
		}

		// SPECIAL CASE: Validate Light Shadow Camera
		if (obj.isLight && obj.shadow && obj.shadow.camera) {
			ensureAllParentMatrices(obj.shadow.camera, visited)
		}
	}

	// Helper function for safe matrix update
	const safeUpdateMatrixWorld = (obj, force = false, depth = 0) => {
		if (!obj || depth > 500) return
		
		try {
			// Ensure this object's matrices are valid
			if (obj.isObject3D) {
				if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
					obj.matrix = new THREE.Matrix4()
					obj.matrix.identity()
				}
				if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
					obj.matrixWorld = new THREE.Matrix4()
					obj.matrixWorld.identity()
				}
				// Ensure modelViewMatrix exists (used by renderer)
				if (!obj.modelViewMatrix || !(obj.modelViewMatrix instanceof THREE.Matrix4)) {
					obj.modelViewMatrix = new THREE.Matrix4()
				}
				// Ensure normalMatrix exists (used for lighting calculations)
				if (!obj.normalMatrix || !(obj.normalMatrix instanceof THREE.Matrix3)) {
					obj.normalMatrix = new THREE.Matrix3()
				}
			} else {
							const hasMatrix = typeof obj.matrix !== 'undefined'
							const hasMatrixWorld = typeof obj.matrixWorld !== 'undefined'
							const hasUpdateMethod = typeof obj.updateMatrixWorld === 'function'

							if (hasMatrix || hasMatrixWorld || hasUpdateMethod) {
								if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
									obj.matrix = new THREE.Matrix4()
									obj.matrix.identity()
								}
								if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
									obj.matrixWorld = new THREE.Matrix4()
									obj.matrixWorld.identity()
								}
							}
						}
			
			// Ensure parent matrices are valid before multiplying
			if (obj.parent) {
				if (obj.parent.isObject3D) {
					if (!obj.parent.matrixWorld || !(obj.parent.matrixWorld instanceof THREE.Matrix4)) {
						obj.parent.matrixWorld = new THREE.Matrix4()
						obj.parent.matrixWorld.identity()
					}
				} else if (typeof obj.parent.matrixWorld !== 'undefined' && (!obj.parent.matrixWorld || !(obj.parent.matrixWorld instanceof THREE.Matrix4))) {
					obj.parent.matrixWorld = new THREE.Matrix4()
					obj.parent.matrixWorld.identity()
				}
			}
			
			// Only call updateMatrixWorld if object has the method
			if (typeof obj.updateMatrixWorld === 'function' && obj.isObject3D !== false) {
				// Call updateMatrix first if needed
				if (typeof obj.updateMatrix === 'function') {
					obj.updateMatrix()
				}
				
				// CRITICAL: Ensure matrixWorld is defined before calling updateMatrixWorld
				// Some objects might have it undefined initially
				if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
					obj.matrixWorld = new THREE.Matrix4()
					obj.matrixWorld.identity()
				}
				
				// Then update world matrix
				obj.updateMatrixWorld(force)
			}
			
			// Recursively update children if force is true
			if (force && obj.children && Array.isArray(obj.children)) {
				for (const child of obj.children) {
					safeUpdateMatrixWorld(child, force, depth + 1)
				}
			}

			// SPECIAL CASE: Validate Skeleton bones
			if (force && obj.isSkinnedMesh && obj.skeleton && Array.isArray(obj.skeleton.bones)) {
				for (const bone of obj.skeleton.bones) {
					safeUpdateMatrixWorld(bone, force, depth + 1)
				}
			}

			// SPECIAL CASE: Validate Light Shadow Camera
			if (force && obj.isLight && obj.shadow && obj.shadow.camera) {
				safeUpdateMatrixWorld(obj.shadow.camera, force, depth + 1)
			}
		} catch (e) {
			// Skip objects that can't be updated
		}
	}

	/**
	 * Validate geometries and bounding spheres in scene hierarchy
	 * This prevents "Cannot read properties of null (reading 'center')" errors during frustum culling
	 * @param {THREE.Object3D} obj - Object to validate
	 * @param {number} depth - Current recursion depth
	 * @param {Set} visited - Set of visited objects
	 * @return {Array} Array of objects with invalid geometries/bounding spheres
	 */
	const validateGeometriesAndBoundingSpheres = (obj, depth = 0, visited = new Set()) => {
		const invalidObjects = []
		if (!obj || depth > 5000 || visited.has(obj)) return invalidObjects
		visited.add(obj)
		
		try {
			// Check if this is a Mesh
			if (obj.isMesh) {
				// Geometry is null
				if (!obj.geometry) {
					invalidObjects.push({ obj, issue: 'geometry is null', type: obj.type, name: obj.name })
				} else {
					// CRITICAL: Always ensure bounding sphere exists and is valid
					// Three.js's frustum culling will call computeBoundingSphere which expects boundingSphere to exist
					// If it's null, Three.js will try to create it, but if that fails, we get the error
					try {
						// Always compute bounding sphere if it doesn't exist or is invalid
						if (!obj.geometry.boundingSphere) {
							obj.geometry.computeBoundingSphere()
						} else if (!obj.geometry.boundingSphere.center) {
							// Bounding sphere exists but center is null - recompute
							obj.geometry.computeBoundingSphere()
						} else {
							// Verify the bounding sphere is actually valid
							const bs = obj.geometry.boundingSphere
							if (!bs || !bs.center || !(bs.center instanceof THREE.Vector3)) {
								obj.geometry.computeBoundingSphere()
							}
						}
					} catch (computeError) {
						invalidObjects.push({ obj, issue: 'boundingSphere computation failed', type: obj.type, name: obj.name, error: computeError.message })
					}
				}
			}
			
			// Recursively check children
			if (obj.children && Array.isArray(obj.children)) {
				for (const child of obj.children) {
					invalidObjects.push(...validateGeometriesAndBoundingSpheres(child, depth + 1, visited))
				}
			}
			
			// Check skeleton bones for SkinnedMesh
			if (obj.isSkinnedMesh && obj.skeleton && Array.isArray(obj.skeleton.bones)) {
				for (const bone of obj.skeleton.bones) {
					invalidObjects.push(...validateGeometriesAndBoundingSpheres(bone, depth + 1, visited))
				}
			}
		} catch (e) {
			// Skip objects that can't be validated
		}
		
		return invalidObjects
	}

	/**
	 * Render the scene
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 * @param {THREE.Scene} scene - Three.js scene
	 */
	const render = (renderer, scene) => {
		if (!renderer || !scene || !camera.value) {
			return
		}
		
		// CRITICAL: Validate geometries and bounding spheres before rendering
		// This prevents "Cannot read properties of null (reading 'center')" errors during frustum culling
		try {
			const invalidGeometries = validateGeometriesAndBoundingSpheres(scene, 0, new Set())
			if (invalidGeometries.length > 0) {
				// Fix or skip objects with invalid geometries
				for (const { obj, issue } of invalidGeometries) {
					if (obj.isMesh) {
						// If geometry is null, make mesh invisible to skip rendering
						if (!obj.geometry) {
							obj.visible = false
							logger.warn('useCamera', 'Mesh has null geometry, making invisible', { type: obj.type, name: obj.name })
						} else if (!obj.geometry.boundingSphere || !obj.geometry.boundingSphere.center) {
							// Try to compute bounding sphere
							try {
								obj.geometry.computeBoundingSphere()
							} catch (e) {
								// If computation fails, make invisible
								obj.visible = false
								logger.warn('useCamera', 'Mesh has invalid bounding sphere, making invisible', { type: obj.type, name: obj.name, error: e.message })
							}
						}
					}
				}
			}
		} catch (validationError) {
			// Log but continue - don't block rendering
			logger.warn('useCamera', 'Geometry validation failed', { error: validationError.message })
		}

		// Light validation before rendering - only check camera (scene validation is expensive)
		// Full scene validation only happens when errors are detected
		if (camera.value) {
			if (!camera.value.matrix || !(camera.value.matrix instanceof THREE.Matrix4)) {
				camera.value.matrix = new THREE.Matrix4()
				camera.value.matrix.identity()
			}
			if (!camera.value.matrixWorld || !(camera.value.matrixWorld instanceof THREE.Matrix4)) {
				camera.value.matrixWorld = new THREE.Matrix4()
				camera.value.matrixWorld.identity()
			}
			// Ensure matrixWorldInverse exists
			if (!camera.value.matrixWorldInverse || !(camera.value.matrixWorldInverse instanceof THREE.Matrix4)) {
				camera.value.matrixWorldInverse = new THREE.Matrix4()
				camera.value.matrixWorldInverse.identity()
			}
			// Ensure projectionMatrix exists
			if (!camera.value.projectionMatrix || !(camera.value.projectionMatrix instanceof THREE.Matrix4)) {
				camera.value.projectionMatrix = new THREE.Matrix4()
				camera.value.projectionMatrix.identity()
			}
			// Ensure projectionMatrixInverse exists
			if (!camera.value.projectionMatrixInverse || !(camera.value.projectionMatrixInverse instanceof THREE.Matrix4)) {
				camera.value.projectionMatrixInverse = new THREE.Matrix4()
				camera.value.projectionMatrixInverse.identity()
			}
		}

		// Safety check: Ensure camera has valid matrices before controls update
		// This prevents "Cannot read properties of undefined (reading 'multiplyMatrices')" errors
		if (!camera.value.matrix || !camera.value.matrixWorld) {
			// Initialize matrices if they don't exist
			if (!camera.value.matrix) {
				camera.value.matrix = new THREE.Matrix4()
				camera.value.matrix.identity()
			}
			if (!camera.value.matrixWorld) {
				camera.value.matrixWorld = new THREE.Matrix4()
				camera.value.matrixWorld.identity()
			}
			camera.value.updateMatrix()
			camera.value.updateMatrixWorld(false)
		}

		// Update OrbitControls before rendering (processes zoom changes)
		// Only if controls and camera are fully initialized, and not during external positioning
		// All matrices are now validated, so controls.update() should be safe
		if (controls.value && controls.value.object && controls.value.object === camera.value && !isPositioningCamera.value) {
			try {
				controls.value.update()
			} catch (controlsError) {
				// If controls update fails due to matrix issues, validate again and retry
				if (controlsError.message && controlsError.message.includes('multiplyMatrices')) {
					logger.warn('useCamera', 'Controls update failed - validating matrices and retrying', {
						error: controlsError.message,
					})
					ensureSceneMatricesValid(scene, 0, new Set())
					ensureSceneMatricesValid(camera.value, 0, new Set())
					camera.value.updateMatrix()
					camera.value.updateMatrixWorld(false)
					// Retry controls update once
					try {
						controls.value.update()
					} catch (retryError) {
						logger.warn('useCamera', 'Controls update retry failed, skipping this frame', retryError)
						return // Skip this render frame
					}
				} else {
					// Re-throw non-matrix errors
					throw controlsError
				}
			}
		}

		// Update distance from OrbitControls if auto-rotate is enabled
		// This allows zoom to work during auto-rotate
		if (autoRotateEnabled.value && controls.value) {
			const currentDistance = camera.value.position.distanceTo(modelCenter.value)
			if (Math.abs(currentDistance - distance.value) > 0.1) {
				// Distance changed by OrbitControls zoom - update our tracked distance
				distance.value = currentDistance
			}
		}

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

		// CRITICAL: Before rendering, ensure ALL objects in scene hierarchy have valid matrices
		// Three.js's renderer internally accesses matrices during rendering, so we must validate everything
		// More importantly, we must ensure matrices are UPDATED (not just exist) before rendering
		// Do this in a try-catch to avoid performance impact from errors
		try {
			// Validate entire scene hierarchy before render
			quickValidateHierarchy(scene, 0)
			quickValidateHierarchy(camera.value, 0)
			
			// CRITICAL: After validation, ensure matrices are UPDATED before rendering
			// updateMatrixWorld ensures matrices are in sync with position/rotation/scale
			// This prevents Three.js from trying to multiply undefined matrices during render
			// Use safe wrapper that validates before each multiplication
			try {
				// CRITICAL: First pass - validate ALL matrices exist before any updates
				// We must ensure parent matrices are valid before children can be updated
				const visited = new Set()
				validateAllMatrices(scene, visited, 0)
				validateAllMatrices(camera.value, visited, 0)
				
				// CRITICAL: Second pass - update local matrices (from position/rotation/scale)
				// This must happen BEFORE updateMatrixWorld which multiplies matrices
				// Update all local matrices first
				updateLocalMatrices(scene, 0)
				updateLocalMatrices(camera.value, 0)
				
				// CRITICAL: Third pass - now safely update world matrices
				// All local matrices are valid, all parent matrices are valid
				// Use Three.js's built-in updateMatrixWorld which handles the recursion correctly
				// We need to ensure ALL parents have valid matrices before calling updateMatrixWorld
				const parentVisited = new Set()
				ensureAllParentMatrices(scene, parentVisited)
				ensureAllParentMatrices(camera.value, parentVisited)
				
				// Use safe wrapper instead of direct updateMatrixWorld call
				try {
					safeUpdateMatrixWorld(camera.value, false)
					safeUpdateMatrixWorld(scene, true)
				} catch (updateError) {
					// If updateMatrixWorld still fails, log and skip this frame
					logger.warn('useCamera', 'safeUpdateMatrixWorld failed even after full validation', {
						error: updateError.message,
						stack: updateError.stack
					})
					throw updateError // Re-throw to skip render
				}
				
				// Retry render once
				renderer.render(scene, camera.value)
			} catch (retryError) {
				// If retry fails, just skip this frame - next frame should work
				// Log detailed error for debugging
				logger.warn('useCamera', 'Render retry failed, skipping frame', {
					error: retryError.message,
					stack: retryError.stack,
					cameraHasMatrix: !!camera.value?.matrix,
					cameraHasMatrixWorld: !!camera.value?.matrixWorld,
				})
			}
		} catch (validateError) {
			// If validation itself fails, log but continue - full error recovery will handle it
		}

		// Render with error handling to prevent crashes from invalid matrices or bounding spheres
		try {
			renderer.render(scene, camera.value)
		} catch (renderError) {
			// Check if this is the bounding sphere error
			if (renderError.message && renderError.message.includes("Cannot read properties of null (reading 'center')")) {
				// Find and fix all geometries with null bounding spheres
				const fixBoundingSpheres = (obj, depth = 0, visited = new Set()) => {
					if (!obj || depth > 5000 || visited.has(obj)) return
					visited.add(obj)
					
					try {
						if (obj.isMesh && obj.geometry) {
							try {
								if (!obj.geometry.boundingSphere || !obj.geometry.boundingSphere.center) {
									obj.geometry.computeBoundingSphere()
								}
							} catch (e) {
								// If computation fails, make mesh invisible
								obj.visible = false
								logger.warn('useCamera', 'Mesh has invalid bounding sphere, making invisible', { 
									type: obj.type, 
									name: obj.name,
									error: e.message
								})
							}
						}
						
						if (obj.children && Array.isArray(obj.children)) {
							for (const child of obj.children) {
								fixBoundingSpheres(child, depth + 1, visited)
							}
						}
						
						if (obj.isSkinnedMesh && obj.skeleton && Array.isArray(obj.skeleton.bones)) {
							for (const bone of obj.skeleton.bones) {
								fixBoundingSpheres(bone, depth + 1, visited)
							}
						}
					} catch (e) {
						// Skip
					}
				}
				
				// Fix all bounding spheres in the scene
				fixBoundingSpheres(scene, 0, new Set())
				
				// Retry render once
				try {
					renderer.render(scene, camera.value)
				} catch (retryError) {
					// Silently skip if retry fails - next frame should work
				}
				return // Skip further error handling
			}
			
			// Log render errors but don't crash - this can happen during model positioning
			if (renderError.message && (renderError.message.includes('multiplyMatrices') || renderError.message.includes('getNormalMatrix'))) {
				// Try to find which object has the invalid matrix by checking scene hierarchy
				let invalidObject = null
				try {
					const findInvalidMatrix = (obj, depth = 0) => {
						if (!obj || depth > 5000 || invalidObject) return
						try {
							// Check Object3D or objects with updateMatrixWorld
							const isObject3D = obj.isObject3D
							const hasUpdate = typeof obj.updateMatrixWorld === 'function'
							
							if (isObject3D || hasUpdate) {
								if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
									invalidObject = { type: obj.type, name: obj.name, issue: 'matrix invalid', isObject3D }
									return
								}
								if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
									invalidObject = { type: obj.type, name: obj.name, issue: 'matrixWorld invalid', isObject3D }
									return
								}
								if (isObject3D && (!obj.modelViewMatrix || !(obj.modelViewMatrix instanceof THREE.Matrix4))) {
									invalidObject = { type: obj.type, name: obj.name, issue: 'modelViewMatrix invalid', isObject3D }
									return
								}
								if (isObject3D && (!obj.normalMatrix || !(obj.normalMatrix instanceof THREE.Matrix3))) {
									invalidObject = { type: obj.type, name: obj.name, issue: 'normalMatrix invalid', isObject3D }
									return
								}
								// Only check parent matrix if parent exists and is an Object3D-like
								if (obj.parent) {
									const parentHasMatrix = obj.parent.matrixWorld instanceof THREE.Matrix4
									if (!parentHasMatrix) {
										// Check if parent should have matrix
										if (obj.parent.isObject3D || typeof obj.parent.updateMatrixWorld === 'function') {
											invalidObject = { type: obj.type, name: obj.name, parentType: obj.parent?.type, issue: 'parent matrixWorld invalid' }
											return
										}
									}
								}
							}
							
							if (obj.children && Array.isArray(obj.children)) {
								for (const child of obj.children) {
									findInvalidMatrix(child, depth + 1)
								}
							}

							// SPECIAL CASE: Validate Skeleton bones
							if (obj.isSkinnedMesh && obj.skeleton && Array.isArray(obj.skeleton.bones)) {
								for (const bone of obj.skeleton.bones) {
									findInvalidMatrix(bone, depth + 1)
								}
							}

							// SPECIAL CASE: Validate Light Shadow Camera
							if (obj.isLight && obj.shadow && obj.shadow.camera) {
								findInvalidMatrix(obj.shadow.camera, depth + 1)
							}
						} catch (e) {
							// Skip
						}
					}
					findInvalidMatrix(scene)
				} catch (e) {
					// Ignore errors during debugging
				}
				
				logger.warn('useCamera', 'Render error detected - matrices may be invalid, attempting to fix', {
					error: renderError.message,
					cameraHasMatrix: !!camera.value?.matrix,
					cameraHasMatrixWorld: !!camera.value?.matrixWorld,
					sceneChildrenCount: scene?.children?.length || 0,
					invalidObject,
					stack: renderError.stack?.substring(0, 500), // First 500 chars of stack
				})
				
				// Clear validation cache and validate everything before attempting to update
				// Use local set
				ensureSceneMatricesValid(scene, 0, new Set())
				ensureSceneMatricesValid(camera.value, 0, new Set())
				
				// Also validate any objects that controls might reference
				if (controls.value && controls.value.target) {
					// Controls target is typically a Vector3, not an Object3D, so no matrix validation needed
					// But ensure camera matrices are definitely valid
					if (!camera.value.matrix || !(camera.value.matrix instanceof THREE.Matrix4)) {
						camera.value.matrix = new THREE.Matrix4()
						camera.value.matrix.identity()
					}
					if (!camera.value.matrixWorld || !(camera.value.matrixWorld instanceof THREE.Matrix4)) {
						camera.value.matrixWorld = new THREE.Matrix4()
						camera.value.matrixWorld.identity()
					}
				}
				
				// Attempt to fix by updating all scene matrices
				// Only call updateMatrixWorld after all matrices are validated
				try {
					// First pass: Validate all objects and ensure matrices exist
					ensureSceneMatricesValid(scene, 0, new Set())
					ensureSceneMatricesValid(camera.value, 0, new Set())
					
					// Second pass: Call updateMatrix() on all objects to build local matrices
					// This must happen before updateMatrixWorld() which multiplies matrices
					// CRITICAL: Ensure matrices exist before calling updateMatrix()
					
					// Update all local matrices first
					updateLocalMatrices(scene, 0)
					updateLocalMatrices(camera.value, 0)
					
					// Ensure camera matrices are valid before updating
					if (!camera.value.matrix || !(camera.value.matrix instanceof THREE.Matrix4)) {
						camera.value.matrix = new THREE.Matrix4()
						camera.value.matrix.identity()
					}
					if (!camera.value.matrixWorld || !(camera.value.matrixWorld instanceof THREE.Matrix4)) {
						camera.value.matrixWorld = new THREE.Matrix4()
						camera.value.matrixWorld.identity()
					}
					camera.value.updateMatrix()
					
					// Third pass: Validate all matrices again after updateMatrix() calls
					// This catches any objects that might have been missed
					ensureSceneMatricesValid(scene, 0, new Set())
					ensureSceneMatricesValid(camera.value, 0, new Set())
					
					// CRITICAL: Before calling updateMatrixWorld, ensure ALL parents in the hierarchy
					// have valid matrices. updateMatrixWorld recursively multiplies parent.matrixWorld * child.matrix
					// so we need to validate the entire parent chain for every object
					
					const parentVisited = new Set()
					ensureAllParentMatrices(scene, parentVisited)
					ensureAllParentMatrices(camera.value, parentVisited)
					
					// Use safe wrapper instead of direct updateMatrixWorld call
					try {
						safeUpdateMatrixWorld(camera.value, false)
						safeUpdateMatrixWorld(scene, true)
					} catch (updateError) {
						// If updateMatrixWorld still fails, log and skip this frame
						logger.warn('useCamera', 'safeUpdateMatrixWorld failed even after full validation', {
							error: updateError.message,
							stack: updateError.stack
						})
						throw updateError // Re-throw to skip render
					}
					
					// Retry render once
					renderer.render(scene, camera.value)
				} catch (retryError) {
					// If retry fails, just skip this frame - next frame should work
					// Log detailed error for debugging
					logger.warn('useCamera', 'Render retry failed, skipping frame', {
						error: retryError.message,
						stack: retryError.stack,
						cameraHasMatrix: !!camera.value?.matrix,
						cameraHasMatrixWorld: !!camera.value?.matrixWorld,
					})
				}
			} else {
				// Re-throw non-matrix errors
				throw renderError
			}
		}
	}

	/**
	 * Toggle auto-rotate
	 */
	const toggleAutoRotate = () => {
		autoRotateEnabled.value = !autoRotateEnabled.value

		// Update OrbitControls settings based on auto-rotate state
		if (controls.value) {
			if (autoRotateEnabled.value) {
				// Disable rotation and pan when auto-rotating, but keep zoom enabled
				controls.value.enableRotate = false
				controls.value.enablePan = false
				controls.value.enableZoom = true // Keep zoom working!
				logger.info('useCamera', 'Auto-rotate enabled - OrbitControls rotation/pan disabled, zoom active')
			} else {
				// Re-enable all controls when auto-rotate is off
				controls.value.enableRotate = true
				controls.value.enablePan = true
				controls.value.enableZoom = true
				logger.info('useCamera', 'Auto-rotate disabled - OrbitControls fully re-enabled')
			}
		}

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
	 * Set zoom speed
	 * @param {number} speed - Zoom speed (default: 1.0)
	 */
	const setZoomSpeed = (speed) => {
		if (controls.value) {
			controls.value.zoomSpeed = speed
			logger.info('useCamera', 'Zoom speed set', { speed })
		}
	}

	/**
	 * Set pan speed
	 * @param {number} speed - Pan speed (default: 1.0)
	 */
	const setPanSpeed = (speed) => {
		if (controls.value) {
			controls.value.panSpeed = speed
			logger.info('useCamera', 'Pan speed set', { speed })
		}
	}

	/**
	 * Set damping (smooth movement)
	 * @param {boolean} enabled - Enable damping
	 */
	const setDamping = (enabled) => {
		if (controls.value) {
			controls.value.enableDamping = enabled
			logger.info('useCamera', 'Damping set', { enabled })
		}
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
	 * Toggle camera projection between perspective and orthographic
	 */
	const toggleCameraProjection = () => {
		if (!perspectiveCamera.value || !orthographicCamera.value || !controls.value) {
			logger.warn('useCamera', 'Cannot toggle projection: cameras or controls not initialized')
			return
		}

		try {
			const currentCamera = camera.value
			const currentPosition = currentCamera.position.clone()
			const currentTarget = controls.value.target.clone()

			// Switch camera type
			const newType = cameraType.value === 'perspective' ? 'orthographic' : 'perspective'
			const newCamera = newType === 'orthographic' ? orthographicCamera.value : perspectiveCamera.value

			// Transfer position and target
			newCamera.position.copy(currentPosition)
			newCamera.lookAt(currentTarget)

			// Handle zoom translation between camera types
			if (newType === 'orthographic' && cameraType.value === 'perspective') {
				// Perspective to Orthographic: Calculate appropriate zoom based on distance
				const distance = currentPosition.distanceTo(currentTarget)
				const fov = perspectiveCamera.value.fov * (Math.PI / 180)
				const frustumHeight = 2 * Math.tan(fov / 2) * distance
				newCamera.zoom = VIEWER_CONFIG.camera.orthographic.frustumSize / frustumHeight
			} else if (newType === 'perspective' && cameraType.value === 'orthographic') {
				// Orthographic to Perspective: Just reset zoom to 1
				newCamera.zoom = 1
			}

			// Update projection matrix
			newCamera.updateProjectionMatrix()

			// Update active camera
			camera.value = newCamera
			cameraType.value = newType

			// Update controls to use new camera
			controls.value.object = newCamera
			controls.value.target.copy(currentTarget)
			controls.value.update()

			logger.info('useCamera', 'Camera projection toggled', {
				from: cameraType.value === 'perspective' ? 'orthographic' : 'perspective',
				to: newType,
				zoom: newCamera.zoom,
			})
		} catch (error) {
			logger.error('useCamera', 'Failed to toggle camera projection', error)
		}
	}

	/**
	 * Rotate camera by delta angles (for controller support)
	 * @param {number} deltaX - Horizontal rotation delta
	 * @param {number} deltaY - Vertical rotation delta
	 */
	const rotateCameraByDelta = (deltaX, deltaY) => {
		if (!camera.value || !controls.value) return

		try {
			// Sync rotationX and rotationY from current camera position if needed
			// This ensures we rotate from the current view, not from (0,0)
			const currentPos = camera.value.position.clone()
			const relativePos = currentPos.sub(modelCenter.value)
			const currentDistance = relativePos.length()

			// Update distance if it changed
			if (currentDistance > 0.1) {
				distance.value = currentDistance
			}

			// Calculate current rotation angles from camera position
			// Only do this if rotationX/Y appear to be at default (0,0) but camera is not at front view
			const currentRotationY = Math.atan2(relativePos.x, relativePos.z)
			const currentRotationX = Math.asin(relativePos.y / currentDistance)

			// If current angles differ significantly from tracked angles, sync them
			const angleDiff = Math.abs(currentRotationY - rotationY.value) + Math.abs(currentRotationX - rotationX.value)
			if (angleDiff > 0.1) {
				rotationY.value = currentRotationY
				rotationX.value = currentRotationX
				logger.info('useCamera', 'Synced rotation angles from camera position', {
					rotationX: rotationX.value,
					rotationY: rotationY.value,
				})
			}

			// Apply rotation delta
			rotationY.value -= deltaX
			rotationX.value += deltaY

			// Clamp vertical rotation
			rotationX.value = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationX.value))

			// Update camera position based on rotation around model center
			const x = modelCenter.value.x + Math.sin(rotationY.value) * Math.cos(rotationX.value) * distance.value
			const y = modelCenter.value.y + Math.sin(rotationX.value) * distance.value
			const z = modelCenter.value.z + Math.cos(rotationY.value) * Math.cos(rotationX.value) * distance.value

			camera.value.position.set(x, y, z)
			camera.value.lookAt(modelCenter.value)

			if (controls.value) {
				controls.value.update()
			}

			logger.info('useCamera', 'Camera rotated by delta', { deltaX, deltaY })
		} catch (error) {
			logger.error('useCamera', 'Failed to rotate camera by delta', error)
		}
	}

	/**
	 * Snap camera to named view with animation
	 * @param {string} viewName - Name of canonical view
	 * @param {number} duration - Animation duration in ms
	 */
	const snapToNamedView = (viewName, duration = 800) => {
		if (!camera.value || !controls.value) return

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
			logger.warn('useCamera', 'Unknown view name', { viewName })
			return
		}

		try {
			const currentDistance = camera.value.position.distanceTo(modelCenter.value)
			const targetPos = new THREE.Vector3(
				modelCenter.value.x + view.x * currentDistance,
				modelCenter.value.y + view.y * currentDistance,
				modelCenter.value.z + view.z * currentDistance,
			)

			// Use existing animateToPreset for smooth animation
			const startTime = Date.now()
			const startPosition = camera.value.position.clone()
			const startTarget = controls.value.target.clone()
			const endTarget = modelCenter.value.clone()

			isAnimating.value = true

			const animate = () => {
				const elapsed = Date.now() - startTime
				const progress = Math.min(elapsed / duration, 1)

				// Easing function (ease-in-out)
				const easeProgress = progress < 0.5
					? 2 * progress * progress
					: 1 - Math.pow(-2 * progress + 2, 2) / 2

				// Interpolate position and target
				camera.value.position.lerpVectors(startPosition, targetPos, easeProgress)
				controls.value.target.lerpVectors(startTarget, endTarget, easeProgress)
				controls.value.update()

				if (progress < 1) {
					animationFrameId.value = requestAnimationFrame(animate)
				} else {
					isAnimating.value = false
					animationFrameId.value = null
					logger.info('useCamera', 'Snap to view completed', { viewName })
				}
			}

			animate()
		} catch (error) {
			logger.error('useCamera', 'Failed to snap to named view', error)
		}
	}

	/**
	 * Get current camera distance from model center
	 * @return {number} Distance
	 */
	const getCameraDistance = () => {
		return distance.value
	}

	/**
	 * Get model center point
	 * @return {THREE.Vector3} Model center
	 */
	const getModelCenter = () => {
		return modelCenter.value
	}

	/**
	 * Pan camera by delta (for controller support)
	 * @param {number} deltaX - Horizontal pan delta
	 * @param {number} deltaY - Vertical pan delta
	 */
	const panCameraByDelta = (deltaX, deltaY) => {
		if (!camera.value || !controls.value) return

		try {
			// Get camera's right and up vectors
			const cameraRight = new THREE.Vector3()
			const cameraUp = new THREE.Vector3()

			camera.value.getWorldDirection(cameraRight)
			cameraRight.cross(camera.value.up).normalize()
			cameraUp.copy(camera.value.up).normalize()

			// Calculate pan offset
			const panSpeed = 0.1
			const panOffset = new THREE.Vector3()
			panOffset.add(cameraRight.multiplyScalar(deltaX * panSpeed))
			panOffset.add(cameraUp.multiplyScalar(deltaY * panSpeed))

			// Apply pan to camera and target
			camera.value.position.add(panOffset)
			modelCenter.value.add(panOffset)

			if (controls.value) {
				controls.value.target.copy(modelCenter.value)
				controls.value.update()
			}

			logger.info('useCamera', 'Camera panned by delta', { deltaX, deltaY })
		} catch (error) {
			logger.error('useCamera', 'Failed to pan camera by delta', error)
		}
	}

	/**
	 * Reset camera pan to original model center
	 */
	const resetPan = () => {
		if (!camera.value || !controls.value || !initialTarget.value) return

		try {
			// Calculate the offset
			const offset = new THREE.Vector3().subVectors(initialTarget.value, modelCenter.value)

			// Apply offset to camera position and target
			camera.value.position.add(offset)
			modelCenter.value.copy(initialTarget.value)

			if (controls.value) {
				controls.value.target.copy(modelCenter.value)
				controls.value.update()
			}

			logger.info('useCamera', 'Pan reset to original center', { center: modelCenter.value })
		} catch (error) {
			logger.error('useCamera', 'Failed to reset pan', error)
		}
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
		perspectiveCamera.value = null
		orthographicCamera.value = null
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
		isPositioningCamera,
		animationPresets,
		cameraType,
		perspectiveCamera,
		orthographicCamera,

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
		setZoomSpeed,
		setPanSpeed,
		setDamping,
		animateToPreset,
		smoothZoom,
		onWindowResize,
		throttledResize,
		updateControls,
		render,
		cancelAnimations,
		toggleCameraProjection,
		rotateCameraByDelta,
		snapToNamedView,
		panCameraByDelta,
		resetPan,
		getCameraDistance,
		getModelCenter,
		dispose,
	}
}
