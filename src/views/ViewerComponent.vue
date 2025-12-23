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
				:indeterminate="loadingProgress.indeterminate" />
			<p v-if="loadingProgress.details">
				{{ loadingProgress.details }}
			</p>
		</div>

		<!-- CSP Texture Warning Banner -->
		<div v-if="hasLoaded && showTextureWarning" class="texture-warning-banner">
			<div class="texture-warning-content">
				<svg class="texture-warning-icon"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2">
					<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
					<line x1="12"
						y1="9"
						x2="12"
						y2="13" />
					<line x1="12"
						y1="17"
						x2="12.01"
						y2="17" />
				</svg>
				<div class="texture-warning-text">
					<strong>{{ t('threedviewer', 'Textures not supported in preview') }}</strong>
					<p>{{ t('threedviewer', 'Some textures may not load in this preview. For full texture support, open the model in the main 3D Viewer.') }}</p>
				</div>
				<NcButton
					type="primary"
					class="texture-warning-button"
					@click.prevent="openInFullViewer">
					{{ t('threedviewer', 'Open in 3D Viewer') }} ↗
				</NcButton>
			</div>
		</div>

		<!-- Open in full viewer button -->
		<NcButton
			v-if="hasLoaded && !showTextureWarning"
			type="primary"
			class="open-in-app-button"
			@click.prevent="openInFullViewer">
			{{ t('threedviewer', 'Open in 3D Viewer') }} ↗
		</NcButton>

		<!-- Animation controls (simple play/pause button) -->
		<NcButton
			v-if="hasLoaded && hasAnimationsComputed"
			type="secondary"
			class="animation-control-button"
			:title="isAnimationPlayingComputed ? t('threedviewer', 'Pause animation') : t('threedviewer', 'Play animation')"
			@click.prevent="toggleAnimation">
			{{ isAnimationPlayingComputed ? '⏸️' : '▶️' }}
		</NcButton>
	</div>
</template>

<script>
import { markRaw } from 'vue'
import { NcProgressBar, NcButton } from '@nextcloud/vue'
import { generateUrl } from '@nextcloud/router'
import { loadModelWithDependencies } from '../loaders/multiFileHelpers.js'
import { removePlaceholders } from '../utils/scene-helpers.js'
import { useScene } from '../composables/useScene.js'
import { useCamera } from '../composables/useCamera.js'
import { useAnimation } from '../composables/useAnimation.js'
import { logger } from '../utils/logger.js'

export default {
	name: 'ViewerComponent',
	components: {
		NcProgressBar,
		NcButton,
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
	emits: [
		'update:loaded',
		'error',
		'push-toast',
		'model-loaded',
	],

	// Setup function - integrates composables with Options API
	setup() {
		// Initialize composables
		const sceneComposable = useScene()
		const cameraComposable = useCamera()
		const animationComposable = useAnimation()

		// Return composables for use in Options API methods
		return {
			sceneComposable,
			cameraComposable,
			animationComposable,
		}
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
			internalFilesList: [], // Store files list for Viewer API
			showTextureWarning: false, // Show warning if textures fail due to CSP
			cspErrorListener: null, // Listener for CSP errors
			lastAnimationTime: 0, // Track time for animation delta
			// Animation state (for reactivity in Options API)
			hasAnimations: false,
			isAnimationPlaying: false,
		}
	},

	computed: {
		/**
		 * Generate URL to open model in full 3D viewer app
		 */
		fullViewerUrl() {
			const dir = this.filename.substring(0, this.filename.lastIndexOf('/'))
			return generateUrl('/apps/threedviewer')
				+ `?fileId=${this.fileid}`
				+ `&filename=${encodeURIComponent(this.filename)}`
				+ `&dir=${encodeURIComponent(dir)}`
		},

		/**
		 * Check if model has animations (reactive)
		 * Returns data property for proper reactivity
		 */
		hasAnimationsComputed() {
			return this.hasAnimations
		},

		/**
		 * Check if animation is playing (reactive)
		 * Returns data property for proper reactivity
		 */
		isAnimationPlayingComputed() {
			return this.isAnimationPlaying
		},
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
	},

	mounted() {
		logger.info('ViewerComponent', 'Component mounted', {
			filename: this.filename,
			mime: this.mime,
			davPath: this.davPath,
			active: this.active,
		})

		// Set up CSP error listener to detect texture loading failures
		this.setupCSPErrorListener()

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

	beforeUnmount() {
		// Restore console error handler
		if (this.cspErrorListener && this.cspErrorListener.restore) {
			this.cspErrorListener.restore()
			this.cspErrorListener = null
		}

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
		if (this.animationComposable && typeof this.animationComposable.dispose === 'function') {
			this.animationComposable.dispose()
		}
		// Reset animation state
		this.hasAnimations = false
		this.isAnimationPlaying = false

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

		/*
		 * Called by Viewer app to update the files list
		 * This is part of the Viewer API contract for multi-file navigation
		 * MUST store and return the fileList for Viewer to know which files are available
		 * @param {Array} fileList - Array of file objects from Viewer
		 * @return {Array} Array of files (same as input)
		 */
		// eslint-disable-next-line vue/no-dupe-keys -- Required by Nextcloud Viewer API: needs both prop AND method
		files(fileList) {
			logger.info('ViewerComponent', 'Files method called', { count: fileList?.length || 0 })

			// Store the files list internally for Viewer API
			if (fileList && Array.isArray(fileList) && fileList.length > 0) {
				this.internalFilesList = fileList
				logger.info('ViewerComponent', 'Files list stored and returned', {
					count: fileList.length,
					firstFile: fileList[0]?.basename || 'unknown',
				})
				return fileList
			}

			// If fileList is invalid, try to construct from props
			if (this.fileid && this.filename && this.basename) {
				const syntheticFile = {
					fileid: this.fileid,
					filename: this.filename,
					basename: this.basename,
					mime: this.mime,
					davPath: this.davPath,
				}
				this.internalFilesList = [syntheticFile]
				logger.info('ViewerComponent', 'Created synthetic file list from props', {
					filename: this.filename,
				})
				return [syntheticFile]
			}

			// Last resort: return empty array (but log warning)
			logger.warn('ViewerComponent', 'No valid files list available, returning empty array')
			this.internalFilesList = []
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
				this.scene = markRaw(new THREE.Scene())
				this.scene.background = new THREE.Color(0xf0f0f0)

				// Store in composable for state management
				this.sceneComposable.scene.value = this.scene

				// Create renderer
				this.renderer = new THREE.WebGLRenderer({
					canvas: this.$refs.canvas,
					antialias: true,
					alpha: false,
					premultipliedAlpha: false,
					preserveDrawingBuffer: true, // Required for screenshots
					powerPreference: 'high-performance',
					failIfMajorPerformanceCaveat: false,
					desynchronized: true,
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
				this.camera = markRaw(new THREE.PerspectiveCamera(75, aspect, 0.1, 1000))
				this.camera.position.z = 5

				// Store in composable
				this.cameraComposable.camera.value = this.camera

				// Setup controls
				this.controls = markRaw(new OrbitControls(this.camera, this.renderer.domElement))
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
					dependencies: result.dependencies.length,
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

					// Initialize animations if present
					if (modelResult.animations && modelResult.animations.length > 0) {
						this.animationComposable.initAnimations(this.modelRoot, modelResult.animations)
						// Update data properties for reactivity - check composable's hasAnimations to ensure initialization succeeded
						this.hasAnimations = this.animationComposable.hasAnimations.value
						this.isAnimationPlaying = this.animationComposable.isPlaying.value
						logger.info('ViewerComponent', 'Animations initialized', {
							count: modelResult.animations.length,
							clips: modelResult.animations.map(clip => clip.name || 'unnamed'),
							hasAnimations: this.hasAnimations,
							isAnimationPlaying: this.isAnimationPlaying,
							composableHasAnimations: this.animationComposable.hasAnimations.value,
						})
					} else {
						// Reset animation state if no animations
						this.hasAnimations = false
						this.isAnimationPlaying = false
						logger.info('ViewerComponent', 'No animations found in model')
					}

					// Check for loading warnings (missing files/textures)
					const totalMissing = (result.missingFiles?.length || 0) + (context.missingTextures?.length || 0)
					if (totalMissing > 0) {
						const missingList = [
							...(result.missingFiles || []),
							...(context.missingTextures || []),
						]

						logger.warn('ViewerComponent', 'Model loaded with warnings', {
							missingCount: totalMissing,
							missingFiles: missingList,
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
						dependencies: result.dependencies.length,
					})

					// Check for texture loading issues after model loads successfully
					// This allows time for texture loading attempts to complete
					setTimeout(() => {
						this.checkForTextureIssues()
					}, 2000)
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
							dirPath,
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
					hasKtx2: true, // KTX2 transcoders available
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

					// Initialize animations if present
					if (result.animations && result.animations.length > 0) {
						this.animationComposable.initAnimations(result.object3D, result.animations)
						// Update data properties for reactivity - check composable's hasAnimations to ensure initialization succeeded
						this.hasAnimations = this.animationComposable.hasAnimations.value
						this.isAnimationPlaying = this.animationComposable.isPlaying.value
						logger.info('ViewerComponent', 'Animations initialized', {
							count: result.animations.length,
							clips: result.animations.map(clip => clip.name || 'unnamed'),
							hasAnimations: this.hasAnimations,
							isAnimationPlaying: this.isAnimationPlaying,
							hasLoaded: this.hasLoaded,
							hasAnimationsComputed: this.hasAnimationsComputed,
							composableHasAnimations: this.animationComposable.hasAnimations.value,
						})
					} else {
						// Reset animation state if no animations
						this.hasAnimations = false
						this.isAnimationPlaying = false
						logger.info('ViewerComponent', 'No animations found in model')
					}

					// Check for texture issues after a delay to allow textures to load
					// The CSP error handler will show the warning if CSP errors are detected
					setTimeout(() => {
						this.checkForTextureIssues()
					}, 2000)
				} else {
					throw new Error('Loader did not return a valid object3D')
				}

			} catch (err) {
				logger.error('ViewerComponent', 'Error loading model', err)
				this.updateProgress(false)
				this.$emit('error', err)

				// Don't re-throw - we've handled it by showing the error

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
					center.z + cameraDistance,
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

			// Update animation mixer if animations are active
			if (this.animationComposable.mixer.value && this.animationComposable.isPlaying.value) {
				const currentTime = performance.now()
				let deltaTime = 0
				if (this.lastAnimationTime > 0) {
					deltaTime = (currentTime - this.lastAnimationTime) / 1000 // Convert to seconds
				} else {
					// First frame: use a small default delta to start animation smoothly
					// This prevents the animation from being stuck on the first frame
					deltaTime = 0.016 // ~60fps frame time
				}
				this.lastAnimationTime = currentTime
				this.animationComposable.update(deltaTime)
				// Sync data property (only update if changed to avoid unnecessary reactivity)
				if (!this.isAnimationPlaying) {
					this.isAnimationPlaying = true
				}
			} else {
				this.lastAnimationTime = 0
				// Sync data property if animation stopped
				if (this.hasAnimations && this.isAnimationPlaying) {
					this.isAnimationPlaying = false
				}
			}

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
				'transmissionMap', 'thicknessMap', 'iridescenceMap', 'iridescenceThicknessMap',
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

		/**
		 * Set up listener to detect CSP errors for texture loading
		 */
		setupCSPErrorListener() {
			// Track CSP errors
			let cspErrorCount = 0
			const maxErrors = 2 // Show warning after 2 CSP errors

			// Listen for console errors (CSP violations appear in console)
			const originalError = console.error
			// eslint-disable-next-line no-console -- Intentional console override for CSP detection
			const originalWarn = console.warn

			const cspErrorHandler = (message, ...args) => {
				const messageStr = String(message || '')
				const argsStr = args.map(arg => String(arg || '')).join(' ')
				const fullMessage = messageStr + ' ' + argsStr

				// Check for CSP-related errors - be more lenient with matching
				if (fullMessage.includes('Content Security Policy')
				    || fullMessage.includes('CSP')
				    || fullMessage.includes('violates')
				    || (fullMessage.includes('blob:') && (fullMessage.includes('violates') || fullMessage.includes('Refused')))
				    || fullMessage.includes('THREE.GLTFLoader: Couldn\'t load texture blob:')) {
					cspErrorCount++
					logger.warn('ViewerComponent', 'CSP error detected for texture loading', {
						count: cspErrorCount,
						message: messageStr.substring(0, 100),
					})

					// Show warning after detecting CSP errors
					if (cspErrorCount >= maxErrors && !this.showTextureWarning) {
						this.showTextureWarning = true
						logger.info('ViewerComponent', 'Showing texture warning banner due to CSP errors', { count: cspErrorCount })
					}
				}

				// Call original error handler
				originalError.apply(console, [message, ...args])
			}

			// Override console.error temporarily
			console.error = cspErrorHandler

			// Store original for cleanup
			this.cspErrorListener = {
				restore: () => {
					/* eslint-disable no-console -- Restoring original console methods */
					console.error = originalError
					console.warn = originalWarn
					/* eslint-enable no-console */
				},
			}
		},

		/**
		 * Check for texture loading issues after model loads
		 * This detects missing textures that may have failed due to CSP
		 */
		checkForTextureIssues() {
			if (!this.scene) return

			let missingTextures = 0
			let totalTextures = 0

			this.scene.traverse((object) => {
				if (object.material) {
					const materials = Array.isArray(object.material) ? object.material : [object.material]

					materials.forEach((material) => {
						// Check common texture properties
						const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']
						textureProps.forEach((prop) => {
							if (material[prop]) {
								totalTextures++
								const texture = material[prop]
								// Check if texture image failed to load
								if (!texture.image || texture.image.width === 0 || texture.image.height === 0) {
									missingTextures++
								}
							}
						})
					})
				}
			})

			// If we have textures but many are missing, likely CSP issue
			if (totalTextures > 0 && missingTextures > 0) {
				const missingRatio = missingTextures / totalTextures
				// Show warning if more than 50% of textures are missing
				if (missingRatio > 0.5) {
					this.showTextureWarning = true
					logger.info('ViewerComponent', 'Texture warning shown due to missing textures', {
						missing: missingTextures,
						total: totalTextures,
						ratio: missingRatio.toFixed(2),
					})
				}
			}
		},

		/**
		 * Toggle animation play/pause
		 */
		toggleAnimation() {
			if (this.animationComposable) {
				this.animationComposable.togglePlay()
				// Update data property for reactivity
				this.isAnimationPlaying = this.animationComposable.isPlaying.value
			}
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
	inset-inline-start: 50%;
	transform: translate(-50%, -50%);
	text-align: center;
	min-width: 300px;
}

.threedviewer-progress p {
	color: #fff;
	font-weight: 500;
	margin: 8px 0;
}

/* Open in full viewer button */
.open-in-app-button {
	position: absolute !important;
	top: 16px;
	inset-inline-end: 16px;
	z-index: 1000;
	box-shadow: 0 2px 8px rgb(0 0 0 / 30%);
}

.open-in-app-button:hover {
	box-shadow: 0 4px 12px rgb(0 0 0 / 40%);
}

/* Animation control button */
.animation-control-button {
	position: absolute !important;
	top: 16px;
	inset-inline-start: 16px;
	z-index: 1000;
	box-shadow: 0 2px 8px rgb(0 0 0 / 30%);
	min-width: 44px;
	padding: 8px 12px !important;
}

/* Hide Nextcloud Viewer's loading spinner when our progress bar is showing */
.showing-progress .icon-loading,
.showing-progress [class*="loading"] {
	display: none !important;
}

/* Texture warning banner - lighter, less prominent */
.texture-warning-banner {
	position: absolute;
	top: 10px;
	left: 10px;
	right: 10px;
	z-index: 20;
	background: rgba(255, 193, 7, 0.25); /* Increased opacity for better visibility */
	border: 1px solid rgba(255, 193, 7, 0.5);
	border-radius: var(--border-radius-large, 8px);
	padding: 10px 14px;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
	max-width: 500px;
	margin: 0 auto;
	backdrop-filter: blur(4px);
}

[dir="rtl"] .texture-warning-banner {
	left: 10px;
	right: 10px;
}

.texture-warning-content {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	color: var(--color-main-text, #333);
}

[dir="rtl"] .texture-warning-content {
	flex-direction: row-reverse;
}

.texture-warning-icon {
	flex-shrink: 0;
	margin-top: 2px;
	color: var(--color-warning, #ffa500);
	opacity: 1;
}

[dir="rtl"] .texture-warning-icon {
	margin-top: 2px;
	margin-inline: 0;
}

.texture-warning-text {
	flex: 1;
	color: var(--color-main-text, #222);
	text-align: start;
}

[dir="rtl"] .texture-warning-text {
	text-align: start;
}

.texture-warning-text strong {
	display: block;
	margin-bottom: 3px;
	font-size: 14px;
	font-weight: 600;
	color: var(--color-main-text, #222);
}

.texture-warning-text p {
	margin: 0;
	font-size: 13px;
	line-height: 1.4;
	opacity: 1;
	color: var(--color-main-text, #333);
}

.texture-warning-button {
	flex-shrink: 0;
	margin-inline-start: auto;
	padding: 6px 12px !important;
	font-size: 12px !important;
	background: var(--color-primary-element, #0082c9) !important;
	color: #fff !important;
	border-color: var(--color-primary-element, #0082c9) !important;
}

[dir="rtl"] .texture-warning-button {
	margin-inline: auto 0;
}

.texture-warning-button:hover {
	opacity: 0.85;
}
</style>
