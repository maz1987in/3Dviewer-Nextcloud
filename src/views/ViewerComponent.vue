<template>
	<div class="threedviewer-wrapper">
		<canvas ref="canvas" class="threedviewer-canvas" />
		<div v-if="loading" class="threedviewer-loading">
			<div class="icon-loading" />
			<p>{{ t('threedviewer', 'Loading 3D model...') }}</p>
		</div>
		<div v-if="error" class="threedviewer-error">
			<p>{{ error }}</p>
		</div>
	</div>
</template>

<script>
export default {
	name: 'ViewerComponent',
	
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
			loading: true,
			error: null,
			scene: null,
			camera: null,
			renderer: null,
			controls: null,
		}
	},

	mounted() {
		console.info('[ThreeDViewer] ViewerComponent mounted', {
			filename: this.filename,
			mime: this.mime,
			davPath: this.davPath,
		})
		
		this.initViewer()
	},

	beforeDestroy() {
		this.cleanup()
	},

	methods: {
		async initViewer() {
			try {
				// Import Three.js dynamically
				const THREE = await import(/* webpackChunkName: "three" */ 'three')
				const { OrbitControls } = await import(/* webpackChunkName: "OrbitControls" */ 'three/examples/jsm/controls/OrbitControls.js')

				// Setup scene
				this.scene = new THREE.Scene()
				this.scene.background = new THREE.Color(0xf0f0f0)

				// Setup camera
				const aspect = this.$refs.canvas.clientWidth / this.$refs.canvas.clientHeight
				this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
				this.camera.position.z = 5

				// Setup renderer
				this.renderer = new THREE.WebGLRenderer({ 
					canvas: this.$refs.canvas,
					antialias: true,
				})
				this.renderer.setSize(this.$refs.canvas.clientWidth, this.$refs.canvas.clientHeight)
				this.renderer.setPixelRatio(window.devicePixelRatio)

				// Setup controls
				this.controls = new OrbitControls(this.camera, this.renderer.domElement)
				this.controls.enableDamping = true

				// Add lights
				const ambientLight = new THREE.AmbientLight(0x404040, 2)
				this.scene.add(ambientLight)

				const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
				directionalLight.position.set(1, 1, 1)
				this.scene.add(directionalLight)

				// Load model
				await this.loadModel(THREE)

				// Start animation loop
				this.animate()

				this.loading = false
				
				// Tell Viewer we're done loading
				this.$emit('update:loaded', true)

			} catch (err) {
				console.error('[ThreeDViewer] Error initializing viewer:', err)
				this.error = this.t('threedviewer', 'Failed to load 3D model: {error}', { error: err.message })
				this.loading = false
				this.$emit('error', err)
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
					
					// TODO: Implement full multi-file loading with dependencies
					// For now, fall back to single-file loading
					// Future implementation will use:
					// const { loadModelWithDependencies } = await import('../loaders/multiFileHelpers.js')
					// const result = await loadModelWithDependencies(this.fileid, this.filename, extension, dirPath)
					console.warn('[ThreeDViewer] Multi-file loading not yet fully implemented, using single-file fallback')
				}

				// Fetch model data from ApiController endpoint
				// Note: Using /api/file/{fileId} (not /file/{fileId})
				const response = await fetch(`/apps/threedviewer/api/file/${this.fileid}`)
				
				if (!response.ok) {
					throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`)
				}

				// Get array buffer
				const arrayBuffer = await response.arrayBuffer()
				console.info('[ThreeDViewer] Downloaded model data:', arrayBuffer.byteLength, 'bytes')

				// Dynamically load the appropriate loader from registry
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
				const result = await loadModelByExtension(extension, arrayBuffer, context)
				
				if (result && result.object3D) {
					// Add loaded model to scene
					this.scene.add(result.object3D)
					
					// Auto-fit camera to model
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
			if (this.renderer) {
				this.renderer.dispose()
			}
			if (this.controls) {
				this.controls.dispose()
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

.threedviewer-loading,
.threedviewer-error {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	text-align: center;
}

.threedviewer-loading .icon-loading {
	width: 44px;
	height: 44px;
	margin: 0 auto 20px;
}
</style>
