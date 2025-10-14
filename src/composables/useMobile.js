/**
 * Mobile controls composable
 * Handles mobile-specific touch controls, gestures, and interactions
 */

import { ref, computed, readonly } from 'vue'
import * as THREE from 'three'
import { logger } from '../utils/logger.js'
import { throttle } from '../utils/mathHelpers.js'

export function useMobile() {
	// Mobile state
	const isMobile = ref(false)
	const isTouchDevice = ref(false)
	const orientation = ref('portrait')
	const screenSize = ref({ width: 0, height: 0 })

	// Touch state
	const touchStartTime = ref(0)
	const lastTouchDistance = ref(0)
	const touchCount = ref(0)
	const isPinching = ref(false)
	const isRotating = ref(false)
	const isPanning = ref(false)

	// Gesture state
	const gestureStartPos = ref(new THREE.Vector2())
	const gestureCurrentPos = ref(new THREE.Vector2())
	const gestureDelta = ref(new THREE.Vector2())
	const gestureVelocity = ref(new THREE.Vector2())

	// Mobile UI state
	const mobileHintsVisible = ref(true)
	const mobileControlsEnabled = ref(true)
	const hapticFeedback = ref(true)

	// Computed properties
	const isMobileDevice = computed(() => isMobile.value)
	const isTouchCapable = computed(() => isTouchDevice.value)
	const isLandscape = computed(() => orientation.value === 'landscape')
	const isPortrait = computed(() => orientation.value === 'portrait')
	const isSmallScreen = computed(() => screenSize.value.width < 768)
	const isLargeScreen = computed(() => screenSize.value.width >= 1024)
	const areMobileHintsVisible = computed(() => mobileHintsVisible.value)
	const areMobileControlsEnabled = computed(() => mobileControlsEnabled.value)
	const isHapticFeedbackEnabled = computed(() => hapticFeedback.value)

	/**
	 * Initialize mobile detection and setup
	 */
	const initMobile = () => {
		detectMobileDevice()
		detectTouchCapability()
		setupOrientationDetection()
		setupScreenSizeDetection()
		setupTouchEvents()

		logger.info('useMobile', 'Mobile initialization complete', {
			isMobile: isMobile.value,
			isTouchDevice: isTouchDevice.value,
			orientation: orientation.value,
			screenSize: screenSize.value,
		})
	}

	/**
	 * Detect if device is mobile
	 * @return {boolean} Whether the device is mobile
	 */
	const detectMobileDevice = () => {
		const userAgent = navigator.userAgent || navigator.vendor || window.opera
		const isMobileDevice = /android|bb\d+|meego|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|rim)|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(userAgent)

	isMobile.value = isMobileDevice
	logger.info('useMobile', 'Mobile device detected', { isMobile: isMobileDevice })

		return isMobileDevice
	}

	/**
	 * Detect if device supports touch
	 * @return {boolean} Whether the device supports touch
	 */
	const detectTouchCapability = () => {
		const isTouchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0
	isTouchDevice.value = isTouchCapable
	logger.info('useMobile', 'Touch capability detected', { isTouchCapable })

		return isTouchCapable
	}

	/**
	 * Setup orientation detection
	 */
	const setupOrientationDetection = () => {
		const updateOrientation = () => {
			const isLandscape = window.innerWidth > window.innerHeight
			orientation.value = isLandscape ? 'landscape' : 'portrait'
			logger.info('useMobile', 'Orientation changed', { orientation: orientation.value })
		}

		// Throttle orientation updates to prevent excessive calls during window dragging
		const throttledUpdateOrientation = throttle(updateOrientation, 150)

		updateOrientation()
		eventListeners.value.orientationChange = throttledUpdateOrientation
		window.addEventListener('orientationchange', throttledUpdateOrientation)
		window.addEventListener('resize', throttledUpdateOrientation)
	}

	/**
	 * Setup screen size detection
	 */
	const setupScreenSizeDetection = () => {
		const updateScreenSize = () => {
			screenSize.value = {
				width: window.innerWidth,
				height: window.innerHeight,
			}
			logger.info('useMobile', 'Screen size updated', screenSize.value)
		}

		// Throttle screen size updates to prevent excessive calls during window dragging
		const throttledUpdateScreenSize = throttle(updateScreenSize, 150)

		updateScreenSize()
		eventListeners.value.resize = throttledUpdateScreenSize
		window.addEventListener('resize', throttledUpdateScreenSize)
	}

	/**
	 * Setup touch event handlers
	 */
	const setupTouchEvents = () => {
		if (!isTouchDevice.value) return

		// Touch start
		const handleTouchStart = (event) => {
			touchStartTime.value = Date.now()
			touchCount.value = event.touches.length

			if (event.touches.length === 1) {
				// Single touch - rotation
				isRotating.value = true
				isPanning.value = false
				isPinching.value = false

				const touch = event.touches[0]
				gestureStartPos.value.set(touch.clientX, touch.clientY)
				gestureCurrentPos.value.copy(gestureStartPos.value)

				logger.info('useMobile', 'Touch start - rotation', {
					x: touch.clientX,
					y: touch.clientY,
				})
			} else if (event.touches.length === 2) {
				// Two touches - pinch/zoom
				isPinching.value = true
				isRotating.value = false
				isPanning.value = false

				const touch1 = event.touches[0]
				const touch2 = event.touches[1]
				const distance = Math.sqrt(
					Math.pow(touch2.clientX - touch1.clientX, 2)
          + Math.pow(touch2.clientY - touch1.clientY, 2),
				)
				lastTouchDistance.value = distance

				// Calculate center point
				const centerX = (touch1.clientX + touch2.clientX) / 2
				const centerY = (touch1.clientY + touch2.clientY) / 2
				gestureStartPos.value.set(centerX, centerY)
				gestureCurrentPos.value.copy(gestureStartPos.value)

				logger.info('useMobile', 'Touch start - pinch', {
					distance,
					centerX,
					centerY,
				})
			}
		}

		// Touch move
		const handleTouchMove = (event) => {
			event.preventDefault()

			if (event.touches.length === 1 && isRotating.value) {
				// Single touch rotation
				const touch = event.touches[0]
				gestureCurrentPos.value.set(touch.clientX, touch.clientY)
				gestureDelta.value.copy(gestureCurrentPos.value).sub(gestureStartPos.value)

				// Calculate velocity
				const deltaTime = Date.now() - touchStartTime.value
				if (deltaTime > 0) {
					gestureVelocity.value.copy(gestureDelta.value).divideScalar(deltaTime)
				}

				logger.info('useMobile', 'Touch move - rotation', {
					delta: { x: gestureDelta.value.x, y: gestureDelta.value.y },
					velocity: { x: gestureVelocity.value.x, y: gestureVelocity.value.y },
				})
			} else if (event.touches.length === 2 && isPinching.value) {
				// Two touch pinch
				const touch1 = event.touches[0]
				const touch2 = event.touches[1]
				const distance = Math.sqrt(
					Math.pow(touch2.clientX - touch1.clientX, 2)
          + Math.pow(touch2.clientY - touch1.clientY, 2),
				)

				if (lastTouchDistance.value > 0) {
					const centerX = (touch1.clientX + touch2.clientX) / 2
					const centerY = (touch1.clientY + touch2.clientY) / 2

					gestureCurrentPos.value.set(centerX, centerY)
					gestureDelta.value.copy(gestureCurrentPos.value).sub(gestureStartPos.value)

					logger.info('useMobile', 'Touch move - pinch', {
						distance,
						centerX,
						centerY,
					})
				}

				lastTouchDistance.value = distance
			}
		}

		// Touch end
		const handleTouchEnd = (event) => {
			const touchLength = Date.now() - touchStartTime.value

			if (event.touches.length === 0) {
				// All touches ended
				if (touchLength < 500 && touchLength > 0 && touchCount.value === 1) {
					// Single tap - could be double tap
					handleSingleTap()
				}

				// Reset gesture state
				isRotating.value = false
				isPanning.value = false
				isPinching.value = false
				gestureDelta.value.set(0, 0)
				gestureVelocity.value.set(0, 0)

				logger.info('useMobile', 'Touch end', {
					touchLength,
					touchCount: touchCount.value,
				})
			}
		}

		// Store event listener references and add event listeners
		eventListeners.value.touchStart = handleTouchStart
		eventListeners.value.touchMove = handleTouchMove
		eventListeners.value.touchEnd = handleTouchEnd
		
		document.addEventListener('touchstart', handleTouchStart, { passive: false })
		document.addEventListener('touchmove', handleTouchMove, { passive: false })
		document.addEventListener('touchend', handleTouchEnd, { passive: false })
	}

	/**
	 * Handle single tap
	 */
	const handleSingleTap = () => {
		logger.info('useMobile', 'Single tap detected')
		// This could trigger double tap detection or other single tap actions
	}

	/**
	 * Setup mobile-specific controls for OrbitControls
	 * @param {THREE.OrbitControls} controls - OrbitControls instance
	 */
	const setupMobileControls = (controls) => {
		if (!controls || !isMobile.value) return

		// Enhanced touch controls for mobile
		controls.enableDamping = true
		controls.dampingFactor = 0.1
		controls.screenSpacePanning = true
		controls.touches = {
			ONE: THREE.TOUCH.ROTATE,
			TWO: THREE.TOUCH.DOLLY_PAN,
		}

		// Adjust limits for mobile
		controls.minDistance = 1
		controls.maxDistance = 50
		controls.maxPolarAngle = Math.PI * 0.8
		controls.minPolarAngle = Math.PI * 0.1

		logger.info('useMobile', 'Mobile controls configured', {
			damping: controls.dampingFactor,
			minDistance: controls.minDistance,
			maxDistance: controls.maxDistance,
		})
	}

	/**
	 * Setup pinch zoom
	 * @param {THREE.OrbitControls} controls - OrbitControls instance
	 */
	const setupPinchZoom = (controls) => {
		if (!controls || !isTouchDevice.value) return

		let lastTouchDistance = 0

		const handleTouchStart = (event) => {
			if (event.touches.length === 2) {
				const touch1 = event.touches[0]
				const touch2 = event.touches[1]
				lastTouchDistance = Math.sqrt(
					Math.pow(touch2.clientX - touch1.clientX, 2)
          + Math.pow(touch2.clientY - touch1.clientY, 2),
				)
			}
		}

		const handleTouchMove = (event) => {
			if (event.touches.length === 2) {
				const touch1 = event.touches[0]
				const touch2 = event.touches[1]
				const distance = Math.sqrt(
					Math.pow(touch2.clientX - touch1.clientX, 2)
          + Math.pow(touch2.clientY - touch1.clientY, 2),
				)

				if (lastTouchDistance > 0) {
					const delta = lastTouchDistance - distance

					// Apply zoom
					if (controls) {
						controls.dollyIn(delta * 0.01)
						controls.update()
					}
				}

				lastTouchDistance = distance
			}
		}

		document.addEventListener('touchstart', handleTouchStart, { passive: false })
		document.addEventListener('touchmove', handleTouchMove, { passive: false })

		logger.info('useMobile', 'Pinch zoom setup complete')
	}

	/**
	 * Setup double tap to reset view
	 * @param {Function} resetFunction - Function to call on double tap
	 */
	const setupDoubleTapReset = (resetFunction) => {
		if (!isTouchDevice.value) return

		let lastTapTime = 0
		const doubleTapDelay = 300

		const handleTouchEnd = (event) => {
			const currentTime = Date.now()
			const tapLength = currentTime - touchStartTime.value

			if (tapLength < 500 && tapLength > 0) {
				if (currentTime - lastTapTime < doubleTapDelay) {
					// Double tap detected
					if (resetFunction) {
						resetFunction()
					}
					logger.info('useMobile', 'Double tap detected - resetting view')
				}

				lastTapTime = currentTime
			}
		}

		document.addEventListener('touchend', handleTouchEnd, { passive: false })
		logger.info('useMobile', 'Double tap reset setup complete')
	}

	/**
	 * Toggle mobile hints visibility
	 */
	const toggleMobileHints = () => {
		mobileHintsVisible.value = !mobileHintsVisible.value
		logger.info('useMobile', 'Mobile hints toggled', { visible: mobileHintsVisible.value })
	}

	/**
	 * Toggle mobile controls
	 */
	const toggleMobileControls = () => {
		mobileControlsEnabled.value = !mobileControlsEnabled.value
		logger.info('useMobile', 'Mobile controls toggled', { enabled: mobileControlsEnabled.value })
	}

	/**
	 * Toggle haptic feedback
	 */
	const toggleHapticFeedback = () => {
		hapticFeedback.value = !hapticFeedback.value
		logger.info('useMobile', 'Haptic feedback toggled', { enabled: hapticFeedback.value })
	}

	/**
	 * Trigger haptic feedback
	 * @param {string} type - Type of haptic feedback ('light', 'medium', 'heavy')
	 */
	const triggerHapticFeedback = (type = 'light') => {
		if (!hapticFeedback.value || !navigator.vibrate) return

		const patterns = {
			light: [10],
			medium: [20],
			heavy: [50],
		}

		navigator.vibrate(patterns[type] || patterns.light)
		logger.info('useMobile', 'Haptic feedback triggered', { type })
	}

	/**
	 * Get mobile-optimized camera settings
	 * @return {object} Camera settings optimized for mobile
	 */
	const getMobileCameraSettings = () => {
		return {
			fov: 75, // Wider FOV for mobile
			near: 0.1,
			far: 1000,
			minDistance: 1,
			maxDistance: 50,
			maxPolarAngle: Math.PI * 0.8,
			minPolarAngle: Math.PI * 0.1,
		}
	}

	/**
	 * Get mobile-optimized renderer settings
	 * @return {object} Renderer settings optimized for mobile
	 */
	const getMobileRendererSettings = () => {
		return {
			antialias: false, // Disable antialias for better performance
			alpha: true,
			powerPreference: 'high-performance',
			pixelRatio: Math.min(window.devicePixelRatio, 2),
		}
	}

	/**
	 * Check if device supports specific features
	 * @param {string} feature - Feature to check
	 * @return {boolean} Whether the feature is supported
	 */
	const supportsFeature = (feature) => {
		const features = {
			touch: isTouchDevice.value,
			haptic: 'vibrate' in navigator,
			orientation: 'orientation' in window,
			fullscreen: 'requestFullscreen' in document.documentElement,
			webgl: !!window.WebGLRenderingContext,
		}

		return features[feature] || false
	}

	/**
	 * Get mobile device information
	 * @return {object} Mobile device information
	 */
	const getMobileInfo = () => {
		return {
			isMobile: isMobile.value,
			isTouchDevice: isTouchDevice.value,
			orientation: orientation.value,
			screenSize: screenSize.value,
			userAgent: navigator.userAgent,
			platform: navigator.platform,
			language: navigator.language,
		}
	}

	// Store event listener references for proper cleanup
	const eventListeners = ref({
		orientationChange: null,
		resize: null,
		touchStart: null,
		touchMove: null,
		touchEnd: null,
	})

	/**
	 * Dispose of mobile resources
	 */
	const dispose = () => {
		// Remove event listeners with proper references
		if (eventListeners.value.orientationChange) {
			window.removeEventListener('orientationchange', eventListeners.value.orientationChange)
		}
		if (eventListeners.value.resize) {
			window.removeEventListener('resize', eventListeners.value.resize)
		}
		if (eventListeners.value.touchStart) {
			document.removeEventListener('touchstart', eventListeners.value.touchStart)
		}
		if (eventListeners.value.touchMove) {
			document.removeEventListener('touchmove', eventListeners.value.touchMove)
		}
		if (eventListeners.value.touchEnd) {
			document.removeEventListener('touchend', eventListeners.value.touchEnd)
		}

		// Clear references
		eventListeners.value = {
			orientationChange: null,
			resize: null,
			touchStart: null,
			touchMove: null,
			touchEnd: null,
		}

		logger.info('useMobile', 'Mobile resources disposed')
	}

	return {
		// State - these are mutable by event listeners, so don't use readonly
		isMobile,
		isTouchDevice,
		orientation,
		screenSize,
		touchCount,
		isPinching,
		isRotating,
		isPanning,
		gestureStartPos,
		gestureCurrentPos,
		gestureDelta,
		gestureVelocity,
		mobileHintsVisible,
		mobileControlsEnabled,
		hapticFeedback,

		// Computed
		isMobileDevice,
		isTouchCapable,
		isLandscape,
		isPortrait,
		isSmallScreen,
		isLargeScreen,
		areMobileHintsVisible,
		areMobileControlsEnabled,
		isHapticFeedbackEnabled,

		// Methods
		initMobile,
		detectMobileDevice,
		detectTouchCapability,
		setupMobileControls,
		setupPinchZoom,
		setupDoubleTapReset,
		toggleMobileHints,
		toggleMobileControls,
		toggleHapticFeedback,
		triggerHapticFeedback,
		getMobileCameraSettings,
		getMobileRendererSettings,
		supportsFeature,
		getMobileInfo,
		dispose,
	}
}
