<template>
	<div ref="container"
		class="three-viewer"
		:aria-label="t('threedviewer','3D viewer canvas container')"
		:class="{ 'mobile': isMobile }">
		<!-- Loading state -->
		<div v-if="isLoading"
			class="loading"
			aria-live="polite"
			:class="{ 'mobile': isMobile }">
			<div class="loading-content">
				<div class="loading-text">
					<div class="loading-stage">
						{{ getStageText(progress.stage) }}
					</div>
					<div class="loading-details">
						<span v-if="progress.message">{{ progress.message }}</span>
						<span v-else-if="progress.total > 0">{{ formatFileSize(progress.loaded) }} / {{ formatFileSize(progress.total) }}</span>
						<span v-else-if="progress.loaded > 0">{{ formatFileSize(progress.loaded) }}</span>
						<span v-else>{{ t('threedviewer', 'Loading 3D scene…') }}</span>
					</div>
					<!-- Show percentage when available -->
					<div v-if="progressPercentage > 0" class="loading-percentage">
						{{ progressPercentage }}%
					</div>
				</div>
				<!-- Nextcloud-style progress bar -->
				<NcProgressBar 
					:value="progressPercentage" 
					:max="100"
					size="medium"
					:aria-label="t('threedviewer','Model load progress')"
				/>
				<div class="loading-actions" :class="{ 'mobile': isMobile }">
					<NcButton
						v-if="progress.stage !== 'error'"
						type="error"
						:disabled="aborting"
						@click="cancelLoad">
						{{ aborting ? t('threedviewer','Canceling…') : t('threedviewer','Cancel loading') }}
					</NcButton>
					<NcButton
						v-if="progress.stage === 'error'"
						type="primary"
						@click="retryLoad">
						{{ t('threedviewer','Retry') }}
					</NcButton>
				</div>
			</div>
		</div>

		<!-- Error display -->
		<div v-if="hasError && errorState" class="error-display" :class="{ 'mobile': isMobile }">
			<div class="error-content">
				<div class="error-icon">
					⚠️
				</div>
				<div class="error-message">
					{{ errorState?.message || 'An error occurred' }}
				</div>
				<div v-if="errorState?.details" class="error-details">
					{{ errorState.details }}
				</div>
				<div v-if="errorState?.suggestions && errorState.suggestions.length > 0" class="error-suggestions">
					<div class="suggestions-title">
						{{ t('threedviewer', 'Suggestions:') }}
					</div>
					<ul class="suggestions-list">
						<li v-for="suggestion in errorState.suggestions" :key="suggestion" class="suggestion-item">
							{{ suggestion }}
						</li>
					</ul>
				</div>
				<div class="error-actions">
					<NcButton v-if="canRetry"
						type="primary"
						@click="retryLoad">
						{{ t('threedviewer','Retry') }}
					</NcButton>
					<NcButton
						type="secondary"
						@click="clearError">
						{{ t('threedviewer','Dismiss') }}
					</NcButton>
				</div>
			</div>
		</div>

		<!-- Comparison controls -->
		<div v-if="isComparisonMode && hasComparisonModel" class="comparison-controls" :class="{ 'mobile': isMobile }">
			<div class="comparison-buttons">
				<button class="comparison-btn" :title="t('threedviewer', 'Toggle original model')" @click="toggleOriginalModel">
					<span class="btn-icon">👁️</span>
					<span class="btn-text">{{ t('threedviewer', 'Original') }}</span>
				</button>
				<button class="comparison-btn" :title="t('threedviewer', 'Toggle comparison model')" @click="toggleComparisonModel">
					<span class="btn-icon">👁️</span>
					<span class="btn-text">{{ t('threedviewer', 'Comparison') }}</span>
				</button>
				<button class="comparison-btn" :title="t('threedviewer', 'Fit both models to view')" @click="fitBothModelsToView">
					<span class="btn-icon">📏</span>
					<span class="btn-text">{{ t('threedviewer', 'Fit Both') }}</span>
				</button>
			</div>
		</div>

	<!-- Performance Stats Overlay (Dev/Debug) -->
	<div v-if="performance && currentFPS > 0" class="performance-stats">
		<div class="stats-header">
			<span class="stats-icon">📊</span>
			<span class="stats-title">Performance</span>
			<span class="stats-mode" :class="'mode-' + currentPerformanceMode">{{ currentPerformanceMode }}</span>
		</div>
		<div class="stats-grid">
			<div class="stat-item">
				<span class="stat-label">FPS:</span>
				<span class="stat-value" :class="{ 'good': currentFPS >= 60, 'warning': currentFPS >= 30 && currentFPS < 60, 'poor': currentFPS < 30 }">
					{{ currentFPS }}
				</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Frame:</span>
				<span class="stat-value">{{ currentFrameTime?.toFixed(1) }}ms</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Memory:</span>
				<span class="stat-value">{{ currentMemoryUsage?.toFixed(1) }}MB</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Quality:</span>
				<span class="stat-value">{{ currentPixelRatio?.toFixed(2) }}x</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Draws:</span>
				<span class="stat-value">{{ currentDrawCalls }}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Triangles:</span>
				<span class="stat-value">{{ (currentTriangles / 1000).toFixed(1) }}K</span>
			</div>
		</div>
	</div>		<!-- Mobile gesture hints -->
		<div v-if="isMobile && !isLoading && modelRoot" class="mobile-hints">
			<div class="hint-item">
				<span class="hint-icon">👆</span>
				<span class="hint-text">{{ t('threedviewer', 'Drag to rotate') }}</span>
			</div>
			<div class="hint-item">
				<span class="hint-icon">🤏</span>
				<span class="hint-text">{{ t('threedviewer', 'Pinch to zoom') }}</span>
			</div>
			<div class="hint-item">
				<span class="hint-icon">👆👆</span>
				<span class="hint-text">{{ t('threedviewer', 'Double tap to reset') }}</span>
			</div>
		</div>

		<!-- Measurement overlay -->
		<div v-if="measurementActive && measurements.length > 0" class="measurement-overlay" :class="{ 'mobile': isMobile }">
			<div class="measurement-header">
				<h3>{{ t('threedviewer', 'Measurements') }}</h3>
				<div class="measurement-controls">
					<select v-model="currentUnitModel" 
						class="unit-selector"
						@change="handleUnitChange">
						<option v-for="unit in availableUnits" 
							:key="unit.value" 
							:value="unit.value">
							{{ unit.label }}
						</option>
					</select>
					<button type="button"
						class="clear-measurements-btn"
						:class="{ 'mobile': isMobile }"
						@click="measurement.clearAllMeasurements">
						{{ t('threedviewer', 'Clear All') }}
					</button>
				</div>
			</div>
			<div class="measurement-list">
				<div v-for="(m, index) in measurements" :key="m.id" class="measurement-item">
					<div class="measurement-info">
						<span class="measurement-label">{{ t('threedviewer', 'Measurement') }} {{ index + 1 }}</span>
						<button type="button"
							class="delete-measurement-btn"
							:class="{ 'mobile': isMobile }"
							@click="deleteMeasurement(m.id)">
							{{ t('threedviewer', 'Delete') }}
						</button>
					</div>
					<div class="measurement-details">
						<span class="measurement-distance">{{ m.formatted || (m.distance.toFixed(2) + ' units') }}</span>
						<div class="measurement-point">
							<span class="point-label">{{ t('threedviewer', 'Point 1') }}:</span>
							<span class="point-coords">({{ m.point1.x.toFixed(2) }}, {{ m.point1.y.toFixed(2) }}, {{ m.point1.z.toFixed(2) }})</span>
						</div>
						<div class="measurement-point">
							<span class="point-label">{{ t('threedviewer', 'Point 2') }}:</span>
							<span class="point-coords">({{ m.point2.x.toFixed(2) }}, {{ m.point2.y.toFixed(2) }}, {{ m.point2.z.toFixed(2) }})</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Annotation overlay -->
		<div v-if="annotationActive && annotations.length > 0" class="annotation-overlay" :class="{ 'mobile': isMobile }">
			<div class="annotation-header">
				<h3>{{ t('threedviewer', 'Annotations') }}</h3>
				<button type="button"
					class="clear-annotations-btn"
					:class="{ 'mobile': isMobile }"
					@click="clearAllAnnotations">
					{{ t('threedviewer', 'Clear All') }}
				</button>
			</div>
			<div class="annotation-list">
				<div v-for="(annotation, index) in annotations" :key="annotation.id" class="annotation-item">
					<div class="annotation-info">
						<span class="annotation-label">{{ t('threedviewer', 'Annotation') }} {{ index + 1 }}</span>
						<button type="button"
							class="delete-annotation-btn"
							:class="{ 'mobile': isMobile }"
							@click="deleteAnnotation(annotation.id)">
							{{ t('threedviewer', 'Delete') }}
						</button>
					</div>
					<div class="annotation-details">
						<input
							v-model="annotation.text"
							class="annotation-text-input"
							:placeholder="t('threedviewer', 'Enter annotation text...')"
							@blur="updateAnnotationText(annotation.id, annotation.text)">
						<div class="annotation-point">
							<span class="point-label">{{ t('threedviewer', 'Position') }}:</span>
							<span class="point-coords">({{ annotation.point.x.toFixed(2) }}, {{ annotation.point.y.toFixed(2) }}, {{ annotation.point.z.toFixed(2) }})</span>
						</div>
					</div>
				</div>
			</div>
		</div>

	</div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import * as THREE from 'three'
import { NcProgressBar, NcButton } from '@nextcloud/vue'
import { useCamera } from '../composables/useCamera.js'
import { useModelLoading } from '../composables/useModelLoading.js'
import { useComparison } from '../composables/useComparison.js'
import { useMeasurement } from '../composables/useMeasurement.js'
import { useAnnotation } from '../composables/useAnnotation.js'
import { usePerformance } from '../composables/usePerformance.js'
import { logger } from '../utils/logger.js'

export default {
	name: 'ThreeViewerRefactored',
	components: {
		NcProgressBar,
		NcButton,
	},
	props: {
		fileId: { type: [Number, String], default: null },
		filename: { type: String, default: null },
		dir: { type: String, default: null },
		showGrid: { type: Boolean, default: true },
		showAxes: { type: Boolean, default: true },
		wireframe: { type: Boolean, default: false },
		background: { type: String, default: null },
		measurementMode: { type: Boolean, default: false },
		annotationMode: { type: Boolean, default: false },
		comparisonMode: { type: Boolean, default: false },
		performanceMode: { type: String, default: 'auto' },
	},
	emits: ['model-loaded', 'error', 'view-reset', 'fit-to-view', 'toggle-auto-rotate', 'change-preset', 'toggle-grid', 'axes-toggle', 'wireframe-toggle', 'background-change', 'toggle-measurement', 'toggle-annotation', 'toggle-comparison', 'toggle-performance', 'dismiss', 'push-toast'],
	setup(props, { emit }) {
		// Refs
		const container = ref(null)
		const scene = ref(null)
		const renderer = ref(null)
		const grid = ref(null)
		const axes = ref(null)
		const modelRoot = ref(null)
		const aborting = ref(false)
		const initializing = ref(true) // Show loading during initial setup
		const animationFrameId = ref(null) // Track animation frame for cleanup

		// Composables
		const camera = useCamera()
		const modelLoading = useModelLoading()
		const comparison = useComparison()
		const measurement = useMeasurement()
		const annotation = useAnnotation()
		const performance = usePerformance()

		// Computed properties
		const isMobile = computed(() => camera.isMobile.value)
		const isLoading = computed(() => initializing.value || modelLoading.isLoading.value)
		const hasError = computed(() => modelLoading.hasError.value)
		const canRetry = computed(() => modelLoading.canRetry.value)
		const progress = computed(() => {
			if (initializing.value && !modelLoading.isLoading.value) {
				return { loaded: 0, total: 0, message: 'Initializing viewer...' }
			}
			return modelLoading.progress.value
		})
		const progressPercentage = computed(() => modelLoading.progressPercentage.value)
		const errorState = computed(() => modelLoading.errorState.value)
		const isComparisonMode = computed(() => comparison.comparisonMode.value)
		const hasComparisonModel = computed(() => comparison.comparisonModel.value !== null)
		const availableUnits = computed(() => measurement.getAvailableUnits())
		const currentUnitModel = computed({
			get: () => measurement.currentUnit.value,
			set: (value) => { measurement.currentUnit.value = value },
		})

		// Methods
		const init = async () => {
			try {
				// Initialize decoders
				await modelLoading.initDecoders()

				// Setup Three.js scene
				await setupScene()

				// Initialize camera
				const width = container.value.clientWidth || container.value.offsetWidth || 800
				const height = container.value.clientHeight || container.value.offsetHeight || 600
				camera.initCamera(width, height, isMobile.value)

				// Setup controls
				await camera.setupControls(renderer.value)

			// Initialize measurement system
			measurement.init(scene.value)

			// Initialize annotation system
			annotation.init(scene.value)

		// Initialize performance monitoring
		performance.initPerformance(renderer.value)
		
		// Set initial performance mode (pass renderer for auto mode detection)
		performance.setPerformanceMode(props.performanceMode, renderer.value)
		
		// Log performance monitoring status
		logger.info('ThreeViewer', 'Performance monitoring initialized', {
			mode: props.performanceMode,
			monitoring: 'ACTIVE',
			fps: 'Tracking started',
			overlay: 'Visible in bottom-left corner'
		})

	// Load model if fileId provided
	if (props.fileId) {
		await loadModel(props.fileId)
	}
	
	// Initialization complete - hide loading indicator
	initializing.value = false

	// Start animation loop
	animate()			// Setup event listeners
			setupEventListeners()

			logger.info('ThreeViewer', 'Initialization complete')
		} catch (error) {
			initializing.value = false // Hide loading on error too
			logger.error('ThreeViewer', 'Initialization failed', error)
			emit('error', error)
		}
	}

	const setupScene = async () => {
		try {
			// Create scene
			scene.value = new THREE.Scene()
			
			// Background will be set via props or remain null (transparent)
			scene.value.background = props.background ? new THREE.Color(props.background) : null
			
			// Ensure container has proper dimensions
			const containerWidth = container.value.clientWidth || container.value.offsetWidth || 800
			const containerHeight = container.value.clientHeight || container.value.offsetHeight || 600

			// Create renderer
			renderer.value = new THREE.WebGLRenderer({
				antialias: true,
				alpha: true,
				powerPreference: 'high-performance',
			})

			// Set initial size - this will set pixel ratio to window.devicePixelRatio by default
			// but initPerformance() will immediately override it with the detected optimal ratio
			renderer.value.setSize(containerWidth, containerHeight)
			// Note: pixel ratio will be overridden by initPerformance() based on auto-detection
			renderer.value.shadowMap.enabled = true
			renderer.value.shadowMap.type = THREE.PCFSoftShadowMap

			container.value.appendChild(renderer.value.domElement)

			// Setup lighting
			setupLighting()

			// Setup grid and axes
			setupHelpers()

			logger.info('ThreeViewer', 'Scene setup complete')
		} catch (error) {
			logger.error('ThreeViewer', 'Failed to setup scene', error)
			throw error
		}
	}

		const setupLighting = () => {
			// Ambient light - increased intensity to match ViewerComponent
			const ambientLight = new THREE.AmbientLight(0x404040, 2.0)
			scene.value.add(ambientLight)

			// Directional light - increased intensity to match ViewerComponent
			const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0)
			directionalLight.position.set(10, 10, 5)
			directionalLight.castShadow = true
			directionalLight.shadow.mapSize.width = 2048
			directionalLight.shadow.mapSize.height = 2048
			scene.value.add(directionalLight)

			// Point light
			const pointLight = new THREE.PointLight(0xffffff, 0.5, 100)
			pointLight.position.set(-10, 10, -10)
			scene.value.add(pointLight)
		}

		const setupHelpers = () => {
			// Grid helper
			if (props.showGrid) {
				grid.value = new THREE.GridHelper(10, 10)
				grid.value.material.color.setHex(0x00ff00)
				grid.value.material.opacity = 1.0
				grid.value.material.transparent = false
				scene.value.add(grid.value)
			}

			// Axes helper
			if (props.showAxes) {
				axes.value = new THREE.AxesHelper(5)
				scene.value.add(axes.value)
			}
		}

		/**
		 * Load a 3D model from file ID
		 * @param {string|number} fileId - Nextcloud file ID
		 */
		const loadModel = async (fileId) => {
			try {
				// Get the filename from props or URL
				const fullPath = props.filename ? decodeURIComponent(props.filename) : 'model.glb'
				
				// Extract directory and filename
				// fullPath might be like "/3d_test/capsule/capsule.obj" or just "model.obj"
				const pathParts = fullPath.split('/').filter(p => p) // Remove empty strings
				const filename = pathParts.pop() // Get the actual filename
				
				// Reconstruct directory path with leading slash if it was present
				let dirPath
				if (fullPath.startsWith('/')) {
					dirPath = '/' + pathParts.join('/')
				} else {
					dirPath = pathParts.join('/') || (props.dir || 'Models')
				}
				
				const extension = filename.split('.').pop().toLowerCase()

				logger.info('ThreeViewer', 'Loading model', {
					fileId,
					filename,
					fullPath,
					dirPath,
					extension,
					userId: window.OC?.getCurrentUser?.()?.uid || 'admin',
					propsFilename: props.filename,
				})

				// Use the model loading composable which has proper progress tracking
				const loadedModel = await modelLoading.loadModelFromFileId(fileId, fullPath, {
					fileId,
					filename,
					dir: dirPath,
					THREE,
				})

				if (loadedModel && loadedModel.object3D) {
					// Add the loaded model to the scene
					modelRoot.value = loadedModel.object3D
					scene.value.add(modelRoot.value)

					// Fit camera to object
					camera.fitCameraToObject(modelRoot.value)

					// Update grid size
					updateGridSize(modelRoot.value)

					emit('model-loaded', { fileId, filename })
					logger.info('ThreeViewer', 'Model loaded successfully')
				} else {
					// Fallback to demo scene if model loading failed
					createDemoScene(fileId)
				}
			} catch (error) {
				// Don't log error if it was a user-initiated cancellation
				if (error.name !== 'AbortError') {
					logger.error('ThreeViewer', 'Failed to load model', error)
					emit('error', error)
				}
			}
		}

		const createDemoScene = (fileId) => {
			try {
				// Create a simple demo scene
				const geometry = new THREE.BoxGeometry(1, 1, 1)
				const material = new THREE.MeshLambertMaterial({ color: 0x00ff00 })
				const cube = new THREE.Mesh(geometry, material)

				modelRoot.value = new THREE.Group()
				modelRoot.value.add(cube)
				scene.value.add(modelRoot.value)

				// Fit camera to object
				camera.fitCameraToObject(modelRoot.value)

				// Update grid size
				updateGridSize(modelRoot.value)

				emit('model-loaded', { fileId, filename: 'demo.glb' })
				logger.info('ThreeViewer', 'Demo scene created')
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to create demo scene', error)
				emit('error', error)
			}
		}

		/**
		 * Dynamically update grid size based on model dimensions
		 * @param {THREE.Object3D} obj - 3D object to fit grid to
		 */
		const updateGridSize = (obj) => {
			if (!grid.value || !obj) return

			try {
				const box = new THREE.Box3().setFromObject(obj)
				
				// Validate bounding box
				if (box.isEmpty()) {
					logger.warn('ThreeViewer', 'Cannot update grid: model bounding box is empty')
					return
				}

				const size = box.getSize(new THREE.Vector3())
				const center = box.getCenter(new THREE.Vector3())
				const maxDim = Math.max(size.x, size.y, size.z)

				// Dynamic grid sizing based on model size
				let gridSize, divisions
				if (maxDim < 5) {
					gridSize = 10
					divisions = 10
				} else if (maxDim < 20) {
					gridSize = 20
					divisions = 20
				} else if (maxDim < 100) {
					gridSize = 100
					divisions = 25
				} else if (maxDim < 500) {
					gridSize = Math.ceil(maxDim * 1.5) // 1.5x model size
					divisions = 50
				} else {
					gridSize = Math.ceil(maxDim * 2) // 2x model size for very large models
					divisions = 100
				}

				// Calculate grid position at the bottom of the model
				const gridY = center.y - (size.y / 2) - 0.1 // Slightly below the bottom of the model

				// Validate grid position to prevent NaN
				if (!isFinite(gridY) || !isFinite(center.x) || !isFinite(center.z)) {
					logger.error('ThreeViewer', 'Invalid grid position calculated', { gridY, center })
					return
				}

				// Update grid
				scene.value.remove(grid.value)
				grid.value = new THREE.GridHelper(gridSize, divisions)
				grid.value.material.color.setHex(0x00ff00)
				grid.value.material.opacity = 1.0
				grid.value.material.transparent = false

				// Position grid at the bottom of the model
				grid.value.position.set(center.x, gridY, center.z)

				scene.value.add(grid.value)

				logger.info('ThreeViewer', 'Grid size updated', {
					gridSize,
					divisions,
					maxDim,
					modelCenter: { x: center.x, y: center.y, z: center.z },
					gridPosition: { x: center.x, y: gridY, z: center.z },
				})
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to update grid size', error)
			}
		}

	const animate = () => {
		animationFrameId.value = requestAnimationFrame(animate)

		// Update controls
		camera.updateControls()

		// Render scene
		camera.render(renderer.value, scene.value)

		// Update performance metrics after rendering (throttled)
		if (performance && typeof performance.updatePerformanceMetrics === 'function') {
			performance.updatePerformanceMetrics(renderer.value, scene.value)
		}
	}

		const setupEventListeners = () => {
			window.addEventListener('resize', onWindowResize)
			
			// Add click handler for measurement and annotation
			if (renderer.value && renderer.value.domElement) {
				renderer.value.domElement.addEventListener('click', onCanvasClick)
			}
		}

	const onWindowResize = () => {
		const width = container.value.clientWidth
		const height = container.value.clientHeight

		camera.onWindowResize(width, height)
		
		// Preserve pixel ratio by using setSize with updateStyle=false
		// This prevents setSize from resetting pixel ratio to window.devicePixelRatio
		renderer.value.setSize(width, height, false)
		
		logger.info('ThreeViewer', 'Window resized', {
			width,
			height,
			pixelRatio: renderer.value.getPixelRatio(),
		})
		
		// Re-adjust overlay positioning on window resize
		adjustOverlayPositioning()
	}

	/**
	 * Dynamically adjust overlay positioning to avoid toolbar overlap
	 */
	const adjustOverlayPositioning = () => {
		// Wait for DOM to be ready and add a small delay to ensure toolbar is fully rendered
		nextTick(() => {
			setTimeout(() => {
				const toolbar = document.querySelector('.viewer-toolbar')
				const appHeader = document.querySelector('#header')
				const nextcloudHeader = document.querySelector('#header')
				
				let totalHeaderHeight = 0
				
				// Check for Nextcloud header height
				if (nextcloudHeader) {
					const headerRect = nextcloudHeader.getBoundingClientRect()
					totalHeaderHeight += headerRect.height
				}
				
				// Check for viewer toolbar height
				if (toolbar) {
					const toolbarRect = toolbar.getBoundingClientRect()
					totalHeaderHeight += toolbarRect.height
				}
				
				// Calculate safe spacing: total header height + padding (more conservative)
				const safeTopSpacing = Math.max(180, totalHeaderHeight + 50)
				
				// Update CSS custom property
				document.documentElement.style.setProperty('--overlay-top-spacing', `${safeTopSpacing}px`)
				
				// For mobile, use a slightly smaller spacing but ensure minimum
				const mobileSpacing = Math.max(140, safeTopSpacing - 30)
				document.documentElement.style.setProperty('--overlay-mobile-top-spacing', `${mobileSpacing}px`)
				
				logger.info('ThreeViewer', 'Adjusted overlay positioning', {
					totalHeaderHeight,
					safeTopSpacing,
					mobileSpacing,
					hasToolbar: !!toolbar,
					hasNextcloudHeader: !!nextcloudHeader,
					windowHeight: window.innerHeight,
					windowWidth: window.innerWidth,
				})
				
				// Force a style recalculation by directly setting styles on overlays
				const measurementOverlay = document.querySelector('.measurement-overlay')
				const annotationOverlay = document.querySelector('.annotation-overlay')
				
				if (measurementOverlay) {
					measurementOverlay.style.top = `${safeTopSpacing}px`
					logger.info('ThreeViewer', 'Forced measurement overlay positioning', { top: safeTopSpacing })
				}
				
				if (annotationOverlay) {
					annotationOverlay.style.top = `${safeTopSpacing}px`
					logger.info('ThreeViewer', 'Forced annotation overlay positioning', { top: safeTopSpacing })
				}
			}, 200) // Increased delay to ensure DOM is fully rendered
		})
	}

	const onCanvasClick = (event) => {
			// Handle measurement clicks
			if (measurement.isActive.value) {
				measurement.handleClick(event, camera.camera.value)
			}
			
			// Handle annotation clicks
			if (annotation.isActive.value) {
				annotation.handleClick(event, camera.camera.value)
			}
		}

		// Comparison methods
		const toggleOriginalModel = () => {
			if (modelRoot.value) {
				comparison.toggleOriginalModel(modelRoot.value)
			}
		}

		const toggleComparisonModel = () => {
			comparison.toggleComparisonModel()
		}

		// Loading methods
		const cancelLoad = () => {
			aborting.value = true
			modelLoading.cancelLoad()
			// Reset aborting state after a short delay
			setTimeout(() => {
				aborting.value = false
			}, 500)
		}

		const retryLoad = async () => {
			try {
				await modelLoading.retryLoad(() => loadModel(props.fileId))
			} catch (error) {
				logger.error('ThreeViewer', 'Retry failed', error)
			}
		}

		const clearError = () => {
			modelLoading.clearError()
		}

		// Utility methods
		const getStageText = (stage) => {
			return modelLoading.getStageText(stage)
		}

		const formatFileSize = (bytes) => {
			return modelLoading.formatFileSize(bytes)
		}

		// Camera control methods
		const fitToView = () => {
			if (modelRoot.value) {
				camera.fitToView(modelRoot.value)
			}
		}

		const resetView = () => {
			camera.resetView()
		}

		// Advanced feature methods
		const toggleMeasurementMode = () => {
			// If turning measurement ON, turn annotation OFF
			if (!measurement.isActive.value) {
				if (annotation.isActive.value) {
					annotation.toggleAnnotation()
				}
			}
			measurement.toggleMeasurement()
		}

		const handleUnitChange = () => {
			measurement.setUnit(currentUnitModel.value)
		}

		const deleteMeasurement = (measurementId) => {
			measurement.deleteMeasurement(measurementId)
		}

		const toggleAnnotationMode = () => {
			// If turning annotation ON, turn measurement OFF
			if (!annotation.isActive.value) {
				if (measurement.isActive.value) {
					measurement.toggleMeasurement()
				}
			}
			annotation.toggleAnnotation()
			emit('toggle-annotation')
		}

		const deleteAnnotation = (annotationId) => {
			annotation.deleteAnnotation(annotationId)
		}

		const updateAnnotationText = (annotationId, newText) => {
			annotation.updateAnnotationText(annotationId, newText)
		}

		const clearAllAnnotations = () => {
			annotation.clearAllAnnotations()
		}

		const toggleComparisonMode = async () => {
			try {
				if (!comparison.isComparisonMode.value) {
					// Entering comparison mode - open native file picker
					comparison.toggleComparisonMode()
					emit('toggle-comparison')
					
					try {
						const filePath = await comparison.openFilePicker()
						
						// Load the selected model
						const context = {
							THREE,
							scene: scene.value,
							abortController: new AbortController(),
							applyWireframe: props.wireframe,
							ensurePlaceholderRemoved: () => {},
							wireframe: props.wireframe,
						}

						await comparison.loadComparisonModelFromPath(filePath, context)

						// Add the comparison model to the scene
						if (comparison.comparisonModel.value) {
							scene.value.add(comparison.comparisonModel.value)

							// Fit both models to view
							if (modelRoot.value && comparison.comparisonModel.value) {
								fitBothModelsToView()
							}
						}
					} catch (error) {
						// User cancelled or error occurred
						logger.error('ThreeViewer', 'Failed to load comparison model', error)
						// Exit comparison mode if picker was cancelled
						comparison.toggleComparisonMode()
						emit('toggle-comparison')
					}
				} else {
					// Exiting comparison mode - clear comparison
					comparison.clearComparison()
					comparison.toggleComparisonMode()
					emit('toggle-comparison')
				}
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to toggle comparison mode', error)
			}
		}

		/**
		 * Fit both original and comparison models to camera view
		 * Positions models side by side and adjusts camera to show both
		 */
		const fitBothModelsToView = () => {
			if (!modelRoot.value || !comparison.comparisonModel.value) {
				logger.warn('ThreeViewer', 'Cannot fit both models: one or both models missing')
				return
			}

			try {
				// First position the models side by side
				comparison.fitBothModelsToView(modelRoot.value, comparison.comparisonModel.value, (model1, model2) => {
					// After positioning, fit camera to the combined bounding box
					const box1 = new THREE.Box3().setFromObject(model1)
					const box2 = new THREE.Box3().setFromObject(model2)
					const combinedBox = box1.union(box2)

					if (combinedBox.isEmpty()) {
						logger.warn('ThreeViewer', 'Combined bounding box is empty')
						return
					}

					const center = combinedBox.getCenter(new THREE.Vector3())
					const size = combinedBox.getSize(new THREE.Vector3())
					const maxDim = Math.max(size.x, size.y, size.z)

					// Calculate camera distance using FOV-based calculation
					const fov = camera.camera.value.fov * (Math.PI / 180)
					const cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.2

					// Position camera to view both models at a good angle
					camera.camera.value.position.set(
						center.x + cameraDistance * 0.7,
						center.y + cameraDistance * 0.7,
						center.z + cameraDistance * 0.7,
					)

					// Set camera target to center of both models
					if (camera.controls.value) {
						camera.controls.value.target.copy(center)
						camera.controls.value.update()
					}

					logger.info('ThreeViewer', 'Camera positioned for both models', {
						center: { x: center.x, y: center.y, z: center.z },
						cameraDistance,
						cameraPosition: { 
							x: camera.camera.value.position.x, 
							y: camera.camera.value.position.y, 
							z: camera.camera.value.position.z 
						}
					})
				})
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to fit both models to view', error)
			}
		}

	const setPerformanceMode = (mode) => {
		if (performance && typeof performance.setPerformanceMode === 'function') {
			performance.setPerformanceMode(mode)
			logger.info('ThreeViewer', 'Performance mode set', { mode })
		}
	}		// Watchers
		watch(() => props.showGrid, (val) => {
			if (grid.value) {
				grid.value.visible = val
			}
		})

		watch(() => props.showAxes, (val) => {
			if (axes.value) {
				axes.value.visible = val
			}
		})

		watch(() => props.wireframe, (val) => {
			// Apply wireframe to all meshes
			if (modelRoot.value) {
				modelRoot.value.traverse((child) => {
					if (child.isMesh) {
						child.material.wireframe = val
					}
				})
			}
		})

		watch(() => props.background, (val) => {
			if (scene.value) {
				scene.value.background = val ? new THREE.Color(val) : null
			}
		})

	watch(() => props.performanceMode, (mode) => {
		if (performance && typeof performance.setPerformanceMode === 'function') {
			// Pass renderer to enable smart detection for auto mode
			// setPerformanceMode already calls applyPerformanceSettings internally
			performance.setPerformanceMode(mode, renderer.value)
			logger.info('ThreeViewer', 'Performance mode changed', { mode })
		}
	})

	// Watch for measurement/annotation mode changes to adjust positioning
	watch(() => measurement.isActive.value, (active) => {
		if (active) {
			nextTick(() => {
				setTimeout(() => adjustOverlayPositioning(), 100)
			})
		}
	})

	watch(() => annotation.isActive.value, (active) => {
		if (active) {
			nextTick(() => {
				setTimeout(() => adjustOverlayPositioning(), 100)
			})
		}
	})			// Lifecycle
	onMounted(() => {
		// Test hooks for Playwright/testing
		if (typeof window !== 'undefined') {
			window.__LOAD_STARTED = true
			window.__THREEDVIEWER_VIEWER = Object.assign({}, window.__THREEDVIEWER_VIEWER, {
				cancelLoad,
				retryLoad,
			})
		}
		init()
		
		// Adjust overlay positioning to avoid toolbar overlap
		adjustOverlayPositioning()
	})

		onBeforeUnmount(() => {
			// Cancel animation loop
			if (animationFrameId.value !== null) {
				cancelAnimationFrame(animationFrameId.value)
				animationFrameId.value = null
			}

			// Cleanup event listeners
			window.removeEventListener('resize', onWindowResize)
			
			// Remove canvas click listener - check domElement exists
			if (renderer.value?.domElement) {
				renderer.value.domElement.removeEventListener('click', onCanvasClick)
			}

		if (renderer.value) {
			renderer.value.dispose()
		}

		camera.dispose()
		modelLoading.clearModel()
		comparison.clearComparison()
		
		// Dispose performance monitoring
		if (performance && typeof performance.dispose === 'function') {
			performance.dispose()
		}
	})

	return {
		// Refs
		container,
			scene,
			renderer,
			grid,
			axes,
			modelRoot,
			aborting,
			initializing,

			// Computed
			isMobile,
			isLoading,
			hasError,
			canRetry,
			progress,
			progressPercentage,
			errorState,
			isComparisonMode,
			hasComparisonModel,
			availableUnits,
			currentUnitModel,

			// Measurement
			measurement,
			measurementActive: measurement.isActive,
			measurementPoints: measurement.points,
			measurementCount: measurement.measurementCount,
			measurements: measurement.measurements,

			// Annotation
			annotation,
			annotationActive: annotation.isActive,
			annotations: annotation.annotations,
			annotationCount: annotation.annotationCount,

			// Comparison
			isComparisonLoading: comparison.isComparisonLoading,

		// Performance
		performance,
		currentFPS: performance.currentFPS,
		currentFrameTime: performance.currentFrameTime,
		currentMemoryUsage: performance.currentMemoryUsage,
		currentDrawCalls: performance.currentDrawCalls,
		currentTriangles: performance.currentTriangles,
		currentPerformanceMode: performance.currentPerformanceMode,
		currentPixelRatio: performance.currentPixelRatio,			// Methods
			toggleOriginalModel,
			toggleComparisonModel,
			fitBothModelsToView,
			cancelLoad,
			retryLoad,
			clearError,
			getStageText,
			formatFileSize,
			toggleAutoRotate: camera.toggleAutoRotate,
			resetView,
			fitToView,
			toggleMeasurementMode,
			handleUnitChange,
			deleteMeasurement,
			toggleAnnotationMode,
			deleteAnnotation,
			updateAnnotationText,
			clearAllAnnotations,
			toggleComparisonMode,
			setPerformanceMode,
		}
	},
}
</script>

<style scoped>
/* CSS Variables for consistent spacing */
:root {
	--overlay-top-spacing: 150px; /* Further increased to ensure no overlap */
	--overlay-side-spacing: 20px;
	--overlay-mobile-top-spacing: 120px; /* Further increased for mobile */
	--overlay-mobile-side-spacing: 10px;
}

/* Force overlay positioning to prevent overlap */
.measurement-overlay,
.annotation-overlay {
	/* Ensure panels are positioned below any header/toolbar */
	top: 80px !important;
	/* Ensure panels don't extend beyond viewport */
	max-width: 280px !important;
	/* Ensure proper z-index */
	z-index: 250 !important;
}

@media (max-width: 768px) {
	.measurement-overlay,
	.annotation-overlay {
		top: 140px !important;
		max-width: calc(100vw - 40px) !important;
	}
}


.three-viewer {
	position: relative;
	width: 100%;
	height: 100%;
	min-height: 400px; /* Ensure minimum height for proper canvas sizing */
	overflow: hidden;
}

.loading {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.8);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
}

.loading-content {
	text-align: center;
	color: white;
	max-width: 500px;
	padding: 20px;
}

.loading-text {
	margin-bottom: 20px;
}

.loading-stage {
	font-size: 18px;
	font-weight: bold;
	margin-bottom: 10px;
}

.loading-details {
	font-size: 14px;
	opacity: 0.9;
	margin-bottom: 5px;
}

.loading-percentage {
	font-size: 24px;
	font-weight: bold;
	margin-top: 10px;
	color: var(--color-primary-element);
}

.loading-actions {
	margin-top: 20px;
	display: flex;
	gap: 10px;
	justify-content: center;
}

.loading-spinner {
	width: 40px;
	height: 40px;
	border: 4px solid rgba(255, 255, 255, 0.3);
	border-top: 4px solid white;
	border-radius: 50%;
	animation: spin 1s linear infinite;
	margin: 0 auto 20px;
}

@keyframes spin {
	0% { transform: rotate(0deg); }
	100% { transform: rotate(360deg); }
}

.error-display {
	position: absolute;
	top: 20px;
	left: 20px;
	right: 20px;
	background: rgba(255, 0, 0, 0.9);
	color: white;
	padding: 20px;
	border-radius: 8px;
	z-index: 1001;
}

/* Performance Stats Overlay */
.performance-stats {
	position: absolute;
	bottom: 10px;
	left: 10px;
	background: rgba(0, 0, 0, 0.85);
	color: #fff;
	padding: 12px;
	border-radius: 8px;
	font-family: 'Monaco', 'Courier New', monospace;
	font-size: 12px;
	z-index: 900;
	min-width: 180px;
	backdrop-filter: blur(10px);
	border: 1px solid rgba(255, 255, 255, 0.1);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.stats-header {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 10px;
	padding-bottom: 8px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.stats-icon {
	font-size: 16px;
}

.stats-title {
	font-weight: bold;
	font-size: 13px;
	flex: 1;
}

.stats-mode {
	font-size: 10px;
	padding: 2px 6px;
	border-radius: 4px;
	font-weight: bold;
	text-transform: uppercase;
}

.stats-mode.mode-low {
	background: rgba(255, 193, 7, 0.3);
	color: #ffc107;
}

.stats-mode.mode-balanced {
	background: rgba(76, 175, 80, 0.3);
	color: #4caf50;
}

.stats-mode.mode-high {
	background: rgba(33, 150, 243, 0.3);
	color: #2196f3;
}

.stats-mode.mode-ultra {
	background: rgba(156, 39, 176, 0.3);
	color: #9c27b0;
}

.stats-mode.mode-auto {
	background: rgba(158, 158, 158, 0.3);
	color: #9e9e9e;
}

.stats-grid {
	display: grid;
	grid-template-columns: 1fr;
	gap: 6px;
}

.stat-item {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 2px 0;
}

.stat-label {
	color: rgba(255, 255, 255, 0.7);
	font-size: 11px;
}

.stat-value {
	font-weight: bold;
	font-size: 12px;
	color: #fff;
}

.stat-value.good {
	color: #4caf50;
}

.stat-value.warning {
	color: #ffc107;
}

.stat-value.poor {
	color: #f44336;
}

.comparison-controls {
	position: absolute;
	top: 60px; /* Position below main toolbar */
	right: 8px;
	z-index: 10;
	background: rgba(0,0,0,0.45);
	backdrop-filter: blur(8px);
	padding: 6px 8px;
	border-radius: 8px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	align-items: center;
	transition: all 0.3s ease;
	border: 1px solid rgba(255, 255, 255, 0.1);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.comparison-buttons {
	display: flex;
	gap: 4px;
	align-items: center;
	flex-wrap: wrap;
}

.comparison-btn {
	font-size: 11px;
	line-height: 1;
	padding: 6px 8px;
	background: var(--color-primary-element, #1976d2);
	color: #fff;
	border: none;
	border-radius: 6px;
	cursor: pointer;
	display: flex;
	align-items: center;
	gap: 4px;
	transition: all 0.2s ease;
	touch-action: manipulation;
	min-height: 32px;
	font-weight: 500;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	position: relative;
	overflow: hidden;
}

.comparison-btn::before {
	content: '';
	position: absolute;
	top: 0;
	left: -100%;
	width: 100%;
	height: 100%;
	background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
	transition: left 0.5s;
}

.comparison-btn:hover::before {
	left: 100%;
}

.comparison-btn:hover {
	background: var(--color-primary-element-hover, #1565c0);
	transform: translateY(-1px);
}

.comparison-btn:focus-visible {
	outline: 2px solid var(--color-primary-text, #fff);
	outline-offset: 2px;
}

.btn-icon {
	font-size: 12px;
	line-height: 1;
}

.btn-text {
	font-size: 10px;
	white-space: nowrap;
}

/* Mobile-specific styles for comparison controls */
.comparison-controls.mobile {
	top: 50px; /* Adjust for mobile toolbar height */
	right: 4px;
	left: 4px;
	flex-direction: row;
	justify-content: space-between;
	padding: 6px 8px;
	border-radius: 8px;
}

.comparison-controls.mobile .comparison-buttons {
	flex: 1;
	justify-content: flex-start;
}

.comparison-controls.mobile .comparison-btn {
	font-size: 10px;
	padding: 6px 8px;
	min-height: 44px; /* iOS recommended touch target size */
	border-radius: 6px;
}

.comparison-controls.mobile .btn-icon {
	font-size: 14px;
}

.comparison-controls.mobile .btn-text {
	font-size: 9px;
}

/* Landscape mobile optimization */
@media (max-width: 768px) and (orientation: landscape) {
	.comparison-controls.mobile {
		top: 40px;
		left: 2px;
		right: 2px;
		padding: 4px 6px;
	}

	.comparison-controls.mobile .comparison-btn {
		padding: 4px 6px;
		min-height: 36px;
	}
}

/* Very small screens */
@media (max-width: 480px) {
	.comparison-controls.mobile .btn-text {
		display: none; /* Hide text on very small screens, show only icons */
	}

	.comparison-controls.mobile .comparison-btn {
		padding: 8px;
		min-width: 44px;
		justify-content: center;
	}
}

/* Dark theme support for comparison controls */
.dark-theme .comparison-controls {
	background: rgba(30, 30, 30, 0.8);
	border-color: rgba(255, 255, 255, 0.2);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.dark-theme .comparison-btn {
	background: var(--color-primary, #64b5f6);
	color: #000;
}

.dark-theme .comparison-btn:hover {
	background: var(--color-primary-element-hover, #42a5f5);
}

/* Accessibility improvements for comparison controls */
.comparison-btn:focus-visible {
	outline: 2px solid var(--color-primary, #0d47a1);
	outline-offset: 2px;
	box-shadow: 0 0 0 4px rgba(13, 71, 161, 0.2);
}

/* High contrast mode for comparison controls */
@media (prefers-contrast: high) {
	.comparison-btn {
		border: 2px solid currentColor;
	}

	.comparison-controls {
		border: 2px solid rgba(255, 255, 255, 0.5);
	}
}

/* Reduced motion for comparison controls */
@media (prefers-reduced-motion: reduce) {
	.comparison-btn::before {
		display: none;
	}

	.comparison-btn:hover {
		transform: none;
	}

	.comparison-controls {
		transition: none;
	}
}

.mobile-hints {
	position: absolute;
	bottom: 20px;
	left: 20px;
	right: 20px;
	display: flex;
	justify-content: space-around;
	z-index: 100;
}

.hint-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 5px;
	color: white;
	background: rgba(0, 0, 0, 0.7);
	padding: 10px;
	border-radius: 5px;
}

.hint-icon {
	font-size: 20px;
}

.hint-text {
	font-size: 12px;
}

@media (max-width: 768px) {
.mobile-hints {
		flex-direction: column;
		gap: 10px;
	}

	.hint-item {
		flex-direction: row;
		justify-content: center;
	}
}

/* Measurement overlay styles */
.measurement-overlay {
	position: absolute;
	top: var(--overlay-top-spacing);
	right: var(--overlay-side-spacing);
	background: rgba(0, 0, 0, 0.8);
	border: 1px solid #00ff00;
	border-radius: 8px;
	padding: 15px;
	max-width: 300px;
	max-height: 400px;
	overflow-y: auto;
	z-index: 200;
	color: white;
	font-family: Arial, sans-serif;
	/* Ensure panel stays within bounds */
	min-width: 250px;
	width: auto;
}

.measurement-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 10px;
	padding-bottom: 10px;
	border-bottom: 1px solid #00ff00;
}

.measurement-header h3 {
	margin: 0;
	font-size: 16px;
	color: #00ff00;
}

.measurement-controls {
	display: flex;
	gap: 10px;
	align-items: center;
}

.unit-selector {
	background: #2a2a2a;
	color: #00ff00;
	border: 1px solid #00ff00;
	padding: 5px 10px;
	border-radius: 4px;
	font-size: 12px;
	cursor: pointer;
}

.unit-selector:hover {
	background: #3a3a3a;
}

.clear-measurements-btn {
	background: #ff4444;
	color: white;
	border: none;
	padding: 5px 10px;
	border-radius: 4px;
	cursor: pointer;
	font-size: 12px;
}

.clear-measurements-btn:hover {
	background: #ff6666;
}

.measurement-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.measurement-item {
	background: rgba(0, 255, 0, 0.1);
	border: 1px solid rgba(0, 255, 0, 0.3);
	border-radius: 4px;
	padding: 10px;
}

.measurement-info {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
}

.measurement-label {
	font-weight: bold;
	font-size: 14px;
	color: #00ff00;
}

.delete-measurement-btn {
	background: #ff4444;
	color: white;
	border: none;
	padding: 3px 8px;
	border-radius: 3px;
	cursor: pointer;
	font-size: 11px;
}

.delete-measurement-btn:hover {
	background: #ff6666;
}

.measurement-distance {
	font-size: 16px;
	font-weight: bold;
	color: #ffffff;
}

.measurement-details {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.measurement-point {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.point-label {
	font-size: 12px;
	color: #cccccc;
}

.point-coords {
	font-size: 11px;
	color: #aaaaaa;
	font-family: monospace;
}

@media (max-width: 768px) {
	.measurement-overlay {
		top: var(--overlay-mobile-top-spacing);
		right: var(--overlay-mobile-side-spacing);
		left: var(--overlay-mobile-side-spacing);
		max-width: none;
		max-height: 300px;
	}

	.measurement-header {
		flex-direction: column;
		gap: 10px;
		align-items: stretch;
	}

	.clear-measurements-btn {
		width: 100%;
		padding: 8px;
	}
}

/* Annotation overlay styles */
.annotation-overlay {
	position: absolute;
	top: var(--overlay-top-spacing);
	left: var(--overlay-side-spacing);
	background: rgba(0, 0, 0, 0.8);
	border: 1px solid #ff0000;
	border-radius: 8px;
	padding: 15px;
	max-width: 300px;
	max-height: 400px;
	overflow-y: auto;
	z-index: 200;
	color: white;
	font-family: Arial, sans-serif;
}

.annotation-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 10px;
	padding-bottom: 10px;
	border-bottom: 1px solid #ff0000;
}

.annotation-header h3 {
	margin: 0;
	font-size: 16px;
	color: #ff0000;
}

.clear-annotations-btn {
	background: #ff4444;
	color: white;
	border: none;
	padding: 5px 10px;
	border-radius: 4px;
	cursor: pointer;
	font-size: 12px;
}

.clear-annotations-btn:hover {
	background: #ff6666;
}

.annotation-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.annotation-item {
	background: rgba(255, 0, 0, 0.1);
	border: 1px solid rgba(255, 0, 0, 0.3);
	border-radius: 4px;
	padding: 10px;
}

.annotation-info {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
}

.annotation-label {
	font-weight: bold;
	font-size: 14px;
	color: #ff0000;
}

.delete-annotation-btn {
	background: #ff4444;
	color: white;
	border: none;
	padding: 3px 8px;
	border-radius: 3px;
	cursor: pointer;
	font-size: 11px;
}

.delete-annotation-btn:hover {
	background: #ff6666;
}

.annotation-details {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.annotation-text-input {
	background: rgba(255, 255, 255, 0.1);
	border: 1px solid rgba(255, 0, 0, 0.5);
	border-radius: 3px;
	padding: 5px 8px;
	color: white;
	font-size: 12px;
	width: 100%;
}

.annotation-text-input::placeholder {
	color: #cccccc;
}

.annotation-text-input:focus {
	outline: none;
	border-color: #ff0000;
	background: rgba(255, 255, 255, 0.15);
}

.annotation-point {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.point-label {
	font-size: 12px;
	color: #cccccc;
}

.point-coords {
	font-size: 11px;
	color: #aaaaaa;
	font-family: monospace;
}

@media (max-width: 768px) {
	.annotation-overlay {
		top: var(--overlay-mobile-top-spacing);
		left: var(--overlay-mobile-side-spacing);
		right: var(--overlay-mobile-side-spacing);
		max-width: none;
		max-height: 300px;
	}

	.annotation-header {
	flex-direction: column;
		gap: 10px;
		align-items: stretch;
}

	.clear-annotations-btn {
	width: 100%;
		padding: 8px;
	}
}
</style>
