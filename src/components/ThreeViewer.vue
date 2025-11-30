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
					:aria-label="t('threedviewer','Model load progress')" />
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

		<!-- Export progress overlay -->
		<div v-if="isExporting"
			class="export-progress-overlay"
			:class="{ 'mobile': isMobile }">
			<div class="export-progress-content">
				<div class="export-icon">
					📦
				</div>
				<div class="export-stage">
					{{ exportProgress.stage || 'Preparing export...' }}
				</div>
				<div class="export-percentage">
					{{ exportProgress.percentage }}%
				</div>
				<NcProgressBar
					:value="exportProgress.percentage"
					:max="100"
					size="medium"
					:aria-label="t('threedviewer','Export progress')" />
			</div>
		</div>

		<!-- Model Statistics Panel -->
		<div v-if="showModelStats && modelStats" class="model-stats-overlay" :class="{ 'mobile': isMobile }">
			<div class="stats-panel-header">
				<div class="stats-title-group">
					<img v-if="formatIcon"
						:src="formatIcon"
						class="format-icon"
						alt="Format icon">
					<h3>{{ t('threedviewer', 'Model Statistics') }}</h3>
				</div>
				<button class="close-stats-btn" @click="toggleModelStats">
					×
				</button>
			</div>

			<div class="stats-panel-content">
				<!-- Geometry Section -->
				<div class="stats-section">
					<h4>{{ t('threedviewer', 'Geometry') }}</h4>
					<div class="stat-row">
						<span>{{ t('threedviewer', 'Vertices') }}:</span>
						<span class="stat-value">{{ modelStats.vertices.toLocaleString() }}</span>
					</div>
					<div class="stat-row">
						<span>{{ t('threedviewer', 'Faces') }}:</span>
						<span class="stat-value">{{ modelStats.faces.toLocaleString() }}</span>
					</div>
					<div class="stat-row">
						<span>{{ t('threedviewer', 'Meshes') }}:</span>
						<span class="stat-value">{{ modelStats.meshes }}</span>
					</div>
				</div>

				<!-- Materials Section -->
				<div class="stats-section">
					<h4>{{ t('threedviewer', 'Materials') }} ({{ modelStats.materialCount }})</h4>
					<div v-if="modelStats.materials.length > 0" class="material-list">
						<div v-for="mat in modelStats.materials" :key="mat.uuid" class="material-item">
							<span class="material-name">{{ mat.name }}</span>
							<span class="material-type">{{ mat.type }}</span>
						</div>
						<div v-if="modelStats.materialCount > 10" class="more-items">
							{{ t('threedviewer', '+ {count} more', { count: modelStats.materialCount - 10 }) }}
						</div>
					</div>
					<div v-else class="no-items">
						{{ t('threedviewer', 'No materials') }}
					</div>
				</div>

				<!-- Textures Section -->
				<div class="stats-section">
					<h4>{{ t('threedviewer', 'Textures') }} ({{ modelStats.textureCount }})</h4>
					<div v-if="modelStats.textureCount > 0" class="stat-row">
						<span>{{ t('threedviewer', 'Memory') }}:</span>
						<span class="stat-value">{{ modelStats.textureMemoryMB.toFixed(2) }} MB</span>
					</div>
					<div v-else class="no-items">
						{{ t('threedviewer', 'No textures') }}
					</div>
				</div>

				<!-- Dimensions Section -->
				<div class="stats-section">
					<h4>{{ t('threedviewer', 'Dimensions') }}</h4>
					<div class="stat-row">
						<span>{{ t('threedviewer', 'Width (X)') }}:</span>
						<span class="stat-value">{{ modelStats.boundingBox.x.toFixed(2) }} units</span>
					</div>
					<div class="stat-row">
						<span>{{ t('threedviewer', 'Height (Y)') }}:</span>
						<span class="stat-value">{{ modelStats.boundingBox.y.toFixed(2) }} units</span>
					</div>
					<div class="stat-row">
						<span>{{ t('threedviewer', 'Depth (Z)') }}:</span>
						<span class="stat-value">{{ modelStats.boundingBox.z.toFixed(2) }} units</span>
					</div>
					<div class="stat-row">
						<span>{{ t('threedviewer', 'Volume') }}:</span>
						<span class="stat-value">{{ modelStats.volume.toFixed(2) }} cu. units</span>
					</div>
				</div>

				<!-- File Section -->
				<div class="stats-section">
					<h4>{{ t('threedviewer', 'File') }}</h4>
					<div class="stat-row">
						<span>{{ t('threedviewer', 'Size') }}:</span>
						<span class="stat-value">{{ modelStats.fileSizeMB.toFixed(2) }} MB</span>
					</div>
					<div class="stat-row">
						<span>{{ t('threedviewer', 'Format') }}:</span>
						<span class="stat-value">{{ modelStats.format.toUpperCase() }}</span>
					</div>
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

		<!-- Texture Loading Indicator (Bottom-Right) -->
		<div v-if="loadingTextures && textureProgress.total > 0" class="texture-progress-indicator">
			<span class="texture-icon">🖼️</span>
			<span class="texture-status">
				{{ t('threedviewer', 'Loading textures') }}... {{ textureProgress.loaded }}/{{ textureProgress.total }}
			</span>
			<div class="mini-progress-bar">
				<div class="progress-fill" :style="{ width: (textureProgress.loaded / textureProgress.total * 100) + '%' }" />
			</div>
		</div>

		<!-- Performance Stats Overlay (Dev/Debug) -->
		<div v-if="showPerformanceStats && performance && currentFPS > 0" class="performance-stats">
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

		<!-- Circular 3D Controller -->
		<CircularController
			:main-camera="camera.camera.value"
			:main-controls="camera.controls.value"
			:visible="showController"
			:persist-position="persistControllerPosition"
			:is-mobile="isMobile"
			@camera-rotate="handleControllerRotate"
			@camera-zoom="handleControllerZoom"
			@cameraPan="handleControllerPan"
			@testPan="handleTestPan"
			@snap-to-view="handleSnapToView"
			@nudge-camera="handleNudgeCamera"
			@position-changed="handleControllerPositionChange" />
	</div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch, computed, nextTick } from 'vue'
import * as THREE from 'three'
import { NcProgressBar, NcButton } from '@nextcloud/vue'
import { generateUrl, imagePath } from '@nextcloud/router'
import axios from '@nextcloud/axios'
import CircularController from './CircularController.vue'
import { useCamera } from '../composables/useCamera.js'
import { useModelLoading } from '../composables/useModelLoading.js'
import { useComparison } from '../composables/useComparison.js'
import { useMeasurement } from '../composables/useMeasurement.js'
import { useAnnotation } from '../composables/useAnnotation.js'
import { usePerformance } from '../composables/usePerformance.js'
import { useExport } from '../composables/useExport.js'
import { useModelStats } from '../composables/useModelStats.js'
import { useProgressiveTextures } from '../composables/useProgressiveTextures.js'
import { useTheme } from '../composables/useTheme.js'
import { useFaceLabels } from '../composables/useFaceLabels.js'
import { useController } from '../composables/useController.js'
import { useScreenshot } from '../composables/useScreenshot.js'
import { logger } from '../utils/logger.js'
import { getIconForFilename } from '../utils/iconHelpers.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { initCache, clearExpired, clearAll, getCacheStats } from '../utils/dependencyCache.js'

export default {
	name: 'ThreeViewerRefactored',
	components: {
		NcProgressBar,
		NcButton,
		CircularController,
	},
	props: {
		fileId: { type: [Number, String], default: null },
		filename: { type: String, default: null },
		dir: { type: String, default: null },
		showGrid: { type: Boolean, default: true },
		showAxes: { type: Boolean, default: true },
		showFaceLabels: { type: Boolean, default: false },
		wireframe: { type: Boolean, default: false },
		background: { type: String, default: null },
		measurementMode: { type: Boolean, default: false },
		annotationMode: { type: Boolean, default: false },
		comparisonMode: { type: Boolean, default: false },
		performanceMode: { type: String, default: 'auto' },
		themeMode: { type: String, default: 'auto' },
		showController: { type: Boolean, default: true },
		persistControllerPosition: { type: Boolean, default: true },
		autoRotate: { type: Boolean, default: false },
		autoRotateSpeed: { type: Number, default: 2.0 },
		zoomSpeed: { type: Number, default: 1.0 },
		panSpeed: { type: Number, default: 1.0 },
		enableDamping: { type: Boolean, default: true },
		enableShadows: { type: Boolean, default: true },
		enableAntialiasing: { type: Boolean, default: true },
		ambientLightIntensity: { type: Number, default: 2.0 },
		directionalLightIntensity: { type: Number, default: 1.0 },
	},
	emits: ['model-loaded', 'error', 'view-reset', 'fit-to-view', 'toggle-auto-rotate', 'toggle-projection', 'change-preset', 'toggle-grid', 'axes-toggle', 'wireframe-toggle', 'background-change', 'toggle-measurement', 'toggle-annotation', 'toggle-comparison', 'toggle-performance', 'dismiss', 'push-toast', 'loading-state-changed', 'fps-updated'],
	setup(props, { emit }) {
		// Refs
		const container = ref(null)
		const scene = ref(null)
		const renderer = ref(null)
		const renderPaused = ref(false)
		const grid = ref(null)
		const axes = ref(null)
		const modelRoot = ref(null)
		const aborting = ref(false)
		const initializing = ref(true) // Show loading during initial setup
		const animationFrameId = ref(null) // Track animation frame for cleanup
		const showPerformanceStats = ref(true) // Toggle for performance stats overlay
		const isInitialized = ref(false) // Guard to prevent multiple initializations

		// Composables
		const camera = useCamera()
		const modelLoading = useModelLoading()
		const comparison = useComparison()
		const measurement = useMeasurement()
		const annotation = useAnnotation()
		const performance = usePerformance()
		const exportComposable = useExport()
		const modelStatsComposable = useModelStats()
		const progressiveTexturesComposable = useProgressiveTextures()
		const themeComposable = useTheme()
		const faceLabels = useFaceLabels()
		const controller = useController()
		const screenshot = useScreenshot()

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

		// Format icon for current model
		const formatIcon = computed(() => {
			const filename = modelStatsComposable.modelStats.value?.filename || props.filename || ''
			return getIconForFilename(filename)
		})

		// Methods
		const init = async () => {
			try {
				// Initialize decoders
				await modelLoading.initDecoders()

				// Setup Three.js scene
				await setupScene()

				// Apply initial theme background to scene
				if (themeComposable.resolvedTheme.value) {
					const currentTheme = themeComposable.resolvedTheme.value
					const themeColors = VIEWER_CONFIG.theme[currentTheme] || VIEWER_CONFIG.theme.light
					if (themeColors.background && scene.value) {
						scene.value.background = new THREE.Color(themeColors.background)
						logger.info('ThreeViewer', 'Initial scene theme applied', { theme: currentTheme, background: themeColors.background })
					}
				}

				// Initialize camera
				// Container should already be available from setupScene, but check again
				if (!container.value) {
					await nextTick()
					if (!container.value) {
						throw new Error('Container element not found')
					}
				}
				const width = container.value.clientWidth || container.value.offsetWidth || 800
				const height = container.value.clientHeight || container.value.offsetHeight || 600
				camera.initCamera(width, height, isMobile.value)

				// Setup controls
				await camera.setupControls(renderer.value)
				camera.setZoomSpeed(props.zoomSpeed)
				camera.setPanSpeed(props.panSpeed)
				camera.setDamping(props.enableDamping)

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
					overlay: 'Visible in bottom-left corner',
				})

				// Load model if fileId provided, otherwise show demo
				if (props.fileId) {
					try {
						await loadModel(props.fileId)
					} catch (error) {
						// Only show demo if initialization failed and it's not an abort
						if (error.name !== 'AbortError') {
							logger.warn('ThreeViewer', 'Failed to load initial model, showing demo scene', error)
							createDemoScene()
						}
					}
				} else {
					// Show demo scene when no file is specified
					createDemoScene()
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
			// Ensure container is available and ready (should be ready from onMounted, but double-check)
				const isContainerReady = () => {
					if (!container.value) return false
					if (!(container.value instanceof HTMLElement)) return false
					if (!container.value.isConnected) return false
					return true
				}

				if (!isContainerReady()) {
					// Wait a bit more and try again
					await nextTick()
					await new Promise(resolve => setTimeout(resolve, 100))
					if (!isContainerReady()) {
						// Last attempt - wait a bit longer
						await new Promise(resolve => setTimeout(resolve, 200))
						if (!isContainerReady()) {
							// Final check
							await nextTick()
							if (!isContainerReady()) {
								throw new Error('Container element not found or not connected to DOM')
							}
						}
					}
				}

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
					preserveDrawingBuffer: true, // Required for screenshots
				})

				// Set initial size - this will set pixel ratio to window.devicePixelRatio by default
				// but initPerformance() will immediately override it with the detected optimal ratio
				renderer.value.setSize(containerWidth, containerHeight)
				// Note: pixel ratio will be overridden by initPerformance() based on auto-detection
				renderer.value.shadowMap.enabled = true
				renderer.value.shadowMap.type = THREE.PCFSoftShadowMap

				container.value.appendChild(renderer.value.domElement)

				// Initialize label renderer for face labels
				faceLabels.initLabelRenderer(container.value, containerWidth, containerHeight)

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
		// Ambient light - use props with config as fallback defaults
			const lightingConfig = VIEWER_CONFIG.lighting
			const ambientLight = new THREE.AmbientLight(
				lightingConfig.ambient.color,
				props.ambientLightIntensity,
			)
			scene.value.add(ambientLight)

			// Directional light - use props with config as fallback defaults
			const directionalLight = new THREE.DirectionalLight(
				lightingConfig.directional.color,
				props.directionalLightIntensity,
			)
			directionalLight.position.set(
				lightingConfig.directional.position.x,
				lightingConfig.directional.position.y,
				lightingConfig.directional.position.z,
			)
			directionalLight.castShadow = lightingConfig.directional.castShadow
			if (directionalLight.castShadow) {
				directionalLight.shadow.mapSize.width = lightingConfig.directional.shadowMapSize
				directionalLight.shadow.mapSize.height = lightingConfig.directional.shadowMapSize
			}
			scene.value.add(directionalLight)

			// Point light - use config values
			if (lightingConfig.point.enabled) {
				const pointLight = new THREE.PointLight(
					lightingConfig.point.color,
					lightingConfig.point.intensity,
					lightingConfig.point.distance,
				)
				pointLight.position.set(
					lightingConfig.point.position.x,
					lightingConfig.point.position.y,
					lightingConfig.point.position.z,
				)
				scene.value.add(pointLight)
			}
		}

		const setupHelpers = () => {
			// Grid helper - use config values for consistency
			if (props.showGrid) {
				const gridSize = VIEWER_CONFIG.grid?.defaultSize || 10
				const gridDivisions = VIEWER_CONFIG.grid?.defaultDivisions || 10
				const gridColor = VIEWER_CONFIG.grid?.colorGrid || 0x00ff00

				grid.value = new THREE.GridHelper(gridSize, gridDivisions, gridColor, gridColor)
				grid.value.material.opacity = VIEWER_CONFIG.grid?.opacity || 1.0
				grid.value.material.transparent = VIEWER_CONFIG.grid?.transparent || false
				scene.value.add(grid.value)
			}

			// Axes helper - use config value for consistency
			if (props.showAxes) {
				const axesSize = VIEWER_CONFIG.axes?.size || 5
				axes.value = new THREE.AxesHelper(axesSize)
				scene.value.add(axes.value)
			}
		}

		/**
		 * Load a 3D model from file ID
		 * @param {string|number} fileId - Nextcloud file ID
		 */
		const loadModel = async (fileId) => {
			try {
				// Get the filename from props
				// If filename is not provided, fetch file info from backend
				let fullPath = props.filename ? decodeURIComponent(props.filename) : null
				let dirPath = props.dir || null

				// If filename not provided, fetch file info from backend
				if (!fullPath && fileId) {
					// Try to get file info from the file list API
					try {
						const fileListUrl = generateUrl('/apps/threedviewer/api/files/list') + '?sort=list'
						const fileListResponse = await axios.get(fileListUrl)
						if (fileListResponse.data && fileListResponse.data.files) {
							const file = fileListResponse.data.files.find(f => f.id === fileId)
							if (file) {
								fullPath = file.path || file.name
								dirPath = file.folder_path || null
								logger.info('ThreeViewer', 'Retrieved file info from API', { fileId, fullPath, dirPath })
							}
						}
					} catch (apiError) {
						logger.warn('ThreeViewer', 'Failed to fetch file info from API, using defaults', apiError)
					}
				}

				// Fallback to default if still no filename
				if (!fullPath) {
					fullPath = 'model.glb'
					logger.warn('ThreeViewer', 'No filename provided, using default', { fileId })
				}

				// Extract directory and filename
				// fullPath might be like "/3d_test/capsule/capsule.obj" or just "model.obj"
				const pathParts = fullPath.split('/').filter(p => p) // Remove empty strings
				const filename = pathParts.pop() || 'model.glb' // Get the actual filename

				// Reconstruct directory path with leading slash if it was present
				if (!dirPath) {
					if (fullPath.startsWith('/')) {
						dirPath = '/' + pathParts.join('/')
					} else {
						dirPath = pathParts.join('/') || 'Models'
					}
				}

				const extension = filename.split('.').pop()?.toLowerCase() || 'glb'

				logger.info('ThreeViewer', 'Loading model', {
					fileId,
					filename,
					fullPath,
					dirPath,
					extension,
					userId: window.OC?.getCurrentUser?.()?.uid || 'admin',
					propsFilename: props.filename,
					propsDir: props.dir,
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

					// Add face labels if enabled
					if (props.showFaceLabels) {
						faceLabels.addFaceLabels(modelRoot.value, scene.value)
					}

					// Calculate model statistics
					const fileSize = modelLoading.progress.value.total || 0
					modelStatsComposable.analyzeModel(modelRoot.value, filename, fileSize)

					// Check for loading warnings (missing files/textures)
					const missingFiles = loadedModel.missingFiles || []
					const missingTextures = loadedModel.missingTextures || []
					const totalMissing = missingFiles.length + missingTextures.length

					if (totalMissing > 0) {
						const missingList = [...missingFiles, ...missingTextures]

						logger.warn('ThreeViewer', 'Model loaded with warnings', {
							missingCount: totalMissing,
							missingFiles: missingList,
						})

						// Emit warning toast
						emit('push-toast', {
							type: 'warning',
							title: 'Model loaded with warnings',
							message: totalMissing === 1
								? `1 texture could not be loaded: ${missingList[0]}`
								: `${totalMissing} textures could not be loaded`,
							timeout: 8000,
						})
					}

					emit('model-loaded', { fileId, filename })
					logger.info('ThreeViewer', 'Model loaded successfully')
				} else {
					// Don't fallback to demo scene - let error state handle it
					throw new Error('Model loaded but no object3D returned')
				}
			} catch (error) {
				// Don't log error if it was a user-initiated cancellation
				if (error.name !== 'AbortError') {
					logger.error('ThreeViewer', 'Failed to load model', error)
					emit('error', error)
					// Don't show demo scene - let error state handle it so user knows file failed
				}
				// Re-throw error so caller knows it failed
				throw error
			}
		}

		const createDemoScene = (fileId = 'demo') => {
			try {
				const demoGroup = new THREE.Group()

				// Load the app logo texture
				const textureLoader = new THREE.TextureLoader()
				const logoPath = imagePath('threedviewer', 'app-color.svg')
				const logoTexture = textureLoader.load(logoPath, undefined, undefined, (error) => {
					logger.warn('ThreeViewer', 'Failed to load app logo, using fallback', error)
				})

				// 1. Center piece - Logo on a plane with depth
				const logoPlaneGeometry = new THREE.PlaneGeometry(2, 2)
				const logoMaterial = new THREE.MeshBasicMaterial({
					map: logoTexture,
					transparent: true,
					side: THREE.DoubleSide,
				})
				const logoPlane = new THREE.Mesh(logoPlaneGeometry, logoMaterial)
				logoPlane.position.set(0, 0.5, 0)
				demoGroup.add(logoPlane)

				// 2. Logo back panel for depth effect
				const backPanelGeometry = new THREE.PlaneGeometry(2.1, 2.1)
				const backPanelMaterial = new THREE.MeshStandardMaterial({
					color: 0x0082c9,
					metalness: 0.3,
					roughness: 0.7,
				})
				const backPanel = new THREE.Mesh(backPanelGeometry, backPanelMaterial)
				backPanel.position.set(0, 0.5, -0.1)
				demoGroup.add(backPanel)

				// 3. Decorative sphere - left
				const sphereGeometry = new THREE.SphereGeometry(0.3, 32, 32)
				const sphereMaterial = new THREE.MeshStandardMaterial({
					color: 0x0082c9,
					metalness: 0.8,
					roughness: 0.2,
				})
				const sphere1 = new THREE.Mesh(sphereGeometry, sphereMaterial)
				sphere1.position.set(-1.3, -0.5, 0.3)
				demoGroup.add(sphere1)

				// 4. Decorative sphere - right
				const sphere2 = new THREE.Mesh(sphereGeometry, sphereMaterial)
				sphere2.position.set(1.3, -0.5, 0.3)
				demoGroup.add(sphere2)

				// 5. Small decorative cubes
				const cubeGeometry = new THREE.BoxGeometry(0.25, 0.25, 0.25)
				const cubeMaterial = new THREE.MeshStandardMaterial({
					color: 0x4ecdc4,
					metalness: 0.5,
					roughness: 0.5,
				})

				const cube1 = new THREE.Mesh(cubeGeometry, cubeMaterial)
				cube1.position.set(-1.5, 0.8, 0.5)
				cube1.rotation.set(0.5, 0.5, 0)
				demoGroup.add(cube1)

				const cube2 = new THREE.Mesh(cubeGeometry, cubeMaterial)
				cube2.position.set(1.5, 0.8, 0.5)
				cube2.rotation.set(0.3, 0.8, 0.2)
				demoGroup.add(cube2)

				// 6. Add demo lights
				const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
				demoGroup.add(ambientLight)

				const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
				directionalLight.position.set(5, 5, 5)
				demoGroup.add(directionalLight)

				const pointLight = new THREE.PointLight(0xffffff, 0.4)
				pointLight.position.set(-3, 3, 3)
				demoGroup.add(pointLight)

				// Add to scene
				modelRoot.value = demoGroup
				scene.value.add(modelRoot.value)

				// Fit camera
				camera.fitCameraToObject(modelRoot.value)
				updateGridSize(modelRoot.value)

				// Analyze demo model for stats
				modelStatsComposable.analyzeModel(modelRoot.value, 'demo-scene.glb', 0)

				emit('model-loaded', { fileId, filename: 'Demo Scene' })
				logger.info('ThreeViewer', 'Demo scene created with app logo')
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
				// Check if user has customized the grid size (default is 10)
				// If customized, respect the user setting instead of auto-sizing
				const userGridSize = VIEWER_CONFIG.grid?.defaultSize || 10
				const isUserCustomized = userGridSize !== 10

				let gridSize, divisions

				if (isUserCustomized) {
					gridSize = userGridSize
					divisions = userGridSize // 1 unit per cell
					logger.info('ThreeViewer', 'Using custom grid size', { gridSize })
				} else if (maxDim < 5) {
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

				// Update axes size and position to match model scale
				if (axes.value && props.showAxes) {
					// Remove old axes
					scene.value.remove(axes.value)

					// Calculate axes size based on model dimensions (25% of max dimension, minimum 5)
					const axesSize = Math.max(maxDim * 0.25, 5)

					// Create new axes with appropriate size
					axes.value = new THREE.AxesHelper(axesSize)

					// Position at bottom of model
					axes.value.position.set(center.x, gridY, center.z)

					// Add to scene
					scene.value.add(axes.value)
				}

				logger.info('ThreeViewer', 'Grid and axes updated', {
					gridSize,
					divisions,
					maxDim,
					axesSize: axes.value ? Math.max(maxDim * 0.25, 5) : 'not visible',
					modelCenter: { x: center.x, y: center.y, z: center.z },
					gridPosition: { x: center.x, y: gridY, z: center.z },
					axesPosition: axes.value ? { x: center.x, y: gridY, z: center.z } : 'not visible',
				})
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to update grid size', error)
			}
		}

		/**
		 * Update billboard text labels to always face the camera
		 * This ensures text remains readable from any viewing angle
		 */
		const updateBillboards = () => {
			if (!scene.value || !camera.camera.value) return

			// Traverse scene and update all billboard-marked meshes
			scene.value.traverse((object) => {
				if (object.userData && object.userData.isBillboard === true) {
					// Make the text mesh face the camera
					object.lookAt(camera.camera.value.position)
				}
			})
		}

		// Animation loop with FPS throttling
		let lastFrameTime = 0
		const animate = (time) => {
			animationFrameId.value = requestAnimationFrame(animate)

			// Handle initial call or missing time argument
			if (!time) {
				time = window.performance.now()
			}

			// Only proceed if camera and renderer are properly initialized
			if (!camera.camera.value || !camera.controls.value || !renderer.value || !scene.value) {
				return
			}

			// FPS Throttling logic
			// Get target FPS from performance settings (respects user "Max Frame Rate")
			const targetFPS = performance.targetFrameRate.value || 60
			const interval = 1000 / targetFPS
			const delta = time - lastFrameTime

			if (delta < interval) {
				return
			}

			// Adjust for timer drift
			// If delta is huge (e.g. tab switch), just reset
			if (delta > 2000) {
				lastFrameTime = time
			} else {
				lastFrameTime = time - (delta % interval)
			}

			// Skip rendering if paused (e.g., during comparison model initialization)
			if (renderPaused.value) {
				return
			}

			// Update controls
			camera.updateControls()

			// Update billboard text labels to face camera
			updateBillboards()

			// Render scene
			camera.render(renderer.value, scene.value)

			// Render face labels
			faceLabels.renderLabels(scene.value, camera.camera.value)

			// Update performance metrics after rendering (throttled)
			if (performance && typeof performance.updatePerformanceMetrics === 'function') {
				performance.updatePerformanceMetrics(renderer.value, scene.value)
			}
		}

		const setupEventListeners = () => {
			window.addEventListener('resize', onWindowResize)

			// Setup ResizeObserver to handle container size changes (e.g. sidebar toggle)
			if (container.value && typeof ResizeObserver !== 'undefined') {
				const resizeObserver = new ResizeObserver((entries) => {
					// Debounce resize to prevent excessive updates
					requestAnimationFrame(() => {
						onWindowResize()
					})
				})
				resizeObserver.observe(container.value)

				// Store observer for cleanup
				container.value._resizeObserver = resizeObserver
			}

			// Add click handler for measurement and annotation
			if (renderer.value && renderer.value.domElement) {
				renderer.value.domElement.addEventListener('click', onCanvasClick)
			}
		}

		const onWindowResize = () => {
			if (!container.value) {
				return
			}
			const width = container.value.clientWidth
			const height = container.value.clientHeight

			camera.onWindowResize(width, height)

			// Update renderer size
			// We allow setSize to update the style to keep DOM and internal size in sync
			renderer.value.setSize(width, height)

			// Resize label renderer
			faceLabels.onWindowResize(width, height)

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
					const toolbar = document.querySelector('.minimal-top-bar')
					const nextcloudHeader = document.querySelector('#header')

					let totalHeaderHeight = 0

					// Check for Nextcloud header height
					if (nextcloudHeader) {
						const headerRect = nextcloudHeader.getBoundingClientRect()
						totalHeaderHeight += headerRect.height
					}

					// Check for minimal top bar height
					if (toolbar) {
						const toolbarRect = toolbar.getBoundingClientRect()
						totalHeaderHeight += toolbarRect.height + 10 // Add some padding
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
						hasMinimalTopBar: !!toolbar,
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

		const togglePerformanceStats = () => {
			showPerformanceStats.value = !showPerformanceStats.value
			logger.info('ThreeViewer', 'Performance stats toggled', { visible: showPerformanceStats.value })
		}

		/**
		 * Toggle model statistics panel
		 */
		const toggleModelStats = () => {
			modelStatsComposable.toggleStatsPanel()
			logger.info('ThreeViewer', 'Model stats toggled', { visible: modelStatsComposable.showStats.value })
		}

		/**
		 * Clear dependency cache
		 */
		const handleClearCache = async () => {
			try {
				logger.info('ThreeViewer', 'Clearing dependency cache')
				await clearAll()
				const stats = await getCacheStats()
				logger.info('ThreeViewer', 'Cache cleared', stats)

				emit('push-toast', {
					type: 'success',
					title: 'Cache Cleared',
					message: 'Dependency cache has been cleared successfully',
				})
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to clear cache', error)
				emit('push-toast', {
					type: 'error',
					title: 'Clear Cache Failed',
					message: error.message || 'Failed to clear cache',
				})
			}
		}

		/**
		 * Handle screenshot capture
		 * @param {object} options - Screenshot options
		 */
		const handleScreenshot = async (options = {}) => {
			if (!renderer.value) {
				logger.warn('ThreeViewer', 'No renderer available for screenshot')
				emit('push-toast', {
					type: 'error',
					title: 'Screenshot Failed',
					message: 'Renderer not initialized',
				})
				return
			}

			try {
				logger.info('ThreeViewer', 'Capturing screenshot', options)

				// Default options
				const screenshotOptions = {
					format: 'png',
					quality: 0.95,
					filename: null,
					...options,
				}

				// Generate filename if not provided
				if (!screenshotOptions.filename) {
					const baseFilename = props.filename
						? props.filename.replace(/\.[^/.]+$/, '')
						: '3dviewer'
					const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
					const extension = screenshotOptions.format === 'png' ? 'png' : 'jpg'
					screenshotOptions.filename = `${baseFilename}-screenshot-${timestamp}.${extension}`
				}

				// Capture and download screenshot
				await screenshot.captureAndDownload(renderer.value, screenshotOptions)

				logger.info('ThreeViewer', 'Screenshot captured successfully', {
					filename: screenshotOptions.filename,
				})

				emit('push-toast', {
					type: 'success',
					title: 'Screenshot Captured',
					message: `Screenshot saved as ${screenshotOptions.filename}`,
				})
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to capture screenshot', error)
				emit('push-toast', {
					type: 'error',
					title: 'Screenshot Failed',
					message: error.message || 'Failed to capture screenshot',
				})
			}
		}

		/**
		 * Handle model export
		 * @param {string} format - Export format (glb, stl, obj)
		 */
		const handleExport = async (format) => {
			if (!modelRoot.value) {
				logger.warn('ThreeViewer', 'No model loaded for export')
				emit('push-toast', {
					type: 'error',
					title: 'Export Failed',
					message: 'No model loaded to export',
				})
				return
			}

			try {
				logger.info('ThreeViewer', 'Starting export', { format })

				// Extract filename from props or use default
				const baseFilename = props.filename
					? props.filename.split('/').pop().split('.')[0]
					: 'model'

				// Export based on format
				switch (format.toLowerCase()) {
				case 'glb':
					await exportComposable.exportAsGLB(modelRoot.value, baseFilename)
					emit('push-toast', {
						type: 'success',
						title: 'Export Successful',
						message: `Model exported as ${baseFilename}.glb`,
					})
					break
				case 'stl':
					await exportComposable.exportAsSTL(modelRoot.value, baseFilename)
					emit('push-toast', {
						type: 'success',
						title: 'Export Successful',
						message: `Model exported as ${baseFilename}.stl`,
					})
					break
				case 'obj':
					await exportComposable.exportAsOBJ(modelRoot.value, baseFilename)
					emit('push-toast', {
						type: 'success',
						title: 'Export Successful',
						message: `Model exported as ${baseFilename}.obj`,
					})
					break
				default:
					throw new Error(`Unsupported export format: ${format}`)
				}

				logger.info('ThreeViewer', 'Export completed successfully', { format, filename: baseFilename })
			} catch (error) {
				logger.error('ThreeViewer', 'Export failed', error)
				emit('push-toast', {
					type: 'error',
					title: 'Export Failed',
					message: error.message || 'Failed to export model',
				})
			}
		}

		/**
		 * Get the current model object for external use (e.g., slicer modal)
		 * @return {THREE.Object3D|null} The model object or null if not loaded
		 */
		const getModelObject = () => {
			return modelRoot.value
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

						// Check if user cancelled (null return)
						if (!filePath) {
							logger.info('ThreeViewer', 'File picker cancelled by user')
							// Exit comparison mode
							comparison.toggleComparisonMode()
							emit('toggle-comparison')
							return
						}

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

						// Pause rendering during comparison model initialization to prevent race conditions
						renderPaused.value = true

						// Add the comparison model to the scene
						if (comparison.comparisonModel.value) {
							scene.value.add(comparison.comparisonModel.value)

							// Use triple requestAnimationFrame to ensure models are fully rendered before fitting
							requestAnimationFrame(() => {
								requestAnimationFrame(() => {
									requestAnimationFrame(() => {
										try {
											// Fit both models to view after everything is ready
											fitBothModelsToView()
										} catch (fitError) {
											logger.warn('ThreeViewer', 'Failed to fit models to view', fitError)
										} finally {
											// Resume rendering after fitting is complete
											renderPaused.value = false
										}
									})
								})
							})
						}
					} catch (error) {
						// Error occurred during loading
						logger.error('ThreeViewer', 'Failed to load comparison model', error)
						// Ensure rendering is resumed on error
						renderPaused.value = false
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
				// Ensure rendering is resumed on error
				renderPaused.value = false
				// Show user-friendly error message
				emit('push-toast', {
					message: t('threedviewer', 'Comparison mode is currently unavailable due to a technical issue. Please try again later.'),
					type: 'error',
					timeout: 5000,
				})
				// Reset comparison mode state
				if (comparison.isComparisonMode.value) {
					comparison.toggleComparisonMode()
					emit('toggle-comparison')
				}
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
					// Use requestAnimationFrame to defer camera updates until after current render cycle
					requestAnimationFrame(() => {
						try {
							// Set flag to prevent OrbitControls from updating during this operation
							if (camera.isPositioningCamera !== undefined) {
								camera.isPositioningCamera.value = true
							}

							// After positioning, fit camera to the combined bounding box
							const box1 = new THREE.Box3().setFromObject(model1)
							const box2 = new THREE.Box3().setFromObject(model2)
							const combinedBox = box1.union(box2)

							if (combinedBox.isEmpty()) {
								logger.warn('ThreeViewer', 'Combined bounding box is empty')
								// Reset flag
								if (camera.isPositioningCamera !== undefined) {
									camera.isPositioningCamera.value = false
								}
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
							// Don't call controls.update() here as isPositioningCamera flag is set
							if (camera.controls.value) {
								camera.controls.value.target.copy(center)
								// Update camera matrices instead
								camera.camera.value.updateMatrixWorld(false)
							}

							logger.info('ThreeViewer', 'Camera positioned for both models', {
								center: { x: center.x, y: center.y, z: center.z },
								cameraDistance,
								cameraPosition: {
									x: camera.camera.value.position.x,
									y: camera.camera.value.position.y,
									z: camera.camera.value.position.z,
								},
							})

							// Reset flag after positioning is complete
							if (camera.isPositioningCamera !== undefined) {
								camera.isPositioningCamera.value = false
							}
						} catch (error) {
							logger.error('ThreeViewer', 'Error in deferred camera positioning', error)
							// Ensure flag is reset even on error
							if (camera.isPositioningCamera !== undefined) {
								camera.isPositioningCamera.value = false
							}
						}
					})
				})
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to fit both models to view', error)
				// Ensure flag is reset even on error
				if (camera.isPositioningCamera !== undefined) {
					camera.isPositioningCamera.value = false
				}
			}
		}

		const setPerformanceMode = (mode) => {
			if (performance && typeof performance.setPerformanceMode === 'function') {
				performance.setPerformanceMode(mode, renderer.value)
				logger.info('ThreeViewer', 'Performance mode set', { mode })
			}
		}

		/**
		 * Handle view cube face click
		 * Animates camera to the selected face view
		 * @param {object} faceView - Face view data with position and label
		 */
		const handleViewCubeFaceClick = (faceView) => {
			if (!camera.camera.value || !camera.controls.value || !modelRoot.value) {
				logger.warn('ThreeViewer', 'Cannot animate to face view: camera, controls, or model not ready')
				return
			}

			try {
			// Calculate the bounding box of the model to determine distance
				const box = new THREE.Box3().setFromObject(modelRoot.value)
				const center = box.getCenter(new THREE.Vector3())
				const size = box.getSize(new THREE.Vector3())
				const maxDim = Math.max(size.x, size.y, size.z)

				// Calculate appropriate distance based on FOV
				const fov = camera.camera.value.fov * (Math.PI / 180)
				const cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5

				// Calculate target camera position based on face direction
				const targetPosition = new THREE.Vector3()
					.copy(faceView.position)
					.multiplyScalar(cameraDistance)
					.add(center)

				// Animate camera to target position
				animateCameraToPosition(targetPosition, center, 1000)

				logger.info('ThreeViewer', 'Animating camera to face view', {
					face: faceView.label,
					targetPosition: { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z },
					center: { x: center.x, y: center.y, z: center.z },
				})
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to animate to face view', error)
			}
		}

		/**
		 * Animate camera to a specific position
		 * @param {THREE.Vector3} targetPosition - Target camera position
		 * @param {THREE.Vector3} targetLookAt - Target look-at point
		 * @param {number} duration - Animation duration in ms
		 */
		const animateCameraToPosition = (targetPosition, targetLookAt, duration = 1000) => {
			if (!camera.camera.value || !camera.controls.value) return

			const startPosition = camera.camera.value.position.clone()
			const startLookAt = camera.controls.value.target.clone()
			const startTime = Date.now()

			const animate = () => {
				const elapsed = Date.now() - startTime
				const progress = Math.min(elapsed / duration, 1)

				// Easing function (ease-in-out cubic)
				const easeProgress = progress < 0.5
					? 4 * progress * progress * progress
					: 1 - Math.pow(-2 * progress + 2, 3) / 2

				// Interpolate position
				camera.camera.value.position.lerpVectors(startPosition, targetPosition, easeProgress)

				// Interpolate look-at target
				camera.controls.value.target.lerpVectors(startLookAt, targetLookAt, easeProgress)
				camera.controls.value.update()

				if (progress < 1) {
					requestAnimationFrame(animate)
				} else {
					logger.info('ThreeViewer', 'Camera animation completed')
				}
			}

			animate()
		}

		/**
		 * Handle controller rotation event
		 * @param root0
		 * @param root0.deltaX
		 * @param root0.deltaY
		 */
		const handleControllerRotate = ({ deltaX, deltaY }) => {
			logger.info('ThreeViewer', 'handleControllerRotate called', { deltaX, deltaY, hasCamera: !!camera.camera.value, hasControls: !!camera.controls.value })

			if (!camera.camera.value || !camera.controls.value) {
				logger.warn('ThreeViewer', 'Camera or controls not ready for rotation')
				return
			}

			try {
				camera.rotateCameraByDelta(deltaX, deltaY)
				logger.info('ThreeViewer', 'Camera rotated from controller', { deltaX, deltaY })
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to rotate camera from controller', error)
			}
		}

		/**
		 * Handle test pan event
		 * @param data
		 */
		const handleTestPan = () => {
			// Test pan handler - placeholder
		}

		/**
		 * Direct pan method that can be called from CircularController
		 * @param panDelta
		 */
		const directPan = (panDelta) => {
			if (!camera.camera.value || !camera.controls.value) {
				return
			}

			try {
			// Use the existing panCameraByDelta method
				camera.panCameraByDelta(panDelta.x, panDelta.y)
				logger.info('ThreeViewer', 'Camera panned from direct call', { x: panDelta.x, y: panDelta.y })
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to pan camera from direct call', error)
			}
		}

		/**
		 * Handle controller pan event
		 * @param root0
		 * @param root0.x
		 * @param root0.y
		 */
		const handleControllerPan = ({ x, y }) => {
			if (!camera.camera.value || !camera.controls.value) {
				return
			}

			try {
				camera.panCameraByDelta(x, y)
				logger.info('ThreeViewer', 'Camera panned from controller', { x, y })
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to pan camera from controller', error)
			}
		}

		/**
		 * Handle controller zoom event
		 * @param root0
		 * @param root0.delta
		 */
		const handleControllerZoom = ({ delta }) => {
			if (!camera.camera.value || !camera.controls.value) return

			try {
			// Get current camera position and target
				const direction = camera.camera.value.position.clone()
					.sub(camera.controls.value.target)

				// Calculate zoom factor (zoom in = positive delta, zoom out = negative delta)
				const zoomAmount = delta * 0.2 // Adjust sensitivity
				const scale = Math.exp(-zoomAmount)

				// Apply zoom by scaling the direction vector
				direction.multiplyScalar(scale)
				camera.camera.value.position.copy(camera.controls.value.target).add(direction)

				// Update controls
				camera.controls.value.update()

				const currentDistance = camera.getCameraDistance()
				logger.info('ThreeViewer', 'Camera zoomed from controller', { delta, newDistance: currentDistance })
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to zoom camera from controller', error)
			}
		}

		/**
		 * Handle controller snap to view event
		 * @param root0
		 * @param root0.viewName
		 */
		const handleSnapToView = ({ viewName }) => {
			logger.info('ThreeViewer', 'handleSnapToView called', { viewName, hasCamera: !!camera.camera.value, hasControls: !!camera.controls.value })

			if (!camera.camera.value || !camera.controls.value) {
				logger.warn('ThreeViewer', 'Camera or controls not ready for snap')
				return
			}

			try {
				camera.snapToNamedView(viewName, VIEWER_CONFIG.controller.animationDuration)
				logger.info('ThreeViewer', 'Snapped to view from controller', { viewName })
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to snap to view from controller', error)
			}
		}

		/**
		 * Handle controller nudge camera event
		 * @param root0
		 * @param root0.direction
		 */
		const handleNudgeCamera = ({ direction }) => {
			logger.info('ThreeViewer', 'handleNudgeCamera called', { direction, hasCamera: !!camera.camera.value, hasControls: !!camera.controls.value })

			if (!camera.camera.value || !camera.controls.value) {
				logger.warn('ThreeViewer', 'Camera or controls not ready for nudge')
				return
			}

			try {
			// Convert direction to delta rotation
				const nudgeAmount = VIEWER_CONFIG.controller.arrowNudgeAmount
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
				if (delta) {
					camera.rotateCameraByDelta(delta.x, delta.y)
					logger.info('ThreeViewer', 'Camera nudged from controller', { direction, delta })
				} else {
					logger.warn('ThreeViewer', 'Unknown nudge direction', { direction })
				}
			} catch (error) {
				logger.error('ThreeViewer', 'Failed to nudge camera from controller', error)
			}
		}

		/**
		 * Handle controller position change event
		 * @param position
		 */
		const handleControllerPositionChange = (position) => {
			logger.info('ThreeViewer', 'Controller position changed', position)
		}

		/**
		 * Toggle controller visibility
		 */
		const toggleController = () => {
			controller.controllerVisible.value = !controller.controllerVisible.value
			controller.saveVisibility(controller.controllerVisible.value)
			logger.info('ThreeViewer', 'Controller toggled', { visible: controller.controllerVisible.value })
		}

		/**
		 * Toggle face labels visibility
		 */
		const toggleFaceLabels = () => {
			if (modelRoot.value && scene.value) {
				faceLabels.toggleLabels(modelRoot.value, scene.value)
			}
		}

		// Watchers
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

		watch(() => props.showFaceLabels, (val) => {
			if (val && modelRoot.value) {
				faceLabels.addFaceLabels(modelRoot.value, scene.value)
			} else {
				faceLabels.clearLabels(scene.value)
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

		watch(() => props.themeMode, (mode) => {
			themeComposable.setTheme(mode)
		})

		// Watch for ambient light intensity changes
		watch(() => props.ambientLightIntensity, (newIntensity) => {
			if (scene.value) {
				const ambientLight = scene.value.children.find(child => child.isAmbientLight)
				if (ambientLight) {
					ambientLight.intensity = newIntensity
					logger.info('ThreeViewer', 'Ambient light intensity updated', { intensity: newIntensity })
				}
			}
		})

		// Watch for directional light intensity changes
		watch(() => props.directionalLightIntensity, (newIntensity) => {
			if (scene.value) {
				const directionalLight = scene.value.children.find(child => child.isDirectionalLight)
				if (directionalLight) {
					directionalLight.intensity = newIntensity
					logger.info('ThreeViewer', 'Directional light intensity updated', { intensity: newIntensity })
				}
			}
		})

		// Watch for autoRotate prop changes
		watch(() => props.autoRotate, (newValue) => {
			if (newValue !== camera.autoRotate.value) {
				camera.toggleAutoRotate()
			}
		})

		// Watch for autoRotateSpeed prop changes
		watch(() => props.autoRotateSpeed, (newSpeed) => {
			camera.setAutoRotateSpeed(newSpeed)
		})

		// Watch for zoomSpeed prop changes
		watch(() => props.zoomSpeed, (newSpeed) => {
			camera.setZoomSpeed(newSpeed)
		})

		// Watch for panSpeed prop changes
		watch(() => props.panSpeed, (newSpeed) => {
			camera.setPanSpeed(newSpeed)
		})

		// Watch for enableDamping prop changes
		watch(() => props.enableDamping, (enabled) => {
			camera.setDamping(enabled)
		})

		// Watch for shadow/AA changes (requires renderer update)
		watch(() => props.enableShadows, (enabled) => {
			if (renderer.value) {
				renderer.value.shadowMap.enabled = enabled
				// Re-traverse scene to update materials
				if (scene.value) {
					scene.value.traverse((child) => {
						if (child.isMesh && child.material) {
							child.material.needsUpdate = true
						}
					})
				}
			}
		})

		// Watch for measurement/annotation mode changes to adjust positioning
		watch(() => measurement.isActive.value, (active) => {
			if (active) {
				nextTick(() => {
					setTimeout(() => adjustOverlayPositioning(), VIEWER_CONFIG.uiTiming.overlayInitialDelay)
				})
			}
		})

		watch(() => annotation.isActive.value, (active) => {
			if (active) {
				nextTick(() => {
					setTimeout(() => adjustOverlayPositioning(), VIEWER_CONFIG.uiTiming.overlayInitialDelay)
				})
			}
		})

		// Emit loading state changes
		watch(() => modelLoading.isLoading.value, (loading) => {
			emit('loading-state-changed', loading)
		})

		// Emit FPS updates (throttled)
		let lastFpsEmit = 0
		const fpsThrottle = VIEWER_CONFIG.uiTiming.fpsEmitThrottle
		watch(() => performance.currentFPS.value, (fps) => {
			const now = Date.now()
			if (now - lastFpsEmit > fpsThrottle) {
				emit('fps-updated', fps)
				lastFpsEmit = now
			}
		})

		// Watch for theme changes to update scene background
		watch(() => themeComposable.resolvedTheme.value, (newTheme) => {
			if (scene.value) {
			// Apply theme to scene background
				const themeColors = VIEWER_CONFIG.theme[newTheme] || VIEWER_CONFIG.theme.light
				if (themeColors.background) {
					scene.value.background = new THREE.Color(themeColors.background)
					logger.info('ThreeViewer', 'Scene theme applied', { theme: newTheme, background: themeColors.background })
				}
			}
		})

		// Watch for fileId changes to reload model when file is selected from navigation
		// Also watch filename and dir to ensure they're updated before loading
		watch([() => props.fileId, () => props.filename, () => props.dir], async ([newFileId, newFilename, newDir], [oldFileId]) => {
			// Only reload if fileId actually changed and is valid, and not during initialization
			if (newFileId && newFileId !== oldFileId && !initializing.value) {
				// Wait for Vue to update all props before loading
				await nextTick()

				logger.info('ThreeViewer', 'File changed, reloading model', {
					oldFileId,
					newFileId,
					filename: newFilename || props.filename,
					dir: newDir || props.dir,
				})

				// Clear previous model
				if (modelRoot.value) {
					scene.value.remove(modelRoot.value)
					modelRoot.value = null
				}

				// Clear model stats
				modelStatsComposable.clearStats()

				// Load new model (loadModel will use updated props.filename and props.dir)
				try {
					await loadModel(newFileId)
				} catch (error) {
					logger.error('ThreeViewer', 'Failed to load model after file selection', error)
					emit('error', error)
					// Don't show demo scene on error - let error state handle it
				}
			}
		}, { immediate: false })

		// Helper function to verify container is ready
		const isContainerReady = () => {
			if (!container.value) return false
			if (!(container.value instanceof HTMLElement)) return false
			// Check if element is actually in the DOM
			if (!container.value.isConnected) return false
			// Check if element has dimensions (is visible)
			if (container.value.clientWidth === 0 && container.value.clientHeight === 0) return false
			return true
		}

		// Watch container ref as fallback initialization
		watch(container, async (newContainer, oldContainer) => {
			// Only initialize if container changed from null to a value, and not already initialized
			if (newContainer && !oldContainer && !isInitialized.value) {
				logger.info('ThreeViewer', 'Container ref became available, waiting for DOM...')
				// Wait a bit to ensure the DOM element is fully ready
				await nextTick()
				await new Promise(resolve => setTimeout(resolve, 150))

				// Retry checking if container is ready
				let retries = 0
				const maxRetries = 10
				while (!isContainerReady() && retries < maxRetries && !isInitialized.value) {
					await nextTick()
					await new Promise(resolve => setTimeout(resolve, 50))
					retries++
				}

				// Double-check that container is ready
				if (isContainerReady() && !isInitialized.value) {
					logger.info('ThreeViewer', 'Container DOM element ready, initializing...', {
						width: container.value.clientWidth,
						height: container.value.clientHeight,
						isConnected: container.value.isConnected,
					})
					isInitialized.value = true
					initializing.value = true
					await initializeViewer()
				} else if (!isContainerReady()) {
					const logFn = typeof logger.debug === 'function' ? logger.debug : logger.info
					logFn('ThreeViewer', 'Container ref was set but DOM element is not ready yet, will retry', {
						hasContainer: !!container.value,
						isHTMLElement: container.value instanceof HTMLElement,
						isConnected: container.value?.isConnected,
						width: container.value?.clientWidth,
						height: container.value?.clientHeight,
					})
				}
			}
		})

		// Initialization function
		const initializeViewer = async () => {
			try {
				// Initialize dependency cache
				try {
					await initCache()
					await clearExpired()
					const stats = await getCacheStats()
					logger.info('ThreeViewer', 'Cache initialized', stats)
				} catch (error) {
					logger.warn('ThreeViewer', 'Cache init failed, continuing without cache', error)
				}

				// Initialize theme system
				themeComposable.initTheme()
				if (props.themeMode && props.themeMode !== 'auto') {
					themeComposable.setTheme(props.themeMode)
				}

				// Initialize camera auto-rotate from props
				if (props.autoRotate && !camera.autoRotate.value) {
					camera.toggleAutoRotate()
				}

				// Initialize controller visibility from props (if explicitly set to false)
				if (props.showController === false) {
					controller.controllerVisible.value = false
				}

				// Initialize controller persist position from props
				// We only need to check if it's explicitly false since it defaults to true in useController
				if (props.persistControllerPosition === false) {
				// We don't have a direct setter for this config in useController,
				// but we can just not load the position if we want to respect the setting immediately
				// However, useController loads position on init.
				// Let's rely on useController checking the config, but we need to update the config
				// or pass this prop down to CircularController.
				}

				// Initialize rotation speed
				if (props.autoRotateSpeed) {
					camera.setAutoRotateSpeed(props.autoRotateSpeed)
				}

				// Test hooks for Playwright/testing
				if (typeof window !== 'undefined') {
					window.__LOAD_STARTED = true
					window.__THREEDVIEWER_VIEWER = Object.assign({}, window.__THREEDVIEWER_VIEWER, {
						cancelLoad,
						retryLoad,
					})
				}
				await init()

				// Adjust overlay positioning to avoid toolbar overlap
				adjustOverlayPositioning()
			} catch (error) {
				console.error('ThreeViewer: Initialization failed', error)
				logger.error('ThreeViewer', 'Initialization failed', error)
				initializing.value = false
				isInitialized.value = false
			}
		}

		// Lifecycle
		onMounted(async () => {
			// Wait for container to be available before initializing
			await nextTick()
			// Wait for parent wrapper to be in DOM first
			let wrapperRetries = 0
			const maxWrapperRetries = 20
			while (!document.getElementById('viewer-wrapper') && wrapperRetries < maxWrapperRetries) {
				await nextTick()
				await new Promise(resolve => setTimeout(resolve, 50))
				wrapperRetries++
			}

			// Wait a bit more to ensure DOM is fully ready
			await new Promise(resolve => setTimeout(resolve, 100))

			// Now wait for container ref to be available
			let retries = 0
			const maxRetries = 30 // Increased retries
			while (!container.value && retries < maxRetries) {
				await nextTick()
				await new Promise(resolve => setTimeout(resolve, 50))
				retries++
			}

			if (!container.value) {
				console.warn('ThreeViewer: Container ref missing after waiting')
				logger.warn('ThreeViewer', 'Container not available after waiting, will retry when container ref is set', {
					retries,
					maxRetries,
					wrapperRetries,
					containerRef: container,
					parentWrapper: document.getElementById('viewer-wrapper'),
					containerElement: container.value,
				})
				// Don't initialize yet - the watch on container will handle it when it becomes available
				return
			}

			// Container is available, initialize if not already initialized
			if (!isInitialized.value) {
				isInitialized.value = true
				await initializeViewer()
			}
		})

		onBeforeUnmount(() => {
			// Cancel animation loop
			if (animationFrameId.value !== null) {
				cancelAnimationFrame(animationFrameId.value)
				animationFrameId.value = null
			}

			// Cleanup event listeners
			window.removeEventListener('resize', onWindowResize)

			// Clean up ResizeObserver
			if (container.value && container.value._resizeObserver) {
				container.value._resizeObserver.disconnect()
				delete container.value._resizeObserver
			}

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

			// Dispose face labels
			faceLabels.dispose()

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

			// Camera composable
			camera,

			// Performance
			performance,
			currentFPS: performance.currentFPS,
			currentFrameTime: performance.currentFrameTime,
			currentMemoryUsage: performance.currentMemoryUsage,
			currentDrawCalls: performance.currentDrawCalls,
			currentTriangles: performance.currentTriangles,
			currentPerformanceMode: performance.currentPerformanceMode,
			currentPixelRatio: performance.currentPixelRatio,
			showPerformanceStats,

			// Camera
			cameraType: camera.cameraType,
			animationPresets: camera.animationPresets,

			// Export state
			isExporting: exportComposable.exporting,
			exportProgress: exportComposable.exportProgress,

			// Model stats
			modelStats: modelStatsComposable.modelStats,
			showModelStats: modelStatsComposable.showStats,
			formatIcon,

			// Progressive textures
			loadingTextures: progressiveTexturesComposable.loadingTextures,
			textureProgress: progressiveTexturesComposable.textureProgress,

			// Theme
			currentTheme: themeComposable.currentTheme,
			resolvedTheme: themeComposable.resolvedTheme,
			direction: themeComposable.direction,
			isRTL: themeComposable.isRTL,

			// Methods
			toggleOriginalModel,
			toggleComparisonModel,
			fitBothModelsToView,
			cancelLoad,
			retryLoad,
			clearError,
			getStageText,
			formatFileSize,
			toggleAutoRotate: camera.toggleAutoRotate,
			toggleCameraProjection: camera.toggleCameraProjection,
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
			directPan,
			setPerformanceMode,
			setTheme: themeComposable.setTheme,
			togglePerformanceStats,
			toggleModelStats,
			handleExport,
			getModelObject,
			handleClearCache,
			handleScreenshot,
			toggleFaceLabels,
			handleViewCubeFaceClick,
			toggleController,
			handleControllerRotate,
			handleControllerZoom,
			handleSnapToView,
			handleNudgeCamera,
			handleControllerPositionChange,
			hasModel: computed(() => modelRoot.value !== null),
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

@media (width <= 768px) {
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

/* Ensure canvas always fills container */
:deep(canvas) {
	width: 100% !important;
	height: 100% !important;
	display: block;
	outline: none;
}

.loading {
	position: absolute;
	top: 0;
	inset-inline: 0;
	bottom: 0;
	background: rgb(0 0 0 / 80%);
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
	border: 4px solid rgb(255 255 255 / 30%);
	border-top: 4px solid white;
	border-radius: 50%;
	animation: spin 1s linear infinite;
	margin: 0 auto 20px;
}

@keyframes spin {
	0% { transform: rotate(0deg); }
	100% { transform: rotate(360deg); }
}

/* Export progress overlay */
.export-progress-overlay {
	position: absolute;
	top: 0;
	inset-inline: 0;
	bottom: 0;
	background: rgb(0 0 0 / 85%);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1500;
	backdrop-filter: blur(4px);
}

.export-progress-content {
	text-align: center;
	color: white;
	max-width: 400px;
	padding: 30px;
	background: rgb(0 0 0 / 70%);
	border-radius: 12px;
	border: 1px solid rgb(255 255 255 / 10%);
	box-shadow: 0 8px 32px rgb(0 0 0 / 30%);
}

.export-icon {
	font-size: 48px;
	margin-bottom: 16px;
	animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
	0%, 100% { transform: scale(1); opacity: 1; }
	50% { transform: scale(1.1); opacity: 0.8; }
}

.export-stage {
	font-size: 16px;
	font-weight: 500;
	margin-bottom: 12px;
	color: #fff;
}

.export-percentage {
	font-size: 28px;
	font-weight: bold;
	margin-bottom: 16px;
	color: var(--color-primary-element, #4287f5);
}

.export-progress-overlay.mobile .export-progress-content {
	max-width: 90%;
	padding: 20px;
}

.export-progress-overlay.mobile .export-icon {
	font-size: 36px;
}

.export-progress-overlay.mobile .export-stage {
	font-size: 14px;
}

.export-progress-overlay.mobile .export-percentage {
	font-size: 24px;
}

/* Model Statistics Panel */
.model-stats-overlay {
	position: absolute;
	top: 80px;
	inset-inline-start: 20px;
	width: 320px;
	max-height: 600px;
	background: rgb(0 0 0 / 90%);
	border: 1px solid rgb(255 255 255 / 20%);
	border-radius: 8px;
	color: white;
	z-index: 300;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	box-shadow: 0 8px 32px rgb(0 0 0 / 40%);
}

.stats-panel-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 16px 20px;
	background: rgb(0 0 0 / 50%);
	border-bottom: 1px solid rgb(255 255 255 / 20%);
}

.stats-title-group {
	display: flex;
	align-items: center;
	gap: 12px;
}

.stats-title-group .format-icon {
	width: 24px;
	height: 24px;
	object-fit: contain;
	filter: brightness(0) invert(1); /* Make icon white for dark bg */
	opacity: 0.9;
}

.stats-panel-header h3 {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: var(--color-primary-element, #4287f5);
}

.close-stats-btn {
	background: transparent;
	border: none;
	color: white;
	font-size: 28px;
	line-height: 1;
	cursor: pointer;
	padding: 4px 8px;
	border-radius: 4px;
	transition: background 0.2s ease;
}

.close-stats-btn:hover {
	background: rgb(255 255 255 / 10%);
}

.stats-panel-content {
	flex: 1;
	overflow-y: auto;
	padding: 16px 20px;
}

.stats-section {
	margin-bottom: 20px;
	padding-bottom: 16px;
	border-bottom: 1px solid rgb(255 255 255 / 10%);
}

.stats-section:last-child {
	border-bottom: none;
	margin-bottom: 0;
}

.stats-section h4 {
	margin: 0 0 12px;
	font-size: 14px;
	font-weight: 600;
	color: rgb(255 255 255 / 90%);
}

.stat-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 6px 0;
	font-size: 13px;
}

.stat-row span:first-child {
	color: rgb(255 255 255 / 70%);
}

.stat-row .stat-value {
	font-weight: 600;
	color: #fff;
	font-family: 'Courier New', monospace;
}

.material-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.material-item {
	display: flex;
	justify-content: space-between;
	padding: 8px 12px;
	background: rgb(255 255 255 / 5%);
	border-radius: 4px;
	font-size: 12px;
}

.material-name {
	color: #fff;
	font-weight: 500;
}

.material-type {
	color: rgb(255 255 255 / 60%);
	font-size: 11px;
}

.no-items {
	color: rgb(255 255 255 / 50%);
	font-style: italic;
	font-size: 12px;
	padding: 8px 0;
}

.more-items {
	color: rgb(255 255 255 / 60%);
	font-size: 12px;
	padding: 8px 12px;
	text-align: center;
	font-style: italic;
}

/* Mobile adjustments for stats panel */
.model-stats-overlay.mobile {
	top: 60px;
	inset-inline: 10px;
	width: auto;
	max-height: 500px;
}

.model-stats-overlay.mobile .stats-panel-header {
	padding: 12px 16px;
}

.model-stats-overlay.mobile .stats-panel-content {
	padding: 12px 16px;
}

.model-stats-overlay.mobile .stat-row {
	font-size: 12px;
}

.error-display {
	position: absolute;
	top: 20px;
	inset-inline: 20px;
	background: rgb(255 0 0 / 90%);
	color: white;
	padding: 20px;
	border-radius: 8px;
	z-index: 1001;
}

/* Texture Progress Indicator */
.texture-progress-indicator {
	position: absolute;
	bottom: 10px;
	inset-inline-end: 10px;
	background: rgb(0 0 0 / 85%);
	color: white;
	padding: 12px 16px;
	border-radius: 8px;
	font-size: 12px;
	z-index: 250;
	display: flex;
	align-items: center;
	gap: 8px;
	border: 1px solid rgb(255 255 255 / 20%);
	box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
	backdrop-filter: blur(10px);
	min-width: 200px;
}

.texture-icon {
	font-size: 16px;
	line-height: 1;
}

.texture-status {
	flex: 1;
	font-size: 11px;
	color: rgb(255 255 255 / 90%);
}

.mini-progress-bar {
	width: 80px;
	height: 4px;
	background: rgb(255 255 255 / 20%);
	border-radius: 2px;
	overflow: hidden;
}

.progress-fill {
	height: 100%;
	background: var(--color-primary-element, #4287f5);
	transition: width 0.3s ease;
	border-radius: 2px;
}

.texture-progress-indicator.mobile {
	bottom: 60px;
	inset-inline: 10px;
	font-size: 11px;
}

/* Performance Stats Overlay */
.performance-stats {
	position: absolute !important;
	bottom: 10px !important;
	inset-inline-start: 10px !important;
	background: rgb(0 0 0 / 85%) !important;
	color: #fff !important;
	padding: 12px !important;
	border-radius: 8px !important;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
	font-size: 12px !important;
	z-index: 900 !important;
	min-width: 180px !important;
	border: 1px solid rgb(255 255 255 / 20%) !important;
	box-shadow: 0 4px 12px rgb(0 0 0 / 30%) !important;
	display: block !important;
	backdrop-filter: blur(10px) !important;
}

.stats-header {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 10px;
	padding-bottom: 8px;
	border-bottom: 1px solid rgb(255 255 255 / 20%);
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
	background: rgb(255 193 7 / 30%);
	color: #ffc107;
}

.stats-mode.mode-balanced {
	background: rgb(76 175 80 / 30%);
	color: #4caf50;
}

.stats-mode.mode-high {
	background: rgb(33 150 243 / 30%);
	color: #2196f3;
}

.stats-mode.mode-ultra {
	background: rgb(156 39 176 / 30%);
	color: #9c27b0;
}

.stats-mode.mode-auto {
	background: rgb(158 158 158 / 30%);
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
	color: rgb(255 255 255 / 70%);
	font-size: 11px;
}

.stat-value {
	font-weight: bold;
	font-size: 12px;
	color: #fff;
}

.stat-value.good,
.stat-value.warning,
.stat-value.poor {
	padding: 2px 6px !important;
	border-radius: 4px !important;
	line-height: normal !important;
	min-height: auto !important;
	margin: 0 !important;
}

.stat-value.good {
	background: rgb(76 175 80 / 20%);
	color: #81c784;
}

.stat-value.warning {
	background: rgb(255 178 0 / 86%) !important;
	color: #000000 !important;
}

.stat-value.poor {
	background: rgb(244 67 54 / 20%);
	color: #e57373;
}

.comparison-controls {
	position: absolute;
	top: 60px; /* Position below main toolbar */
	inset-inline-end: 8px;
	z-index: 10;
	background: rgb(0 0 0 / 45%);
	backdrop-filter: blur(8px);
	padding: 6px 8px;
	border-radius: 8px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	align-items: center;
	transition: all 0.3s ease;
	border: 1px solid rgb(255 255 255 / 10%);
	box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
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
	box-shadow: 0 2px 4px rgb(0 0 0 / 10%);
	position: relative;
	overflow: hidden;
}

.comparison-btn::before {
	content: '';
	position: absolute;
	top: 0;
	inset-inline-start: -100%;
	width: 100%;
	height: 100%;
	background: linear-gradient(90deg, transparent, rgb(255 255 255 / 20%), transparent);
	transition: left 0.5s;
}

.comparison-btn:hover::before {
	inset-inline-start: 100%;
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
	inset-inline: 4px;
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
@media (width <= 768px) and (orientation: landscape) {
	.comparison-controls.mobile {
		top: 40px;
		inset-inline: 2px;
		padding: 4px 6px;
	}

	.comparison-controls.mobile .comparison-btn {
		padding: 4px 6px;
		min-height: 36px;
	}
}

/* Very small screens */
@media (width <= 480px) {
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
	background: rgb(30 30 30 / 80%);
	border-color: rgb(255 255 255 / 20%);
	box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
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
	box-shadow: 0 0 0 4px rgb(13 71 161 / 20%);
}

/* High contrast mode for comparison controls */
@media (prefers-contrast: high) {
	.comparison-btn {
		border: 2px solid currentcolor;
	}

	.comparison-controls {
		border: 2px solid rgb(255 255 255 / 50%);
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
	inset-inline: 20px;
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
	background: rgb(0 0 0 / 70%);
	padding: 10px;
	border-radius: 5px;
}

.hint-icon {
	font-size: 20px;
}

.hint-text {
	font-size: 12px;
}

@media (width <= 768px) {
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
	inset-inline-end: var(--overlay-side-spacing);
	background: rgb(0 0 0 / 80%);
	border: 1px solid #0f0;
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
	border-bottom: 1px solid #0f0;
}

.measurement-header h3 {
	margin: 0;
	font-size: 16px;
	color: #0f0;
}

.measurement-controls {
	display: flex;
	gap: 10px;
	align-items: center;
}

.unit-selector {
	background: #2a2a2a;
	color: #0f0;
	border: 1px solid #0f0;
	padding: 5px 10px;
	border-radius: 4px;
	font-size: 12px;
	cursor: pointer;
}

.unit-selector:hover {
	background: #3a3a3a;
}

.clear-measurements-btn {
	background: #f44;
	color: white;
	border: none;
	padding: 5px 10px;
	border-radius: 4px;
	cursor: pointer;
	font-size: 12px;
}

.clear-measurements-btn:hover {
	background: #f66;
}

.measurement-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.measurement-item {
	background: rgb(0 255 0 / 10%);
	border: 1px solid rgb(0 255 0 / 30%);
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
	color: #0f0;
}

.delete-measurement-btn {
	background: #f44;
	color: white;
	border: none;
	padding: 3px 8px;
	border-radius: 3px;
	cursor: pointer;
	font-size: 11px;
}

.delete-measurement-btn:hover {
	background: #f66;
}

.measurement-distance {
	font-size: 16px;
	font-weight: bold;
	color: #fff;
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
	color: #ccc;
}

.point-coords {
	font-size: 11px;
	color: #aaa;
	font-family: monospace;
}

@media (width <= 768px) {
	.measurement-overlay {
		top: var(--overlay-mobile-top-spacing);
		inset-inline: var(--overlay-mobile-side-spacing);
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
	inset-inline-start: var(--overlay-side-spacing);
	background: rgb(0 0 0 / 80%);
	border: 1px solid #f00;
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
	border-bottom: 1px solid #f00;
}

.annotation-header h3 {
	margin: 0;
	font-size: 16px;
	color: #f00;
}

.clear-annotations-btn {
	background: #f44;
	color: white;
	border: none;
	padding: 5px 10px;
	border-radius: 4px;
	cursor: pointer;
	font-size: 12px;
}

.clear-annotations-btn:hover {
	background: #f66;
}

.annotation-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.annotation-item {
	background: rgb(255 0 0 / 10%);
	border: 1px solid rgb(255 0 0 / 30%);
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
	color: #f00;
}

.delete-annotation-btn {
	background: #f44;
	color: white;
	border: none;
	padding: 3px 8px;
	border-radius: 3px;
	cursor: pointer;
	font-size: 11px;
}

.delete-annotation-btn:hover {
	background: #f66;
}

.annotation-details {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.annotation-text-input {
	background: rgb(255 255 255 / 10%);
	border: 1px solid rgb(255 0 0 / 50%);
	border-radius: 3px;
	padding: 5px 8px;
	color: white;
	font-size: 12px;
	width: 100%;
}

.annotation-text-input::placeholder {
	color: #ccc;
}

.annotation-text-input:focus {
	outline: none;
	border-color: #f00;
	background: rgb(255 255 255 / 15%);
}

.annotation-point {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.point-label {
	font-size: 12px;
	color: #ccc;
}

.point-coords {
	font-size: 11px;
	color: #aaa;
	font-family: monospace;
}

@media (width <= 768px) {
	.annotation-overlay {
		top: var(--overlay-mobile-top-spacing);
		inset-inline: var(--overlay-mobile-side-spacing);
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

/* RTL (Right-to-Left) Support */
[dir="rtl"] .model-stats-overlay {
	inset-inline: auto 20px;
}

[dir="rtl"] .export-progress-overlay {
	/* Center aligned, no change needed */
}

[dir="rtl"] .texture-progress-indicator {
	inset-inline: 10px auto;
}

[dir="rtl"] .performance-stats {
	inset-inline: auto 10px;
}

[dir="rtl"] .measurement-overlay,
[dir="rtl"] .annotation-overlay {
	/* Top-center aligned, no change needed */
}
</style>
