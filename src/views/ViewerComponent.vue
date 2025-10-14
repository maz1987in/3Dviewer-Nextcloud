<template>
	<div class="threedviewer-wrapper" :class="{ 'showing-progress': loadingProgress.show }">
		<canvas ref="canvas" class="threedviewer-canvas" />
		
		<!-- Progress bar for loading states -->
		<div v-if="loadingProgress.show" class="threedviewer-progress">
			<p>{{ loadingProgress.message }}</p>
			<NcProgressBar 
				:value="loadingProgress.value" 
				:max="100"
				:size="'small'"
				:indeterminate="loadingProgress.indeterminate"
			/>
			<p v-if="loadingProgress.details">{{ loadingProgress.details }}</p>
		</div>
		
		<!-- Open in full viewer button -->
		<NcButton
			v-if="hasLoaded"
			type="primary"
			class="open-in-app-button"
			@click.prevent="openInFullViewer">
			{{ t('threedviewer', 'Open in 3D Viewer') }} ↗
		</NcButton>
	</div>
</template>

<script>
import { NcProgressBar, NcButton } from '@nextcloud/vue'
import { generateUrl } from '@nextcloud/router'
import { loadModelWithDependencies } from '../loaders/multiFileHelpers.js'
import { removePlaceholders } from '../utils/scene-helpers.js'
import { useScene } from '../composables/useScene.js'
import { useCamera } from '../composables/useCamera.js'
import { logger } from '../utils/logger.js'

export default {
	name: 'ViewerComponent',
	
	components: {
		NcProgressBar,
		NcButton,
	},
	
	// Setup function - integrates composables with Options API
	setup() {
		// Initialize composables
		const sceneComposable = useScene()
		const cameraComposable = useCamera()
		
		// Return composables for use in Options API methods
		return {
			sceneComposable,
			cameraComposable,
		}
	},
	
	props: {
		// Viewer passes these props automatically
		davPath: {
			type: String,
			required: true,
		},
		filename: {
			type: String,
			required: true,
		},
		basename: {
			type: String,
			required: true,
		},
		mime: {
			type: String,
			required: true,
		},
		fileid: {
			type: [String, Number],
			required: true,
		},
		// Viewer passes this to indicate if this instance is active
		active: {
			type: Boolean,
			default: false,
		},
		// Optional: Viewer passes this for multi-file navigation
		files: {
			type: Array,
			required: false,
			default: () => [],
		},
	},

	data() {
		return {
			scene: null,
			camera: null,
			renderer: null,
			controls: null,
			loadingProgress: {
				show: false,
				value: 0,
				message: '',
				details: '',
				indeterminate: true,
			},
			isActive: false, // Track if this instance is the active one
			hasLoaded: false, // Track if model has been loaded
			loadingCancelled: false, // Flag to cancel ongoing loads
			animationFrameId: null, // Track animation frame for cleanup
			cleanupTimeoutId: null, // Track cleanup timeout for proper disposal
		}
	},

	watch: {
		// Watch for active prop changes from Viewer
		active(newActive, oldActive) {
			logger.info('ViewerComponent', 'Active prop changed', { newActive, oldActive, filename: this.filename })
			
			if (newActive && !oldActive && !this.hasLoaded) {
				// Component became active - start loading
				logger.info('ViewerComponent', 'Instance activated via prop, starting load', { filename: this.filename })
				this.isActive = true
				this.loadingCancelled = false
				this.$emit('update:loaded', false)
				this.initViewer()
			} else if (newActive && !oldActive && this.hasLoaded) {
				// Component became active but already loaded - ensure progress is hidden
				logger.info('ViewerComponent', 'Instance activated, already loaded', { filename: this.filename })
				this.isActive = true
				this.updateProgress(false)
				this.$emit('update:loaded', true)
			} else if (!newActive && oldActive) {
				// Component became inactive - cancel loading if in progress
				logger.info('ViewerComponent', 'Instance deactivated, cancelling load', { filename: this.filename })
				this.loadingCancelled = true
				this.isActive = false
			}
		},
		// Watch for file changes when navigating in Viewer
		fileid(newId, oldId) {
			if (newId && newId !== oldId) {
				logger.info('ViewerComponent', 'File changed, reloading viewer', { newId, oldId })
				this.hasLoaded = false
				this.loadingCancelled = false
				this.initViewer()
			}
		},
		// Watch files prop to suppress Viewer warning
		files(newFiles) {
			if (newFiles && newFiles.length > 0) {
				logger.info('ViewerComponent', 'Files list updated', { count: newFiles.length })
			}
		},
	},

	mounted() {
		logger.info('ViewerComponent', 'Component mounted', {
			filename: this.filename,
			mime: this.mime,
			davPath: this.davPath,
			active: this.active,
		})
		
		// Check if we're already active on mount (initial file)
		if (this.active) {
			logger.info('ViewerComponent', 'Instance is active on mount, starting load', { filename: this.filename })
			this.isActive = true
			this.$emit('update:loaded', false)
			this.initViewer()
		} else {
			// Wait for active prop to change
			this.isActive = false
			logger.info('ViewerComponent', 'Instance created, waiting for active prop from Viewer')
		}
	},

	beforeDestroy() {
		// Cancel animation loop
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId)
			this.animationFrameId = null
		}

		// Cancel any ongoing loading
		this.loadingCancelled = true
		
		// Use the enhanced cleanup method
		this.cleanupWebGLContext()
		
		// Cleanup composables (hybrid integration)
		if (this.sceneComposable && typeof this.sceneComposable.dispose === 'function') {
			this.sceneComposable.dispose()
		}
		if (this.cameraComposable && typeof this.cameraComposable.dispose === 'function') {
			this.cameraComposable.dispose()
		}
		
		// Additional cleanup for any remaining resources
		if (this.scene) {
			this.scene.clear()
		}
		if (this.controls) {
			this.controls.dispose()
		}
		
		// Clear any pending cleanup timeout
		if (this.cleanupTimeoutId !== null) {
			clearTimeout(this.cleanupTimeoutId)
			this.cleanupTimeoutId = null
		}
		
		// Schedule garbage collection with tracked timeout
		this.cleanupTimeoutId = setTimeout(() => {
			if (window.gc) {
				window.gc()
			}
			this.cleanupTimeoutId = null
		}, 100)
	},

	computed: {
		/**
		 * Generate URL to open model in full 3D viewer app
		 */
		fullViewerUrl() {
			const dir = this.filename.substring(0, this.filename.lastIndexOf('/'))
			return generateUrl('/apps/threedviewer') + 
				`?fileId=${this.fileid}` +
				`&filename=${encodeURIComponent(this.filename)}` +
				`&dir=${encodeURIComponent(dir)}`
		},
	},

	methods: {
		/**
		 * Called by Viewer app when this file becomes active/visible
		 * This is when we should actually load the model
		 */
		update() {
			if (!this.isActive && !this.hasLoaded) {
				logger.info('ViewerComponent', 'Instance activated, starting load', { filename: this.filename })
				this.isActive = true
				this.loadingCancelled = false
				
				// Signal that we're handling loading
				this.$emit('update:loaded', false)
				
				// Start loading this file
				this.initViewer()
			} else if (!this.isActive && this.hasLoaded) {
				// Already loaded, just mark as active and hide any lingering progress
				logger.info('ViewerComponent', 'Instance activated, already loaded', { filename: this.filename })
				this.isActive = true
				this.updateProgress(false)
				this.$emit('update:loaded', true)
			}
		},

		/**
		 * Called by Viewer app to update the files list
		 * This is part of the Viewer API contract for multi-file navigation
		 * MUST return the fileList for Viewer to know which files are available
		 */
		files(fileList) {
			logger.info('ViewerComponent', 'Files method called', { count: fileList?.length || 0 })
			
			// IMPORTANT: Must return the fileList for Viewer to call update()
			// If we don't return it, Viewer thinks there are no files and skips activation
			if (fileList && fileList.length > 0) {
				logger.info('ViewerComponent', 'Returning file list', { count: fileList.length })
				return fileList
			}
			
			// Return empty array if no files provided
			logger.info('ViewerComponent', 'No files provided, returning empty array')
			return []
		},

		updateProgress(show, value = 0, message = '', details = '', indeterminate = true) {
			this.loadingProgress = {
				show,
				value,
				message,
				details,
				indeterminate,
			}
		},

		/**
		 * Open the model in the full 3D Viewer app (new tab)
		 */
		openInFullViewer() {
			window.open(this.fullViewerUrl, '_blank', 'noopener,noreferrer')
		},

		/**
		 * Initialize the 3D viewer
		 * Sets up Three.js scene, camera, controls, and loads the model
		 */
		async initViewer() {
			try {
				// Check if loading was cancelled before starting
				if (this.loadingCancelled) {
					logger.info('ViewerComponent', 'Loading cancelled before init')
					return
				}

				this.updateProgress(true, 0, this.t('threedviewer', 'Initializing 3D viewer...'), '', false)
				
				// Clean up any existing WebGL context first
				this.cleanupWebGLContext()

				// Import Three.js dynamically
				this.updateProgress(true, 10, this.t('threedviewer', 'Loading 3D engine...'), '', false)
				
				// Check cancellation before heavy imports
				if (this.loadingCancelled) {
					logger.info('ViewerComponent', 'Loading cancelled during imports')
					this.updateProgress(false)
					return
				}

			const THREE = await import(/* webpackChunkName: "three" */ 'three')
			const { OrbitControls } = await import(/* webpackChunkName: "OrbitControls" */ 'three/examples/jsm/controls/OrbitControls.js')

			// Check cancellation after imports
			if (this.loadingCancelled) {
				logger.info('ViewerComponent', 'Loading cancelled after imports')
				this.updateProgress(false)
				return
			}

			// Setup scene - manually create for now (composable expects container without canvas)
			this.updateProgress(true, 20, this.t('threedviewer', 'Setting up 3D scene...'), '', false)
			
			// Create scene
			this.scene = new THREE.Scene()
			this.scene.background = new THREE.Color(0xf0f0f0)
			
			// Store in composable for state management
			this.sceneComposable.scene.value = this.scene
			
			// Create renderer
			this.renderer = new THREE.WebGLRenderer({ 
				canvas: this.$refs.canvas,
				antialias: true,
				alpha: false,
				premultipliedAlpha: false,
				preserveDrawingBuffer: false,
				powerPreference: 'high-performance',
				failIfMajorPerformanceCaveat: false,
				desynchronized: true
			})
			this.renderer.setSize(this.$refs.canvas.clientWidth, this.$refs.canvas.clientHeight)
			this.renderer.setPixelRatio(window.devicePixelRatio)
			this.renderer.shadowMap.enabled = false
			this.renderer.outputColorSpace = THREE.SRGBColorSpace
			
			// Store in composable
			this.sceneComposable.renderer.value = this.renderer
			
			// Suppress specific WebGL warnings
			this.setupWebGLErrorHandling()

			// Setup camera and controls using composable
			this.updateProgress(true, 25, this.t('threedviewer', 'Setting up camera...'), '', false)
			
			const aspect = this.$refs.canvas.clientWidth / this.$refs.canvas.clientHeight
			this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
			this.camera.position.z = 5
			
			// Store in composable
			this.cameraComposable.camera.value = this.camera
			
			// Setup controls
			this.controls = new OrbitControls(this.camera, this.renderer.domElement)
			this.controls.enableDamping = true
			
			// Store in composable
			this.cameraComposable.controls.value = this.controls

			// Add lights using composable
			// Check cancellation before creating lights
			if (this.loadingCancelled) {
				logger.info('ViewerComponent', 'Loading cancelled before lighting')
				this.updateProgress(false)
				return
			}
			
			this.updateProgress(true, 30, this.t('threedviewer', 'Setting up lighting...'), '', false)
			
			// Use composable for lighting setup
			this.sceneComposable.setupLighting({
				ambientColor: 0x404040,
				ambientIntensity: 2,
				directionalColor: 0xffffff,
				directionalIntensity: 1,
				directionalPosition: { x: 1, y: 1, z: 1 },
				directionalShadows: false, // Match our original settings
			})

			// Load model
			this.updateProgress(true, 40, this.t('threedviewer', 'Loading 3D model...'), '', false)
			
			// Check cancellation before heavy model loading
				if (this.loadingCancelled) {
					logger.info('ViewerComponent', 'Loading cancelled before model download')
					this.updateProgress(false)
					return
				}

				await this.loadModel(THREE)

				// Check cancellation after model load
				if (this.loadingCancelled) {
					logger.info('ViewerComponent', 'Loading cancelled after model load')
					this.updateProgress(false)
					return
				}

				// Start animation loop
				this.updateProgress(true, 95, this.t('threedviewer', 'Finalizing...'), '', false)
				this.animate()
				
				// Mark as loaded
				this.hasLoaded = true
				
				// Hide progress and tell Viewer we're done loading
				this.updateProgress(false)
				this.$emit('update:loaded', true)

			} catch (err) {
				// Don't show errors if loading was cancelled
				if (this.loadingCancelled) {
					logger.info('ViewerComponent', 'Loading cancelled, ignoring error')
					this.updateProgress(false)
					return
				}

				logger.error('ViewerComponent', 'Error initializing viewer', err)
				this.updateProgress(false)
				this.$emit('error', err)
			}
		},

		/**
		 * Load model with multiple associated files (e.g., OBJ with MTL)
		 * @param {object} result - Result from loadModelWithDependencies
		 * @param {object} THREE - Three.js module
		 */
		async loadModelWithFiles(result, THREE) {
			try {
				logger.info('ViewerComponent', 'Loading model with files', {
					mainFile: result.mainFile.name,
					dependencies: result.dependencies.length
				})

				// Extract extension from main file
				const extension = result.mainFile.name.split('.').pop().toLowerCase()
				
				// Create a mock context for multi-file loading
				const context = {
					THREE,
					scene: this.scene,
					renderer: this.renderer,
					fileId: this.fileid,
					additionalFiles: result.dependencies, // Pass dependencies to loader
					applyWireframe: (enabled) => this.applyWireframe(enabled),
					ensurePlaceholderRemoved: () => removePlaceholders(this.scene),
				}

				// Convert main file to ArrayBuffer
				const arrayBuffer = await result.mainFile.arrayBuffer()
				
				// Load model using the registry
				const { loadModelByExtension } = await import('../loaders/registry.js')
				const modelResult = await loadModelByExtension(extension, arrayBuffer, context)

				if (modelResult && modelResult.object3D) {
					this.modelRoot = modelResult.object3D
					this.scene.add(this.modelRoot)
					
					// Fit camera to model
					this.fitCameraToModel(this.modelRoot, THREE)
					
					// Update progress
					this.updateProgress(true, 100, this.t('threedviewer', 'Model loaded'), '', false)
					logger.info('ViewerComponent', 'Model loaded successfully')
					
					// Check for loading warnings (missing files/textures)
					const totalMissing = (result.missingFiles?.length || 0) + (context.missingTextures?.length || 0)
					if (totalMissing > 0) {
						const missingList = [
							...(result.missingFiles || []),
							...(context.missingTextures || [])
						]
						
						logger.warn('ViewerComponent', 'Model loaded with warnings', {
							missingCount: totalMissing,
							missingFiles: missingList
						})
						
						// Emit warning toast
						this.$emit('push-toast', {
							type: 'warning',
							title: this.t('threedviewer', 'Model loaded with warnings'),
							message: totalMissing === 1
								? this.t('threedviewer', '1 texture could not be loaded')
								: this.t('threedviewer', '{count} textures could not be loaded', { count: totalMissing }),
							timeout: 8000,
						})
					}
					
					// Emit success event
					this.$emit('model-loaded', {
						filename: result.mainFile.name,
						fileId: this.fileid,
						dependencies: result.dependencies.length
					})
				} else {
					throw new Error('No valid 3D object returned from loader')
				}
				
			} catch (error) {
				logger.error('ViewerComponent', 'Error loading model with files', error)
				this.$emit('error', error)
				throw error
			}
		},

		/**
		 * Load a 3D model from file ID
		 * @param {object} THREE - Three.js module
		 */
		async loadModel(THREE) {
			try {
				// Extract extension from filename
				const extension = this.filename.split('.').pop().toLowerCase()
				logger.info('ViewerComponent', 'Loading model', {
					filename: this.filename,
					extension,
					fileId: this.fileid,
					mime: this.mime,
					davPath: this.davPath,
				})

				// Extract directory path from filename for multi-file loading
				const dirPath = this.filename.substring(0, this.filename.lastIndexOf('/'))

			// Check if this is a multi-file format
			const isMultiFile = ['obj', 'gltf', 'fbx', '3ds', 'dae'].includes(extension)
		
		if (isMultiFile) {
			logger.info('ViewerComponent', 'Multi-file format detected, loading with dependencies')
			
			try {
				// Load model with dependencies for multi-file formats
				const result = await loadModelWithDependencies(
					this.fileid,
					this.filename,
					extension,
					dirPath
				)
				
				logger.info('ViewerComponent', 'Multi-file loading successful', { mainFile: result.mainFile?.name })
				
				// Process the result and load the model
				await this.loadModelWithFiles(result, THREE)
				return
				
			} catch (error) {
				logger.warn('ViewerComponent', 'Multi-file loading failed, falling back to single-file', error)
				// Continue to single-file loading below
			}
		}

		// Single-file loading (fallback or non-multi-file formats)
		// Fetch model data from ApiController endpoint
		this.updateProgress(true, 0, this.t('threedviewer', 'Downloading model...'), this.filename, false)
		// Note: Using /api/file/{fileId} (not /file/{fileId})
		const response = await fetch(`/apps/threedviewer/api/file/${this.fileid}`)
				
				if (!response.ok) {
					throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`)
				}

				// Get array buffer with progress tracking
				const contentLength = response.headers.get('content-length')
				const total = contentLength ? parseInt(contentLength, 10) : 0
				
				let arrayBuffer
				if (total > 0 && response.body) {
					// Track download progress
					const reader = response.body.getReader()
					const chunks = []
					let receivedLength = 0
					
					while (true) {
						const { done, value } = await reader.read()
						
						if (done) break
						
						chunks.push(value)
						receivedLength += value.length
						
						// Update progress (0-50% for download)
						const downloadProgress = Math.round((receivedLength / total) * 50)
						this.updateProgress(true, downloadProgress, this.t('threedviewer', 'Downloading model...'), `${Math.round(receivedLength / 1024 / 1024 * 10) / 10} MB / ${Math.round(total / 1024 / 1024 * 10) / 10} MB`, false)
					}
					
					// Combine chunks into array buffer
					const chunksAll = new Uint8Array(receivedLength)
					let position = 0
					for (const chunk of chunks) {
						chunksAll.set(chunk, position)
						position += chunk.length
					}
					
					arrayBuffer = chunksAll.buffer
				} else {
					// Fallback if content-length not available
					arrayBuffer = await response.arrayBuffer()
				}
				
				logger.info('ViewerComponent', 'Downloaded model data', { bytes: arrayBuffer.byteLength })

				// Dynamically load the appropriate loader from registry
				this.updateProgress(true, 50, this.t('threedviewer', 'Loading 3D loader...'), '', false)
				const { loadModelByExtension } = await import(/* webpackChunkName: "loader-registry" */ '../loaders/registry.js')
				
				// Prepare context for loader
				const context = {
					THREE,
					scene: this.scene,
					renderer: this.renderer,
					wireframe: false,
					applyWireframe: (enabled) => {
						// Simple wireframe toggle implementation
						this.scene.traverse((child) => {
							if (child.isMesh && child.material) {
								child.material.wireframe = enabled
							}
						})
					},
					ensurePlaceholderRemoved: () => removePlaceholders(this.scene),
					hasDraco: true, // DRACO decoders available
					hasKtx2: true,  // KTX2 transcoders available
				}

				// Load model using registry
				this.updateProgress(true, 60, this.t('threedviewer', 'Parsing 3D model...'), extension.toUpperCase(), false)
				const result = await loadModelByExtension(extension, arrayBuffer, context)
				
				if (result && result.object3D) {
					// Add loaded model to scene
					this.updateProgress(true, 80, this.t('threedviewer', 'Adding model to scene...'), '', false)
					this.scene.add(result.object3D)
					
					// Auto-fit camera to model
					this.updateProgress(true, 90, this.t('threedviewer', 'Positioning camera...'), '', false)
					this.fitCameraToModel(result.object3D, THREE)
					
					logger.info('ViewerComponent', 'Model loaded successfully')
				} else {
					throw new Error('Loader did not return a valid object3D')
				}

			} catch (err) {
				logger.error('ViewerComponent', 'Error loading model', err)
				this.updateProgress(false)
				this.$emit('error', err)
				
				// Don't re-throw - we've handled it by showing the error
				return
			}
		},

		/**
		 * Fit camera to view the entire model
		 * @param {THREE.Object3D} object - 3D object to fit camera to
		 * @param {object} THREE - Three.js module
		 */
		fitCameraToModel(object, THREE) {
			if (!object || !this.camera) {
				logger.warn('ViewerComponent', 'Cannot fit camera: missing object or camera')
				return
			}

			try {
				const box = new THREE.Box3().setFromObject(object)
				
				// Validate bounding box
				if (box.isEmpty()) {
					logger.warn('ViewerComponent', 'Cannot fit camera: model bounding box is empty')
					return
				}

			const size = box.getSize(new THREE.Vector3())
			const center = box.getCenter(new THREE.Vector3())
			const maxDim = Math.max(size.x, size.y, size.z)
			
			// Calculate optimal camera distance based on FOV and model size
			const fov = this.camera.fov * (Math.PI / 180) // Convert to radians
			const cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.75 // 0.75 fits better than 1.2

				// Validate calculated values
				if (!isFinite(cameraDistance) || !isFinite(center.x) || !isFinite(center.y) || !isFinite(center.z)) {
					logger.error('ViewerComponent', 'Invalid camera position calculated', { cameraDistance, center })
					return
				}
				
				this.camera.position.set(
					center.x + cameraDistance * 0.5,
					center.y + cameraDistance * 0.5,
					center.z + cameraDistance
				)
				this.camera.lookAt(center)
				
				if (this.controls) {
					this.controls.target.copy(center)
					this.controls.update()
				}
				
				this.camera.near = cameraDistance / 100
				this.camera.far = cameraDistance * 100
				this.camera.updateProjectionMatrix()
				
				logger.info('ViewerComponent', 'Camera fitted to model', {
					size: { x: size.x.toFixed(2), y: size.y.toFixed(2), z: size.z.toFixed(2) },
					center: { x: center.x.toFixed(2), y: center.y.toFixed(2), z: center.z.toFixed(2) },
					distance: cameraDistance.toFixed(2),
				})
			} catch (error) {
				logger.error('ViewerComponent', 'Failed to fit camera to model', error)
			}
		},

	/**
	 * Animation loop for rendering the 3D scene
	 * Tracks animation frame ID for proper cleanup
	 */
	animate() {
		if (!this.renderer || !this.scene || !this.camera) {
			return
		}

		this.animationFrameId = requestAnimationFrame(this.animate)
		
		if (this.controls) {
			this.controls.update()
		}

		this.renderer.render(this.scene, this.camera)
	},

	/**
	 * Clean up Three.js resources for the current model
	 */
	cleanup() {
			logger.info('ViewerComponent', 'Starting cleanup for model', { filename: this.filename })
			
			// Dispose of geometries, materials, and textures
			this.scene.traverse((object) => {
				if (object.geometry) {
					object.geometry.dispose()
				}
				if (object.material) {
					if (Array.isArray(object.material)) {
						object.material.forEach(material => {
							this.disposeMaterial(material)
						})
					} else {
						this.disposeMaterial(object.material)
					}
				}
			})
			
			// Clear the scene
			this.scene.clear()
			
			// Force garbage collection of textures
			if (this.renderer && this.renderer.info) {
				logger.info('ViewerComponent', 'Renderer info before cleanup', { info: this.renderer.info })
			}
			
			// Dispose of renderer and controls
			if (this.renderer) {
				this.renderer.dispose()
			}
			if (this.controls) {
				this.controls.dispose()
			}
			
			logger.info('ViewerComponent', 'Cleanup completed for model', { filename: this.filename })
		},
		
		cleanupWebGLContext() {
			// Restore original WebGL getError method
			if (this.renderer && this.renderer.getContext && this.originalGetError) {
				const context = this.renderer.getContext()
				context.getError = this.originalGetError
				this.originalGetError = null
			}
			
			// Clear any existing WebGL state
			if (this.renderer) {
				this.cleanup()
				
				// Force WebGL context recreation to clear immutable textures
				const canvas = this.renderer.domElement
				if (canvas && canvas.parentNode) {
					// Remove canvas from DOM temporarily
					const parent = canvas.parentNode
					parent.removeChild(canvas)
					
					// Force context loss
					const context = this.renderer.getContext()
					if (context && context.getExtension) {
						const loseContext = context.getExtension('WEBGL_lose_context')
						if (loseContext) {
							loseContext.loseContext()
						}
					}
					
					// Re-add canvas to DOM
					parent.appendChild(canvas)
				}
				
				// Dispose renderer completely
				this.renderer.dispose()
				this.renderer = null
			}
			
			// Force garbage collection if available
			if (window.gc) {
				window.gc()
			}
		},
		
		/**
		 * Setup WebGL error handling to suppress harmless warnings
		 * Uses targeted approach instead of global console override
		 */
		setupWebGLErrorHandling() {
			// Suppress specific WebGL warnings that are harmless but noisy
			if (this.renderer && this.renderer.getContext) {
				const context = this.renderer.getContext()
				
				// Override getError to filter out texture immutable warnings
				const originalGetError = context.getError
				context.getError = () => {
					const error = originalGetError.call(context)
					// Filter out GL_INVALID_OPERATION for texture immutable warnings
					if (error === 1282) { // GL_INVALID_OPERATION
						// Check if this is likely a texture immutable warning
						const stack = new Error().stack
						if (stack && stack.includes('glTexStorage2D')) {
							return 0 // GL_NO_ERROR
						}
					}
					return error
				}
				
				// Store original method for cleanup
				this.originalGetError = originalGetError
				
				logger.info('ViewerComponent', 'WebGL error handling configured to suppress texture immutable warnings')
			}
		},
		
		/**
		 * Dispose of a material and all its textures
		 * @param {THREE.Material} material - Material to dispose
		 */
		disposeMaterial(material) {
			// Dispose all possible texture properties
			const textureProperties = [
				'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap',
				'aoMap', 'displacementMap', 'bumpMap', 'alphaMap', 'lightMap',
				'envMap', 'specularMap', 'clearcoatMap', 'clearcoatNormalMap',
				'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap',
				'transmissionMap', 'thicknessMap', 'iridescenceMap', 'iridescenceThicknessMap'
			]
			
			textureProperties.forEach(prop => {
				if (material[prop]) {
					material[prop].dispose()
					delete material[prop]
				}
			})
			
			// Dispose the material itself
			material.dispose()
		},
	},
}
</script>

<style scoped>
.threedviewer-wrapper {
	position: relative;
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
}

.threedviewer-canvas {
	width: 100%;
	height: 100%;
	display: block;
}

.threedviewer-progress {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	text-align: center;
	min-width: 300px;
}

.threedviewer-progress p {
	color: #ffffff;
	font-weight: 500;
	margin: 8px 0;
}

/* Open in full viewer button */
.open-in-app-button {
	position: absolute !important;
	top: 16px;
	right: 16px;
	z-index: 1000;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.open-in-app-button:hover {
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

/* Hide Nextcloud Viewer's loading spinner when our progress bar is showing */
.showing-progress .icon-loading,
.showing-progress [class*="loading"] {
	display: none !important;
}
</style>
