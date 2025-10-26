<template>
	<div
		ref="controllerRef"
		class="circular-controller"
		:class="{ 'mobile': isMobile, 'dragging': isDragging, 'hidden': !visible, 'fade-in': fadeIn }"
		:style="controllerStyle"
		role="region"
		:aria-label="t('threedviewer', '3D navigation controller')">
		<div class="controller-layers">
			<!-- Outer zoom ring with tick marks (visual only) -->
			<div class="zoom-ring">
				<svg viewBox="0 0 250 250" xmlns="http://www.w3.org/2000/svg">
					<circle
						class="zoom-ring-circle"
						cx="125"
						cy="125"
						:r="ringRadius" />
					<g class="zoom-ring-ticks">
						<line
							v-for="i in 12"
							:key="`tick-${i}`"
							:x1="125 + ringRadius * Math.cos((i * 30 - 90) * Math.PI / 180)"
							:y1="125 + ringRadius * Math.sin((i * 30 - 90) * Math.PI / 180)"
							:x2="125 + (ringRadius - 5) * Math.cos((i * 30 - 90) * Math.PI / 180)"
							:y2="125 + (ringRadius - 5) * Math.sin((i * 30 - 90) * Math.PI / 180)" />
					</g>
				</svg>
			</div>

			<!-- Movement ring (full interactive area) -->
			<div
				class="movement-ring"
				:class="{ 'panning-mode': isPanningMode }"
				:aria-label="isPanningMode ? t('threedviewer', 'Click or drag to pan view') : t('threedviewer', 'Click or drag to rotate view')"
				:title="isPanningMode ? t('threedviewer', 'Click anywhere to pan - farther from center = faster') : t('threedviewer', 'Click anywhere to rotate - farther from center = faster')"
				@mousedown="handleMovementStart"
				@touchstart.prevent="handleMovementTouchStart">
				<!-- Directional arrows (visual indicators only) -->
				<div class="arrow-indicators">
					<div
						v-for="arrow in arrows"
						:key="arrow.direction"
						:class="['direction-arrow', `arrow-${arrow.direction}`]"
						:aria-hidden="true">
						{{ arrow.icon }}
					</div>
				</div>

				<!-- Zoom buttons (replacing left/right arrows) -->
				<button
					class="zoom-btn zoom-out"
					:aria-label="t('threedviewer', 'Zoom Out')"
					:title="t('threedviewer', 'Zoom Out')"
					@click.stop="handleZoomOut"
					@mousedown.stop="handleZoomOutStart"
					@mouseup.stop="handleZoomStop"
					@mouseleave.stop="handleZoomStop"
					@touchstart.stop="handleZoomOutStart"
					@touchend.stop="handleZoomStop">
					−
				</button>
				<button
					class="zoom-btn zoom-in"
					:aria-label="t('threedviewer', 'Zoom In')"
					:title="t('threedviewer', 'Zoom In')"
					@click.stop="handleZoomIn"
					@mousedown.stop="handleZoomInStart"
					@mouseup.stop="handleZoomStop"
					@mouseleave.stop="handleZoomStop"
					@touchstart.stop="handleZoomInStart"
					@touchend.stop="handleZoomStop">
					+
				</button>

				<!-- Panning mode toggle button -->
				<button
					class="mode-btn panning-toggle"
					:class="{ active: isPanningMode }"
					:aria-label="isPanningMode ? t('threedviewer', 'Switch to Rotation Mode') : t('threedviewer', 'Switch to Panning Mode')"
					:title="isPanningMode ? t('threedviewer', 'Switch to Rotation Mode') : t('threedviewer', 'Switch to Panning Mode')"
					@click.stop="togglePanningMode">
					{{ isPanningMode ? '↻' : '↔' }}
				</button>

				<!-- Panning reset button (only visible in panning mode) -->
				<button
					v-if="isPanningMode"
					class="mode-btn panning-reset"
					:aria-label="t('threedviewer', 'Reset camera position')"
					:title="t('threedviewer', 'Reset camera position')"
					@click.stop="resetPanning">
					⌂
				</button>

				<!-- Inner dashed ring (visual guide) -->
				<div class="orbit-ring-visual" />

				<!-- Center dot indicator -->
				<div class="center-dot" />
			</div>

			<!-- Central cube gizmo -->
			<div
				ref="cubeContainerRef"
				class="cube-container"
				:aria-label="t('threedviewer', 'Click cube face to snap to view')"
				:title="t('threedviewer', 'Click cube face to snap to view')">
				<!-- Canvas will be inserted here by Three.js -->
			</div>

			<!-- Drag handle for repositioning -->
			<div
				class="drag-handle"
				:aria-label="t('threedviewer', 'Move Controller')"
				:title="t('threedviewer', 'Drag to reposition controller')"
				@mousedown.stop="handleDragStart"
				@touchstart.stop.prevent="handleDragTouchStart">
				⋮⋮
			</div>
		</div>
	</div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, watch, getCurrentInstance } from 'vue'
import * as THREE from 'three'
import { logger } from '../utils/logger.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'

export default {
	name: 'CircularController',
	props: {
		mainCamera: {
			type: Object,
			default: null,
		},
		mainControls: {
			type: Object,
			default: null,
		},
		visible: {
			type: Boolean,
			default: true,
		},
		isMobile: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['camera-rotate', 'camera-zoom', 'snap-to-view', 'position-changed', 'nudge-camera', 'cameraPan', 'testPan'],
	setup(props, { emit }) {
		// Refs
		const controllerRef = ref(null)
		const cubeContainerRef = ref(null)

		// State
		const position = ref({ x: 20, y: 20 }) // x: right offset, y: top offset
		const isDragging = ref(false)
		const fadeIn = ref(false)
		const dragOffset = ref({ x: 0, y: 0 })
		const isMoving = ref(false)
		const movementInterval = ref(null)
		const movementDirection = ref({ x: 0, y: 0 })
		const zoomInterval = ref(null)

		// Three.js cube gizmo
		const cubeScene = ref(null)
		const cubeCamera = ref(null)
		const cubeRenderer = ref(null)
		const cubeMesh = ref(null)
		const animationFrameId = ref(null)
		const raycaster = ref(new THREE.Raycaster())
		const mouse = ref(new THREE.Vector2())

		// Configuration
		const config = VIEWER_CONFIG.controller
		const controllerSize = computed(() => props.isMobile ? config.size.mobile : config.size.desktop)
		const cubeSize = computed(() => props.isMobile ? config.cubeSize.mobile : config.cubeSize.desktop)
		const ringRadius = computed(() => controllerSize.value / 2 - 10)

		// Arrow definitions
		const arrows = [
			{ direction: 'up', icon: '▲', label: 'Rotate Up' },
			{ direction: 'down', icon: '▼', label: 'Rotate Down' },
			{ direction: 'up-left', icon: '◤', label: 'Rotate Up-Left' },
			{ direction: 'up-right', icon: '◥', label: 'Rotate Up-Right' },
			{ direction: 'down-left', icon: '◣', label: 'Rotate Down-Left' },
			{ direction: 'down-right', icon: '◢', label: 'Rotate Down-Right' },
		]

		// Face views for cube clicking
		const faceViews = {
			FRONT: { position: new THREE.Vector3(0, 0, 1), label: 'FRONT' },
			BACK: { position: new THREE.Vector3(0, 0, -1), label: 'BACK' },
			LEFT: { position: new THREE.Vector3(-1, 0, 0), label: 'LEFT' },
			RIGHT: { position: new THREE.Vector3(1, 0, 0), label: 'RIGHT' },
			TOP: { position: new THREE.Vector3(0, 1, 0), label: 'TOP' },
			BOTTOM: { position: new THREE.Vector3(0, -1, 0), label: 'BOTTOM' },
		}

		// Computed style for positioning
		const controllerStyle = computed(() => ({
			top: `${position.value.y}px`,
			right: `${position.value.x}px`,
		}))

		/**
		 * Create canvas with text label for cube faces
		 * @param text
		 * @param color
		 */
		const createTextCanvas = (text, color = '#4287f5') => {
			const canvas = document.createElement('canvas')
			const size = VIEWER_CONFIG.texture.cubeTextureSize
			canvas.width = size
			canvas.height = size

			const context = canvas.getContext('2d')

			// Background
			context.fillStyle = color
			context.fillRect(0, 0, size, size)

			// Border
			context.strokeStyle = '#ffffff'
			context.lineWidth = 8
			context.strokeRect(0, 0, size, size)

			// Text
			context.fillStyle = '#ffffff'
			context.font = 'bold 48px Arial'
			context.textAlign = 'center'
			context.textBaseline = 'middle'
			context.fillText(text, size / 2, size / 2)

			return canvas
		}

		/**
		 * Initialize the cube gizmo
		 */
		const initCubeGizmo = () => {
			if (!cubeContainerRef.value) return

			try {
				// Create scene
				cubeScene.value = new THREE.Scene()

				// Create camera
				const size = cubeSize.value
				cubeCamera.value = new THREE.OrthographicCamera(
					-size / 2, size / 2,
					size / 2, -size / 2,
					1, 1000,
				)
				cubeCamera.value.position.set(0, 0, 200)

				// Create renderer
				cubeRenderer.value = new THREE.WebGLRenderer({
					alpha: true,
					antialias: true,
				})
				cubeRenderer.value.setSize(cubeSize.value, cubeSize.value)
				cubeRenderer.value.setClearColor(0x000000, 0)
				cubeContainerRef.value.appendChild(cubeRenderer.value.domElement)

				// Create cube with labeled faces
				const materials = [
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('RIGHT', '#e74c3c')) }),
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('LEFT', '#e67e22')) }),
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('TOP', '#3498db')) }),
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('BOTTOM', '#9b59b6')) }),
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('FRONT', '#2ecc71')) }),
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('BACK', '#f39c12')) }),
				]

				const geometry = new THREE.BoxGeometry(50, 50, 50)
				cubeMesh.value = new THREE.Mesh(geometry, materials)
				cubeScene.value.add(cubeMesh.value)

				// Add edges
				const edges = new THREE.EdgesGeometry(geometry)
				const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }))
				cubeMesh.value.add(line)

				// Setup click interaction
				setupCubeClickHandler()

				// Setup rotation stop handler
				setupRotationStopHandler()

				// Start animation
				animate()

				logger.info('CircularController', 'Cube gizmo initialized')
			} catch (error) {
				logger.error('CircularController', 'Failed to initialize cube gizmo', error)
			}
		}

		/**
		 * Setup click handler for cube face selection
		 */
		const setupRotationStopHandler = () => {
		// No longer needed - drag-to-rotate doesn't require global stop handler
		}
		// Double-click tracking
		const lastClickTime = ref(0)
		const lastClickedFace = ref(null)
		const DOUBLE_CLICK_DELAY = VIEWER_CONFIG.interaction.doubleClickDelay // ms

		// Cube drag rotation state
		const isDraggingCube = ref(false)
		const cubeDragStart = ref({ x: 0, y: 0 })
		const lastCubeDragPos = ref({ x: 0, y: 0 })
		const hasCubeDragStarted = ref(false) // Track if actual drag movement has started

		const setupCubeClickHandler = () => {
			if (!cubeRenderer.value) return

			const canvas = cubeRenderer.value.domElement

			// Handle mousedown - start drag or detect click
			canvas.addEventListener('mousedown', (event) => {
				const rect = canvas.getBoundingClientRect()
				mouse.value.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
				mouse.value.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

				raycaster.value.setFromCamera(mouse.value, cubeCamera.value)
				const intersects = raycaster.value.intersectObject(cubeMesh.value)

				if (intersects.length > 0) {
					const faceIndex = Math.floor(intersects[0].faceIndex / 2)
					const faceNames = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK']
					const faceName = faceNames[faceIndex]

					// Check for double-click
					const currentTime = Date.now()
					const timeSinceLastClick = currentTime - lastClickTime.value

					if (timeSinceLastClick < DOUBLE_CLICK_DELAY && lastClickedFace.value === faceName) {
					// Double-click detected - snap to view
						logger.info('CircularController', 'Cube face double-clicked - snapping to view', { face: faceName })
						emit('snap-to-view', { viewName: faceName })
						lastClickedFace.value = null
						lastClickTime.value = 0
					} else {
						// Prepare for potential drag
						cubeDragStart.value = { x: event.clientX, y: event.clientY }
						lastCubeDragPos.value = { x: event.clientX, y: event.clientY }
						lastClickedFace.value = faceName
						lastClickTime.value = currentTime
						isDraggingCube.value = true
						hasCubeDragStarted.value = false // Reset drag started flag

						logger.info('CircularController', 'Cube drag prepared', { face: faceName })
					}
				}
			})

			// Handle mousemove - rotate based on drag
			const handleCubeDrag = (event) => {
				if (!isDraggingCube.value) return

				// Calculate total distance from drag start
				const totalDeltaX = event.clientX - cubeDragStart.value.x
				const totalDeltaY = event.clientY - cubeDragStart.value.y
				const totalDistance = Math.sqrt(totalDeltaX * totalDeltaX + totalDeltaY * totalDeltaY)

				// Only start emitting rotation events after a minimum movement threshold
				// This prevents tiny accidental movements on click
				const MIN_DRAG_THRESHOLD = VIEWER_CONFIG.interaction.dragThreshold // pixels
				if (!hasCubeDragStarted.value && totalDistance < MIN_DRAG_THRESHOLD) {
					return // Ignore movement until threshold is exceeded
				}

				// Mark that drag has actually started
				if (!hasCubeDragStarted.value) {
					hasCubeDragStarted.value = true
					// Reset last position to current position to avoid large initial delta
					lastCubeDragPos.value = { x: event.clientX, y: event.clientY }
					logger.info('CircularController', 'Cube drag actually started - threshold exceeded')
					return // Skip first frame after threshold
				}

				// Calculate deltas: moving mouse up/down = vertical rotation, left/right = horizontal rotation
				const deltaY = event.clientY - lastCubeDragPos.value.y // Mouse Y movement
				const deltaX = event.clientX - lastCubeDragPos.value.x // Mouse X movement

				// Skip if no actual movement (prevents zero-delta events)
				if (deltaX === 0 && deltaY === 0) return

				// Update last position
				lastCubeDragPos.value = { x: event.clientX, y: event.clientY }

				// Emit rotation with sensitivity adjustment
				// Both directions are now natural - drag direction matches rotation
				const sensitivity = VIEWER_CONFIG.interaction.cubeDragSensitivity
				emit('camera-rotate', {
					deltaX: deltaX * sensitivity, // Horizontal mouse movement → X-axis rotation (natural)
					deltaY: deltaY * sensitivity, // Vertical mouse movement → Y-axis rotation (natural)
				})
			}

			// Handle mouseup - stop drag
			const handleCubeMouseUp = () => {
				if (isDraggingCube.value) {
					logger.info('CircularController', 'Cube drag ended')
					isDraggingCube.value = false
					hasCubeDragStarted.value = false
				}
			}

			// Add event listeners
			document.addEventListener('mousemove', handleCubeDrag)
			document.addEventListener('mouseup', handleCubeMouseUp)

			// Touch support
			canvas.addEventListener('touchstart', (event) => {
				if (event.touches.length !== 1) return

				const touch = event.touches[0]
				const rect = canvas.getBoundingClientRect()
				mouse.value.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1
				mouse.value.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1

				raycaster.value.setFromCamera(mouse.value, cubeCamera.value)
				const intersects = raycaster.value.intersectObject(cubeMesh.value)

				if (intersects.length > 0) {
					const faceIndex = Math.floor(intersects[0].faceIndex / 2)
					const faceNames = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK']
					const faceName = faceNames[faceIndex]

					// Check for double-tap
					const currentTime = Date.now()
					const timeSinceLastClick = currentTime - lastClickTime.value

					if (timeSinceLastClick < DOUBLE_CLICK_DELAY && lastClickedFace.value === faceName) {
					// Double-tap detected - snap to view
						logger.info('CircularController', 'Cube face double-tapped - snapping to view', { face: faceName })
						emit('snap-to-view', { viewName: faceName })
						lastClickedFace.value = null
						lastClickTime.value = 0
					} else {
						// Prepare for potential drag
						cubeDragStart.value = { x: touch.clientX, y: touch.clientY }
						lastCubeDragPos.value = { x: touch.clientX, y: touch.clientY }
						lastClickedFace.value = faceName
						lastClickTime.value = currentTime
						isDraggingCube.value = true
						hasCubeDragStarted.value = false // Reset drag started flag

						logger.info('CircularController', 'Cube touch drag prepared', { face: faceName })
					}
				}
			})

			const handleCubeTouchMove = (event) => {
				if (!isDraggingCube.value || event.touches.length !== 1) return

				const touch = event.touches[0]

				// Calculate total distance from drag start
				const totalDeltaX = touch.clientX - cubeDragStart.value.x
				const totalDeltaY = touch.clientY - cubeDragStart.value.y
				const totalDistance = Math.sqrt(totalDeltaX * totalDeltaX + totalDeltaY * totalDeltaY)

				// Only start emitting rotation events after a minimum movement threshold
				const MIN_DRAG_THRESHOLD = VIEWER_CONFIG.interaction.dragThreshold // pixels
				if (!hasCubeDragStarted.value && totalDistance < MIN_DRAG_THRESHOLD) {
					return // Ignore movement until threshold is exceeded
				}

				// Mark that drag has actually started
				if (!hasCubeDragStarted.value) {
					hasCubeDragStarted.value = true
					// Reset last position to current position to avoid large initial delta
					lastCubeDragPos.value = { x: touch.clientX, y: touch.clientY }
					logger.info('CircularController', 'Cube touch drag actually started - threshold exceeded')
					return // Skip first frame after threshold
				}

				// Calculate deltas: moving touch up/down = vertical rotation, left/right = horizontal rotation
				const deltaY = touch.clientY - lastCubeDragPos.value.y // Touch Y movement
				const deltaX = touch.clientX - lastCubeDragPos.value.x // Touch X movement

				// Skip if no actual movement (prevents zero-delta events)
				if (deltaX === 0 && deltaY === 0) return

				// Update last position
				lastCubeDragPos.value = { x: touch.clientX, y: touch.clientY }

				// Emit rotation with sensitivity adjustment
				// Both directions are now natural - drag direction matches rotation
				const sensitivity = VIEWER_CONFIG.interaction.cubeDragSensitivity
				emit('camera-rotate', {
					deltaX: deltaX * sensitivity, // Horizontal touch movement → X-axis rotation (natural)
					deltaY: deltaY * sensitivity, // Vertical touch movement → Y-axis rotation (natural)
				})
			}

			const handleCubeTouchEnd = () => {
				if (isDraggingCube.value) {
					logger.info('CircularController', 'Cube touch drag ended')
					isDraggingCube.value = false
					hasCubeDragStarted.value = false
				}
			}

			document.addEventListener('touchmove', handleCubeTouchMove, { passive: false })
			document.addEventListener('touchend', handleCubeTouchEnd)

			logger.info('CircularController', 'Cube drag handler setup complete - VERSION 7.0 - NO SNAP')
		}

		/**
		 * Update cube rotation to match main camera
		 */
		const updateCubeOrientation = () => {
			if (!cubeMesh.value || !props.mainCamera) return

			try {
				// Copy inverted rotation from main camera
				const mainCameraQuaternion = props.mainCamera.quaternion.clone()
				mainCameraQuaternion.invert()
				cubeMesh.value.quaternion.copy(mainCameraQuaternion)
			} catch (error) {
				// Silently handle errors
			}
		}

		/**
		 * Animation loop for cube rendering
		 */
		const animate = () => {
			animationFrameId.value = requestAnimationFrame(animate)

			updateCubeOrientation()

			if (cubeRenderer.value && cubeScene.value && cubeCamera.value) {
				cubeRenderer.value.render(cubeScene.value, cubeCamera.value)
			}
		}

		/**
		 * Handle movement ring mouse down - calculate direction and start continuous rotation
		 * @param event
		 */
		const handleMovementStart = (event) => {
		// Prevent default behavior and stop propagation
			event.preventDefault()
			event.stopPropagation()

			// Don't start a new movement if already moving
			if (isMoving.value) return

			if (!controllerRef.value) return

			const rect = controllerRef.value.getBoundingClientRect()
			const centerX = rect.left + rect.width / 2
			const centerY = rect.top + rect.height / 2

			// Calculate direction vector from center to click point
			const deltaX = event.clientX - centerX
			const deltaY = event.clientY - centerY
			const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

			// Normalize direction - accept clicks up to slightly beyond the controller radius
			// But exclude clicks too close to center (where cube is) - minimum 15% of radius
			const maxRadius = (controllerSize.value / 2) * 1.1 // 110% to include edge clicks with margin
			const minRadius = (controllerSize.value / 2) * 0.15
			if (distance > minRadius && distance <= maxRadius) {
				const normalizedX = deltaX / distance
				const normalizedY = deltaY / distance
				const strength = Math.min(distance / (maxRadius * 0.5), 1.0)

				if (isPanningMode.value) {
				// Panning mode - start continuous movement
					movementDirection.value = {
						x: normalizedX * strength * 0.02,
						y: normalizedY * strength * 0.02,
					}

					isMoving.value = true
					startContinuousMovement()
				} else {
				// Rotation mode - emit rotation events
					movementDirection.value = {
						x: normalizedX * strength * 0.02,
						y: normalizedY * strength * 0.02,
					}

					isMoving.value = true
					startContinuousMovement()
				}
			}

			document.addEventListener('mousemove', handleMovementMove)
			document.addEventListener('mouseup', handleMovementEnd)
		}

		/**
		 * Update movement direction while dragging
		 * @param event
		 */
		const handleMovementMove = (event) => {
			if (!isMoving.value || !controllerRef.value) return

			const rect = controllerRef.value.getBoundingClientRect()
			const centerX = rect.left + rect.width / 2
			const centerY = rect.top + rect.height / 2

			const deltaX = event.clientX - centerX
			const deltaY = event.clientY - centerY
			const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

			const maxRadius = controllerSize.value / 2
			if (distance > 0 && distance < maxRadius * 0.9) {
				const normalizedX = deltaX / distance
				const normalizedY = deltaY / distance
				const strength = Math.min(distance / (maxRadius * 0.5), 1.0)

				// Update movement direction for both rotation and panning modes
				movementDirection.value = {
					x: normalizedX * strength * 0.02,
					y: normalizedY * strength * 0.02,
				}
			} else {
				// Stop movement if drag goes outside valid range
				movementDirection.value = { x: 0, y: 0 }
			}
		}

		/**
		 * Stop continuous movement
		 * @param event
		 */
		const handleMovementEnd = (event) => {
			isMoving.value = false
			if (movementInterval.value) {
				clearInterval(movementInterval.value)
				movementInterval.value = null
			}

			document.removeEventListener('mousemove', handleMovementMove)
			document.removeEventListener('mouseup', handleMovementEnd)
		}

		/**
		 * Start continuous camera rotation based on movement direction
		 */
		const startContinuousMovement = () => {
			// Immediately apply first movement
			if (movementDirection.value.x !== 0 || movementDirection.value.y !== 0) {
				if (isPanningMode.value) {
					// Panning mode - direct camera manipulation
					if (props.mainCamera && props.mainControls) {
						try {
							// Get camera's right and up vectors
							const cameraRight = new THREE.Vector3()
							const cameraUp = new THREE.Vector3()

							// Get camera direction (where camera is looking)
							const cameraDirection = new THREE.Vector3()
							props.mainCamera.getWorldDirection(cameraDirection)

							// Calculate right vector (perpendicular to camera direction and up)
							cameraRight.crossVectors(props.mainCamera.up, cameraDirection).normalize()

							// Use camera's up vector
							cameraUp.copy(props.mainCamera.up).normalize()

							// Calculate dynamic pan speed based on camera distance to target
							const panConfig = VIEWER_CONFIG.controller.panSpeed
							const cameraDistance = props.mainCamera.position.distanceTo(props.mainControls.target)
							const dynamicPanSpeed = Math.max(
								panConfig.min,
								Math.min(
									panConfig.max,
									panConfig.base + (cameraDistance * panConfig.cameraDistanceFactor),
								),
							)

							// Calculate pan offset - invert both X and Y for natural panning
							const panOffset = new THREE.Vector3()
							panOffset.add(cameraRight.multiplyScalar(-movementDirection.value.x * dynamicPanSpeed)) // Invert X
							panOffset.add(cameraUp.multiplyScalar(-movementDirection.value.y * dynamicPanSpeed)) // Invert Y

							// Apply pan to camera and target
							props.mainCamera.position.add(panOffset)
							props.mainControls.target.add(panOffset)
							props.mainControls.update()
						} catch (error) {
							logger.error('CircularController', 'Continuous pan error', error)
						}
					}
				} else {
					// Rotation mode
					emit('camera-rotate', {
						deltaX: movementDirection.value.x,
						deltaY: movementDirection.value.y,
					})
				}
			}

			// Continue applying movement while active
			if (movementInterval.value) {
				clearInterval(movementInterval.value)
			}

			movementInterval.value = setInterval(() => {
				// Stop if not moving
				if (!isMoving.value) {
					clearInterval(movementInterval.value)
					movementInterval.value = null
					return
				}

				if (movementDirection.value.x !== 0 || movementDirection.value.y !== 0) {
					if (isPanningMode.value) {
						// Panning mode - direct camera manipulation
						if (props.mainCamera && props.mainControls) {
							try {
								// Get camera's right and up vectors
								const cameraRight = new THREE.Vector3()
								const cameraUp = new THREE.Vector3()

								// Get camera direction (where camera is looking)
								const cameraDirection = new THREE.Vector3()
								props.mainCamera.getWorldDirection(cameraDirection)

								// Calculate right vector (perpendicular to camera direction and up)
								cameraRight.crossVectors(props.mainCamera.up, cameraDirection).normalize()

								// Use camera's up vector
								cameraUp.copy(props.mainCamera.up).normalize()

								// Calculate dynamic pan speed based on camera distance to target
								const panConfig = VIEWER_CONFIG.controller.panSpeed
								const cameraDistance = props.mainCamera.position.distanceTo(props.mainControls.target)
								const dynamicPanSpeed = Math.max(
									panConfig.min,
									Math.min(
										panConfig.max,
										panConfig.base + (cameraDistance * panConfig.cameraDistanceFactor),
									),
								)

								// Calculate pan offset - invert both X and Y for natural panning
								const panOffset = new THREE.Vector3()
								panOffset.add(cameraRight.multiplyScalar(-movementDirection.value.x * dynamicPanSpeed)) // Invert X
								panOffset.add(cameraUp.multiplyScalar(-movementDirection.value.y * dynamicPanSpeed)) // Invert Y

								// Apply pan to camera and target
								props.mainCamera.position.add(panOffset)
								props.mainControls.target.add(panOffset)
								props.mainControls.update()
							} catch (error) {
								logger.error('CircularController', 'Pan error', error)
							}
						}
					} else {
						// Rotation mode
						emit('camera-rotate', {
							deltaX: movementDirection.value.x,
							deltaY: movementDirection.value.y,
						})
					}
				}
			}, 16) // ~60fps
		}

		/**
		 * Handle movement ring touch start
		 * @param event
		 */
		const handleMovementTouchStart = (event) => {
			if (event.touches.length !== 1 || !controllerRef.value) return

			const touch = event.touches[0]
			const rect = controllerRef.value.getBoundingClientRect()
			const centerX = rect.left + rect.width / 2
			const centerY = rect.top + rect.height / 2

			const deltaX = touch.clientX - centerX
			const deltaY = touch.clientY - centerY
			const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

			// Normalize direction - accept clicks up to slightly beyond the controller radius
			// But exclude clicks too close to center (where cube is) - minimum 15% of radius
			const maxRadius = (controllerSize.value / 2) * 1.1 // 110% to include edge clicks with margin
			const minRadius = (controllerSize.value / 2) * 0.15
			if (distance > minRadius && distance <= maxRadius) {
				const normalizedX = deltaX / distance
				const normalizedY = deltaY / distance
				const strength = Math.min(distance / (maxRadius * 0.5), 1.0)

				movementDirection.value = {
					x: normalizedX * strength * 0.02,
					y: normalizedY * strength * 0.02,
				}

				isMoving.value = true
				startContinuousMovement()

				logger.info('CircularController', 'Touch movement started', {
					deltaX,
					deltaY,
					distance,
					maxRadius,
					strength,
					direction: movementDirection.value,
				})
			}

			document.addEventListener('touchmove', handleMovementTouchMove, { passive: false })
			document.addEventListener('touchend', handleMovementTouchEnd)
		}

		/**
		 * Handle movement touch move
		 * @param event
		 */
		const handleMovementTouchMove = (event) => {
			if (!isMoving.value || event.touches.length !== 1 || !controllerRef.value) return

			event.preventDefault()
			const touch = event.touches[0]
			const rect = controllerRef.value.getBoundingClientRect()
			const centerX = rect.left + rect.width / 2
			const centerY = rect.top + rect.height / 2

			const deltaX = touch.clientX - centerX
			const deltaY = touch.clientY - centerY
			const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

			const maxRadius = controllerSize.value / 2
			if (distance > 0 && distance < maxRadius * 0.9) {
				const normalizedX = deltaX / distance
				const normalizedY = deltaY / distance
				const strength = Math.min(distance / (maxRadius * 0.5), 1.0)

				movementDirection.value = {
					x: normalizedX * strength * 0.02,
					y: normalizedY * strength * 0.02,
				}
			}
		}

		/**
		 * Handle movement touch end
		 */
		const handleMovementTouchEnd = () => {
			isMoving.value = false
			if (movementInterval.value) {
				clearInterval(movementInterval.value)
				movementInterval.value = null
			}

			document.removeEventListener('touchmove', handleMovementTouchMove)
			document.removeEventListener('touchend', handleMovementTouchEnd)
		}

		/**
		 * Handle zoom in
		 */
		const handleZoomIn = () => {
			emit('camera-zoom', { delta: 1 })
			logger.info('CircularController', 'Zoom in clicked')
		}

		/**
		 * Handle zoom out
		 */
		const handleZoomOut = () => {
			emit('camera-zoom', { delta: -1 })
			logger.info('CircularController', 'Zoom out clicked')
		}

		/**
		 * Handle continuous zoom in (hold button)
		 * @param event
		 */
		const handleZoomInStart = (event) => {
			// Clear any existing interval first
			if (zoomInterval.value) {
				clearInterval(zoomInterval.value)
				zoomInterval.value = null
			}

			// Immediate zoom
			handleZoomIn()

			// Continue zooming while held
			zoomInterval.value = setInterval(() => {
				handleZoomIn()
			}, 100)

			logger.info('CircularController', 'Continuous zoom in started')
		}

		/**
		 * Handle continuous zoom out (hold button)
		 * @param event
		 */
		const handleZoomOutStart = (event) => {
			// Clear any existing interval first
			if (zoomInterval.value) {
				clearInterval(zoomInterval.value)
				zoomInterval.value = null
			}

			// Immediate zoom
			handleZoomOut()

			// Continue zooming while held
			zoomInterval.value = setInterval(() => {
				handleZoomOut()
			}, 100)

			logger.info('CircularController', 'Continuous zoom out started')
		}

		/**
		 * Stop continuous zoom
		 */
		const handleZoomStop = () => {
			if (zoomInterval.value) {
				clearInterval(zoomInterval.value)
				zoomInterval.value = null
				logger.info('CircularController', 'Continuous zoom stopped')
			}
		}

		// Panning mode state
		const isPanningMode = ref(false)

		/**
		 * Toggle between rotation and panning mode
		 */
		const togglePanningMode = () => {
			isPanningMode.value = !isPanningMode.value
			logger.info('CircularController', 'Mode toggled', { isPanningMode: isPanningMode.value })
		}

		/**
		 * Reset camera panning to original position
		 */
		const resetPanning = () => {
			if (props.mainCamera && props.mainControls) {
				try {
				// Only reset the target (panning) to center, keep camera distance and angle
					const currentCameraPosition = props.mainCamera.position.clone()
					const currentDistance = currentCameraPosition.length()

					// Calculate the direction from camera to current target
					const cameraDirection = new THREE.Vector3()
					cameraDirection.subVectors(props.mainControls.target, currentCameraPosition).normalize()

					// Set new target to be at the same distance from camera, but centered
					const newTarget = new THREE.Vector3(0, 0, 0)
					props.mainControls.target.copy(newTarget)
					props.mainControls.update()

					logger.info('CircularController', 'Camera panning reset to center (preserving zoom and angle)')
				} catch (error) {
					logger.error('CircularController', 'Failed to reset panning', error)
				}
			}
		}

		// Zoom ring interaction state
		const isZoomDragging = ref(false)
		const zoomStartY = ref(0)
		const zoomStartDistance = ref(0)

		/**
		 * Handle zoom ring mouse start
		 * @param event
		 */
		const handleZoomRingStart = (event) => {
			if (!controllerRef.value) return

			const rect = controllerRef.value.getBoundingClientRect()
			const centerY = rect.top + rect.height / 2
			zoomStartY.value = event.clientY
			zoomStartDistance.value = Math.abs(event.clientY - centerY)
			isZoomDragging.value = true

			// Add event listeners for mouse move and up
			document.addEventListener('mousemove', handleZoomRingMove)
			document.addEventListener('mouseup', handleZoomRingEnd)

			logger.info('CircularController', 'Zoom ring interaction started')
		}

		/**
		 * Handle zoom ring mouse move
		 * @param event
		 */
		const handleZoomRingMove = (event) => {
			if (!isZoomDragging.value || !controllerRef.value) return

			const rect = controllerRef.value.getBoundingClientRect()
			const centerY = rect.top + rect.height / 2
			const currentY = event.clientY
			const deltaY = currentY - zoomStartY.value

			// Determine zoom direction based on vertical movement
			if (Math.abs(deltaY) > 10) { // Minimum movement threshold
				const zoomDelta = deltaY > 0 ? -1 : 1 // Down = zoom out, Up = zoom in
				emit('camera-zoom', { delta: zoomDelta * 0.5 }) // Slower zoom for ring
				zoomStartY.value = currentY // Reset start position for continuous zoom
			}
		}

		/**
		 * Handle zoom ring mouse end
		 */
		const handleZoomRingEnd = () => {
			if (isZoomDragging.value) {
				isZoomDragging.value = false
				document.removeEventListener('mousemove', handleZoomRingMove)
				document.removeEventListener('mouseup', handleZoomRingEnd)
				logger.info('CircularController', 'Zoom ring interaction ended')
			}
		}

		/**
		 * Handle zoom ring touch start
		 * @param event
		 */
		const handleZoomRingTouchStart = (event) => {
			if (!controllerRef.value || event.touches.length !== 1) return

			const rect = controllerRef.value.getBoundingClientRect()
			const centerY = rect.top + rect.height / 2
			zoomStartY.value = event.touches[0].clientY
			zoomStartDistance.value = Math.abs(event.touches[0].clientY - centerY)
			isZoomDragging.value = true

			logger.info('CircularController', 'Zoom ring touch started')
		}

		/**
		 * Handle zoom ring touch move
		 * @param event
		 */
		const handleZoomRingTouchMove = (event) => {
			if (!isZoomDragging.value || !controllerRef.value || event.touches.length !== 1) return

			const rect = controllerRef.value.getBoundingClientRect()
			const centerY = rect.top + rect.height / 2
			const currentY = event.touches[0].clientY
			const deltaY = currentY - zoomStartY.value

			// Determine zoom direction based on vertical movement
			if (Math.abs(deltaY) > 10) { // Minimum movement threshold
				const zoomDelta = deltaY > 0 ? -1 : 1 // Down = zoom out, Up = zoom in
				emit('camera-zoom', { delta: zoomDelta * 0.5 }) // Slower zoom for ring
				zoomStartY.value = currentY // Reset start position for continuous zoom
			}
		}

		/**
		 * Handle controller drag start
		 * @param event
		 */
		const handleDragStart = (event) => {
			isDragging.value = true
			const rect = controllerRef.value.getBoundingClientRect()
			dragOffset.value = {
				x: event.clientX - rect.right + window.scrollX,
				y: event.clientY - rect.top + window.scrollY,
			}

			document.addEventListener('mousemove', handleDragMove)
			document.addEventListener('mouseup', handleDragEnd)
		}

		/**
		 * Handle controller drag move
		 * @param event
		 */
		const handleDragMove = (event) => {
			if (!isDragging.value) return

			const newX = Math.max(0, Math.min(
				window.innerWidth - controllerSize.value,
				window.innerWidth - event.clientX + dragOffset.value.x,
			))
			const newY = Math.max(0, Math.min(
				window.innerHeight - controllerSize.value,
				event.clientY - dragOffset.value.y,
			))

			position.value = { x: newX, y: newY }
		}

		/**
		 * Handle controller drag end
		 */
		const handleDragEnd = () => {
			isDragging.value = false
			document.removeEventListener('mousemove', handleDragMove)
			document.removeEventListener('mouseup', handleDragEnd)

			// Save position
			savePosition()
			emit('position-changed', position.value)
		}

		/**
		 * Handle controller touch drag start
		 * @param event
		 */
		const handleDragTouchStart = (event) => {
			if (event.touches.length !== 1) return

			const touch = event.touches[0]
			isDragging.value = true
			const rect = controllerRef.value.getBoundingClientRect()
			dragOffset.value = {
				x: touch.clientX - rect.right + window.scrollX,
				y: touch.clientY - rect.top + window.scrollY,
			}

			document.addEventListener('touchmove', handleDragTouchMove, { passive: false })
			document.addEventListener('touchend', handleDragTouchEnd)
		}

		/**
		 * Handle controller touch drag move
		 * @param event
		 */
		const handleDragTouchMove = (event) => {
			if (!isDragging.value || event.touches.length !== 1) return

			event.preventDefault()
			const touch = event.touches[0]

			const newX = Math.max(0, Math.min(
				window.innerWidth - controllerSize.value,
				window.innerWidth - touch.clientX + dragOffset.value.x,
			))
			const newY = Math.max(0, Math.min(
				window.innerHeight - controllerSize.value,
				touch.clientY - dragOffset.value.y,
			))

			position.value = { x: newX, y: newY }
		}

		/**
		 * Handle controller touch drag end
		 */
		const handleDragTouchEnd = () => {
			isDragging.value = false
			document.removeEventListener('touchmove', handleDragTouchMove)
			document.removeEventListener('touchend', handleDragTouchEnd)

			// Save position
			savePosition()
			emit('position-changed', position.value)
		}

		/**
		 * Load controller position from localStorage
		 */
		const loadPosition = () => {
			if (!config.persistPosition) return

			try {
				const saved = localStorage.getItem('threedviewer:controller-position')
				if (saved) {
					const pos = JSON.parse(saved)
					if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
						position.value = pos
						logger.info('CircularController', 'Position loaded', pos)
					}
				}
			} catch (error) {
				logger.warn('CircularController', 'Failed to load position', error)
			}
		}

		/**
		 * Save controller position to localStorage
		 */
		const savePosition = () => {
			if (!config.persistPosition) return

			try {
				localStorage.setItem('threedviewer:controller-position', JSON.stringify(position.value))
				logger.info('CircularController', 'Position saved', position.value)
			} catch (error) {
				logger.warn('CircularController', 'Failed to save position', error)
			}
		}

		/**
		 * Cleanup resources
		 */
		const dispose = () => {
			if (animationFrameId.value) {
				cancelAnimationFrame(animationFrameId.value)
				animationFrameId.value = null
			}

			if (zoomInterval.value) {
				clearInterval(zoomInterval.value)
				zoomInterval.value = null
			}

			if (rotationInterval.value) {
				clearInterval(rotationInterval.value)
				rotationInterval.value = null
			}

			if (movementInterval.value) {
				clearInterval(movementInterval.value)
				movementInterval.value = null
			}

			if (cubeRenderer.value) {
				cubeRenderer.value.dispose()
				cubeRenderer.value = null
			}

			if (cubeMesh.value) {
				if (cubeMesh.value.geometry) {
					cubeMesh.value.geometry.dispose()
				}
				if (Array.isArray(cubeMesh.value.material)) {
					cubeMesh.value.material.forEach(mat => {
						if (mat.map) mat.map.dispose()
						mat.dispose()
					})
				}
				cubeMesh.value = null
			}

			cubeScene.value = null
			cubeCamera.value = null

			// Remove event listeners
			document.removeEventListener('mousemove', handleMovementMove)
			document.removeEventListener('mouseup', handleMovementEnd)
			document.removeEventListener('touchmove', handleMovementTouchMove)
			document.removeEventListener('touchend', handleMovementTouchEnd)
			document.removeEventListener('mousemove', handleDragMove)
			document.removeEventListener('mouseup', handleDragEnd)
			document.removeEventListener('touchmove', handleDragTouchMove)
			document.removeEventListener('touchend', handleDragTouchEnd)

			logger.info('CircularController', 'Controller disposed')
		}

		// Lifecycle
		onMounted(() => {
			loadPosition()
			initCubeGizmo()
			// Add fade-in animation
			setTimeout(() => {
				fadeIn.value = true
			}, 100)
		})

		onBeforeUnmount(() => {
			dispose()
		})

		// Watch for camera changes
		watch(() => props.mainCamera, () => {
			updateCubeOrientation()
		}, { deep: true })

		return {
			controllerRef,
			cubeContainerRef,
			controllerStyle,
			isDragging,
			fadeIn,
			arrows,
			ringRadius,
			isPanningMode,
			togglePanningMode,
			resetPanning,
			handleMovementStart,
			handleMovementTouchStart,
			handleZoomIn,
			handleZoomOut,
			handleZoomInStart,
			handleZoomOutStart,
			handleZoomStop,
			handleZoomRingStart,
			handleZoomRingMove,
			handleZoomRingEnd,
			handleZoomRingTouchStart,
			handleZoomRingTouchMove,
			handleDragStart,
			handleDragTouchStart,
		}
	},
}
</script>

<style scoped src="../css/components/circular-controller.css"></style>
