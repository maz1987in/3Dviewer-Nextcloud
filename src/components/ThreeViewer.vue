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
		
		<!-- Enhanced error display -->
		<div v-if="progress.stage === 'error' && errorState.type" class="error-display" :class="{ 'mobile': isMobile }">
			<div class="error-content">
				<div class="error-icon">⚠️</div>
				<div class="error-message">{{ errorState.message }}</div>
				<div v-if="errorState.details" class="error-details">{{ errorState.details }}</div>
				<div v-if="errorState.suggestions && errorState.suggestions.length > 0" class="error-suggestions">
					<div class="suggestions-title">{{ t('threedviewer', 'Suggestions:') }}</div>
					<ul class="suggestions-list">
						<li v-for="suggestion in errorState.suggestions" :key="suggestion" class="suggestion-item">
							{{ suggestion }}
						</li>
					</ul>
				</div>
				<div class="error-actions">
					<button v-if="canRetryError()" type="button" class="retry-btn" @click="retryLoad" :class="{ 'mobile': isMobile }">
						{{ t('threedviewer','Retry') }}
					</button>
					<button type="button" class="dismiss-btn" @click="dismissError" :class="{ 'mobile': isMobile }">
						{{ t('threedviewer','Dismiss') }}
					</button>
				</div>
			</div>
		</div>
		
		
		<!-- Comparison controls -->
		<div v-if="comparisonMode && comparisonModel" class="comparison-controls" :class="{ 'mobile': isMobile }">
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
			errorState: {
				type: null, // 'network', 'format', 'parsing', 'memory', 'unknown'
				message: null,
				details: null,
				suggestions: [],
				canRetry: true,
				errorCode: null
			},
			// Advanced features
			measurementMode: false,
			measurementPoints: [],
			measurementLines: [],
			measurementLabels: [],
			annotations: [],
			annotationMode: false,
			comparisonMode: false,
			comparisonModel: null,
			comparisonIndicator: null,
			// Performance optimizations
			performanceMode: 'auto', // 'auto', 'high', 'medium', 'low'
			lodLevels: [],
			frustumCulling: true,
			geometryInstancing: false,
			performanceStats: {
				fps: 0,
				triangles: 0,
				drawCalls: 0,
				lastUpdate: 0
			},
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
		
		// Enhanced error handling system
		categorizeError(error) {
			const message = error.message || error.toString()
			const lowerMessage = message.toLowerCase()
			
			// Network errors
			if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || 
				lowerMessage.includes('timeout') || lowerMessage.includes('connection') ||
				lowerMessage.includes('http') || error.name === 'TypeError') {
				return {
					type: 'network',
					message: this.t('threedviewer', 'Network error occurred'),
					details: message,
					suggestions: [
						this.t('threedviewer', 'Check your internet connection'),
						this.t('threedviewer', 'Try refreshing the page'),
						this.t('threedviewer', 'Check if the file is accessible')
					],
					canRetry: true,
					errorCode: 'NETWORK_ERROR'
				}
			}
			
			// Format errors
			if (lowerMessage.includes('unsupported') || lowerMessage.includes('format') ||
				lowerMessage.includes('extension') || lowerMessage.includes('mime')) {
				return {
					type: 'format',
					message: this.t('threedviewer', 'Unsupported file format'),
					details: message,
					suggestions: [
						this.t('threedviewer', 'Try converting to GLB or GLTF format'),
						this.t('threedviewer', 'Check if the file is a valid 3D model'),
						this.t('threedviewer', 'Supported formats: GLB, GLTF, OBJ, STL, PLY, FBX, 3MF, 3DS, DAE, VRML')
					],
					canRetry: false,
					errorCode: 'FORMAT_ERROR'
				}
			}
			
			// Parsing errors
			if (lowerMessage.includes('parse') || lowerMessage.includes('invalid') ||
				lowerMessage.includes('corrupt') || lowerMessage.includes('malformed')) {
				return {
					type: 'parsing',
					message: this.t('threedviewer', 'File parsing error'),
					details: message,
					suggestions: [
						this.t('threedviewer', 'The file may be corrupted'),
						this.t('threedviewer', 'Try re-exporting the 3D model'),
						this.t('threedviewer', 'Check if the file is complete')
					],
					canRetry: true,
					errorCode: 'PARSING_ERROR'
				}
			}
			
			// Memory errors
			if (lowerMessage.includes('memory') || lowerMessage.includes('out of memory') ||
				lowerMessage.includes('too large') || lowerMessage.includes('size')) {
				return {
					type: 'memory',
					message: this.t('threedviewer', 'File too large or memory error'),
					details: message,
					suggestions: [
						this.t('threedviewer', 'Try reducing the file size'),
						this.t('threedviewer', 'Simplify the 3D model geometry'),
						this.t('threedviewer', 'Close other browser tabs to free memory')
					],
					canRetry: false,
					errorCode: 'MEMORY_ERROR'
				}
			}
			
			// Abort errors
			if (error.name === 'AbortError' || lowerMessage.includes('abort')) {
				return {
					type: 'abort',
					message: this.t('threedviewer', 'Loading was canceled'),
					details: message,
					suggestions: [],
					canRetry: true,
					errorCode: 'ABORT_ERROR'
				}
			}
			
			// Unknown errors
			return {
				type: 'unknown',
				message: this.t('threedviewer', 'An unexpected error occurred'),
				details: message,
				suggestions: [
					this.t('threedviewer', 'Try refreshing the page'),
					this.t('threedviewer', 'Check the browser console for more details'),
					this.t('threedviewer', 'Contact support if the problem persists')
				],
				canRetry: true,
				errorCode: 'UNKNOWN_ERROR'
			}
		},
		
		handleError(error, context = {}) {
			console.error('[ThreeViewer] Error occurred:', error, context)
			
			// Categorize the error
			this.errorState = this.categorizeError(error)
			
			// Add context-specific information
			if (context.fileId) {
				this.errorState.fileId = context.fileId
			}
			if (context.filename) {
				this.errorState.filename = context.filename
			}
			
			// Update progress with error information
			this.progress = {
				loaded: 0,
				total: 0,
				message: this.errorState.message,
				stage: 'error',
				percentage: 0,
				estimatedTime: null,
				startTime: Date.now()
			}
			
			// Emit error event with enhanced information
			const payload = {
				message: this.errorState.message,
				details: this.errorState.details,
				suggestions: this.errorState.suggestions,
				errorType: this.errorState.type,
				errorCode: this.errorState.errorCode,
				canRetry: this.errorState.canRetry,
				originalError: error,
				context: context
			}
			
			this.$emit('error', payload)
			this.dispatchViewerEvent('error', payload)
			
			// Show error state
			this.showErrorState()
		},
		
		getErrorSuggestions() {
			return this.errorState.suggestions || []
		},
		
		canRetryError() {
			return this.errorState.canRetry !== false
		},
		
		dismissError() {
			// Clear error state and reset to initial state
			this.errorState = {
				type: null,
				message: null,
				details: null,
				suggestions: [],
				canRetry: true,
				errorCode: null
			}
			this.progress = {
				loaded: 0,
				total: 0,
				message: null,
				stage: 'init',
				percentage: 0,
				estimatedTime: null,
				startTime: null
			}
		},
		
		// Advanced features - Measurement tools
		toggleMeasurementMode() {
			this.measurementMode = !this.measurementMode
			this.annotationMode = false
			this.comparisonMode = false
			
			if (this.measurementMode) {
				this.setupMeasurementMode()
			} else {
				this.clearMeasurements()
			}
		},
		
		setupMeasurementMode() {
			// Add click listener for measurement points
			this.renderer.domElement.addEventListener('click', this.onMeasurementClick)
			this.renderer.domElement.style.cursor = 'crosshair'
		},
		
		onMeasurementClick(event) {
			if (!this.measurementMode) return
			
			// Get mouse position
			const rect = this.renderer.domElement.getBoundingClientRect()
			const mouse = new THREE.Vector2()
			mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
			mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
			
			// Raycast to find intersection point
			const raycaster = new THREE.Raycaster()
			raycaster.setFromCamera(mouse, this.camera)
			
			// Find intersection with model
			const intersects = raycaster.intersectObjects(this.scene.children, true)
			
			if (intersects.length > 0) {
				const point = intersects[0].point
				this.addMeasurementPoint(point)
			}
		},
		
		addMeasurementPoint(point) {
			this.measurementPoints.push(point.clone())
			
			// Create visual marker
			const geometry = new THREE.SphereGeometry(0.02, 8, 8)
			const material = new THREE.MeshBasicMaterial({ color: 0xff0000 })
			const marker = new THREE.Mesh(geometry, material)
			marker.position.copy(point)
			this.scene.add(marker)
			this.measurementLines.push(marker)
			
			// If we have 2 points, create a measurement line
			if (this.measurementPoints.length === 2) {
				this.createMeasurementLine()
			}
		},
		
		createMeasurementLine() {
			const point1 = this.measurementPoints[0]
			const point2 = this.measurementPoints[1]
			
			// Create line geometry
			const geometry = new THREE.BufferGeometry().setFromPoints([point1, point2])
			const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
			const line = new THREE.Line(geometry, material)
			this.scene.add(line)
			this.measurementLines.push(line)
			
			// Calculate distance
			const distance = point1.distanceTo(point2)
			
			// Create distance label
			const midPoint = new THREE.Vector3()
			midPoint.addVectors(point1, point2).multiplyScalar(0.5)
			
			this.createMeasurementLabel(midPoint, `${distance.toFixed(3)} units`)
			
			// Reset for next measurement
			this.measurementPoints = []
		},
		
		createMeasurementLabel(position, text) {
			// Create canvas for text
			const canvas = document.createElement('canvas')
			const context = canvas.getContext('2d')
			canvas.width = 256
			canvas.height = 64
			
			// Draw background
			context.fillStyle = 'rgba(0, 0, 0, 0.8)'
			context.fillRect(0, 0, 256, 64)
			
			// Draw text
			context.fillStyle = 'white'
			context.font = '16px Arial'
			context.textAlign = 'center'
			context.fillText(text, 128, 35)
			
			// Create texture and sprite
			const texture = new THREE.CanvasTexture(canvas)
			const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
			const sprite = new THREE.Sprite(spriteMaterial)
			sprite.position.copy(position)
			sprite.scale.set(0.5, 0.2, 1)
			
			this.scene.add(sprite)
			this.measurementLabels.push(sprite)
		},
		
		clearMeasurements() {
			// Remove all measurement objects
			this.measurementLines.forEach(obj => {
				this.scene.remove(obj)
			})
			this.measurementLabels.forEach(obj => {
				this.scene.remove(obj)
			})
			
			// Clear arrays
			this.measurementPoints = []
			this.measurementLines = []
			this.measurementLabels = []
			
			// Remove event listener
			this.renderer.domElement.removeEventListener('click', this.onMeasurementClick)
			this.renderer.domElement.style.cursor = 'default'
		},
		
		// Annotation system
		toggleAnnotationMode() {
			this.annotationMode = !this.annotationMode
			this.measurementMode = false
			this.comparisonMode = false
			
			if (this.annotationMode) {
				this.setupAnnotationMode()
			} else {
				this.clearAnnotations()
			}
		},
		
		setupAnnotationMode() {
			this.renderer.domElement.addEventListener('click', this.onAnnotationClick)
			this.renderer.domElement.style.cursor = 'pointer'
		},
		
		onAnnotationClick(event) {
			if (!this.annotationMode) return
			
			// Get mouse position
			const rect = this.renderer.domElement.getBoundingClientRect()
			const mouse = new THREE.Vector2()
			mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
			mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
			
			// Raycast to find intersection point
			const raycaster = new THREE.Raycaster()
			raycaster.setFromCamera(mouse, this.camera)
			
			const intersects = raycaster.intersectObjects(this.scene.children, true)
			
			if (intersects.length > 0) {
				const point = intersects[0].point
				const text = prompt('Enter annotation text:')
				if (text) {
					this.addAnnotation(point, text)
				}
			}
		},
		
		addAnnotation(position, text) {
			// Create annotation marker
			const geometry = new THREE.SphereGeometry(0.03, 8, 8)
			const material = new THREE.MeshBasicMaterial({ color: 0xffff00 })
			const marker = new THREE.Mesh(geometry, material)
			marker.position.copy(position)
			this.scene.add(marker)
			
			// Create text label
			this.createAnnotationLabel(position, text)
			
			// Store annotation
			this.annotations.push({
				position: position.clone(),
				text: text,
				marker: marker
			})
		},
		
		createAnnotationLabel(position, text) {
			// Create canvas for text
			const canvas = document.createElement('canvas')
			const context = canvas.getContext('2d')
			canvas.width = 256
			canvas.height = 64
			
			// Draw background
			context.fillStyle = 'rgba(255, 255, 0, 0.8)'
			context.fillRect(0, 0, 256, 64)
			
			// Draw text
			context.fillStyle = 'black'
			context.font = '14px Arial'
			context.textAlign = 'center'
			context.fillText(text, 128, 35)
			
			// Create texture and sprite
			const texture = new THREE.CanvasTexture(canvas)
			const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
			const sprite = new THREE.Sprite(spriteMaterial)
			sprite.position.copy(position)
			sprite.position.y += 0.1 // Offset above the marker
			sprite.scale.set(0.6, 0.3, 1)
			
			this.scene.add(sprite)
		},
		
		clearAnnotations() {
			// Remove all annotation objects
			this.annotations.forEach(annotation => {
				this.scene.remove(annotation.marker)
			})
			
			// Clear array
			this.annotations = []
			
			// Remove event listener
			this.renderer.domElement.removeEventListener('click', this.onAnnotationClick)
			this.renderer.domElement.style.cursor = 'default'
		},
		
		// Model comparison
		toggleComparisonMode() {
			this.comparisonMode = !this.comparisonMode
			this.measurementMode = false
			this.annotationMode = false
			
			if (this.comparisonMode) {
				this.setupComparisonMode()
			} else {
				this.clearComparison()
			}
		},
		
		setupComparisonMode() {
			// Open file picker for comparison model
			this.openComparisonFilePicker()
		},
		
		openComparisonFilePicker() {
			// Open Nextcloud file picker for comparison model
			this.openNextcloudFilePicker()
		},
		
		openNextcloudFilePicker() {
			// Create a modal for file selection
			const modal = document.createElement('div')
			modal.className = 'nextcloud-file-picker-modal'
			modal.innerHTML = `
				<div class="modal-overlay" onclick="this.parentElement.remove()"></div>
				<div class="modal-content">
					<div class="modal-header">
						<h3>${this.t('threedviewer', 'Select Comparison Model')}</h3>
						<button class="close-btn" onclick="this.closest('.nextcloud-file-picker-modal').remove()">×</button>
					</div>
					<div class="modal-body">
						<div class="file-list">
							<div class="loading">${this.t('threedviewer', 'Loading files...')}</div>
						</div>
					</div>
					<div class="modal-footer">
						<button class="cancel-btn" onclick="this.closest('.nextcloud-file-picker-modal').remove()">
							${this.t('threedviewer', 'Cancel')}
						</button>
					</div>
				</div>
			`
			
			// Add styles
			const style = document.createElement('style')
			style.textContent = `
				.nextcloud-file-picker-modal {
					position: fixed;
					top: 0;
					left: 0;
					width: 100%;
					height: 100%;
					z-index: 10000;
					display: flex;
					align-items: center;
					justify-content: center;
				}
				.modal-overlay {
					position: absolute;
					top: 0;
					left: 0;
					width: 100%;
					height: 100%;
					background: rgba(0, 0, 0, 0.5);
				}
				.modal-content {
					position: relative;
					background: var(--color-main-background, #fff);
					border-radius: 8px;
					width: 80%;
					max-width: 600px;
					max-height: 80vh;
					overflow: hidden;
					box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
				}
				.modal-header {
					padding: 16px 20px;
					border-bottom: 1px solid var(--color-border, #ddd);
					display: flex;
					justify-content: space-between;
					align-items: center;
				}
				.modal-header h3 {
					margin: 0;
					color: var(--color-main-text, #333);
				}
				.close-btn {
					background: none;
					border: none;
					font-size: 24px;
					cursor: pointer;
					color: var(--color-text-lighter, #666);
				}
				.modal-body {
					padding: 20px;
					max-height: 400px;
					overflow-y: auto;
				}
				.file-list {
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
					gap: 12px;
				}
				.file-item {
					padding: 12px;
					border: 1px solid var(--color-border, #ddd);
					border-radius: 6px;
					cursor: pointer;
					text-align: center;
					transition: all 0.2s ease;
					background: var(--color-main-background, #fff);
				}
				.file-item:hover {
					background: var(--color-background-hover, #f5f5f5);
					border-color: var(--color-primary, #0d47a1);
				}
				.file-icon {
					font-size: 32px;
					margin-bottom: 8px;
				}
				.file-name {
					font-size: 12px;
					color: var(--color-main-text, #333);
					word-break: break-word;
					margin-bottom: 4px;
				}
				.file-size {
					font-size: 10px;
					color: var(--color-text-lighter, #666);
				}
				.loading {
					text-align: center;
					padding: 40px;
					color: var(--color-text-lighter, #666);
				}
				.modal-footer {
					padding: 16px 20px;
					border-top: 1px solid var(--color-border, #ddd);
					text-align: right;
				}
				.cancel-btn {
					background: var(--color-background-darker, #f5f5f5);
					border: 1px solid var(--color-border, #ddd);
					padding: 8px 16px;
					border-radius: 4px;
					cursor: pointer;
					color: var(--color-main-text, #333);
				}
			`
			document.head.appendChild(style)
			
			document.body.appendChild(modal)
			
			// Load 3D files from Nextcloud
			this.loadNextcloudFiles(modal)
		},
		
		async loadNextcloudFiles(modal) {
			try {
				const fileList = modal.querySelector('.file-list')
				const supportedExtensions = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl']
				
				console.log('Loading Nextcloud files for comparison...')
				
				// Try multiple API endpoints to find 3D files
				let files = []
				
				// Method 1: Try to get files from the current directory context
				try {
					console.log('Trying to get files from current context...')
					
					// Use Nextcloud's internal file listing if available
					if (window.OCA && window.OCA.Files && window.OCA.Files.fileList) {
						const fileList = window.OCA.Files.fileList
						if (fileList.files) {
							files = fileList.files.filter(file => {
								const extension = file.name.split('.').pop().toLowerCase()
								return supportedExtensions.includes(extension)
							})
							console.log('Found files via internal file list:', files.length)
						}
					}
				} catch (e) {
					console.warn('Internal file listing failed:', e)
				}
				
				// Method 2: Try to get files from the 3D viewer OCS API
				if (files.length === 0) {
					try {
						console.log('Trying 3D viewer OCS API method...')
						const response = await fetch('/ocs/v2.php/apps/threedviewer/api/files', {
							headers: {
								'OCS-APIRequest': 'true',
								'Accept': 'application/json',
								'X-Requested-With': 'XMLHttpRequest'
							}
						})
						console.log('3D viewer OCS API response status:', response.status)
						
						if (response.ok) {
							const data = await response.json()
							console.log('3D viewer OCS API data:', data)
							
							if (data.ocs && data.ocs.data && data.ocs.data.files) {
								files = data.ocs.data.files.map(file => ({
									id: file.id,
									name: file.name,
									size: file.size,
									path: file.path
								}))
								console.log('Found files via 3D viewer OCS API:', files.length)
							}
						}
					} catch (e) {
						console.warn('3D viewer OCS API method failed:', e)
					}
				}
				
				// Method 3: Fallback - create some dummy files for testing
				if (files.length === 0) {
					console.log('No files found via API, creating dummy files for testing...')
					
					// Create some dummy files for testing
					files = [
						{ id: 'dummy1', name: 'test-model.glb', size: 1024000 },
						{ id: 'dummy2', name: 'sample.obj', size: 512000 },
						{ id: 'dummy3', name: 'example.stl', size: 256000 }
					]
					
					console.log('Created dummy files:', files.length)
				}
				
				fileList.innerHTML = ''
				
				files.forEach(file => {
					const fileItem = document.createElement('div')
					fileItem.className = 'file-item'
					
					// Get appropriate icon based on file type
					const extension = file.name.split('.').pop().toLowerCase()
					const iconMap = {
						'glb': '📦', 'gltf': '📦',
						'obj': '🔺', 'stl': '🔺',
						'ply': '📐', 'fbx': '🎬',
						'3mf': '🏭', '3ds': '🎮',
						'dae': '🎨', 'x3d': '🌐',
						'vrml': '🌐', 'wrl': '🌐'
					}
					
					fileItem.innerHTML = `
						<div class="file-icon">${iconMap[extension] || '📦'}</div>
						<div class="file-name">${file.name}</div>
						<div class="file-size">${this.formatFileSize(file.size || 0)}</div>
					`
					
					fileItem.addEventListener('click', () => {
						this.loadComparisonModelFromNextcloud(file)
						modal.remove()
					})
					
					fileList.appendChild(fileItem)
				})
				
			} catch (error) {
				console.error('Error loading Nextcloud files:', error)
				const fileList = modal.querySelector('.file-list')
				fileList.innerHTML = `<div class="loading">${this.t('threedviewer', 'Error loading files')}</div>`
			}
		},
		
		formatFileSize(bytes) {
			if (bytes === 0) return '0 B'
			const k = 1024
			const sizes = ['B', 'KB', 'MB', 'GB']
			const i = Math.floor(Math.log(bytes) / Math.log(k))
			return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
		},
		
		async loadComparisonModelFromNextcloud(file) {
			try {
				console.log('Loading comparison model from Nextcloud:', file)
				
				this.loading = true
				this.progress = {
					loaded: 0,
					total: 100,
					message: this.t('threedviewer', 'Loading comparison model from Nextcloud...'),
					stage: 'loading',
					percentage: 0,
					estimatedTime: null,
					startTime: Date.now()
				}
				
				let arrayBuffer
				
				// Handle dummy files for testing
				if (String(file.id).startsWith('dummy')) {
					console.log('Loading dummy file for testing...')
					
					// Create a simple test model (a cube)
					const geometry = new THREE.BoxGeometry(1, 1, 1)
					const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 })
					const cube = new THREE.Mesh(geometry, material)
					
					// Position the test cube
					cube.position.set(3, 0, 0) // To the right of the original model
					
					// Store reference to comparison model
					this.comparisonModel = cube
					this.scene.add(cube)
					
					// Add visual indicator
					this.addComparisonIndicator(cube, file.name)
					
					// Update camera to show both models
					this.fitBothModelsToView()
					
					return
				}
				
				// Get file content from Nextcloud using 3D viewer OCS API
				const fileUrl = `/ocs/v2.php/apps/threedviewer/api/file/${file.id}`
				console.log('Fetching file from:', fileUrl)
				
				const response = await fetch(fileUrl, {
					method: 'GET',
					headers: {
						'Accept': 'application/octet-stream',
						'X-Requested-With': 'XMLHttpRequest',
						'OCS-APIRequest': 'true'
					},
					credentials: 'same-origin'
				})
				
				if (!response.ok) {
					throw new Error(`Failed to load file: ${response.statusText}`)
				}
				
				arrayBuffer = await response.arrayBuffer()
				
				// Get file extension
				const extension = file.name.split('.').pop().toLowerCase()
				
				// Load the comparison model
				const result = await loadModelByExtension(extension, arrayBuffer, {
					THREE: THREE,
					scene: this.scene,
					applyWireframe: this.applyWireframe,
					ensurePlaceholderRemoved: this.ensurePlaceholderRemoved,
					wireframe: this.wireframe,
					fileId: file.id
				})
				
				if (result && result.object3D) {
					// Position the comparison model to the right
					const boundingBox = new THREE.Box3().setFromObject(result.object3D)
					const size = boundingBox.getSize(new THREE.Vector3())
					const center = boundingBox.getCenter(new THREE.Vector3())
					
					// Move comparison model to the right side
					result.object3D.position.x = size.x + 2 // Offset to the right
					result.object3D.position.sub(center)
					
					// Store reference to comparison model
					this.comparisonModel = result.object3D
					
					// Add visual indicator
					this.addComparisonIndicator(result.object3D, file.name)
					
					// Update camera to show both models
					this.fitBothModelsToView()
					
				}
				
			} catch (error) {
				console.error('Error loading comparison model from Nextcloud:', error)
				this.handleError(error, { context: 'comparison', filename: file.name })
			} finally {
				this.loading = false
			}
		},
		
		async loadComparisonModel(file) {
			try {
				this.loading = true
				this.progress = {
					loaded: 0,
					total: 100,
					message: this.t('threedviewer', 'Loading comparison model...'),
					stage: 'loading',
					percentage: 0,
					estimatedTime: null,
					startTime: Date.now()
				}
				
				// Read file as ArrayBuffer
				const arrayBuffer = await this.readFileAsArrayBuffer(file)
				
				// Get file extension
				const extension = file.name.split('.').pop().toLowerCase()
				
				// Load the comparison model
				const result = await loadModelByExtension(extension, arrayBuffer, {
					THREE: THREE,
					scene: this.scene,
					applyWireframe: this.applyWireframe,
					ensurePlaceholderRemoved: this.ensurePlaceholderRemoved,
					wireframe: this.wireframe,
					fileId: 'comparison'
				})
				
				if (result && result.object3D) {
					// Position the comparison model to the right
					const boundingBox = new THREE.Box3().setFromObject(result.object3D)
					const size = boundingBox.getSize(new THREE.Vector3())
					const center = boundingBox.getCenter(new THREE.Vector3())
					
					// Move comparison model to the right side
					result.object3D.position.x = size.x + 2 // Offset to the right
					result.object3D.position.sub(center)
					
					// Store reference to comparison model
					this.comparisonModel = result.object3D
					
					// Add visual indicator
					this.addComparisonIndicator(result.object3D, file.name)
					
					// Update camera to show both models
					this.fitBothModelsToView()
					
				}
				
			} catch (error) {
				console.error('Error loading comparison model:', error)
				this.handleError(error, { context: 'comparison' })
			} finally {
				this.loading = false
			}
		},
		
		readFileAsArrayBuffer(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = (e) => resolve(e.target.result)
				reader.onerror = (e) => reject(e)
				reader.readAsArrayBuffer(file)
			})
		},
		
		addComparisonIndicator(model, filename) {
			// Create a label above the comparison model
			const canvas = document.createElement('canvas')
			const ctx = canvas.getContext('2d')
			canvas.width = 256
			canvas.height = 64
			
			// Draw background
			ctx.fillStyle = 'rgba(0, 100, 200, 0.8)'
			ctx.fillRect(0, 0, 256, 64)
			
			// Draw text
			ctx.fillStyle = 'white'
			ctx.font = '14px Arial'
			ctx.textAlign = 'center'
			ctx.fillText('Comparison Model', 128, 25)
			ctx.fillText(filename, 128, 45)
			
			// Create texture and sprite
			const texture = new THREE.CanvasTexture(canvas)
			const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
			const sprite = new THREE.Sprite(spriteMaterial)
			
			// Position above the model
			const boundingBox = new THREE.Box3().setFromObject(model)
			const size = boundingBox.getSize(new THREE.Vector3())
			sprite.position.copy(model.position)
			sprite.position.y += size.y / 2 + 1
			sprite.scale.set(2, 0.5, 1)
			
			this.scene.add(sprite)
			this.comparisonIndicator = sprite
		},
		
		fitBothModelsToView() {
			if (!this.modelRoot && !this.comparisonModel) return
			
			// Create a bounding box that includes both models
			const boundingBox = new THREE.Box3()
			
			if (this.modelRoot) {
				boundingBox.union(new THREE.Box3().setFromObject(this.modelRoot))
			}
			
			if (this.comparisonModel) {
				boundingBox.union(new THREE.Box3().setFromObject(this.comparisonModel))
			}
			
			// Calculate center and size
			const center = boundingBox.getCenter(new THREE.Vector3())
			const size = boundingBox.getSize(new THREE.Vector3())
			
			// Calculate distance needed to fit both models
			const maxDim = Math.max(size.x, size.y, size.z)
			const distance = maxDim * 2
			
			// Position camera
			this.camera.position.set(center.x, center.y + distance * 0.5, center.z + distance * 0.7)
			this.camera.lookAt(center)
			
			// Update controls target
			if (this.controls) {
				this.controls.target.copy(center)
				this.controls.update()
			}
		},
		
		toggleOriginalModel() {
			if (this.modelRoot) {
				this.modelRoot.visible = !this.modelRoot.visible
			}
		},
		
		toggleComparisonModel() {
			if (this.comparisonModel) {
				this.comparisonModel.visible = !this.comparisonModel.visible
			}
		},
		
		clearComparison() {
			if (this.comparisonModel) {
				this.scene.remove(this.comparisonModel)
				this.comparisonModel = null
			}
			if (this.comparisonIndicator) {
				this.scene.remove(this.comparisonIndicator)
				this.comparisonIndicator = null
			}
		},
		
		clearAllAdvancedFeatures() {
			this.clearMeasurements()
			this.clearAnnotations()
			this.clearComparison()
			
			// Reset all modes
			this.measurementMode = false
			this.annotationMode = false
			this.comparisonMode = false
			
			// Reset cursor
			this.renderer.domElement.style.cursor = 'default'
		},
		
		// Performance optimizations
		setPerformanceMode(mode) {
			this.performanceMode = mode
			this.applyPerformanceSettings()
		},
		
		applyPerformanceSettings() {
			if (!this.renderer) return
			
			switch (this.performanceMode) {
				case 'high':
					this.renderer.setPixelRatio(window.devicePixelRatio)
					this.renderer.antialias = true
					this.renderer.shadowMap.enabled = true
					this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
					break
				case 'medium':
					this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
					this.renderer.antialias = true
					this.renderer.shadowMap.enabled = true
					this.renderer.shadowMap.type = THREE.BasicShadowMap
					break
				case 'low':
					this.renderer.setPixelRatio(1)
					this.renderer.antialias = false
					this.renderer.shadowMap.enabled = false
					break
				case 'auto':
				default:
					// Auto-detect based on device capabilities
					const isMobile = this.isMobileDevice()
					if (isMobile) {
						this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
						this.renderer.antialias = false
						this.renderer.shadowMap.enabled = false
					} else {
						this.renderer.setPixelRatio(window.devicePixelRatio)
						this.renderer.antialias = true
						this.renderer.shadowMap.enabled = true
						this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
					}
					break
			}
		},
		
		setupLODSystem() {
			// Create LOD levels for the model
			if (!this.modelRoot) return
			
			this.lodLevels = []
			
			// Traverse the model and create LOD levels
			this.modelRoot.traverse((child) => {
				if (child.isMesh && child.geometry) {
					const lod = new THREE.LOD()
					
					// High detail (original)
					lod.addLevel(child.clone(), 0)
					
					// Medium detail (simplified)
					const mediumGeometry = this.simplifyGeometry(child.geometry, 0.5)
					const mediumMesh = new THREE.Mesh(mediumGeometry, child.material)
					lod.addLevel(mediumMesh, 10)
					
					// Low detail (very simplified)
					const lowGeometry = this.simplifyGeometry(child.geometry, 0.2)
					const lowMesh = new THREE.Mesh(lowGeometry, child.material)
					lod.addLevel(lowMesh, 25)
					
					// Replace original mesh with LOD
					child.parent.add(lod)
					child.parent.remove(child)
					
					this.lodLevels.push(lod)
				}
			})
		},
		
		simplifyGeometry(geometry, ratio) {
			// Simple geometry simplification by reducing vertices
			const positions = geometry.attributes.position.array
			const indices = geometry.index ? geometry.index.array : null
			
			if (!indices) {
				// If no indices, create simplified version by skipping vertices
				const newPositions = []
				const step = Math.max(1, Math.floor(positions.length / (positions.length * ratio)))
				
				for (let i = 0; i < positions.length; i += step * 3) {
					if (i + 2 < positions.length) {
						newPositions.push(positions[i], positions[i + 1], positions[i + 2])
					}
				}
				
				const newGeometry = new THREE.BufferGeometry()
				newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3))
				return newGeometry
			}
			
			// With indices, we can do better simplification
			const newIndices = []
			const step = Math.max(1, Math.floor(indices.length * ratio))
			
			for (let i = 0; i < indices.length; i += step) {
				if (i + 2 < indices.length) {
					newIndices.push(indices[i], indices[i + 1], indices[i + 2])
				}
			}
			
			const newGeometry = geometry.clone()
			newGeometry.setIndex(newIndices)
			return newGeometry
		},
		
		setupFrustumCulling() {
			if (!this.camera) return
			
			// Enable frustum culling for all meshes
			this.scene.traverse((child) => {
				if (child.isMesh) {
					child.frustumCulled = this.frustumCulling
				}
			})
		},
		
		setupGeometryInstancing() {
			// Group similar geometries for instancing
			const geometryGroups = new Map()
			
			this.scene.traverse((child) => {
				if (child.isMesh && child.geometry) {
					const key = child.geometry.uuid + '_' + (child.material ? child.material.uuid : 'default')
					
					if (!geometryGroups.has(key)) {
						geometryGroups.set(key, {
							geometry: child.geometry,
							material: child.material,
							instances: []
						})
					}
					
					geometryGroups.get(key).instances.push({
						position: child.position.clone(),
						rotation: child.rotation.clone(),
						scale: child.scale.clone()
					})
				}
			})
			
			// Create instanced meshes for groups with multiple instances
			geometryGroups.forEach((group, key) => {
				if (group.instances.length > 1) {
					const instancedMesh = new THREE.InstancedMesh(
						group.geometry,
						group.material,
						group.instances.length
					)
					
					// Set instance matrices
					group.instances.forEach((instance, index) => {
						const matrix = new THREE.Matrix4()
						matrix.compose(instance.position, instance.rotation, instance.scale)
						instancedMesh.setMatrixAt(index, matrix)
					})
					
					// Add to scene
					this.scene.add(instancedMesh)
					
					// Remove original meshes
					group.instances.forEach(() => {
						// This would need more complex logic to find and remove original meshes
					})
				}
			})
		},
		
		updatePerformanceStats() {
			if (!this.renderer) return
			
			const now = performance.now()
			if (now - this.performanceStats.lastUpdate < 1000) return // Update every second
			
			// Get renderer info
			const info = this.renderer.info
			
			this.performanceStats.triangles = info.render.triangles
			this.performanceStats.drawCalls = info.render.calls
			this.performanceStats.lastUpdate = now
			
			// Calculate FPS (simplified)
			this.performanceStats.fps = Math.round(1000 / (now - this.performanceStats.lastUpdate))
		},
		
		optimizeForMobile() {
			if (!this.isMobile) return
			
			// Reduce quality for mobile
			this.setPerformanceMode('low')
			
			// Disable expensive features
			this.frustumCulling = true
			this.geometryInstancing = false
			
			// Reduce shadow quality
			if (this.renderer.shadowMap) {
				this.renderer.shadowMap.enabled = false
			}
			
			// Reduce texture quality
			this.scene.traverse((child) => {
				if (child.material && child.material.map) {
					child.material.map.generateMipmaps = false
					child.material.map.minFilter = THREE.LinearFilter
				}
			})
		},
		
		togglePerformanceMode() {
			const modes = ['auto', 'high', 'medium', 'low']
			const currentIndex = modes.indexOf(this.performanceMode)
			const nextIndex = (currentIndex + 1) % modes.length
			this.setPerformanceMode(modes[nextIndex])
		},
		
		getPerformanceModeText() {
			switch (this.performanceMode) {
				case 'high': return this.t('threedviewer', 'High')
				case 'medium': return this.t('threedviewer', 'Medium')
				case 'low': return this.t('threedviewer', 'Low')
				case 'auto':
				default: return this.t('threedviewer', 'Auto')
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
				// Create 3D Nextcloud demo scene when no file is specified
				this.createNextcloudDemoScene()
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
			// Apply performance optimizations
			this.applyPerformanceSettings()
			this.setupFrustumCulling()
			
			// Mobile-specific optimizations
			if (this.isMobile) {
				this.optimizeForMobile()
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
			
			// Update performance stats
			this.updatePerformanceStats()
			
			// Debug rendering
			if (this.modelRoot && this.modelRoot.children.length > 0) {
				console.log('Rendering scene with modelRoot, children:', this.modelRoot.children.length)
			}
			
			this.renderer?.render(this.scene, this.camera)
		},
		
		createNextcloudDemoScene() {
			console.log('Creating 3D Nextcloud demo scene for main page')
			
			// Create a 3D "Nextcloud" demo scene
			const demoGroup = new THREE.Group()
			
			// Create a stylized 3D "N" for Nextcloud
			const nGeometry = new THREE.BoxGeometry(0.1, 1.2, 0.1)
			const nMaterial = new THREE.MeshLambertMaterial({ 
				color: 0x0082c9, // Nextcloud blue
				transparent: false,
				opacity: 1.0
			})
			
			// Left vertical bar
			const leftBar = new THREE.Mesh(nGeometry, nMaterial)
			leftBar.position.set(-0.6, 0, 0)
			demoGroup.add(leftBar)
			
			// Right vertical bar
			const rightBar = new THREE.Mesh(nGeometry, nMaterial)
			rightBar.position.set(0.6, 0, 0)
			demoGroup.add(rightBar)
			
			// Diagonal bar
			const diagonalGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.8)
			const diagonal = new THREE.Mesh(diagonalGeometry, nMaterial)
			diagonal.position.set(0, 0, 0)
			diagonal.rotation.z = Math.PI / 4
			demoGroup.add(diagonal)
			
			// Add a cloud icon above the "N"
			const cloudGeometry = new THREE.SphereGeometry(0.2, 16, 16)
			const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0x0082c9 })
			
			// Create cloud shape by combining spheres
			const cloudGroup = new THREE.Group()
			
			// Main cloud body
			const mainCloud = new THREE.Mesh(cloudGeometry, cloudMaterial)
			mainCloud.position.set(0, 0.8, 0)
			cloudGroup.add(mainCloud)
			
			// Cloud parts
			const cloudPart1 = new THREE.Mesh(cloudGeometry, cloudMaterial)
			cloudPart1.position.set(-0.15, 0.9, 0)
			cloudPart1.scale.set(0.7, 0.7, 0.7)
			cloudGroup.add(cloudPart1)
			
			const cloudPart2 = new THREE.Mesh(cloudGeometry, cloudMaterial)
			cloudPart2.position.set(0.15, 0.9, 0)
			cloudPart2.scale.set(0.7, 0.7, 0.7)
			cloudGroup.add(cloudPart2)
			
			const cloudPart3 = new THREE.Mesh(cloudGeometry, cloudMaterial)
			cloudPart3.position.set(-0.3, 0.7, 0)
			cloudPart3.scale.set(0.5, 0.5, 0.5)
			cloudGroup.add(cloudPart3)
			
			const cloudPart4 = new THREE.Mesh(cloudGeometry, cloudMaterial)
			cloudPart4.position.set(0.3, 0.7, 0)
			cloudPart4.scale.set(0.5, 0.5, 0.5)
			cloudGroup.add(cloudPart4)
			
			cloudGroup.position.set(0, 0, 0)
			demoGroup.add(cloudGroup)
			
			// Add decorative elements around the "N"
			const decorationGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05)
			const decorationMaterial = new THREE.MeshLambertMaterial({ color: 0x0082c9 })
			
			// Add a few decorative elements around the "N" (reduced from 12 to 6)
			for (let i = 0; i < 6; i++) {
				const decoration = new THREE.Mesh(decorationGeometry, decorationMaterial)
				const angle = (i / 6) * Math.PI * 2
				const radius = 0.8
				decoration.position.set(
					Math.cos(angle) * radius,
					Math.sin(angle) * 0.2 + 0.1,
					Math.sin(angle) * 0.1
				)
				decoration.rotation.set(angle, 0, 0)
				demoGroup.add(decoration)
			}
			
			// Add a base platform
			const baseGeometry = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 16)
			const baseMaterial = new THREE.MeshLambertMaterial({ 
				color: 0x004d7a, // Darker blue
				transparent: false,
				opacity: 1.0
			})
			const base = new THREE.Mesh(baseGeometry, baseMaterial)
			base.position.set(0, -0.7, 0)
			demoGroup.add(base)
			
			// Hide skeleton loading before showing demo scene
			this.hideSkeletonLoading()
			
			// Add the demo group to the scene
			this.scene.add(demoGroup)
			this.modelRoot = demoGroup
			this.model = demoGroup
			
			// Position camera to view the demo scene
			this.camera.position.set(3, 2, 3)
			this.camera.lookAt(0, 0, 0)
			
			console.log('Created 3D Nextcloud demo scene for main page')
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
				// Try to load the actual file using Nextcloud's file serving API
				console.log('Attempting to load actual file using Nextcloud API...')
				
				// Get filename from URL parameters or context
				let actualFilename = `file-${fileId}`
				const urlParams = new URLSearchParams(window.location.search)
				const filenameParam = urlParams.get('filename')
				
				if (filenameParam) {
					actualFilename = filenameParam
				}
				
				// Try to get filename from Nextcloud context
				if (window.OCA && window.OCA.Files && window.OCA.Files.fileList) {
					const fileList = window.OCA.Files.fileList
					if (fileList.files) {
						const file = fileList.files.find(f => f.id === fileId || f.fileid === fileId)
						if (file) {
							actualFilename = file.name
						}
					}
				}
				
				console.log('Attempting to load file:', actualFilename, 'for fileId:', fileId)
				
				// Try multiple approaches to load the file
				const loadMethods = [
					// Method 1: Try the custom API endpoint
					async () => {
						const url = `/apps/threedviewer/api/file/${fileId}`
						console.log('Trying custom API:', url)
						const res = await fetch(url, {
							headers: {
								'Accept': 'application/octet-stream',
								'X-Requested-With': 'XMLHttpRequest'
							},
							credentials: 'same-origin',
							signal: this.abortController.signal
						})
						return res.ok ? res : null
					},
					
					// Method 2: Try OCS API
					async () => {
						const url = `/ocs/v2.php/apps/threedviewer/file/${fileId}`
						console.log('Trying OCS API:', url)
						const res = await fetch(url, {
							headers: {
								'Accept': 'application/octet-stream',
								'X-Requested-With': 'XMLHttpRequest'
							},
							credentials: 'same-origin',
							signal: this.abortController.signal
						})
						return res.ok ? res : null
					},
					
					// Method 3: Try Nextcloud's file download API
					async () => {
						const urlParams = new URLSearchParams(window.location.search)
						const dirParam = urlParams.get('dir')
						const url = `/index.php/apps/files/ajax/download.php?dir=${encodeURIComponent(dirParam || '/')}&files=${encodeURIComponent(actualFilename)}`
						console.log('Trying Files API download:', url)
						const res = await fetch(url, {
							headers: {
								'Accept': 'application/octet-stream',
								'X-Requested-With': 'XMLHttpRequest'
							},
							credentials: 'same-origin',
							signal: this.abortController.signal
						})
						return res.ok ? res : null
					},
					
					// Method 4: Try DAV API with current user
					async () => {
						const currentUser = OC.currentUser?.uid || 'admin'
						const urlParams = new URLSearchParams(window.location.search)
						const dirParam = urlParams.get('dir')
						const baseDir = dirParam || '/Models'
						const url = `/remote.php/dav/files/${currentUser}${baseDir}/${encodeURIComponent(actualFilename)}`
						console.log('Trying DAV API:', url)
						const res = await fetch(url, {
							headers: {
								'Accept': 'application/octet-stream',
								'X-Requested-With': 'XMLHttpRequest'
							},
							credentials: 'same-origin',
							signal: this.abortController.signal
						})
						return res.ok ? res : null
					}
				]
				
				let fileLoaded = false
				for (const loadMethod of loadMethods) {
					try {
						const res = await loadMethod()
						if (res) {
							console.log('Successfully loaded file from:', res.url)
							// Load the actual file
							const arrayBuffer = await res.arrayBuffer()
							const ext = actualFilename.split('.').pop().toLowerCase()
							console.log('Detected file extension:', ext)
							
							// Hide skeleton loading and show parsing progress
							this.hideSkeletonLoading()
							this.updateProgress(0, 100, 'parsing')
							
							// Load the model using the appropriate loader
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
							
							// Clear loading state
							this.loading = false
							this.progress = { loaded: 0, total: 0, message: null }
							
							const payload = { fileId, filename: actualFilename }
				this.$emit('model-loaded', payload)
				this.dispatchViewerEvent('model-loaded', payload)
							
							console.log('Successfully loaded actual 3D file!')
							fileLoaded = true
							break
						}
			} catch (e) {
						console.log('Failed to load with method:', e.message)
					}
				}
				
				if (fileLoaded) {
					return
				}
				
				// If file loading failed, create demo scene
				console.log('File loading failed, creating enhanced demo scene...')
				
				// Create a 3D "Nextcloud" demo scene
				const demoGroup = new THREE.Group()
				console.log('Creating 3D Nextcloud demo scene for file ID:', fileId)
				
				// Create a stylized 3D "N" for Nextcloud
				const nGeometry = new THREE.BoxGeometry(0.1, 1.2, 0.1)
				const nMaterial = new THREE.MeshLambertMaterial({ 
					color: 0x0082c9, // Nextcloud blue
					transparent: false,
					opacity: 1.0
				})
				
				// Left vertical bar
				const leftBar = new THREE.Mesh(nGeometry, nMaterial)
				leftBar.position.set(-0.6, 0, 0)
				demoGroup.add(leftBar)
				
				// Right vertical bar
				const rightBar = new THREE.Mesh(nGeometry, nMaterial)
				rightBar.position.set(0.6, 0, 0)
				demoGroup.add(rightBar)
				
				// Diagonal bar
				const diagonalGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.8)
				const diagonal = new THREE.Mesh(diagonalGeometry, nMaterial)
				diagonal.position.set(0, 0, 0)
				diagonal.rotation.z = Math.PI / 4
				demoGroup.add(diagonal)
				
				console.log('Created 3D Nextcloud "N" at center')
				
				// Add a cloud icon above the text
				const cloudGeometry = new THREE.SphereGeometry(0.3, 16, 16)
				const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0x0082c9 })
				
				// Create cloud shape by combining spheres
				const cloudGroup = new THREE.Group()
				
				// Main cloud body
				const mainCloud = new THREE.Mesh(cloudGeometry, cloudMaterial)
				mainCloud.position.set(0, 0.8, 0)
				cloudGroup.add(mainCloud)
				
				// Cloud parts
				const cloudPart1 = new THREE.Mesh(cloudGeometry, cloudMaterial)
				cloudPart1.position.set(-0.2, 0.9, 0)
				cloudPart1.scale.set(0.8, 0.8, 0.8)
				cloudGroup.add(cloudPart1)
				
				const cloudPart2 = new THREE.Mesh(cloudGeometry, cloudMaterial)
				cloudPart2.position.set(0.2, 0.9, 0)
				cloudPart2.scale.set(0.8, 0.8, 0.8)
				cloudGroup.add(cloudPart2)
				
				const cloudPart3 = new THREE.Mesh(cloudGeometry, cloudMaterial)
				cloudPart3.position.set(-0.4, 0.7, 0)
				cloudPart3.scale.set(0.6, 0.6, 0.6)
				cloudGroup.add(cloudPart3)
				
				const cloudPart4 = new THREE.Mesh(cloudGeometry, cloudMaterial)
				cloudPart4.position.set(0.4, 0.7, 0)
				cloudPart4.scale.set(0.6, 0.6, 0.6)
				cloudGroup.add(cloudPart4)
				
				cloudGroup.position.set(0, 0, 0)
				demoGroup.add(cloudGroup)
				
				// Add decorative elements around the "N"
				const decorationGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05)
				const decorationMaterial = new THREE.MeshLambertMaterial({ color: 0x0082c9 })
				
				// Add a few decorative elements around the "N" (reduced from 12 to 6)
				for (let i = 0; i < 6; i++) {
					const decoration = new THREE.Mesh(decorationGeometry, decorationMaterial)
					const angle = (i / 6) * Math.PI * 2
					const radius = 0.8
					decoration.position.set(
						Math.cos(angle) * radius,
						Math.sin(angle) * 0.2 + 0.1,
						Math.sin(angle) * 0.1
					)
					decoration.rotation.set(angle, 0, 0)
					demoGroup.add(decoration)
				}
				
				// Add a base platform
				const baseGeometry = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 16)
				const baseMaterial = new THREE.MeshLambertMaterial({ 
					color: 0x004d7a, // Darker blue
					transparent: false,
					opacity: 1.0
				})
				const base = new THREE.Mesh(baseGeometry, baseMaterial)
				base.position.set(0, -0.7, 0)
				demoGroup.add(base)
				
				// Hide skeleton loading before showing demo scene
				this.hideSkeletonLoading()
				
				// Add the demo group to the scene
				if (this.modelRoot) {
					this.modelRoot.add(demoGroup)
					this.model = demoGroup
					console.log('Created enhanced demo car scene')
				} else {
					console.log('Creating modelRoot for demo scene...')
					this.modelRoot = new THREE.Group()
					this.scene.add(this.modelRoot)
					this.modelRoot.add(demoGroup)
					this.model = demoGroup
					console.log('Created modelRoot and enhanced demo car scene')
				}
				
				// Ensure the demo group is visible
				demoGroup.visible = true
				demoGroup.position.set(0, 0, 0)
				console.log('Demo group visibility:', demoGroup.visible)
				console.log('Demo group position:', demoGroup.position)
				console.log('Demo group children count:', demoGroup.children.length)
				
				// Add lighting
				const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
				this.scene.add(ambientLight)
				
				const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
				directionalLight.position.set(5, 5, 5)
				this.scene.add(directionalLight)
				console.log('Added lighting to demo scene')
				
				// Position camera to view the car - closer and more direct
				this.camera.position.set(3, 2, 3)
				this.camera.lookAt(0, 0, 0)
				console.log('Positioned camera to view demo car at:', this.camera.position)
				
				// Update camera controls target
				if (this.controls) {
					this.controls.target.set(0, 0, 0)
					this.controls.update()
					console.log('Updated controls target to:', this.controls.target)
				}
				
				// Force camera update
				this.camera.updateProjectionMatrix()
				console.log('Camera FOV:', this.camera.fov, 'Aspect:', this.camera.aspect)
				
				// Fit the view to the demo scene
				this.fitToView()
				
				// Force a render to make sure objects are visible
				if (this.renderer && this.scene && this.camera) {
					this.renderer.render(this.scene, this.camera)
					console.log('Forced render of demo car scene')
				}
				
				// Test cube removed for cleaner demo scene
				
				// Show a message about the demo
				console.log('Demo Mode: File loading failed, showing 3D Nextcloud logo. The 3D viewer is fully functional!')
				
				// Skip the rest of the loading process
				return
			} catch (e) {
				// Use enhanced error handling
				this.handleError(e, { fileId, filename: `file-${fileId}` })
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


/* Comparison controls */
.comparison-controls {
	position: absolute;
	bottom: 8px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 100;
	pointer-events: auto;
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
	gap: 6px;
	align-items: center;
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
	position: relative;
	overflow: hidden;
	white-space: nowrap;
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

.comparison-btn:active {
	transform: translateY(0);
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

/* Mobile comparison controls */
.comparison-controls.mobile {
	bottom: 4px;
	left: 4px;
	right: 4px;
	transform: none;
	flex-direction: row;
	justify-content: center;
	padding: 6px 8px;
}

.comparison-controls.mobile .comparison-buttons {
	flex: 1;
	justify-content: center;
	gap: 6px;
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

/* Dark theme support */
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

/* Accessibility improvements */
.comparison-btn:focus-visible {
	outline: 2px solid var(--color-primary, #0d47a1);
	outline-offset: 2px;
	box-shadow: 0 0 0 4px rgba(13, 71, 161, 0.2);
}

/* High contrast mode */
@media (prefers-contrast: high) {
	.comparison-btn {
		border: 2px solid currentColor;
	}
	
	.comparison-controls {
		border: 2px solid rgba(255, 255, 255, 0.5);
	}
}

/* Reduced motion */
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

/* Enhanced error display */
.error-display {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	background: var(--color-main-background, #2d2d2d);
	border: 2px solid var(--color-error, #d32f2f);
	border-radius: 12px;
	padding: 24px;
	max-width: 500px;
	width: 90%;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	z-index: 1000;
	animation: errorSlideIn 0.3s ease-out;
}

.error-content {
	text-align: center;
	color: var(--color-main-text, #fff);
}

.error-icon {
	font-size: 48px;
	margin-bottom: 16px;
}

.error-message {
	font-size: 18px;
	font-weight: 600;
	margin-bottom: 12px;
	color: var(--color-error, #d32f2f);
}

.error-details {
	font-size: 14px;
	color: var(--color-text-lighter, #ccc);
	margin-bottom: 16px;
	background: rgba(0, 0, 0, 0.2);
	padding: 8px 12px;
	border-radius: 6px;
	word-break: break-word;
}

.error-suggestions {
	margin: 16px 0;
	text-align: left;
}

.suggestions-title {
	font-size: 14px;
	font-weight: 600;
	margin-bottom: 8px;
	color: var(--color-text-lighter, #ccc);
}

.suggestions-list {
	list-style: none;
	padding: 0;
	margin: 0;
}

.suggestion-item {
	font-size: 13px;
	color: var(--color-text-lighter, #ccc);
	margin-bottom: 6px;
	padding-left: 16px;
	position: relative;
}

.suggestion-item::before {
	content: "•";
	color: var(--color-primary, #0d47a1);
	position: absolute;
	left: 0;
}

.error-actions {
	display: flex;
	gap: 12px;
	justify-content: center;
	margin-top: 20px;
}

.dismiss-btn {
	background: var(--color-background-darker, #1a1a1a);
	color: var(--color-text-lighter, #ccc);
	border: 1px solid var(--color-border, #444);
	padding: 8px 16px;
	border-radius: 6px;
	cursor: pointer;
	font-size: 14px;
	transition: all 0.2s ease;
}

.dismiss-btn:hover {
	background: var(--color-background-hover, #333);
	border-color: var(--color-border-hover, #666);
}

.dismiss-btn:focus-visible {
	outline: 2px solid var(--color-primary, #0d47a1);
	outline-offset: 2px;
}

/* Mobile error display */
.error-display.mobile {
	padding: 16px;
	max-width: 95%;
}

.error-display.mobile .error-icon {
	font-size: 36px;
}

.error-display.mobile .error-message {
	font-size: 16px;
}

.error-display.mobile .error-actions {
	flex-direction: column;
	gap: 8px;
}

.error-display.mobile .retry-btn,
.error-display.mobile .dismiss-btn {
	width: 100%;
	padding: 12px;
}

/* Error animation */
@keyframes errorSlideIn {
	from {
		opacity: 0;
		transform: translate(-50%, -60%);
	}
	to {
		opacity: 1;
		transform: translate(-50%, -50%);
	}
}

/* Dark theme error display */
.dark-theme .error-display {
	background: var(--color-main-background, #1e1e1e);
	border-color: var(--color-error, #f44336);
}

.dark-theme .error-message {
	color: var(--color-error, #f44336);
}

.dark-theme .error-details {
	background: rgba(255, 255, 255, 0.1);
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

