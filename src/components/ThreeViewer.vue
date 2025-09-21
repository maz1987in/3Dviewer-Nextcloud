<template>
	<div class="three-viewer" ref="container" :aria-label="t('threedviewer','3D viewer canvas container')" :class="{ 'mobile': isMobile }">
		<!-- Loading state -->
		<div v-if="isLoading" class="loading" aria-live="polite" :class="{ 'mobile': isMobile }">
			<div class="loading-content">
				<div class="loading-spinner" :class="{ 'mobile': isMobile }"></div>
				<div class="loading-text">
					<div class="loading-stage">{{ getStageText(progress.stage) }}</div>
					<div class="loading-details">
			<span v-if="progress.message">{{ progress.message }}</span>
						<span v-else-if="progress.total > 0">{{ formatFileSize(progress.loaded) }} / {{ formatFileSize(progress.total) }}</span>
						<span v-else-if="progress.loaded > 0">{{ formatFileSize(progress.loaded) }}</span>
			<span v-else>{{ t('threedviewer', 'Loading 3D scene…') }}</span>
			</div>
					<div v-if="progressPercentage > 0" class="loading-percentage">{{ progressPercentage }}%</div>
				</div>
				<div v-if="progress.total > 0" class="progress-bar" :aria-label="t('threedviewer','Model load progress')" role="progressbar" :aria-valuemin="0" :aria-valuemax="progress.total" :aria-valuenow="progress.loaded" :class="{ 'mobile': isMobile }">
					<div class="progress-bar__fill" :style="{ width: Math.min(100, progressPercentage) + '%' }"></div>
					<div class="progress-bar__label">{{ progressPercentage }}%</div>
				</div>
				<div class="loading-actions" :class="{ 'mobile': isMobile }">
					<button v-if="progress.stage !== 'error'" type="button" class="cancel-btn" @click="cancelLoad" :disabled="aborting" :class="{ 'mobile': isMobile }">
						{{ aborting ? t('threedviewer','Canceling…') : t('threedviewer','Cancel loading') }}
					</button>
					<button v-if="progress.stage === 'error'" type="button" class="retry-btn" @click="retryLoad" :class="{ 'mobile': isMobile }">
						{{ t('threedviewer','Retry') }}
					</button>
				</div>
			</div>
		</div>
		
		<!-- Error display -->
		<div v-if="hasError && errorState" class="error-display" :class="{ 'mobile': isMobile }">
			<div class="error-content">
				<div class="error-icon">⚠️</div>
				<div class="error-message">{{ errorState?.message || 'An error occurred' }}</div>
				<div v-if="errorState?.details" class="error-details">{{ errorState.details }}</div>
				<div v-if="errorState?.suggestions && errorState.suggestions.length > 0" class="error-suggestions">
					<div class="suggestions-title">{{ t('threedviewer', 'Suggestions:') }}</div>
					<ul class="suggestions-list">
						<li v-for="suggestion in errorState.suggestions" :key="suggestion" class="suggestion-item">
							{{ suggestion }}
						</li>
					</ul>
				</div>
				<div class="error-actions">
					<button v-if="canRetry" type="button" class="retry-btn" @click="retryLoad" :class="{ 'mobile': isMobile }">
						{{ t('threedviewer','Retry') }}
					</button>
					<button type="button" class="dismiss-btn" @click="clearError" :class="{ 'mobile': isMobile }">
						{{ t('threedviewer','Dismiss') }}
					</button>
				</div>
			</div>
		</div>
		
		<!-- Comparison controls -->
		<div v-if="isComparisonMode && hasComparisonModel" class="comparison-controls" :class="{ 'mobile': isMobile }">
			<div class="comparison-buttons">
				<button @click="toggleOriginalModel" class="comparison-btn" :title="t('threedviewer', 'Toggle original model')">
					<span class="btn-icon">👁️</span>
					<span class="btn-text">{{ t('threedviewer', 'Original') }}</span>
				</button>
				<button @click="toggleComparisonModel" class="comparison-btn" :title="t('threedviewer', 'Toggle comparison model')">
					<span class="btn-icon">👁️</span>
					<span class="btn-text">{{ t('threedviewer', 'Comparison') }}</span>
				</button>
				<button @click="fitBothModelsToView" class="comparison-btn" :title="t('threedviewer', 'Fit both models to view')">
					<span class="btn-icon">📏</span>
					<span class="btn-text">{{ t('threedviewer', 'Fit Both') }}</span>
				</button>
			</div>
		</div>
		
		<!-- Mobile gesture hints -->
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
				<button type="button" class="clear-measurements-btn" @click="measurement.clearAllMeasurements" :class="{ 'mobile': isMobile }">
					{{ t('threedviewer', 'Clear All') }}
				</button>
			</div>
			<div class="measurement-list">
				<div v-for="(measurement, index) in measurements" :key="measurement.id" class="measurement-item">
					<div class="measurement-info">
						<span class="measurement-label">{{ t('threedviewer', 'Measurement') }} {{ index + 1 }}</span>
						<span class="measurement-distance">{{ measurement.distance.toFixed(2) }} units</span>
					</div>
					<div class="measurement-details">
						<div class="measurement-point">
							<span class="point-label">{{ t('threedviewer', 'Point 1') }}:</span>
							<span class="point-coords">({{ measurement.point1.x.toFixed(2) }}, {{ measurement.point1.y.toFixed(2) }}, {{ measurement.point1.z.toFixed(2) }})</span>
						</div>
						<div class="measurement-point">
							<span class="point-label">{{ t('threedviewer', 'Point 2') }}:</span>
							<span class="point-coords">({{ measurement.point2.x.toFixed(2) }}, {{ measurement.point2.y.toFixed(2) }}, {{ measurement.point2.z.toFixed(2) }})</span>
						</div>
					</div>
				</div>
			</div>
		</div>
		
		<!-- Annotation overlay -->
		<div v-if="annotationActive && annotations.length > 0" class="annotation-overlay" :class="{ 'mobile': isMobile }">
			<div class="annotation-header">
				<h3>{{ t('threedviewer', 'Annotations') }}</h3>
				<button type="button" class="clear-annotations-btn" @click="clearAllAnnotations" :class="{ 'mobile': isMobile }">
					{{ t('threedviewer', 'Clear All') }}
				</button>
			</div>
			<div class="annotation-list">
				<div v-for="(annotation, index) in annotations" :key="annotation.id" class="annotation-item">
					<div class="annotation-info">
						<span class="annotation-label">{{ t('threedviewer', 'Annotation') }} {{ index + 1 }}</span>
						<button type="button" class="delete-annotation-btn" @click="deleteAnnotation(annotation.id)" :class="{ 'mobile': isMobile }">
							{{ t('threedviewer', 'Delete') }}
						</button>
					</div>
					<div class="annotation-details">
						<input 
							v-model="annotation.text" 
							@blur="updateAnnotationText(annotation.id, annotation.text)"
							class="annotation-text-input"
							:placeholder="t('threedviewer', 'Enter annotation text...')"
						/>
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
import { useCamera } from '../composables/useCamera.js'
import { useModelLoading } from '../composables/useModelLoading.js'
import { useComparison } from '../composables/useComparison.js'
import { useMeasurement } from '../composables/useMeasurement.js'
import { useAnnotation } from '../composables/useAnnotation.js'
import { logError } from '../utils/error-handler.js'

export default {
	name: 'ThreeViewerRefactored',
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
		
		// Composables
		const camera = useCamera()
		const modelLoading = useModelLoading()
		const comparison = useComparison()
		const measurement = useMeasurement()
		const annotation = useAnnotation()
		
		// Computed properties
		const isMobile = computed(() => camera.isMobile.value)
		const isLoading = computed(() => modelLoading.isLoading.value)
		const hasError = computed(() => modelLoading.hasError.value)
		const canRetry = computed(() => modelLoading.canRetry.value)
		const progress = computed(() => modelLoading.progress.value)
		const progressPercentage = computed(() => modelLoading.progressPercentage.value)
		const errorState = computed(() => modelLoading.errorState.value)
		const isComparisonMode = computed(() => comparison.comparisonMode.value)
		const hasComparisonModel = computed(() => comparison.comparisonModel.value !== null)
		
		// Methods
		const init = async () => {
			try {
				// Initialize decoders
				await modelLoading.initDecoders()
				
				// Setup Three.js scene
				await setupScene()
				
				// Initialize camera
				const width = container.value.clientWidth
				const height = container.value.clientHeight
				camera.initCamera(width, height, isMobile.value)
				
				// Setup controls (disabled due to NaN issue)
				await camera.setupControls(renderer.value)
				
				// Setup custom controls for interaction
				if (renderer.value && renderer.value.domElement) {
					camera.setupCustomControls(renderer.value.domElement, (event, camera) => {
						// Handle measurement clicks
						measurement.handleClick(event, camera)
						// Handle annotation clicks
						annotation.handleClick(event, camera)
					})
				}
				
				// Initialize measurement system
				measurement.init(scene.value)
				
				// Initialize annotation system
				annotation.init(scene.value)
				
				// Load model if fileId provided
				if (props.fileId) {
					await loadModel(props.fileId)
				}
				
				// Start animation loop
				animate()
				
				// Setup event listeners
				setupEventListeners()
				
				logError('ThreeViewer', 'Initialization complete')
			} catch (error) {
				logError('ThreeViewer', 'Initialization failed', error)
				emit('error', error)
			}
		}
		
		const setupScene = async () => {
			// Create scene
			scene.value = new THREE.Scene()
			
			// Create renderer
			renderer.value = new THREE.WebGLRenderer({ 
				antialias: true,
				alpha: true,
				powerPreference: 'high-performance'
			})
			
			renderer.value.setSize(container.value.clientWidth, container.value.clientHeight)
			renderer.value.setPixelRatio(Math.min(window.devicePixelRatio, 2))
			renderer.value.shadowMap.enabled = true
			renderer.value.shadowMap.type = THREE.PCFSoftShadowMap
			
			container.value.appendChild(renderer.value.domElement)
			
			// Debug: Check renderer setup
			console.log('🔍 DEBUG - Renderer setup:', {
				containerWidth: container.value.clientWidth,
				containerHeight: container.value.clientHeight,
				rendererSize: renderer.value.getSize(new THREE.Vector2()),
				domElement: renderer.value.domElement ? 'exists' : 'null',
				domElementStyle: renderer.value.domElement ? renderer.value.domElement.style.cssText : 'null',
				domElementVisible: renderer.value.domElement ? renderer.value.domElement.offsetWidth > 0 : false
			})
			
			// Setup lighting
			setupLighting()
			
			// Setup grid and axes
			setupHelpers()
			
			logError('ThreeViewer', 'Scene setup complete')
		}
		
		const setupLighting = () => {
			// Ambient light
			const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
			scene.value.add(ambientLight)
			
			// Directional light
			const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
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
		
		const loadModel = async (fileId) => {
			try {
				// Get the filename from props or URL
				const filename = props.filename ? decodeURIComponent(props.filename) : 'model.glb'
				const extension = filename.split('.').pop().toLowerCase()
				
				// Debug logging
				console.log('🔍 DEBUG - Props received:', {
					fileId,
					propsFilename: props.filename,
					propsDir: props.dir,
					decodedFilename: props.filename ? decodeURIComponent(props.filename) : 'N/A',
					decodedDir: props.dir ? decodeURIComponent(props.dir) : 'N/A'
				})
				
				logError('ThreeViewer', 'Loading model', {
					fileId,
					filename,
					dir: props.dir,
					userId: window.OC?.getCurrentUser?.()?.uid || 'admin',
					propsFilename: props.filename,
					decodedFilename: props.filename ? decodeURIComponent(props.filename) : 'N/A'
				})
				
				// Try multiple approaches to fetch the model
				let response
				let error
				const userId = window.OC?.getCurrentUser?.()?.uid || 'admin'
				const dir = props.dir || 'Models'
				
				// First try: Use the custom API endpoint
				try {
					response = await fetch(`/apps/threedviewer/file/${fileId}`)
					if (response.ok) {
						// Success with custom API
			} else {
						throw new Error(`Custom API failed: ${response.status}`)
					}
				} catch (e) {
					// Fallback: Use Nextcloud Files API
					try {
						response = await fetch(`/remote.php/dav/files/${userId}/${dir}/${filename}`)
						if (!response.ok) {
							throw new Error(`Files API failed: ${response.status}`)
						}
					} catch (e2) {
						// Final fallback: Try direct file access
						response = await fetch(`/remote.php/dav/files/${userId}/${filename}`)
						if (!response.ok) {
							throw new Error(`All methods failed: Custom API (${e.message}), Files API (${e2.message}), Direct access (${response.status})`)
						}
					}
				}
				
				if (!response.ok) {
					const errorText = await response.text()
					throw new Error(`Failed to fetch model: ${response.status} ${response.statusText} - ${errorText}`)
				}
				
				// Get the array buffer
				const arrayBuffer = await response.arrayBuffer()
				
				// Use the model loading composable to load the actual model
				const loadedModel = await modelLoading.loadModel(arrayBuffer, extension, {
					fileId,
					filename,
					dir: props.dir
				})
				
				if (loadedModel && loadedModel.object3D) {
					// Add the loaded model to the scene
					modelRoot.value = loadedModel.object3D
					scene.value.add(modelRoot.value)
					
					// Debug logging
					console.log('🔍 DEBUG - Model added to scene:')
					console.log('  - Children count:', modelRoot.value.children.length)
					console.log('  - Position:', modelRoot.value.position.x, modelRoot.value.position.y, modelRoot.value.position.z)
					console.log('  - Visible:', modelRoot.value.visible)
					console.log('  - Scene children:', scene.value.children.length)
					console.log('  - Has geometry:', modelRoot.value.geometry ? 'yes' : 'no')
					if (modelRoot.value.children[0]) {
						console.log('  - First child type:', modelRoot.value.children[0].type)
						console.log('  - First child visible:', modelRoot.value.children[0].visible)
						console.log('  - First child position:', modelRoot.value.children[0].position.x, modelRoot.value.children[0].position.y, modelRoot.value.children[0].position.z)
					}
					
					// Fit camera to object
					camera.fitCameraToObject(modelRoot.value)
					
					// Update grid size
					updateGridSize(modelRoot.value)
					
					emit('model-loaded', { fileId, filename })
					logError('ThreeViewer', 'Model loaded successfully')
				} else {
					// Fallback to demo scene if model loading failed
					createDemoScene(fileId)
				}
			} catch (error) {
				logError('ThreeViewer', 'Failed to load model', error)
				emit('error', error)
			}
		}
		
		const createDemoScene = (fileId) => {
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
			logError('ThreeViewer', 'Demo scene created')
		}
		
		const updateGridSize = (obj) => {
			if (!grid.value || !obj) return
			
			const box = new THREE.Box3().setFromObject(obj)
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
				gridSize = 50
				divisions = 25
					} else {
				gridSize = 100
				divisions = 50
			}
			
			// Calculate grid position at the bottom of the model
			const gridY = center.y - (size.y / 2) - 0.1 // Slightly below the bottom of the model
			
			// Update grid
			scene.value.remove(grid.value)
			grid.value = new THREE.GridHelper(gridSize, divisions)
			grid.value.material.color.setHex(0x00ff00)
			grid.value.material.opacity = 1.0
			grid.value.material.transparent = false
			
			// Position grid at the bottom of the model
			grid.value.position.set(center.x, gridY, center.z)
			
			scene.value.add(grid.value)
			
			logError('ThreeViewer', 'Grid size updated', { 
				gridSize, 
				divisions, 
				maxDim, 
				modelCenter: { x: center.x, y: center.y, z: center.z },
				gridPosition: { x: center.x, y: gridY, z: center.z }
			})
		}
		
		const animate = () => {
			requestAnimationFrame(animate)
			
			// Update controls
			camera.updateControls()
			
			// Render scene
			camera.render(renderer.value, scene.value)
		}
		
		const setupEventListeners = () => {
			window.addEventListener('resize', onWindowResize)
		}
		
		const onWindowResize = () => {
			const width = container.value.clientWidth
			const height = container.value.clientHeight
			
			camera.onWindowResize(width, height)
			renderer.value.setSize(width, height)
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
		
		const fitBothModelsToView = () => {
			if (modelRoot.value && hasComparisonModel.value) {
				comparison.fitBothModelsToView(modelRoot.value, hasComparisonModel.value, camera.fitBothModelsToView)
			}
		}
		
		// Loading methods
		const cancelLoad = () => {
			modelLoading.cancelLoad()
			aborting.value = true
		}
		
		const retryLoad = async () => {
			try {
				await modelLoading.retryLoad(() => loadModel(props.fileId))
			} catch (error) {
				logError('ThreeViewer', 'Retry failed', error)
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
			measurement.toggleMeasurement()
			console.log('🔍 DEBUG - Measurement mode toggled:', measurement.isActive.value)
		}
		
		const toggleAnnotationMode = () => {
			annotation.toggleAnnotation()
			console.log('🔍 DEBUG - Annotation mode toggled:', annotation.isActive.value)
			emit('toggle-annotation')
		}
		
		const deleteAnnotation = (annotationId) => {
			annotation.deleteAnnotation(annotationId)
			console.log('🔍 DEBUG - Annotation deleted:', annotationId)
		}
		
		const updateAnnotationText = (annotationId, newText) => {
			annotation.updateAnnotationText(annotationId, newText)
			console.log('🔍 DEBUG - Annotation text updated:', annotationId, newText)
		}
		
		const clearAllAnnotations = () => {
			annotation.clearAllAnnotations()
			console.log('🔍 DEBUG - All annotations cleared')
		}
		
		const toggleComparisonMode = () => {
			// TODO: Implement comparison functionality
			console.log('🔍 DEBUG - Comparison mode toggled (not yet implemented)')
			emit('toggle-comparison')
		}
		
		const setPerformanceMode = (mode) => {
			// TODO: Implement performance mode functionality
			console.log('🔍 DEBUG - Performance mode set to:', mode)
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
		
		// Lifecycle
		onMounted(() => {
			init()
		})
		
		onBeforeUnmount(() => {
			// Cleanup
			window.removeEventListener('resize', onWindowResize)
			
			if (renderer.value) {
				renderer.value.dispose()
			}
			
			camera.dispose()
			modelLoading.clearModel()
			comparison.clearComparison()
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
			resetView,
			fitToView,
			toggleMeasurementMode,
			toggleAnnotationMode,
			deleteAnnotation,
			updateAnnotationText,
			clearAllAnnotations,
			toggleComparisonMode,
			setPerformanceMode
		}
	}
}
</script>

<style scoped>
.three-viewer { 
	position: relative; 
	width: 100%; 
	height: 100%;
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

.comparison-controls {
	position: absolute;
	top: 20px;
	right: 20px;
	z-index: 100;
}

.comparison-buttons {
	display: flex;
	gap: 10px;
}

.comparison-btn {
	background: rgba(0, 0, 0, 0.7);
	color: white;
	border: none;
	padding: 10px;
	border-radius: 5px;
	cursor: pointer;
	display: flex;
	align-items: center;
	gap: 5px;
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
	top: 20px;
	right: 20px;
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
		top: 10px;
		right: 10px;
		left: 10px;
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
	top: 20px;
	left: 20px;
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
		top: 10px;
		left: 10px;
		right: 10px;
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
