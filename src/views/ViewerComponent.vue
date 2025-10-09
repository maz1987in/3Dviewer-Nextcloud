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
		}
	},

	watch: {
		// Watch for active prop changes from Viewer
		active(newActive, oldActive) {
			console.info('[ThreeDViewer] Active prop changed:', { newActive, oldActive, filename: this.filename })
			
			if (newActive && !oldActive && !this.hasLoaded) {
				// Component became active - start loading
				console.info('[ThreeDViewer] Instance activated via prop, starting load:', this.filename)
				this.isActive = true
				this.loadingCancelled = false
				this.$emit('update:loaded', false)
				this.initViewer()
			} else if (newActive && !oldActive && this.hasLoaded) {
				// Component became active but already loaded - ensure progress is hidden
				console.info('[ThreeDViewer] Instance activated, already loaded:', this.filename)
				this.isActive = true
				this.updateProgress(false)
				this.$emit('update:loaded', true)
			} else if (!newActive && oldActive) {
				// Component became inactive - cancel loading if in progress
				console.info('[ThreeDViewer] Instance deactivated, cancelling load:', this.filename)
				this.loadingCancelled = true
				this.isActive = false
			}
		},
		// Watch for file changes when navigating in Viewer
		fileid(newId, oldId) {
			if (newId && newId !== oldId) {
				console.info('[ThreeDViewer] File changed, reloading viewer')
				this.hasLoaded = false
				this.loadingCancelled = false
				this.initViewer()
			}
		},
		// Watch files prop to suppress Viewer warning
		files(newFiles) {
			if (newFiles && newFiles.length > 0) {
				console.debug('[ThreeDViewer] Files list updated:', newFiles.length, 'files')
			}
		},
	},

	mounted() {
		console.info('[ThreeDViewer] ViewerComponent mounted', {
			filename: this.filename,
			mime: this.mime,
			davPath: this.davPath,
			active: this.active,
		})
		
		// Check if we're already active on mount (initial file)
		if (this.active) {
			console.info('[ThreeDViewer] Instance is active on mount, starting load:', this.filename)
			this.isActive = true
			this.$emit('update:loaded', false)
			this.initViewer()
		} else {
			// Wait for active prop to change
			this.isActive = false
			console.debug('[ThreeDViewer] Instance created, waiting for active prop from Viewer')
		}
	},

	beforeDestroy() {
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
		
		// Add a small delay to allow WebGL cleanup
		setTimeout(() => {
			if (window.gc) {
				window.gc()
			}
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
				console.info('[ThreeDViewer] Instance activated, starting load:', this.filename)
				this.isActive = true
				this.loadingCancelled = false
				
				// Signal that we're handling loading
				this.$emit('update:loaded', false)
				
				// Start loading this file
				this.initViewer()
			} else if (!this.isActive && this.hasLoaded) {
				// Already loaded, just mark as active and hide any lingering progress
				console.info('[ThreeDViewer] Instance activated, already loaded:', this.filename)
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
			console.debug('[ThreeDViewer] Files method called with', fileList?.length || 0, 'files')
			
			// IMPORTANT: Must return the fileList for Viewer to call update()
			// If we don't return it, Viewer thinks there are no files and skips activation
			if (fileList && fileList.length > 0) {
				console.debug('[ThreeDViewer] Returning file list with', fileList.length, 'files')
				return fileList
			}
			
			// Return empty array if no files provided
			console.debug('[ThreeDViewer] No files provided, returning empty array')
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

		async initViewer() {
			try {
				// Check if loading was cancelled before starting
				if (this.loadingCancelled) {
					console.debug('[ThreeDViewer] Loading cancelled before init')
					return
				}

				this.updateProgress(true, 0, this.t('threedviewer', 'Initializing 3D viewer...'), '', false)
				
				// Clean up any existing WebGL context first
				this.cleanupWebGLContext()

				// Import Three.js dynamically
				this.updateProgress(true, 10, this.t('threedviewer', 'Loading 3D engine...'), '', false)
				
				// Check cancellation before heavy imports
				if (this.loadingCancelled) {
					console.debug('[ThreeDViewer] Loading cancelled during imports')
					this.updateProgress(false)
					return
				}

			const THREE = await import(/* webpackChunkName: "three" */ 'three')
			const { OrbitControls } = await import(/* webpackChunkName: "OrbitControls" */ 'three/examples/jsm/controls/OrbitControls.js')

			// Check cancellation after imports
			if (this.loadingCancelled) {
				console.debug('[ThreeDViewer] Loading cancelled after imports')
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
			this.renderer.outputEncoding = THREE.sRGBEncoding
			
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
				console.debug('[ThreeDViewer] Loading cancelled before lighting')
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
					console.debug('[ThreeDViewer] Loading cancelled before model download')
					this.updateProgress(false)
					return
				}

				await this.loadModel(THREE)

				// Check cancellation after model load
				if (this.loadingCancelled) {
					console.debug('[ThreeDViewer] Loading cancelled after model load')
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
					console.debug('[ThreeDViewer] Loading cancelled, ignoring error')
					this.updateProgress(false)
					return
				}

				console.error('[ThreeDViewer] Error initializing viewer:', err)
				this.updateProgress(false)
				this.$emit('error', err)
			}
		},

		async loadModelWithFiles(result, THREE) {
			try {
				console.info('[ThreeDViewer] Loading model with files:', {
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
					console.info('[ThreeDViewer] Model loaded successfully')
					
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
				console.error('[ThreeDViewer] Error loading model with files:', error)
				this.$emit('error', error)
				throw error
			}
		},

		async loadModel(THREE) {
			try {
				// Extract extension from filename
				const extension = this.filename.split('.').pop().toLowerCase()
				console.info('[ThreeDViewer] Loading model:', {
					filename: this.filename,
					extension,
					fileId: this.fileid,
					mime: this.mime,
					davPath: this.davPath,
				})

				// Extract directory path from filename for multi-file loading
				const dirPath = this.filename.substring(0, this.filename.lastIndexOf('/'))

			// Check if this is a multi-file format
			const isMultiFile = ['obj', 'gltf', 'fbx'].includes(extension)
		
		if (isMultiFile) {
			console.info('[ThreeDViewer] Multi-file format detected, loading with dependencies...')
			
			try {
				// Load model with dependencies for multi-file formats
				const result = await loadModelWithDependencies(
					this.fileid,
					this.filename,
					extension,
					dirPath
				)
				
				console.info('[ThreeDViewer] Multi-file loading successful:', result)
				
				// Process the result and load the model
				await this.loadModelWithFiles(result, THREE)
				return
				
			} catch (error) {
				console.warn('[ThreeDViewer] Multi-file loading failed, falling back to single-file:', error)
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
					
					var arrayBuffer = chunksAll.buffer
				} else {
					// Fallback if content-length not available
					var arrayBuffer = await response.arrayBuffer()
				}
				
				console.info('[ThreeDViewer] Downloaded model data:', arrayBuffer.byteLength, 'bytes')

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
					
					console.info('[ThreeDViewer] Model loaded successfully')
				} else {
					throw new Error('Loader did not return a valid object3D')
				}

			} catch (err) {
				console.error('[ThreeDViewer] Error loading model:', err)
				this.updateProgress(false)
				this.$emit('error', err)
				
				// Don't re-throw - we've handled it by showing the error
				return
			}
		},

		fitCameraToModel(object, THREE) {
			const box = new THREE.Box3().setFromObject(object)
			const size = box.getSize(new THREE.Vector3())
			const center = box.getCenter(new THREE.Vector3())
			const maxDim = Math.max(size.x, size.y, size.z)
			const cameraDistance = Math.max(maxDim * 2, 20)
			
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
			
			console.info('[ThreeDViewer] Camera fitted to model:', {
				size: { x: size.x.toFixed(2), y: size.y.toFixed(2), z: size.z.toFixed(2) },
				center: { x: center.x.toFixed(2), y: center.y.toFixed(2), z: center.z.toFixed(2) },
				distance: cameraDistance.toFixed(2),
			})
		},

	animate() {
		if (!this.renderer || !this.scene || !this.camera) {
			return
		}

		requestAnimationFrame(this.animate)
		
		if (this.controls) {
			this.controls.update()
		}

		this.renderer.render(this.scene, this.camera)
	},

	cleanup() {
			console.info('[ThreeDViewer] Starting cleanup for model:', this.filename)
			
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
				console.info('[ThreeDViewer] Renderer info before cleanup:', this.renderer.info)
			}
			
			// Dispose of renderer and controls
			if (this.renderer) {
				this.renderer.dispose()
			}
			if (this.controls) {
				this.controls.dispose()
			}
			
			console.info('[ThreeDViewer] Cleanup completed for model:', this.filename)
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
			}
			
			// Set up global WebGL warning suppression (only if not already set)
			if (!window.webglWarningSuppressed) {
				this.setupGlobalWebGLWarningSuppression()
				window.webglWarningSuppressed = true
				
				// Inform user about WebGL warning suppression
				console.info('[ThreeDViewer] WebGL texture immutable warnings have been suppressed as they are harmless and don\'t affect functionality.')
			}
		},
		
		setupGlobalWebGLWarningSuppression() {
			// Create a more comprehensive console override that handles all WebGL warnings
			const originalConsoleError = console.error
			const originalConsoleWarn = console.warn
			
			const suppressWebGLWarning = (message) => {
				return message.includes('GL_INVALID_OPERATION: glTexStorage2D: Texture is immutable') ||
					   message.includes('Texture is immutable') ||
					   message.includes('glTexStorage2D')
			}
			
			console.error = (...args) => {
				const message = args.join(' ')
				if (suppressWebGLWarning(message)) {
					// Suppress these specific warnings as they're harmless
					return
				}
				originalConsoleError.apply(console, args)
			}
			
			console.warn = (...args) => {
				const message = args.join(' ')
				if (suppressWebGLWarning(message)) {
					// Suppress these specific warnings as they're harmless
					return
				}
				originalConsoleWarn.apply(console, args)
			}
			
			// Store original methods for potential cleanup
			window.originalConsoleError = originalConsoleError
			window.originalConsoleWarn = originalConsoleWarn
		},
		
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
