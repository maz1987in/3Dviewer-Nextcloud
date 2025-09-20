<template>
	<div class="three-viewer" ref="container" :aria-label="t('threedviewer','3D viewer canvas container')" :class="{ 'mobile': isMobile }">
		<div v-if="loading" class="loading" aria-live="polite" :class="{ 'mobile': isMobile }">
			<div class="loading-content">
				<div class="loading-spinner" :class="{ 'mobile': isMobile }"></div>
				<div class="loading-text">
					<div class="loading-stage">{{ getStageText(progress.stage) }}</div>
					<div class="loading-details">
						<span v-if="progress.message">{{ progress.message }}</span>
						<span v-else-if="progress.total > 0">{{ formatBytes(progress.loaded) }} / {{ formatBytes(progress.total) }}</span>
						<span v-else-if="progress.loaded > 0">{{ formatBytes(progress.loaded) }}</span>
						<span v-else>{{ t('threedviewer', 'Loading 3D scene…') }}</span>
					</div>
					<div v-if="progress.percentage > 0" class="loading-percentage">{{ progress.percentage }}%</div>
					<div v-if="progress.estimatedTime && progress.estimatedTime > 0" class="loading-time">
						{{ t('threedviewer', 'About {time}s remaining', { time: progress.estimatedTime }) }}
					</div>
				</div>
				<div v-if="progress.total > 0" class="progress-bar" :aria-label="t('threedviewer','Model load progress')" role="progressbar" :aria-valuemin="0" :aria-valuemax="progress.total" :aria-valuenow="progress.loaded" :class="{ 'mobile': isMobile }">
					<div class="progress-bar__fill" :style="{ width: Math.min(100, progress.percentage) + '%' }"></div>
					<div class="progress-bar__label">{{ progress.percentage }}%</div>
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
		
		<!-- Mobile gesture hints -->
		<div v-if="isMobile && !loading && modelRoot" class="mobile-hints">
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
	</div>
</template>

<script>
import * as THREE from 'three'
import { loadModelByExtension, isSupportedExtension } from '../loaders/registry.js'

export default {
	name: 'ThreeViewer',
	props: {
		fileId: { type: [Number, String], default: null },
		showGrid: { type: Boolean, default: true },
		showAxes: { type: Boolean, default: true },
		wireframe: { type: Boolean, default: false },
		background: { type: String, default: null },
	},
	data() {
		return {
			loading: true,
			progress: { loaded: 0, total: 0, message: null },
			renderer: null,
			scene: null,
			camera: null,
			controls: null,
			animationId: null,
			modelRoot: null,
			initialCameraPos: null,
			initialTarget: new THREE.Vector3(0,0,0),
			baselineCameraPos: null,
			baselineTarget: null,
			currentFileId: null,
			_saveTimer: null,
			hasDraco: null,
			hasKtx2: null,
			hasMeshopt: null,
			abortController: null,
			aborting: false,
			abortedEmitted: false,
			isMobile: false,
			touchStartDistance: 0,
			touchStartScale: 1,
			skeletonGroup: null,
			retryCount: 0,
			maxRetries: 3,
			autoRotate: false,
			autoRotateSpeed: 2.0,
			animationPresets: [],
			currentPreset: null,
			isAnimating: false,
		}
	},
	mounted() { this.init(); if (typeof window !== 'undefined') { window.__THREEDVIEWER_VIEWER = this } },
	beforeDestroy() { this.dispose(); this.cancelOngoingLoad() },
	watch: {
		showGrid(val) { if (this.grid) this.grid.visible = val },
		showAxes(val) { if (this.axes) this.axes.visible = val },
		wireframe(val) { this.applyWireframe(val) },
		background(val) { this.applyBackground(val) },
		fileId: { immediate: false, handler(id) { if (id) { this.cancelOngoingLoad(); this.loadModel(id) } } },
	},
		methods: {
		isMobileDevice() {
			return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
				   (navigator.maxTouchPoints && navigator.maxTouchPoints > 1) ||
				   window.innerWidth <= 768
		},
		
		setupMobileControls() {
			if (!this.isMobile || !this.controls) return
			
			// Enhanced touch controls for mobile
			this.controls.enableDamping = true
			this.controls.dampingFactor = 0.1
			this.controls.screenSpacePanning = true
			this.controls.touches = {
				ONE: THREE.TOUCH.ROTATE,
				TWO: THREE.TOUCH.DOLLY_PAN
			}
			
			// Add pinch-to-zoom support
			this.setupPinchZoom()
			
			// Add double-tap to reset view
			this.setupDoubleTapReset()
		},
		
		setupPinchZoom() {
			const canvas = this.renderer.domElement
			let lastTouchDistance = 0
			
			canvas.addEventListener('touchstart', (e) => {
				if (e.touches.length === 2) {
					const touch1 = e.touches[0]
					const touch2 = e.touches[1]
					lastTouchDistance = Math.sqrt(
						Math.pow(touch2.clientX - touch1.clientX, 2) +
						Math.pow(touch2.clientY - touch1.clientY, 2)
					)
				}
			}, { passive: true })
			
			canvas.addEventListener('touchmove', (e) => {
				if (e.touches.length === 2) {
					e.preventDefault()
					const touch1 = e.touches[0]
					const touch2 = e.touches[1]
					const currentDistance = Math.sqrt(
						Math.pow(touch2.clientX - touch1.clientX, 2) +
						Math.pow(touch2.clientY - touch1.clientY, 2)
					)
					
					if (lastTouchDistance > 0) {
						const scale = currentDistance / lastTouchDistance
						const scaleSpeed = 0.1
						const delta = (scale - 1) * scaleSpeed
						
						// Apply zoom
						if (this.controls) {
							this.controls.dollyIn(delta)
							this.controls.update()
						}
					}
					
					lastTouchDistance = currentDistance
				}
			}, { passive: false })
		},
		
		setupDoubleTapReset() {
			const canvas = this.renderer.domElement
			let lastTap = 0
			
			canvas.addEventListener('touchend', (e) => {
				const currentTime = new Date().getTime()
				const tapLength = currentTime - lastTap
				
				if (tapLength < 500 && tapLength > 0) {
					// Double tap detected
					this.resetView()
				}
				
				lastTap = currentTime
			}, { passive: true })
		},
		
		showSkeletonLoading() {
			// Create a skeleton loading animation
			if (this.skeletonGroup) {
				this.scene.remove(this.skeletonGroup)
			}
			
			this.skeletonGroup = new THREE.Group()
			
			// Create animated skeleton cubes
			const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5)
			const material = new THREE.MeshBasicMaterial({ 
				color: 0x666666, 
				transparent: true, 
				opacity: 0.6 
			})
			
			for (let i = 0; i < 8; i++) {
				const cube = new THREE.Mesh(geometry, material)
				cube.position.set(
					(Math.random() - 0.5) * 4,
					(Math.random() - 0.5) * 4,
					(Math.random() - 0.5) * 4
				)
				cube.rotation.set(
					Math.random() * Math.PI,
					Math.random() * Math.PI,
					Math.random() * Math.PI
				)
				this.skeletonGroup.add(cube)
			}
			
			this.scene.add(this.skeletonGroup)
		},
		
		hideSkeletonLoading() {
			if (this.skeletonGroup) {
				this.scene.remove(this.skeletonGroup)
				this.skeletonGroup = null
			}
		},
		
		updateProgress(loaded, total, stage = null) {
			this.progress.loaded = loaded
			this.progress.total = total
			this.progress.percentage = total > 0 ? Math.round((loaded / total) * 100) : 0
			
			if (stage) {
				this.progress.stage = stage
			}
			
			// Calculate estimated time remaining
			if (loaded > 0 && total > 0) {
				const elapsed = Date.now() - this.progress.startTime
				const rate = loaded / elapsed
				const remaining = (total - loaded) / rate
				this.progress.estimatedTime = Math.round(remaining / 1000) // in seconds
			}
		},
		
		formatBytes(bytes) {
			if (bytes === 0) return '0 B'
			const k = 1024
			const sizes = ['B', 'KB', 'MB', 'GB']
			const i = Math.floor(Math.log(bytes) / Math.log(k))
			return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
		},
		
		getStageText(stage) {
			const stageTexts = {
				'initializing': this.t('threedviewer', 'Initializing...'),
				'downloading': this.t('threedviewer', 'Downloading model...'),
				'downloaded': this.t('threedviewer', 'Download complete'),
				'parsing': this.t('threedviewer', 'Parsing 3D model...'),
				'processing': this.t('threedviewer', 'Processing geometry...'),
				'complete': this.t('threedviewer', 'Loading complete'),
				'retrying': this.t('threedviewer', 'Retrying...'),
				'error': this.t('threedviewer', 'Error occurred')
			}
			return stageTexts[stage] || this.t('threedviewer', 'Loading...')
		},
		
		async retryLoad() {
			if (this.retryCount < this.maxRetries) {
				this.retryCount++
				this.updateProgress(0, 0, 'retrying')
				this.progress.message = this.t('threedviewer', 'Retry attempt {count} of {max}', { 
					count: this.retryCount, 
					max: this.maxRetries 
				})
				
				// Wait a bit before retrying
				await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount))
				
				// Retry loading the model
				if (this.currentFileId) {
					await this.loadModel(this.currentFileId)
				}
			} else {
				this.showErrorState()
			}
		},
		
		showErrorState() {
			this.loading = false
			this.hideSkeletonLoading()
			this.progress = {
				loaded: 0,
				total: 0,
				message: this.t('threedviewer', 'Failed to load model after {count} attempts', { count: this.maxRetries }),
				stage: 'error',
				percentage: 0,
				estimatedTime: null,
				startTime: Date.now()
			}
		},
		
		// Camera control enhancements
		toggleAutoRotate() {
			this.autoRotate = !this.autoRotate
			if (this.controls) {
				this.controls.autoRotate = this.autoRotate
				this.controls.autoRotateSpeed = this.autoRotateSpeed
			}
		},
		
		setAutoRotateSpeed(speed) {
			this.autoRotateSpeed = Math.max(0.1, Math.min(10, speed))
			if (this.controls) {
				this.controls.autoRotateSpeed = this.autoRotateSpeed
			}
		},
		
		initAnimationPresets() {
			this.animationPresets = [
				{
					name: 'front',
					label: this.t('threedviewer', 'Front View'),
					position: { x: 0, y: 0, z: 5 },
					target: { x: 0, y: 0, z: 0 }
				},
				{
					name: 'back',
					label: this.t('threedviewer', 'Back View'),
					position: { x: 0, y: 0, z: -5 },
					target: { x: 0, y: 0, z: 0 }
				},
				{
					name: 'left',
					label: this.t('threedviewer', 'Left View'),
					position: { x: -5, y: 0, z: 0 },
					target: { x: 0, y: 0, z: 0 }
				},
				{
					name: 'right',
					label: this.t('threedviewer', 'Right View'),
					position: { x: 5, y: 0, z: 0 },
					target: { x: 0, y: 0, z: 0 }
				},
				{
					name: 'top',
					label: this.t('threedviewer', 'Top View'),
					position: { x: 0, y: 5, z: 0 },
					target: { x: 0, y: 0, z: 0 }
				},
				{
					name: 'bottom',
					label: this.t('threedviewer', 'Bottom View'),
					position: { x: 0, y: -5, z: 0 },
					target: { x: 0, y: 0, z: 0 }
				},
				{
					name: 'isometric',
					label: this.t('threedviewer', 'Isometric View'),
					position: { x: 3, y: 3, z: 3 },
					target: { x: 0, y: 0, z: 0 }
				},
				{
					name: 'orbit',
					label: this.t('threedviewer', 'Orbit View'),
					position: { x: 4, y: 2, z: 4 },
					target: { x: 0, y: 0, z: 0 }
				}
			]
		},
		
		async animateToPreset(presetName, duration = 1000) {
			const preset = this.animationPresets.find(p => p.name === presetName)
			if (!preset || !this.controls) return
			
			this.isAnimating = true
			this.currentPreset = presetName
			
			const startPosition = this.camera.position.clone()
			const startTarget = this.controls.target.clone()
			const endPosition = new THREE.Vector3(preset.position.x, preset.position.y, preset.position.z)
			const endTarget = new THREE.Vector3(preset.target.x, preset.target.y, preset.target.z)
			
			const startTime = Date.now()
			
			const animate = () => {
				const elapsed = Date.now() - startTime
				const progress = Math.min(elapsed / duration, 1)
				
				// Easing function (ease-in-out)
				const easeProgress = progress < 0.5 
					? 2 * progress * progress 
					: 1 - Math.pow(-2 * progress + 2, 3) / 2
				
				// Interpolate position and target
				this.camera.position.lerpVectors(startPosition, endPosition, easeProgress)
				this.controls.target.lerpVectors(startTarget, endTarget, easeProgress)
				this.controls.update()
				
				if (progress < 1) {
					requestAnimationFrame(animate)
				} else {
					this.isAnimating = false
					this.currentPreset = null
				}
			}
			
			animate()
		},
		
		smoothZoom(targetDistance, duration = 500) {
			if (!this.controls) return
			
			const startDistance = this.camera.position.distanceTo(this.controls.target)
			const startTime = Date.now()
			
			const animate = () => {
				const elapsed = Date.now() - startTime
				const progress = Math.min(elapsed / duration, 1)
				
				const easeProgress = progress < 0.5 
					? 2 * progress * progress 
					: 1 - Math.pow(-2 * progress + 2, 3) / 2
				
				const currentDistance = startDistance + (targetDistance - startDistance) * easeProgress
				const direction = this.camera.position.clone().sub(this.controls.target).normalize()
				this.camera.position.copy(this.controls.target).add(direction.multiplyScalar(currentDistance))
				this.controls.update()
				
				if (progress < 1) {
					requestAnimationFrame(animate)
				}
			}
			
			animate()
		},
		
		fitToView(padding = 1.2) {
			if (!this.modelRoot || !this.controls) return
			
			const box = new THREE.Box3().setFromObject(this.modelRoot)
			const size = box.getSize(new THREE.Vector3())
			const center = box.getCenter(new THREE.Vector3())
			
			const maxDim = Math.max(size.x, size.y, size.z)
			const fov = this.camera.fov * (Math.PI / 180)
			const distance = Math.abs(maxDim / Math.sin(fov / 2)) * padding
			
			// Animate to fit
			this.animateToPreset({
				name: 'fit',
				position: { x: center.x, y: center.y, z: center.z + distance },
				target: { x: center.x, y: center.y, z: center.z }
			}, 1000)
		},
		
		// Theme and accessibility enhancements
		applyTheme() {
			const isDark = this.isDarkMode()
			this.updateSceneTheme(isDark)
			this.updateUITheme(isDark)
		},
		
		isDarkMode() {
			// Check multiple sources for dark mode
			if (this.$root?.$ncTheme?.isDark !== undefined) {
				return this.$root.$ncTheme.isDark
			}
			
			// Check CSS custom properties
			const root = document.documentElement
			const computedStyle = getComputedStyle(root)
			const colorScheme = computedStyle.getPropertyValue('color-scheme').trim()
			if (colorScheme === 'dark') return true
			
			// Check system preference
			if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
				return true
			}
			
			// Check Nextcloud theme
			if (typeof OC !== 'undefined' && OC.theme && OC.theme.isDark) {
				return OC.theme.isDark
			}
			
			return false
		},
		
		updateSceneTheme(isDark) {
			if (!this.scene) return
			
			// Update background color
			this.scene.background = new THREE.Color(isDark ? 0x1e1e1e : 0xf5f5f5)
			
			// Update lighting for better contrast in dark mode
			if (this.scene.children) {
				this.scene.children.forEach(child => {
					if (child.type === 'AmbientLight') {
						child.intensity = isDark ? 0.8 : 0.7
					} else if (child.type === 'DirectionalLight') {
						child.intensity = isDark ? 1.0 : 0.8
					}
				})
			}
		},
		
		updateUITheme(isDark) {
			// Add theme class to container
			const container = this.$refs.container
			if (container) {
				container.classList.toggle('dark-theme', isDark)
				container.classList.toggle('light-theme', !isDark)
			}
		},
		
		async init() {
			const container = this.$refs.container
			const width = container.clientWidth || 800
			const height = container.clientHeight || 600
			this.scene = new THREE.Scene()
			this.scene.background = new THREE.Color(this.$root?.$ncTheme?.isDark ? 0x1e1e1e : 0xf5f5f5)
			
			// Mobile-optimized camera settings
			this.isMobile = this.isMobileDevice()
			const fov = this.isMobile ? 75 : 60 // Wider FOV for mobile
			this.camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000)
			this.camera.position.set(2, 2, 2)
			
			// Apply dark mode theme
			this.applyTheme()
			
			// Mobile-optimized renderer settings
			this.renderer = new THREE.WebGLRenderer({ 
				antialias: !this.isMobile, // Disable antialiasing on mobile for performance
				powerPreference: this.isMobile ? "low-power" : "high-performance"
			})
			
			// Optimize pixel ratio for mobile
			const pixelRatio = this.isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio
			this.renderer.setPixelRatio(pixelRatio)
			this.renderer.setSize(width, height)
			
			// Mobile-specific renderer optimizations
			if (this.isMobile) {
				this.renderer.shadowMap.enabled = false // Disable shadows on mobile
				this.renderer.outputColorSpace = THREE.SRGBColorSpace
			}
			
			container.appendChild(this.renderer.domElement)
			const ambient = new THREE.AmbientLight(0xffffff, 0.7)
			const dir = new THREE.DirectionalLight(0xffffff, 0.8)
			dir.position.set(5, 10, 7.5)
			this.scene.add(ambient, dir)
			if (!this.fileId) {
				const geo = new THREE.BoxGeometry(1, 1, 1)
				const mat = new THREE.MeshStandardMaterial({ color: 0x1565c0, metalness: 0.1, roughness: 0.8 })
				this.cube = new THREE.Mesh(geo, mat)
				this.scene.add(this.cube)
			}
			this.grid = new THREE.GridHelper(10, 10)
			this.axes = new THREE.AxesHelper(2)
			this.scene.add(this.grid, this.axes)
			this.grid.visible = this.showGrid
			this.axes.visible = this.showAxes
			// Lazy-load OrbitControls to keep main bundle smaller
			try {
				const mod = await import(/* webpackChunkName: "orbit-controls" */ 'three/examples/jsm/controls/OrbitControls.js')
				const OrbitControls = mod.OrbitControls || mod.default
				this.controls = new OrbitControls(this.camera, this.renderer.domElement)
				
				// Basic controls setup
				this.controls.enableDamping = true
				this.controls.dampingFactor = 0.05
				this.controls.screenSpacePanning = false
				this.controls.update()
				this.controls.addEventListener('end', this.onControlsEnd)
				
				// Setup mobile-specific controls
				this.setupMobileControls()
				
				// Initialize animation presets
				this.initAnimationPresets()
				
			} catch (e) {
				// If dynamic import fails, continue without controls (rare)
				console.warn('[ThreeViewer] Failed to load OrbitControls chunk', e)
			}
			window.addEventListener('resize', this.onWindowResize)
			this.initialCameraPos = this.camera.position.clone()
			this.loading = false
			this.animate()
			if (this.fileId) this.loadModel(this.fileId)
		},
		animate() {
			this.animationId = requestAnimationFrame(this.animate)
			if (this.cube && !this.modelRoot) {
				this.cube.rotation.x += 0.01
				this.cube.rotation.y += 0.015
			}
			this.controls?.update()
			this.renderer?.render(this.scene, this.camera)
		},
		async loadModel(fileId) {
			this.cancelOngoingLoad()
			this.loading = true
			this.progress = { 
				loaded: 0, 
				total: 0, 
				message: null,
				stage: 'initializing',
				percentage: 0,
				estimatedTime: null,
				startTime: Date.now()
			}
			this.currentFileId = fileId
			this.baselineCameraPos = null
			this.baselineTarget = null
			this.aborting = false
			this.abortedEmitted = false
			this.abortController = new AbortController()
			
			// Show skeleton loading for better UX
			this.showSkeletonLoading()
			
			// Announce load start early (before fetch) for external listeners / tests
			const startPayload = { fileId }
			this.$emit('load-start', startPayload)
			this.dispatchViewerEvent('load-start', startPayload)
			try {
				const url = `/ocs/v2.php/apps/threedviewer/file/${fileId}`
				const res = await fetch(url, { headers: { 'Accept': 'application/octet-stream' }, signal: this.abortController.signal })
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				let filename = (res.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)"?/i)?.[1] || 'model.glb'
				const ext = filename.split('.').pop().toLowerCase()
				if (!isSupportedExtension(ext)) throw new Error(`Unsupported extension: ${ext}`)
				let arrayBuffer
				const contentLength = Number(res.headers.get('Content-Length') || 0)
				if (res.body && contentLength > 0 && 'getReader' in res.body) {
					this.updateProgress(0, contentLength, 'downloading')
					const reader = res.body.getReader()
					const chunks = []
					let received = 0
					while (true) {
						const { done, value } = await reader.read()
						if (done) break
						chunks.push(value)
						received += value.byteLength
						this.updateProgress(received, contentLength, 'downloading')
						if (this.aborting) throw new DOMException('Aborted', 'AbortError')
					}
					const totalLength = received
					arrayBuffer = new Uint8Array(totalLength)
					let offset = 0
					for (const c of chunks) { arrayBuffer.set(c, offset); offset += c.byteLength }
					arrayBuffer = arrayBuffer.buffer
				} else {
					const blob = await res.blob()
					arrayBuffer = await blob.arrayBuffer()
					this.updateProgress(arrayBuffer.byteLength, arrayBuffer.byteLength, 'downloaded')
				}
				
				// Hide skeleton loading and show parsing progress
				this.hideSkeletonLoading()
				this.updateProgress(0, 100, 'parsing')
				if (['glb','gltf'].includes(ext)) await this.detectDecoderAssets()
				const { object3D } = await loadModelByExtension(ext, arrayBuffer, {
					THREE,
					scene: this.scene,
					renderer: this.renderer,
					applyWireframe: (enabled) => this.applyWireframe(enabled),
					ensurePlaceholderRemoved: () => this.ensurePlaceholderRemoved(),
					hasDraco: this.hasDraco,
					hasKtx2: this.hasKtx2,
					wireframe: this.wireframe,
					fileId: this.fileId,
				})
				if (this.aborting) throw new DOMException('Aborted', 'AbortError')
				this.modelRoot = object3D
				this.scene.add(this.modelRoot)
				this.fitCameraToObject(this.modelRoot)
				this.baselineCameraPos = this.camera.position.clone()
				this.baselineTarget = this.controls.target.clone()
				this.applySavedCamera(fileId)
				const payload = { fileId, filename }
				this.$emit('model-loaded', payload)
				this.dispatchViewerEvent('model-loaded', payload)
			} catch (e) {
				if (e && e.name === 'AbortError') {
					this.progress.message = t('threedviewer','Canceled')
					const payload = { fileId }
					this.$emit('model-aborted', payload)
					this.dispatchViewerEvent('model-aborted', payload)
				} else {
					console.error(e)
					const payload = { message: e.message || e.toString(), error: e }
					this.$emit('error', payload)
					this.dispatchViewerEvent('error', payload)
					this.progress.message = null
					this.progress.loaded = 0
					this.progress.total = 0
				}
			} finally {
				if (this.progress.total > 0 && this.progress.loaded < this.progress.total && !this.aborting) {
					this.progress.loaded = this.progress.total
				}
				this.loading = false
				this.aborting = false
				this.abortController = null
			}
		},
		cancelOngoingLoad() {
			if (this.abortController) {
				try { this.abortController.abort() } catch (_) {}
				this.abortController = null
				this.aborting = false
			}
		},
		cancelLoad() {
			if (!this.loading || this.aborting) return
			if (this.abortController) {
				this.aborting = true
				try { this.abortController.abort() } catch (_) {}
				// Proactively dispatch aborted event to guarantee external listeners receive it,
				// even if the underlying fetch rejects before our try/catch below handles it.
				if (!this.abortedEmitted) {
					const payload = { fileId: this.currentFileId }
					this.$emit('model-aborted', payload)
					this.dispatchViewerEvent('model-aborted', payload)
					this.abortedEmitted = true
				}
			}
		},
		async ensurePlaceholderRemoved() {
			if (this.cube) {
				this.scene.remove(this.cube)
				this.cube.geometry.dispose()
				this.cube.material.dispose()
				this.cube = null
			}
		},
		async detectDecoderAssets() {
			// Temporarily disable decoder detection to avoid 404 errors
			// The 3D viewer will work without decoders, just with reduced functionality
			this.hasDraco = false
			this.hasKtx2 = false
			this.hasMeshopt = false
			console.log('[threedviewer] Decoder detection disabled - using basic 3D viewer mode')
		},
		fitCameraToObject(obj) {
			const box = new THREE.Box3().setFromObject(obj)
			if (box.isEmpty()) return
			const size = new THREE.Vector3()
			const center = new THREE.Vector3()
			box.getSize(size)
			box.getCenter(center)
			const maxDim = Math.max(size.x, size.y, size.z)
			const fov = this.camera.fov * (Math.PI / 180)
			let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.4
			this.camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ)
			this.controls.target.copy(center)
			this.controls.update()
			if (!this.baselineCameraPos || !this.baselineTarget) {
				this.baselineCameraPos = this.camera.position.clone()
				this.baselineTarget = this.controls.target.clone()
			}
		},
		applyWireframe(enabled) {
			if (!this.modelRoot) return
			this.modelRoot.traverse(node => {
				if (node.isMesh && node.material) {
					const materials = Array.isArray(node.material) ? node.material : [node.material]
					materials.forEach(m => { if ('wireframe' in m) m.wireframe = enabled })
				}
			})
		},
		applyBackground(val) { if (val) { try { this.scene.background = new THREE.Color(val) } catch (_) {} } },
		resetView() {
			if (this.baselineCameraPos && this.baselineTarget) {
				this.camera.position.copy(this.baselineCameraPos)
				this.controls.target.copy(this.baselineTarget)
				this.controls.update()
			} else if (this.initialCameraPos) {
				this.camera.position.copy(this.initialCameraPos)
				this.controls.target.copy(this.initialTarget)
				this.controls.update()
			}
			this.$emit('reset-done')
		},
		onControlsEnd() { if (this.fileId) this.scheduleCameraSave() },
		scheduleCameraSave() {
			if (this._saveTimer) clearTimeout(this._saveTimer)
			this._saveTimer = setTimeout(() => this.saveCameraState(this.fileId), 400)
		},
		getCameraStore() { try { return JSON.parse(localStorage.getItem('threedviewer.camera.v1')) || {} } catch (_) { return {} } },
		setCameraStore(store) { try { localStorage.setItem('threedviewer.camera.v1', JSON.stringify(store)) } catch (_) {} },
		saveCameraState(fileId) {
			if (!fileId || !this.camera || !this.controls) return
			const store = this.getCameraStore()
			store[fileId] = { pos: [this.camera.position.x, this.camera.position.y, this.camera.position.z], target: [this.controls.target.x, this.controls.target.y, this.controls.target.z] }
			this.setCameraStore(store)
		},
		applySavedCamera(fileId) {
			if (!fileId) return false
			const entry = this.getCameraStore()[fileId]
			if (!entry || !entry.pos || !entry.target) return false
			try {
				this.camera.position.set(entry.pos[0], entry.pos[1], entry.pos[2])
				this.controls.target.set(entry.target[0], entry.target[1], entry.target[2])
				this.controls.update()
				return true
			} catch (_) { return false }
		},
		onWindowResize() {
			if (!this.renderer || !this.camera) return
			const container = this.$refs.container
			const width = container.clientWidth
			const height = container.clientHeight || width * 0.75
			this.camera.aspect = width / height
			this.camera.updateProjectionMatrix()
			this.renderer.setSize(width, height)
		},
		dispose() {
			cancelAnimationFrame(this.animationId)
			window.removeEventListener('resize', this.onWindowResize)
			this.controls?.dispose()
			if (this.controls) this.controls.removeEventListener('end', this.onControlsEnd)
			if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null }
			this.cancelOngoingLoad()
			if (this.renderer) {
				this.renderer.dispose()
				if (this.renderer.domElement?.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
			}
			;['cube', 'grid', 'axes', 'modelRoot'].forEach(key => {
				if (this[key]) {
					this.scene?.remove(this[key])
					if (this[key].geometry) this[key].geometry.dispose()
					if (this[key].material) {
						if (Array.isArray(this[key].material)) this[key].material.forEach(m => m.dispose())
						else this[key].material.dispose()
					}
				}
			})
		},
		dispatchViewerEvent(type, detail) {
			try {
				const el = this.$refs.container
				if (el) {
					el.dispatchEvent(new CustomEvent(`threedviewer:${type}` , { detail, bubbles: true, composed: true }))
				}
			} catch (_) {}
		},
	},
}
</script>

<style scoped>
.three-viewer { 
	position: relative; 
	width: 100%; 
	height: calc(100vh - 120px); 
	min-height: 400px; 
	outline: none; 
	display: flex; 
	align-items: center; 
	justify-content: center;
	touch-action: none; /* Prevent default touch behaviors */
	-webkit-touch-callout: none; /* Disable iOS callout */
	-webkit-user-select: none; /* Disable text selection */
	user-select: none;
}

.loading { 
	position: absolute; 
	top: 50%; 
	left: 50%; 
	transform: translate(-50%, -50%); 
	font-size: 0.95rem; 
	color: var(--color-text-light, #555);
	pointer-events: none; /* Prevent interaction with loading text */
}

.loading-actions { 
	margin-top: 0.5rem; 
	text-align: center; 
}

.cancel-btn { 
	cursor: pointer; 
	font-size: 0.75rem; 
	padding: 4px 10px; 
	border-radius: 4px; 
	background: var(--color-primary, #0d47a1); 
	color: #fff; 
	border: none;
	touch-action: manipulation; /* Optimize touch response */
}

.cancel-btn[disabled] { 
	opacity: 0.6; 
	cursor: default; 
}

/* Mobile-specific styles */
@media (max-width: 768px) {
	.three-viewer {
		height: calc(100vh - 80px); /* Reduce height on mobile */
		min-height: 300px;
	}
	
	.loading {
		font-size: 0.85rem;
		padding: 0 20px;
	}
	
	.cancel-btn {
		font-size: 0.8rem;
		padding: 6px 12px;
		min-height: 44px; /* iOS recommended touch target size */
	}
}

/* Landscape mobile optimization */
@media (max-width: 768px) and (orientation: landscape) {
	.three-viewer {
		height: calc(100vh - 60px);
		min-height: 250px;
	}
}

/* High DPI mobile devices */
@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
	.three-viewer {
		/* Optimize for high DPI displays */
		image-rendering: -webkit-optimize-contrast;
		image-rendering: crisp-edges;
	}
}

/* Mobile loading enhancements */
.loading.mobile {
	padding: 20px;
}

.loading-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
}

.loading-spinner {
	width: 32px;
	height: 32px;
	border: 3px solid rgba(255, 255, 255, 0.3);
	border-top: 3px solid var(--color-primary, #0d47a1);
	border-radius: 50%;
	animation: spin 1s linear infinite;
}

.loading-spinner.mobile {
	width: 40px;
	height: 40px;
	border-width: 4px;
}

.loading-text {
	font-size: 0.9rem;
	text-align: center;
	color: var(--color-text-light, #555);
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.loading.mobile .loading-text {
	font-size: 1rem;
}

.loading-stage {
	font-weight: 600;
	color: var(--color-primary, #0d47a1);
	font-size: 1.1em;
}

.loading-details {
	font-size: 0.9em;
	color: var(--color-text, #333);
}

.loading-percentage {
	font-size: 1.2em;
	font-weight: 700;
	color: var(--color-primary, #0d47a1);
}

.loading-time {
	font-size: 0.8em;
	color: var(--color-text-light, #666);
	font-style: italic;
}

.progress-bar {
	position: relative;
	width: 200px;
	height: 6px;
	background: rgba(0, 0, 0, 0.1);
	border-radius: 3px;
	overflow: hidden;
}

.progress-bar__fill {
	height: 100%;
	background: linear-gradient(90deg, var(--color-primary, #0d47a1), var(--color-success, #2e7d32));
	border-radius: 3px;
	transition: width 0.3s ease;
}

.progress-bar__label {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	font-size: 0.7em;
	font-weight: 600;
	color: white;
	text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.progress-bar.mobile {
	width: 250px;
	height: 8px;
}

.progress-bar.mobile .progress-bar__label {
	font-size: 0.8em;
}

.cancel-btn.mobile {
	font-size: 0.9rem;
	padding: 8px 16px;
	min-height: 44px;
}

.retry-btn {
	cursor: pointer;
	font-size: 0.75rem;
	padding: 4px 10px;
	border-radius: 4px;
	background: var(--color-success, #2e7d32);
	color: #fff;
	border: none;
	touch-action: manipulation;
}

.retry-btn:hover {
	background: var(--color-success-hover, #1b5e20);
	transform: translateY(-1px);
}

.retry-btn.mobile {
	font-size: 0.9rem;
	padding: 8px 16px;
	min-height: 44px;
}

/* Mobile gesture hints */
.mobile-hints {
	position: absolute;
	bottom: 20px;
	left: 50%;
	transform: translateX(-50%);
	background: rgba(0, 0, 0, 0.7);
	backdrop-filter: blur(8px);
	border-radius: 12px;
	padding: 12px 16px;
	display: flex;
	gap: 16px;
	align-items: center;
	z-index: 5;
	animation: fadeInUp 0.5s ease-out;
}

.hint-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	color: white;
	font-size: 0.8rem;
}

.hint-icon {
	font-size: 1.2rem;
	line-height: 1;
}

.hint-text {
	font-size: 0.7rem;
	text-align: center;
	white-space: nowrap;
}

/* Animations */
@keyframes spin {
	0% { transform: rotate(0deg); }
	100% { transform: rotate(360deg); }
}

@keyframes fadeInUp {
	from {
		opacity: 0;
		transform: translateX(-50%) translateY(20px);
	}
	to {
		opacity: 1;
		transform: translateX(-50%) translateY(0);
	}
}

/* Hide hints after 5 seconds */
.mobile-hints {
	animation: fadeInUp 0.5s ease-out, fadeOut 0.5s ease-in 4.5s forwards;
}

@keyframes fadeOut {
	to {
		opacity: 0;
		transform: translateX(-50%) translateY(-20px);
	}
}

/* Dark theme support */
.dark-theme {
	--color-primary: #64b5f6;
	--color-primary-hover: #42a5f5;
	--color-success: #4caf50;
	--color-success-hover: #388e3c;
	--color-text: #e0e0e0;
	--color-text-light: #b0b0b0;
	--color-background: #1e1e1e;
	--color-surface: #2d2d2d;
	--color-border: #404040;
}

.light-theme {
	--color-primary: #0d47a1;
	--color-primary-hover: #1565c0;
	--color-success: #2e7d32;
	--color-success-hover: #1b5e20;
	--color-text: #333333;
	--color-text-light: #666666;
	--color-background: #f5f5f5;
	--color-surface: #ffffff;
	--color-border: #e0e0e0;
}

/* Accessibility improvements */
.three-viewer:focus-within {
	outline: 2px solid var(--color-primary, #0d47a1);
	outline-offset: 2px;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
	.tb {
		border: 2px solid currentColor;
	}
	
	.progress-bar {
		border: 2px solid currentColor;
	}
	
	.mobile-hints {
		border: 2px solid white;
	}
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
	.loading-spinner {
		animation: none;
	}
	
	.tb:hover {
		transform: none;
	}
	
	.retry-btn:hover {
		transform: none;
	}
	
	.mobile-hints {
		animation: none;
	}
}

/* Focus indicators for keyboard navigation */
.tb:focus-visible,
.retry-btn:focus-visible,
.cancel-btn:focus-visible,
.preset-select:focus-visible {
	outline: 2px solid var(--color-primary, #0d47a1);
	outline-offset: 2px;
	box-shadow: 0 0 0 4px rgba(13, 71, 161, 0.2);
}

/* Screen reader only text */
.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
</style>

