/* global THREE */
/**
 * UI controls and toolbar management composable
 * Handles UI state, toolbar interactions, and user interface controls
 */

import { ref, computed, readonly } from 'vue'
import { logger } from '../utils/logger.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { disposeObject } from '../utils/three-utils.js'

export function useUI() {
	// UI state
	const showGrid = ref(true)
	const showAxes = ref(true)
	const wireframe = ref(false)
	const background = ref(null)
	const autoRotate = ref(false)
	const autoRotateSpeed = ref(VIEWER_CONFIG.camera.autoRotateSpeed)
	const performanceMode = ref('balanced')

	// Toolbar state
	const toolbarVisible = ref(true)
	const settingsOpen = ref(false)
	const helpOpen = ref(false)

	// Loading state
	const skeletonLoading = ref(false)
	const skeletonGroup = ref(null)

	// Mobile state
	const isMobile = ref(false)
	const mobileHintsVisible = ref(true)

	// Computed properties
	const isGridVisible = computed(() => showGrid.value)
	const isAxesVisible = computed(() => showAxes.value)
	const isWireframeMode = computed(() => wireframe.value)
	const currentBackground = computed(() => background.value)
	const isAutoRotating = computed(() => autoRotate.value)
	const currentPerformanceMode = computed(() => performanceMode.value)
	const isToolbarVisible = computed(() => toolbarVisible.value)
	const isSettingsOpen = computed(() => settingsOpen.value)
	const isHelpOpen = computed(() => helpOpen.value)
	const isSkeletonLoading = computed(() => skeletonLoading.value)
	const isMobileDevice = computed(() => isMobile.value)
	const areMobileHintsVisible = computed(() => mobileHintsVisible.value)

	/**
	 * Initialize UI state
	 * @param {object} options - Initial UI options
	 */
	const initUI = (options = {}) => {
		showGrid.value = options.showGrid ?? true
		showAxes.value = options.showAxes ?? true
		wireframe.value = options.wireframe ?? false
		background.value = options.background ?? null
		autoRotate.value = options.autoRotate ?? false
		autoRotateSpeed.value = options.autoRotateSpeed ?? VIEWER_CONFIG.camera.autoRotateSpeed
		performanceMode.value = options.performanceMode ?? 'balanced'
		isMobile.value = options.isMobile ?? false

	logger.info('useUI', 'UI initialized', {
		showGrid: showGrid.value,
		showAxes: showAxes.value,
		wireframe: wireframe.value,
		background: background.value,
		autoRotate: autoRotate.value,
		performanceMode: performanceMode.value,
		isMobile: isMobile.value,
	})
	}

	/**
	 * Toggle grid visibility
	 * @param {THREE.GridHelper} grid - Grid helper object
	 */
	const toggleGrid = (grid) => {
		showGrid.value = !showGrid.value
		if (grid) {
			grid.visible = showGrid.value
		}
		logger.info('useUI', 'Grid toggled', { visible: showGrid.value })
	}

	/**
	 * Toggle axes visibility
	 * @param {THREE.AxesHelper} axes - Axes helper object
	 */
	const toggleAxes = (axes) => {
		showAxes.value = !showAxes.value
		if (axes) {
			axes.visible = showAxes.value
		}
		logger.info('useUI', 'Axes toggled', { visible: showAxes.value })
	}

	/**
	 * Toggle wireframe mode
	 * @param {THREE.Object3D} model - Model to apply wireframe to
	 */
	const toggleWireframe = (model) => {
		wireframe.value = !wireframe.value
		if (model) {
			applyWireframe(model, wireframe.value)
		}
		logger.info('useUI', 'Wireframe toggled', { enabled: wireframe.value })
	}

	/**
	 * Apply wireframe to model
	 * @param {THREE.Object3D} model - Model to apply wireframe to
	 * @param {boolean} enabled - Whether to enable wireframe
	 */
	const applyWireframe = (model, enabled) => {
		if (!model) return

		model.traverse((child) => {
			if (child.isMesh && child.material) {
				if (Array.isArray(child.material)) {
					child.material.forEach(material => {
						material.wireframe = enabled
					})
				} else {
					child.material.wireframe = enabled
				}
			}
		})

		logger.info('useUI', 'Wireframe applied', { enabled })
	}

	/**
	 * Set background color
	 * @param {string} color - Background color
	 * @param {THREE.Scene} scene - Three.js scene
	 */
	const setBackground = (color, scene) => {
		background.value = color
		if (scene) {
			scene.background = color ? new THREE.Color(color) : null
		}
		logger.info('useUI', 'Background set', { color })
	}

	/**
	 * Toggle auto-rotate
	 * @param {THREE.OrbitControls} controls - Orbit controls
	 */
	const toggleAutoRotate = (controls) => {
		autoRotate.value = !autoRotate.value
		if (controls) {
			controls.autoRotate = autoRotate.value
			controls.autoRotateSpeed = autoRotateSpeed.value
		}
		logger.info('useUI', 'Auto-rotate toggled', { enabled: autoRotate.value })
	}

	/**
	 * Set auto-rotate speed
	 * @param {number} speed - Rotation speed
	 * @param {THREE.OrbitControls} controls - Orbit controls
	 */
	const setAutoRotateSpeed = (speed, controls) => {
		autoRotateSpeed.value = Math.max(0.1, Math.min(10, speed))
		if (controls) {
			controls.autoRotateSpeed = autoRotateSpeed.value
		}
		logger.info('useUI', 'Auto-rotate speed set', { speed: autoRotateSpeed.value })
	}

	/**
	 * Set performance mode
	 * @param {string} mode - Performance mode ('low', 'balanced', 'high')
	 */
	const setPerformanceMode = (mode) => {
		performanceMode.value = mode
		logger.info('useUI', 'Performance mode set', { mode })
	}

	/**
	 * Toggle toolbar visibility
	 */
	const toggleToolbar = () => {
		toolbarVisible.value = !toolbarVisible.value
		logger.info('useUI', 'Toolbar toggled', { visible: toolbarVisible.value })
	}

	/**
	 * Toggle settings panel
	 */
	const toggleSettings = () => {
		settingsOpen.value = !settingsOpen.value
		logger.info('useUI', 'Settings toggled', { open: settingsOpen.value })
	}

	/**
	 * Toggle help panel
	 */
	const toggleHelp = () => {
		helpOpen.value = !helpOpen.value
		logger.info('useUI', 'Help toggled', { open: helpOpen.value })
	}

	/**
	 * Show skeleton loading
	 * @param {THREE.Scene} scene - Three.js scene
	 */
	const showSkeletonLoading = (scene) => {
		if (skeletonGroup.value) {
			skeletonGroup.value.visible = true
			return
		}

		skeletonLoading.value = true
		skeletonGroup.value = new THREE.Group()

		// Create skeleton loading animation
		for (let i = 0; i < 8; i++) {
			const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1)
			const material = new THREE.MeshBasicMaterial({
				color: 0x00ff00,
				transparent: true,
				opacity: 0.7,
			})
			const cube = new THREE.Mesh(geometry, material)

			const angle = (i / 8) * Math.PI * 2
			const radius = 2
			cube.position.set(
				Math.cos(angle) * radius,
				Math.sin(angle * 2) * 0.5,
				Math.sin(angle) * radius,
			)

			skeletonGroup.value.add(cube)
		}

		scene.add(skeletonGroup.value)
		logger.info('useUI', 'Skeleton loading shown')
	}

	/**
	 * Hide skeleton loading
	 */
	const hideSkeletonLoading = () => {
		if (skeletonGroup.value) {
			skeletonGroup.value.visible = false
		}
		skeletonLoading.value = false
		logger.info('useUI', 'Skeleton loading hidden')
	}

	/**
	 * Toggle mobile hints
	 */
	const toggleMobileHints = () => {
		mobileHintsVisible.value = !mobileHintsVisible.value
		logger.info('useUI', 'Mobile hints toggled', { visible: mobileHintsVisible.value })
	}

	/**
	 * Detect mobile device
	 * @return {boolean} Whether the device is mobile
	 */
	const detectMobileDevice = () => {
		const userAgent = navigator.userAgent || navigator.vendor || window.opera
		const isMobileDevice = /android|bb\d+|meego|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|rim)|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(userAgent)

		isMobile.value = isMobileDevice
		logger.info('useUI', 'Mobile device detected', { isMobile: isMobileDevice })

		return isMobileDevice
	}

	/**
	 * Get UI preset configurations
	 * @return {object} UI presets
	 */
	const getUIPresets = () => {
		return {
			default: {
				showGrid: true,
				showAxes: true,
				wireframe: false,
				background: null,
				autoRotate: false,
				performanceMode: 'balanced',
			},
			presentation: {
				showGrid: false,
				showAxes: false,
				wireframe: false,
				background: '#ffffff',
				autoRotate: true,
				performanceMode: 'high',
			},
			debug: {
				showGrid: true,
				showAxes: true,
				wireframe: true,
				background: '#000000',
				autoRotate: false,
				performanceMode: 'low',
			},
			mobile: {
				showGrid: false,
				showAxes: false,
				wireframe: false,
				background: null,
				autoRotate: false,
				performanceMode: 'balanced',
			},
		}
	}

	/**
	 * Apply UI preset
	 * @param {string} presetName - Name of the preset
	 * @param {object} context - Context objects (grid, axes, model, scene, controls)
	 */
	const applyUIPreset = (presetName, context = {}) => {
		const presets = getUIPresets()
		const preset = presets[presetName]

	if (!preset) {
		logger.warn('useUI', 'Unknown UI preset', { presetName })
		return
	}

		// Apply preset values
		showGrid.value = preset.showGrid
		showAxes.value = preset.showAxes
		wireframe.value = preset.wireframe
		background.value = preset.background
		autoRotate.value = preset.autoRotate
		performanceMode.value = preset.performanceMode

		// Apply to context objects
		if (context.grid) {
			context.grid.visible = showGrid.value
		}
		if (context.axes) {
			context.axes.visible = showAxes.value
		}
		if (context.model) {
			applyWireframe(context.model, wireframe.value)
		}
		if (context.scene) {
			setBackground(background.value, context.scene)
		}
		if (context.controls) {
			context.controls.autoRotate = autoRotate.value
			context.controls.autoRotateSpeed = autoRotateSpeed.value
		}

		logger.info('useUI', 'UI preset applied', { presetName, preset })
	}

	/**
	 * Reset UI to default state
	 * @param {object} context - Context objects
	 */
	const resetUI = (context = {}) => {
		applyUIPreset('default', context)
		logger.info('useUI', 'UI reset to default')
	}

	/**
	 * Get current UI state
	 * @return {object} Current UI state
	 */
	const getUIState = () => {
		return {
			showGrid: showGrid.value,
			showAxes: showAxes.value,
			wireframe: wireframe.value,
			background: background.value,
			autoRotate: autoRotate.value,
			autoRotateSpeed: autoRotateSpeed.value,
			performanceMode: performanceMode.value,
			toolbarVisible: toolbarVisible.value,
			settingsOpen: settingsOpen.value,
			helpOpen: helpOpen.value,
			isMobile: isMobile.value,
			mobileHintsVisible: mobileHintsVisible.value,
		}
	}

	/**
	 * Dispose of UI resources
	 */
	const dispose = () => {
		if (skeletonGroup.value) {
			disposeObject(skeletonGroup.value)
			skeletonGroup.value = null
		}

		logger.info('useUI', 'UI disposed')
	}

	return {
		// State
		showGrid: readonly(showGrid),
		showAxes: readonly(showAxes),
		wireframe: readonly(wireframe),
		background: readonly(background),
		autoRotate: readonly(autoRotate),
		autoRotateSpeed: readonly(autoRotateSpeed),
		performanceMode: readonly(performanceMode),
		toolbarVisible: readonly(toolbarVisible),
		settingsOpen: readonly(settingsOpen),
		helpOpen: readonly(helpOpen),
		skeletonLoading: readonly(skeletonLoading),
		skeletonGroup: readonly(skeletonGroup),
		isMobile: readonly(isMobile),
		mobileHintsVisible: readonly(mobileHintsVisible),

		// Computed
		isGridVisible,
		isAxesVisible,
		isWireframeMode,
		currentBackground,
		isAutoRotating,
		currentPerformanceMode,
		isToolbarVisible,
		isSettingsOpen,
		isHelpOpen,
		isSkeletonLoading,
		isMobileDevice,
		areMobileHintsVisible,

		// Methods
		initUI,
		toggleGrid,
		toggleAxes,
		toggleWireframe,
		applyWireframe,
		setBackground,
		toggleAutoRotate,
		setAutoRotateSpeed,
		setPerformanceMode,
		toggleToolbar,
		toggleSettings,
		toggleHelp,
		showSkeletonLoading,
		hideSkeletonLoading,
		toggleMobileHints,
		detectMobileDevice,
		getUIPresets,
		applyUIPreset,
		resetUI,
		getUIState,
		dispose,
	}
}
