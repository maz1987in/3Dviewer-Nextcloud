/**
 * Scene management composable
 * Handles Three.js scene setup, lighting, helpers, and scene management
 */

import { ref, computed } from 'vue'
import * as THREE from 'three'
import { logError } from '../utils/error-handler.js'
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

			logError('useScene', 'Scene initialized', {
				width,
				height,
				backgroundColor: backgroundColor.value,
				shadows: renderer.value.shadowMap.enabled,
				antialias: antialias.value,
			})
		} catch (error) {
			logError('useScene', 'Failed to initialize scene', error)
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

		// Ambient light
		const ambientLight = new THREE.AmbientLight(
			options.ambientColor ?? 0x404040,
			options.ambientIntensity ?? 0.6,
		)
		scene.value.add(ambientLight)
		lights.value.push(ambientLight)

		// Directional light
		const directionalLight = new THREE.DirectionalLight(
			options.directionalColor ?? 0xffffff,
			options.directionalIntensity ?? 0.8,
		)
		directionalLight.position.set(
			options.directionalPosition?.x ?? 10,
			options.directionalPosition?.y ?? 10,
			options.directionalPosition?.z ?? 5,
		)
		directionalLight.castShadow = options.directionalShadows ?? true

		if (directionalLight.castShadow) {
			directionalLight.shadow.mapSize.width = options.shadowMapSize ?? 2048
			directionalLight.shadow.mapSize.height = options.shadowMapSize ?? 2048
			directionalLight.shadow.camera.near = options.shadowCameraNear ?? 0.5
			directionalLight.shadow.camera.far = options.shadowCameraFar ?? 50
			directionalLight.shadow.camera.left = options.shadowCameraLeft ?? -10
			directionalLight.shadow.camera.right = options.shadowCameraRight ?? 10
			directionalLight.shadow.camera.top = options.shadowCameraTop ?? 10
			directionalLight.shadow.camera.bottom = options.shadowCameraBottom ?? -10
		}

		scene.value.add(directionalLight)
		lights.value.push(directionalLight)

		// Point light
		if (options.pointLight !== false) {
			const pointLight = new THREE.PointLight(
				options.pointColor ?? 0xffffff,
				options.pointIntensity ?? 0.5,
				options.pointDistance ?? 100,
			)
			pointLight.position.set(
				options.pointPosition?.x ?? -10,
				options.pointPosition?.y ?? 10,
				options.pointPosition?.z ?? -10,
			)
			scene.value.add(pointLight)
			lights.value.push(pointLight)
		}

		// Hemisphere light
		if (options.hemisphereLight) {
			const hemisphereLight = new THREE.HemisphereLight(
				options.hemisphereSkyColor ?? 0x87CEEB,
				options.hemisphereGroundColor ?? 0x362D1D,
				options.hemisphereIntensity ?? 0.3,
			)
			scene.value.add(hemisphereLight)
			lights.value.push(hemisphereLight)
		}

		logError('useScene', 'Lighting setup complete', {
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

		logError('useScene', 'Helpers setup complete', {
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
			const config = VIEWER_CONFIG.grid.dynamicSizing

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
			const gridOffset = VIEWER_CONFIG.grid.groundOffset

			// Remove old grid
			scene.value.remove(grid.value)

			// Create new grid
			grid.value = new THREE.GridHelper(gridSize, divisions)
			grid.value.material.color.setHex(0x00ff00)
			grid.value.material.opacity = 1.0
			grid.value.material.transparent = false
			grid.value.position.y = groundLevel + gridOffset

			scene.value.add(grid.value)

			logError('useScene', 'Grid size updated', {
				gridSize,
				divisions,
				maxDim,
				groundLevel: grid.value.position.y,
			})
		} catch (error) {
			logError('useScene', 'Failed to update grid size', error)
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
		logError('useScene', 'Background set', { background })
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

		logError('useScene', 'Fog added', { color, near, far })
	}

	/**
	 * Remove fog from the scene
	 */
	const removeFog = () => {
		if (!scene.value) return

		scene.value.fog = null
		fog.value = null

		logError('useScene', 'Fog removed')
	}

	/**
	 * Add object to scene
	 * @param {THREE.Object3D} object - Object to add
	 */
	const addObject = (object) => {
		if (!scene.value || !object) return

		scene.value.add(object)
		logError('useScene', 'Object added to scene', {
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
		logError('useScene', 'Object removed from scene', {
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
		logError('useScene', 'Scene resized', { width, height })
	}

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

		logError('useScene', 'Scene disposed')
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
		addFog,
		removeFog,
		addObject,
		removeObject,
		onWindowResize,
		render,
		getSceneStats,
		dispose,
	}
	
	return composableReturn
}
