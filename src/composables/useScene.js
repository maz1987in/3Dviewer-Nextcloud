/**
 * Scene management composable
 * Handles Three.js scene setup, lighting, helpers, and scene management
 */

import { ref, computed } from 'vue'
import * as THREE from 'three'
import { disposeObject } from '../utils/three-utils.js'
import { logger } from '../utils/logger.js'
import { throttle } from '../utils/mathHelpers.js'
import { clearRaycastCache } from '../utils/modelScaleUtils.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'

export function useScene() {
	// Scene state
	const scene = ref(null)
	const renderer = ref(null)
	const grid = ref(null)
	const axes = ref(null)
	const lights = ref([])
	const helpers = ref([])

	// Scene settings
	const backgroundColor = ref(null)
	const fog = ref(null)
	const shadows = ref(true)
	const antialias = ref(true)

	// Performance state
	const frameCount = ref(0)
	const lastTime = ref(0)
	const fps = ref(0)

	// Computed properties
	const isSceneReady = computed(() => scene.value !== null && renderer.value !== null)
	const hasGrid = computed(() => grid.value !== null)
	const hasAxes = computed(() => axes.value !== null)
	const lightCount = computed(() => lights.value.length)
	const helperCount = computed(() => helpers.value.length)
	const currentFPS = computed(() => fps.value)

	/**
	 * Initialize the Three.js scene
	 * @param {HTMLElement} container - Container element
	 * @param {object} options - Scene options
	 */
	const initScene = (container, options = {}) => {
		try {
			// Create scene
			scene.value = new THREE.Scene()

			// Set background
			if (options.backgroundColor) {
				scene.value.background = new THREE.Color(options.backgroundColor)
				backgroundColor.value = options.backgroundColor
			}

			// Add fog if specified
			if (options.fog) {
				scene.value.fog = new THREE.Fog(0x000000, 1, 1000)
				fog.value = scene.value.fog
			}

			// Create renderer
			const width = container.clientWidth
			const height = container.clientHeight

			renderer.value = new THREE.WebGLRenderer({
				antialias: options.antialias ?? true,
				alpha: options.alpha ?? true,
				powerPreference: options.powerPreference ?? 'high-performance',
				preserveDrawingBuffer: true, // Required for screenshots
			})

			renderer.value.setSize(width, height)
			renderer.value.setPixelRatio(Math.min(window.devicePixelRatio, 2))
			renderer.value.shadowMap.enabled = options.shadows ?? true
			renderer.value.shadowMap.type = THREE.PCFSoftShadowMap
			renderer.value.outputColorSpace = THREE.SRGBColorSpace

			container.appendChild(renderer.value.domElement)

			// Setup lighting
			setupLighting(options.lighting)

			// Setup helpers
			setupHelpers(options.helpers)

			logger.info('useScene', 'Scene initialized', {
				width,
				height,
				backgroundColor: backgroundColor.value,
				shadows: renderer.value.shadowMap.enabled,
				antialias: antialias.value,
			})
		} catch (error) {
			logger.error('useScene', 'Failed to initialize scene', error)
			throw error
		}
	}

	/**
	 * Setup scene lighting
	 * @param {object} options - Lighting options
	 */
	const setupLighting = (options = {}) => {
		if (!scene.value) return

		// Clear existing lights
		lights.value.forEach(light => {
			scene.value.remove(light)
		})
		lights.value = []

		// Use config values with optional overrides
		const lightingConfig = VIEWER_CONFIG.lighting

		// Ambient light
		const ambientLight = new THREE.AmbientLight(
			options.ambientColor ?? lightingConfig.ambient.color,
			options.ambientIntensity ?? lightingConfig.ambient.intensity,
		)
		scene.value.add(ambientLight)
		lights.value.push(ambientLight)

		// Directional light
		const directionalLight = new THREE.DirectionalLight(
			options.directionalColor ?? lightingConfig.directional.color,
			options.directionalIntensity ?? lightingConfig.directional.intensity,
		)
		directionalLight.position.set(
			options.directionalPosition?.x ?? lightingConfig.directional.position.x,
			options.directionalPosition?.y ?? lightingConfig.directional.position.y,
			options.directionalPosition?.z ?? lightingConfig.directional.position.z,
		)
		directionalLight.castShadow = options.directionalShadows ?? lightingConfig.directional.castShadow

		if (directionalLight.castShadow) {
			directionalLight.shadow.mapSize.width = options.shadowMapSize ?? lightingConfig.directional.shadowMapSize
			directionalLight.shadow.mapSize.height = options.shadowMapSize ?? lightingConfig.directional.shadowMapSize
			directionalLight.shadow.camera.near = options.shadowCameraNear ?? lightingConfig.directional.shadowCameraNear
			directionalLight.shadow.camera.far = options.shadowCameraFar ?? lightingConfig.directional.shadowCameraFar
			directionalLight.shadow.camera.left = options.shadowCameraLeft ?? lightingConfig.directional.shadowCameraLeft
			directionalLight.shadow.camera.right = options.shadowCameraRight ?? lightingConfig.directional.shadowCameraRight
			directionalLight.shadow.camera.top = options.shadowCameraTop ?? lightingConfig.directional.shadowCameraTop
			directionalLight.shadow.camera.bottom = options.shadowCameraBottom ?? lightingConfig.directional.shadowCameraBottom
		}

		scene.value.add(directionalLight)
		lights.value.push(directionalLight)

		// Point light
		if (options.pointLight !== false && lightingConfig.point.enabled) {
			const pointLight = new THREE.PointLight(
				options.pointColor ?? lightingConfig.point.color,
				options.pointIntensity ?? lightingConfig.point.intensity,
				options.pointDistance ?? lightingConfig.point.distance,
			)
			pointLight.position.set(
				options.pointPosition?.x ?? lightingConfig.point.position.x,
				options.pointPosition?.y ?? lightingConfig.point.position.y,
				options.pointPosition?.z ?? lightingConfig.point.position.z,
			)
			scene.value.add(pointLight)
			lights.value.push(pointLight)
		}

		// Hemisphere light
		if (options.hemisphereLight || lightingConfig.hemisphere.enabled) {
			const hemisphereLight = new THREE.HemisphereLight(
				options.hemisphereSkyColor ?? lightingConfig.hemisphere.skyColor,
				options.hemisphereGroundColor ?? lightingConfig.hemisphere.groundColor,
				options.hemisphereIntensity ?? lightingConfig.hemisphere.intensity,
			)
			scene.value.add(hemisphereLight)
			lights.value.push(hemisphereLight)
		}

		logger.info('useScene', 'Lighting setup complete', {
			lightCount: lights.value.length,
			shadows: directionalLight.castShadow,
		})
	}

	/**
	 * Setup scene helpers
	 * @param {object} options - Helper options
	 */
	const setupHelpers = (options = {}) => {
		if (!scene.value) return

		// Clear existing helpers
		helpers.value.forEach(helper => {
			scene.value.remove(helper)
		})
		helpers.value = []

		// Grid helper
		if (options.grid !== false) {
			const gridSize = options.gridSize ?? VIEWER_CONFIG.grid.defaultSize
			const gridDivisions = options.gridDivisions ?? VIEWER_CONFIG.grid.defaultDivisions
			const gridColorCenterLine = options.gridColorCenterLine ?? VIEWER_CONFIG.grid.colorCenterLine
			const gridColorGrid = options.gridColorGrid ?? VIEWER_CONFIG.grid.colorGrid

			grid.value = new THREE.GridHelper(gridSize, gridDivisions, gridColorCenterLine, gridColorGrid)
			grid.value.material.opacity = options.gridOpacity ?? VIEWER_CONFIG.grid.opacity
			grid.value.material.transparent = options.gridTransparent ?? VIEWER_CONFIG.grid.transparent
			scene.value.add(grid.value)
			helpers.value.push(grid.value)
		}

		// Axes helper
		if (options.axes !== false) {
			const axesSize = options.axesSize ?? VIEWER_CONFIG.axes.size
			axes.value = new THREE.AxesHelper(axesSize)
			scene.value.add(axes.value)
			helpers.value.push(axes.value)
		}

		// Light helpers (for debugging)
		if (options.lightHelpers) {
			lights.value.forEach(light => {
				let helper = null
				if (light instanceof THREE.DirectionalLight) {
					helper = new THREE.DirectionalLightHelper(light, 1)
				} else if (light instanceof THREE.PointLight) {
					helper = new THREE.PointLightHelper(light, 1)
				} else if (light instanceof THREE.HemisphereLight) {
					helper = new THREE.HemisphereLightHelper(light, 1)
				}

				if (helper) {
					scene.value.add(helper)
					helpers.value.push(helper)
				}
			})
		}

		logger.info('useScene', 'Helpers setup complete', {
			helperCount: helpers.value.length,
			hasGrid: !!grid.value,
			hasAxes: !!axes.value,
		})
	}

	/**
	 * Update grid size based on model dimensions
	 * @param {THREE.Object3D} model - Model to base grid size on
	 */
	const updateGridSize = (model) => {
		if (!grid.value || !model) return

		try {
			const box = new THREE.Box3().setFromObject(model)
			const size = box.getSize(new THREE.Vector3())
			const maxDim = Math.max(size.x, size.y, size.z)

			// Determine grid size based on model dimensions
			let gridSize, divisions
			const config = VIEWER_CONFIG.gridDynamicSizing

			if (maxDim < config.smallModelThreshold) {
				gridSize = config.smallGridSize
				divisions = config.smallGridDivisions
			} else if (maxDim < config.mediumModelThreshold) {
				gridSize = config.mediumGridSize
				divisions = config.mediumGridDivisions
			} else if (maxDim < config.largeModelThreshold) {
				gridSize = config.largeGridSize
				divisions = config.largeGridDivisions
			} else {
				gridSize = config.veryLargeGridSize
				divisions = config.veryLargeGridDivisions
			}

			// Ensure grid size is even
			if (gridSize % 2 !== 0) {
				gridSize += 1
			}

			// Position grid at ground level
			const center = box.getCenter(new THREE.Vector3())
			const groundLevel = center.y - size.y / 2
			const gridOffset = config.groundOffset

			// Remove old grid
			scene.value.remove(grid.value)

			// Create new grid
			grid.value = new THREE.GridHelper(gridSize, divisions)
			grid.value.material.color.setHex(0x00ff00)
			grid.value.material.opacity = 1.0
			grid.value.material.transparent = false
			grid.value.position.y = groundLevel + gridOffset

			scene.value.add(grid.value)

			logger.info('useScene', 'Grid size updated', {
				gridSize,
				divisions,
				maxDim,
				groundLevel: grid.value.position.y,
			})
		} catch (error) {
			logger.error('useScene', 'Failed to update grid size', error)
		}
	}

	/**
	 * Set scene background
	 * @param {string|THREE.Color|THREE.Texture} background - Background color, texture, or null
	 */
	const setBackground = (background) => {
		if (!scene.value) return

		if (typeof background === 'string') {
			scene.value.background = new THREE.Color(background)
		} else {
			scene.value.background = background
		}

		backgroundColor.value = background
		logger.info('useScene', 'Background set', { background })
	}

	/**
	 * Add fog to the scene
	 * @param {object} options - Fog options
	 */
	const addFog = (options = {}) => {
		if (!scene.value) return

		const color = options.color ?? 0x000000
		const near = options.near ?? 1
		const far = options.far ?? 1000

		scene.value.fog = new THREE.Fog(color, near, far)
		fog.value = scene.value.fog

		logger.info('useScene', 'Fog added', { color, near, far })
	}

	/**
	 * Remove fog from the scene
	 */
	const removeFog = () => {
		if (!scene.value) return

		scene.value.fog = null
		fog.value = null

		logger.info('useScene', 'Fog removed')
	}

	/**
	 * Add object to scene
	 * @param {THREE.Object3D} object - Object to add
	 * @throws {Error} If scene not initialized or object is invalid
	 */
	const addObject = (object) => {
		if (!scene.value) {
			logger.error('useScene', 'Scene not initialized')
			throw new Error('Scene must be initialized before adding objects')
		}
		if (!object) {
			logger.error('useScene', 'No object provided to add to scene')
			throw new Error('Object is required')
		}
		if (!(object instanceof THREE.Object3D)) {
			logger.error('useScene', 'Invalid object type provided')
			throw new Error('Object must be an instance of THREE.Object3D')
		}

		scene.value.add(object)

		// Clear raycast cache since scene structure changed
		clearRaycastCache()

		logger.info('useScene', 'Object added to scene', {
			type: object.constructor.name,
			children: object.children.length,
		})
	}

	/**
	 * Remove object from scene
	 * @param {THREE.Object3D} object - Object to remove
	 */
	const removeObject = (object) => {
		if (!scene.value || !object) return

		scene.value.remove(object)

		// Clear raycast cache since scene structure changed
		clearRaycastCache()

		logger.info('useScene', 'Object removed from scene', {
			type: object.constructor.name,
		})
	}

	/**
	 * Update scene on window resize
	 * @param {number} width - New width
	 * @param {number} height - New height
	 */
	const onWindowResize = (width, height) => {
		if (!renderer.value) return

		renderer.value.setSize(width, height)
		logger.info('useScene', 'Scene resized', { width, height })
	}

	/**
	 * Throttled version of window resize handler
	 * Limits resize updates to prevent excessive re-renders during window dragging
	 */
	const throttledResize = throttle(onWindowResize, 100)

	/**
	 * Render the scene
	 * @param {THREE.Camera} camera - Camera to render with
	 */
	const render = (camera) => {
		if (!renderer.value || !scene.value || !camera) return

		renderer.value.render(scene.value, camera)

		// Update FPS counter
		updateFPS()
	}

	/**
	 * Update FPS counter
	 */
	const updateFPS = () => {
		frameCount.value++
		const currentTime = performance.now()

		if (currentTime - lastTime.value >= 1000) {
			fps.value = Math.round((frameCount.value * 1000) / (currentTime - lastTime.value))
			frameCount.value = 0
			lastTime.value = currentTime
		}
	}

	/**
	 * Get scene statistics
	 * @return {object} Scene statistics
	 */
	const getSceneStats = () => {
		if (!scene.value) return null

		let meshCount = 0
		let vertexCount = 0
		let faceCount = 0

		scene.value.traverse((child) => {
			if (child.isMesh) {
				meshCount++
				if (child.geometry) {
					if (child.geometry.attributes.position) {
						vertexCount += child.geometry.attributes.position.count
					}
					if (child.geometry.index) {
						faceCount += child.geometry.index.count / 3
					} else {
						faceCount += child.geometry.attributes.position.count / 3
					}
				}
			}
		})

		return {
			meshCount,
			vertexCount,
			faceCount,
			lightCount: lights.value.length,
			helperCount: helpers.value.length,
			fps: fps.value,
		}
	}

	/**
	 * Apply theme to scene background
	 * @param {string} theme - 'light' or 'dark'
	 */
	const applyThemeToScene = (theme) => {
		if (!scene.value) return

		const themeColors = VIEWER_CONFIG.theme[theme] || VIEWER_CONFIG.theme.light

		if (themeColors.background) {
			scene.value.background = new THREE.Color(themeColors.background)
			backgroundColor.value = themeColors.background

			logger.info('useScene', 'Scene theme applied', {
				theme,
				background: themeColors.background,
			})
		}
	}

	/**
	 * Dispose of scene resources
	 */
	const dispose = () => {
		// Dispose of renderer
		if (renderer.value) {
			renderer.value.dispose()
			renderer.value = null
		}

		// Dispose of scene objects
		if (scene.value) {
			disposeObject(scene.value)
			scene.value = null
		}

		// Clear references
		grid.value = null
		axes.value = null
		lights.value = []
		helpers.value = []
		backgroundColor.value = null
		fog.value = null

		// Clear raycast cache when disposing scene
		clearRaycastCache()

		logger.info('useScene', 'Scene disposed')
	}

	const composableReturn = {
		// State - these are mutable by the composable's own methods, so don't use readonly
		scene,
		renderer,
		grid,
		axes,
		lights,
		helpers,
		backgroundColor,
		fog,
		shadows,
		antialias,
		fps,

		// Computed
		isSceneReady,
		hasGrid,
		hasAxes,
		lightCount,
		helperCount,
		currentFPS,

		// Methods
		initScene,
		setupLighting,
		setupHelpers,
		updateGridSize,
		setBackground,
		applyThemeToScene,
		addFog,
		removeFog,
		addObject,
		removeObject,
		onWindowResize,
		throttledResize,
		render,
		getSceneStats,
		dispose,
	}

	return composableReturn
}
