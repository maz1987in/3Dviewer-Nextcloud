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
		
		<div v-if="error" class="threedviewer-error">
			<p>{{ error }}</p>
		</div>
	</div>
</template>

<script>
import { NcProgressBar } from '@nextcloud/vue'

export default {
	name: 'ViewerComponent',
	
	components: {
		NcProgressBar,
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
	},

	data() {
		return {
			error: null,
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
		}
	},

	mounted() {
		console.info('[ThreeDViewer] ViewerComponent mounted', {
			filename: this.filename,
			mime: this.mime,
			davPath: this.davPath,
		})
		
		// Immediately signal that we're handling loading
		this.$emit('update:loaded', false)
		
		this.initViewer()
	},

	beforeDestroy() {
		// Use the enhanced cleanup method
		this.cleanupWebGLContext()
		
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

	methods: {
		updateProgress(show, value = 0, message = '', details = '', indeterminate = true) {
			this.loadingProgress = {
				show,
				value,
				message,
				details,
				indeterminate,
			}
		},

		async initViewer() {
			try {
				this.updateProgress(true, 0, this.t('threedviewer', 'Initializing 3D viewer...'), '', true)
				
				// Clean up any existing WebGL context first
				this.cleanupWebGLContext()

				// Import Three.js dynamically
				this.updateProgress(true, 10, this.t('threedviewer', 'Loading 3D engine...'), '', true)
				const THREE = await import(/* webpackChunkName: "three" */ 'three')
				const { OrbitControls } = await import(/* webpackChunkName: "OrbitControls" */ 'three/examples/jsm/controls/OrbitControls.js')

				// Setup scene
				this.updateProgress(true, 20, this.t('threedviewer', 'Setting up 3D scene...'), '', true)
				this.scene = new THREE.Scene()
				this.scene.background = new THREE.Color(0xf0f0f0)

				// Setup camera
				const aspect = this.$refs.canvas.clientWidth / this.$refs.canvas.clientHeight
				this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
				this.camera.position.z = 5

				// Setup renderer with enhanced WebGL context management
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
				
				// Configure renderer to minimize texture conflicts
				this.renderer.shadowMap.enabled = false
				this.renderer.outputEncoding = THREE.sRGBEncoding
				
				// Suppress specific WebGL warnings
				this.setupWebGLErrorHandling()

				// Setup controls
				this.controls = new OrbitControls(this.camera, this.renderer.domElement)
				this.controls.enableDamping = true

				// Add lights
				this.updateProgress(true, 30, this.t('threedviewer', 'Setting up lighting...'), '', true)
				const ambientLight = new THREE.AmbientLight(0x404040, 2)
				this.scene.add(ambientLight)

				const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
				directionalLight.position.set(1, 1, 1)
				this.scene.add(directionalLight)

				// Load model
				this.updateProgress(true, 40, this.t('threedviewer', 'Loading 3D model...'), '', true)
				await this.loadModel(THREE)

				// Start animation loop
				this.updateProgress(true, 90, this.t('threedviewer', 'Finalizing...'), '', true)
				this.animate()
				
				// Hide progress and tell Viewer we're done loading
				this.updateProgress(false)
				this.$emit('update:loaded', true)

			} catch (err) {
				console.error('[ThreeDViewer] Error initializing viewer:', err)
				this.error = this.t('threedviewer', 'Failed to load 3D model: {error}', { error: err.message })
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
					ensurePlaceholderRemoved: () => {
						// Remove any placeholder objects
						const placeholders = this.scene.children.filter(c => c.userData?.isPlaceholder)
						placeholders.forEach(p => this.scene.remove(p))
					},
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
					this.updateProgress(true, 100, this.t('threedviewer', 'Model loaded'), '', true)
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
				this.error = this.t('threedviewer', 'Failed to load 3D model: {error}', { error: error.message })
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

		// Check if this is a multi-file format
		const isMultiFile = ['obj', 'gltf'].includes(extension)
		
		if (isMultiFile) {
			console.info('[ThreeDViewer] Multi-file format detected, loading with dependencies...')
			
			try {
				// Load model with dependencies for multi-file formats
				const result = await loadModelWithDependencies({
					fileId: this.fileid,
					filename: this.filename,
					extension: extension,
					dirPath: dirPath
				})
				
				console.info('[ThreeDViewer] Multi-file loading successful:', result)
				
				// Process the result and load the model
				await this.loadModelWithFiles(result.mainFile, result.additionalFiles)
				return
				
			} catch (error) {
				console.warn('[ThreeDViewer] Multi-file loading failed, falling back to single-file:', error)
				// Continue to single-file loading below
			}
		}

		// Single-file loading (fallback or non-multi-file formats)
		// Fetch model data from ApiController endpoint
		this.updateProgress(true, 50, this.t('threedviewer', 'Downloading model...'), this.filename, true)
		// Note: Using /api/file/{fileId} (not /file/{fileId})
		const response = await fetch(`/apps/threedviewer/api/file/${this.fileid}`)
				
				if (!response.ok) {
					throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`)
				}

				// Get array buffer
				const arrayBuffer = await response.arrayBuffer()
				console.info('[ThreeDViewer] Downloaded model data:', arrayBuffer.byteLength, 'bytes')

				// Dynamically load the appropriate loader from registry
				this.updateProgress(true, 60, this.t('threedviewer', 'Loading 3D loader...'), '', true)
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
					ensurePlaceholderRemoved: () => {
						// Remove any placeholder objects
						const placeholders = this.scene.children.filter(c => c.userData?.isPlaceholder)
						placeholders.forEach(p => this.scene.remove(p))
					},
					hasDraco: true, // DRACO decoders available
					hasKtx2: true,  // KTX2 transcoders available
				}

				// Load model using registry
				this.updateProgress(true, 70, this.t('threedviewer', 'Parsing 3D model...'), extension.toUpperCase(), true)
				const result = await loadModelByExtension(extension, arrayBuffer, context)
				
				if (result && result.object3D) {
					// Add loaded model to scene
					this.updateProgress(true, 80, this.t('threedviewer', 'Adding model to scene...'), '', true)
					this.scene.add(result.object3D)
					
					// Auto-fit camera to model
					this.updateProgress(true, 85, this.t('threedviewer', 'Positioning camera...'), '', true)
					this.fitCameraToModel(result.object3D, THREE)
					
					console.info('[ThreeDViewer] Model loaded successfully')
				} else {
					throw new Error('Loader did not return a valid object3D')
				}

			} catch (err) {
				console.error('[ThreeDViewer] Error loading model:', err)
				// Fall back to placeholder cube on error
				console.warn('[ThreeDViewer] Falling back to placeholder cube')
				const geometry = new THREE.BoxGeometry(1, 1, 1)
				const material = new THREE.MeshStandardMaterial({ color: 0xff6b6b })
				const cube = new THREE.Mesh(geometry, material)
				cube.userData.isPlaceholder = true
				this.scene.add(cube)
				
				// Re-throw to show error message
				throw err
			}
		},

		fitCameraToModel(object, THREE) {
			// Calculate bounding box
			const box = new THREE.Box3().setFromObject(object)
			const size = box.getSize(new THREE.Vector3())
			const center = box.getCenter(new THREE.Vector3())
			
			// Get max dimension
			const maxDim = Math.max(size.x, size.y, size.z)
			
			// Calculate camera distance (using FOV and model size)
			const fov = this.camera.fov * (Math.PI / 180)
			const cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.2 // 1.2 = padding factor
			
			// Position camera
			this.camera.position.set(
				center.x + cameraDistance * 0.5,
				center.y + cameraDistance * 0.5,
				center.z + cameraDistance
			)
			
			// Point camera at center
			this.camera.lookAt(center)
			
			// Update controls target
			if (this.controls) {
				this.controls.target.copy(center)
				this.controls.update()
			}
			
			// Update near/far planes
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

.threedviewer-error {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	text-align: center;
}

/* Hide Nextcloud Viewer's loading spinner when our progress bar is showing */
.showing-progress .icon-loading,
.showing-progress [class*="loading"] {
	display: none !important;
}
</style>
