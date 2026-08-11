<template>
	<div
		ref="controllerRef"
		class="circular-controller"
		:class="{ 'mobile': isMobile, 'dragging': isDragging, 'hidden': !visible, 'fade-in': fadeIn, 'idle': isIdle && visible }"
		:style="controllerStyle"
		role="region"
		:aria-label="t('threedviewer', '3D navigation controller')"
		@pointerenter="wakeFromIdle"
		@pointermove="wakeFromIdle">
		<div class="console-row">
			<!-- Steering annulus with the cube compass in its hole -->
			<div class="gizmo" :style="gizmoStyle">
				<div
					ref="ringRef"
					class="steer-ring"
					:class="{ 'panning-mode': isPanningMode }"
					tabindex="0"
					role="application"
					:aria-label="isPanningMode
						? t('threedviewer', 'Pan the view. Drag the ring, or use the arrow keys.')
						: t('threedviewer', 'Orbit the view. Drag the ring, or use the arrow keys.')"
					@mousedown="handleMovementStart"
					@touchstart.prevent="handleMovementTouchStart"
					@keydown="handleRingKeydown"
					@keyup="handleRingKeyup"
					@blur="handleRingKeyup">
					<!-- Live wedge: direction from the angle, opacity from the strength -->
					<div class="steer-wedge" :style="wedgeStyle" aria-hidden="true" />
					<!-- Four cardinal notches replace the twelve decorative ticks -->
					<div class="notch notch-n" aria-hidden="true" />
					<div class="notch notch-s" aria-hidden="true" />
					<div class="notch notch-w" aria-hidden="true" />
					<div class="notch notch-e" aria-hidden="true" />
					<div class="steer-dot" :style="dotStyle" aria-hidden="true" />
					<div class="ring-hole" aria-hidden="true" />
				</div>

				<!-- Central cube gizmo (Three.js canvas is inserted here) -->
				<div
					ref="cubeContainerRef"
					class="cube-container"
					:style="cubeStyle"
					:aria-label="t('threedviewer', 'Orientation cube. Drag to orbit, double-click a face to snap to that view.')"
					:title="t('threedviewer', 'Drag to orbit · double-click a face to snap')" />
			</div>

			<!-- Attached button rail -->
			<div class="rail">
				<div
					class="rail-btn drag-handle rail-wide"
					role="button"
					tabindex="0"
					:aria-label="t('threedviewer', 'Move controller')"
					:title="t('threedviewer', 'Drag to reposition controller')"
					@mousedown.stop="handleDragStart"
					@touchstart.stop.prevent="handleDragTouchStart">
					<span class="grip" aria-hidden="true">
						<i /><i /><i /><i /><i /><i />
					</span>
				</div>

				<div class="rail-divider" aria-hidden="true" />

				<button
					class="rail-btn"
					:class="{ active: !isPanningMode }"
					:aria-pressed="String(!isPanningMode)"
					:aria-label="t('threedviewer', 'Rotate mode')"
					:title="t('threedviewer', 'Rotate mode')"
					@click.stop="setRotateMode">
					<ViewerIcon name="rotateMode" :size="18" />
				</button>
				<button
					class="rail-btn"
					:class="{ active: isPanningMode }"
					:aria-pressed="String(isPanningMode)"
					:aria-label="t('threedviewer', 'Pan mode')"
					:title="t('threedviewer', 'Pan mode')"
					@click.stop="setPanMode">
					<ViewerIcon name="panMode" :size="18" />
				</button>

				<div class="rail-divider" aria-hidden="true" />

				<button
					class="rail-btn"
					:aria-label="t('threedviewer', 'Zoom in')"
					:title="t('threedviewer', 'Zoom in — hold to repeat')"
					@click.stop="handleZoomIn"
					@mousedown.stop="handleZoomInStart"
					@mouseup.stop="handleZoomStop"
					@mouseleave.stop="handleZoomStop"
					@touchstart.stop="handleZoomInStart"
					@touchend.stop="handleZoomStop">
					+
				</button>
				<button
					class="rail-btn"
					:aria-label="t('threedviewer', 'Zoom out')"
					:title="t('threedviewer', 'Zoom out — hold to repeat')"
					@click.stop="handleZoomOut"
					@mousedown.stop="handleZoomOutStart"
					@mouseup.stop="handleZoomStop"
					@mouseleave.stop="handleZoomStop"
					@touchstart.stop="handleZoomOutStart"
					@touchend.stop="handleZoomStop">
					−
				</button>

				<!-- Disabled rather than hidden outside pan mode, so nothing below it shifts -->
				<button
					class="rail-btn rail-wide"
					:disabled="!isPanningMode"
					:aria-label="t('threedviewer', 'Recentre view')"
					:title="t('threedviewer', 'Recentre — keeps your zoom and angle')"
					@click.stop="resetPanning">
					<ViewerIcon name="recenter" :size="18" />
				</button>
			</div>
		</div>

		<!-- Live readout: what the ring is actually sending -->
		<div class="readout" aria-live="off">
			{{ readout }}
		</div>
	</div>
</template>

<script>
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import ViewerIcon from './ViewerIcon.vue'
import * as THREE from 'three'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { logger } from '../utils/logger.js'
import { clampToContainer, clampWithinContainer } from '../utils/controllerPosition.js'
import { dotOffset, readoutValues, steerFromPointer, wedgeFromAngle } from '../utils/controllerSteering.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'

export default {
	name: 'CircularController',

	components: {
		ViewerIcon,
	},
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
		persistPosition: {
			type: Boolean,
			default: true,
		},
	},
	emits: ['camera-rotate', 'camera-zoom', 'snap-to-view', 'position-changed', 'nudge-camera', 'cameraPan', 'testPan'],
	setup(props, { emit }) {
		// Refs
		const controllerRef = ref(null)

		/**
		 * Bounds of the element the controller is positioned against.
		 *
		 * `.three-viewer` is the offset parent, so this is the 3D scene's own box —
		 * never the window, which is what used to let the controller sit under the
		 * app navigation.
		 *
		 * @return {DOMRect|null} the offset parent's rect, or null before mount
		 */
		const containerRect = () => controllerRef.value?.offsetParent?.getBoundingClientRect() ?? null
		const cubeContainerRef = ref(null)
		const ringRef = ref(null)

		// Live steering state, shared by the wedge, the dot and the readout so all three
		// describe the same vector.
		const steerAngle = ref(0)
		const steerStrength = ref(0)
		const steerLive = ref(false)
		const isPanningMode = ref(false)
		const isIdle = ref(false)
		const idleTimer = ref(null)

		// State
		const position = ref({ x: 20, y: 80 }) // x: left offset, y: top offset
		const isDragging = ref(false)
		const fadeIn = ref(false)
		const dragOffset = ref({ x: 0, y: 0 })
		const isMoving = ref(false)
		const movementInterval = ref(null)
		const movementDirection = ref({ x: 0, y: 0 })
		const zoomInterval = ref(null)
		const rotationInterval = ref(null)

		// Three.js cube gizmo (shallowRef to avoid Vue 3 proxy wrapping Three.js objects)
		const cubeScene = shallowRef(null)
		const cubeCamera = shallowRef(null)
		const cubeRenderer = shallowRef(null)
		const cubeMesh = shallowRef(null)
		const animationFrameId = ref(null)
		const raycaster = shallowRef(new THREE.Raycaster())
		const mouse = shallowRef(new THREE.Vector2())

		// Configuration
		const config = VIEWER_CONFIG.controller
		/** Room under the console for the live readout line. */
		const READOUT_HEIGHT = 22
		/** How long the controller sits untouched before it fades back. */
		const IDLE_AFTER_MS = 2500
		/** Strength applied by a held arrow key, matching a mid-ring drag. */
		const KEY_STRENGTH = 0.6
		const controllerSize = computed(() => props.isMobile ? config.size.mobile : config.size.desktop)
		const cubeSize = computed(() => props.isMobile ? config.cubeSize.mobile : config.cubeSize.desktop)
		const railWidth = computed(() => props.isMobile ? config.railWidth.mobile : config.railWidth.desktop)
		// The console is a ring plus an attached rail, so it is no longer square — the
		// drag clamp needs both dimensions to keep it inside the scene.
		const footprint = computed(() => ({
			width: controllerSize.value + railWidth.value,
			height: controllerSize.value + READOUT_HEIGHT,
		}))

		// Computed style for positioning
		const controllerStyle = computed(() => ({
			top: `${position.value.y}px`,
			left: `${position.value.x}px`,
		}))

		const gizmoStyle = computed(() => ({
			width: `${controllerSize.value}px`,
			height: `${controllerSize.value}px`,
		}))

		const cubeStyle = computed(() => ({
			width: `${cubeSize.value}px`,
			height: `${cubeSize.value}px`,
		}))

		/**
		 * The wedge painted under the pointer: a narrow accent arc centred on the
		 * steering angle, masked into the annulus. Its opacity carries the strength, so
		 * distance-scaled speed becomes something you can see rather than folklore.
		 */
		const wedgeStyle = computed(() => {
			// The mask leaves the ring's hole clear so the cube stays readable.
			const mask = 'radial-gradient(circle, transparent 46%, #000 58%, #000 96%, transparent 99%)'
			const accent = 'var(--tdv-color-primary)'
			const spread = 52
			const from = wedgeFromAngle({ angle: steerAngle.value, spread })

			return {
				opacity: steerStrength.value > 0.001 ? (steerLive.value ? 1 : 0.45) : 0,
				background: `conic-gradient(from ${from}deg, transparent 0deg, ${accent} ${spread / 2}deg, transparent ${spread}deg)`,
				maskImage: mask,
				WebkitMaskImage: mask,
			}
		})

		/** Dot tracking the pointer, so the ring shows where the vector points. */
		const dotStyle = computed(() => {
			const { x, y, scale } = dotOffset({
				angle: steerAngle.value,
				strength: steerStrength.value,
				diameter: controllerSize.value,
			})

			return {
				opacity: steerStrength.value > 0.001 ? 1 : 0,
				transform: `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(2)})`,
			}
		})

		const readout = computed(() => {
			const mode = isPanningMode.value
				? t('threedviewer', 'pan')
				: t('threedviewer', 'orbit')
			const { degrees, strengthPercent, steering } = readoutValues({
				angle: steerAngle.value,
				strength: steerStrength.value,
			})

			if (!steering) {
				return mode + '  ·  ' + t('threedviewer', 'drag the ring to steer')
			}

			return `${mode}  ·  ${degrees}°  ·  ` + t('threedviewer', 'strength {percent}%', { percent: strengthPercent })
		})

		/**
		 * Record the vector the ring is currently sending.
		 *
		 * @param {number} angle - degrees clockwise from up
		 * @param {number} strength - 0-1
		 * @param {boolean} live - whether the pointer is still down
		 */
		const setSteer = (angle, strength, live) => {
			steerAngle.value = angle
			steerStrength.value = strength
			steerLive.value = live
		}

		const clearSteer = () => setSteer(steerAngle.value, 0, false)

		/** Any interaction pulls the controller back to full opacity and restarts the clock. */
		const wakeFromIdle = () => {
			isIdle.value = false
			if (idleTimer.value) {
				clearTimeout(idleTimer.value)
			}
			idleTimer.value = setTimeout(() => {
				isIdle.value = true
			}, IDLE_AFTER_MS)
		}

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
		/**
		 * Convert a steering vector into the movement the camera loop consumes.
		 *
		 * The loop already knows how to turn a direction into orbit or pan, so this only
		 * has to translate angle+strength back into the x/y it expects, and start the
		 * loop if it is not already running.
		 *
		 * @param {number} angle - degrees clockwise from up
		 * @param {number} strength - 0-1
		 */
		const applySteer = (angle, strength) => {
			const radians = ((angle - 90) * Math.PI) / 180
			movementDirection.value = {
				x: Math.cos(radians) * strength * 0.02,
				y: Math.sin(radians) * strength * 0.02,
			}

			if (!isMoving.value) {
				isMoving.value = true
				startContinuousMovement()
			}
		}

		/** Rotate mode and pan mode are now separate buttons, not one toggle. */
		const setRotateMode = () => {
			isPanningMode.value = false
			wakeFromIdle()
		}

		const setPanMode = () => {
			isPanningMode.value = true
			wakeFromIdle()
		}

		/**
		 * Arrow keys steer a focused ring.
		 *
		 * The eight arrow glyphs in the old design were aria-hidden decoration, so the
		 * ring had no keyboard path at all. These map each arrow onto the same vector a
		 * drag in that direction would produce.
		 *
		 * @param {KeyboardEvent} event - keydown on the ring
		 */
		const handleRingKeydown = (event) => {
			const bearings = {
				ArrowUp: 0,
				ArrowRight: 90,
				ArrowDown: 180,
				ArrowLeft: 270,
			}
			const angle = bearings[event.key]
			if (angle === undefined) return

			event.preventDefault()
			wakeFromIdle()
			setSteer(angle, KEY_STRENGTH, true)
			applySteer(angle, KEY_STRENGTH)
		}

		/** Releasing the key — or losing focus mid-press — stops the camera. */
		const handleRingKeyup = () => {
			if (!isMoving.value) return
			handleMovementEnd()
		}

		const handleMovementStart = (event) => {
		// Prevent default behavior and stop propagation
			event.preventDefault()
			event.stopPropagation()

			// Don't start a new movement if already moving
			if (isMoving.value) return

			if (!ringRef.value) return

			// Deliberately not focusing here: a programmatic focus paints the keyboard
			// focus ring on every mouse drag. The ring is still reachable with Tab.
			wakeFromIdle()

			const { angle, strength, inRange } = steerFromPointer({
				pointerX: event.clientX,
				pointerY: event.clientY,
				rect: ringRef.value.getBoundingClientRect(),
			})

			// Outside the ring, or inside the dead zone where the cube lives.
			if (!inRange || strength <= 0) return

			setSteer(angle, strength, true)
			applySteer(angle, strength)

			document.addEventListener('mousemove', handleMovementMove)
			document.addEventListener('mouseup', handleMovementEnd)
		}

		/**
		 * Update movement direction while dragging
		 * @param event
		 */
		const handleMovementMove = (event) => {
			if (!isMoving.value || !ringRef.value) return

			const { angle, strength, inRange } = steerFromPointer({
				pointerX: event.clientX,
				pointerY: event.clientY,
				rect: ringRef.value.getBoundingClientRect(),
			})

			if (!inRange) {
				// Dragged away from the ring: stop steering but keep the loop alive so
				// coming back does not need a fresh press.
				movementDirection.value = { x: 0, y: 0 }
				clearSteer()
				return
			}

			setSteer(angle, strength, true)
			applySteer(angle, strength)
		}

		/**
		 * Stop continuous movement
		 * @param event
		 */
		const handleMovementEnd = () => {
			isMoving.value = false
			movementDirection.value = { x: 0, y: 0 }
			clearSteer()
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
			if (event.touches.length !== 1 || !ringRef.value) return
			const touch = event.touches[0]

			wakeFromIdle()
			const { angle, strength, inRange } = steerFromPointer({
				pointerX: touch.clientX,
				pointerY: touch.clientY,
				rect: ringRef.value.getBoundingClientRect(),
			})
			if (!inRange || strength <= 0) return

			setSteer(angle, strength, true)
			applySteer(angle, strength)

			document.addEventListener('touchmove', handleMovementTouchMove, { passive: false })
			document.addEventListener('touchend', handleMovementTouchEnd)
		}

		/**
		 * Handle movement touch move
		 * @param event
		 */
		const handleMovementTouchMove = (event) => {
			if (!isMoving.value || event.touches.length !== 1 || !ringRef.value) return
			event.preventDefault()
			const touch = event.touches[0]

			const { angle, strength, inRange } = steerFromPointer({
				pointerX: touch.clientX,
				pointerY: touch.clientY,
				rect: ringRef.value.getBoundingClientRect(),
			})

			if (!inRange) {
				movementDirection.value = { x: 0, y: 0 }
				clearSteer()
				return
			}

			setSteer(angle, strength, true)
			applySteer(angle, strength)
		}

		/**
		 * Handle movement touch end
		 */
		const handleMovementTouchEnd = () => {
			isMoving.value = false
			movementDirection.value = { x: 0, y: 0 }
			clearSteer()
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

		/**
		 * Toggle between rotation and panning mode
		 */

		/**
		 * Reset camera panning to original position
		 */
		const resetPanning = () => {
			if (props.mainCamera && props.mainControls) {
				try {
				// Only reset the target (panning) to center, keep camera distance and angle
					const currentCameraPosition = props.mainCamera.position.clone()

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

		/**
		 * Handle zoom ring mouse start
		 * @param event
		 */

		/**
		 * Handle zoom ring mouse move
		 * @param event
		 */

		/**
		 * Handle zoom ring mouse end
		 */

		/**
		 * Handle zoom ring touch start
		 * @param event
		 */

		/**
		 * Handle zoom ring touch move
		 * @param event
		 */

		/**
		 * Handle controller drag start
		 * @param event
		 */
		const handleDragStart = (event) => {
			isDragging.value = true
			const rect = controllerRef.value.getBoundingClientRect()
			dragOffset.value = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
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

			position.value = clampToContainer({
				pointerX: event.clientX,
				pointerY: event.clientY,
				offsetX: dragOffset.value.x,
				offsetY: dragOffset.value.y,
				container: containerRect(),
				size: footprint.value,
			})
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
				x: touch.clientX - rect.left,
				y: touch.clientY - rect.top,
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

			position.value = clampToContainer({
				pointerX: touch.clientX,
				pointerY: touch.clientY,
				offsetX: dragOffset.value.x,
				offsetY: dragOffset.value.y,
				container: containerRect(),
				size: footprint.value,
			})
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
			if (!props.persistPosition) return

			try {
				const saved = localStorage.getItem('threedviewer:controller-position')
				if (saved) {
					const pos = JSON.parse(saved)
					if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
						// Older builds stored viewport offsets, and any saved position can
						// outlive the window it was saved at, so a stored value may land
						// outside the viewer entirely.
						position.value = clampWithinContainer({
							x: pos.x,
							y: pos.y,
							container: containerRect(),
							size: footprint.value,
						})
						logger.info('CircularController', 'Position loaded', position.value)
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
			if (!props.persistPosition) return

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

			if (idleTimer.value) {
				clearTimeout(idleTimer.value)
				idleTimer.value = null
			}

			logger.info('CircularController', 'Controller disposed')
		}

		// Lifecycle
		onMounted(() => {
			loadPosition()
			initCubeGizmo()
			wakeFromIdle()
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
			t,
			controllerRef,
			cubeContainerRef,
			ringRef,
			controllerStyle,
			gizmoStyle,
			cubeStyle,
			wedgeStyle,
			dotStyle,
			readout,
			isDragging,
			fadeIn,
			isIdle,
			wakeFromIdle,
			isPanningMode,
			setRotateMode,
			setPanMode,
			resetPanning,
			handleMovementStart,
			handleMovementTouchStart,
			handleRingKeydown,
			handleRingKeyup,
			handleZoomIn,
			handleZoomOut,
			handleZoomInStart,
			handleZoomOutStart,
			handleZoomStop,
			handleDragStart,
			handleDragTouchStart,
		}
	},
}
</script>

<style scoped src="../css/components/circular-controller.css"></style>
