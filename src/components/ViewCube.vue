<template>
	<div ref="containerRef" class="view-cube-container" :class="{ 'mobile': isMobile }">
		<!-- Canvas will be inserted here -->
	</div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { logger } from '../utils/logger.js'

export default {
	name: 'ViewCube',
	props: {
		mainCamera: {
			type: Object,
			required: true,
		},
		isMobile: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['face-click'],
	setup(props, { emit }) {
		const containerRef = ref(null)
		const cubeScene = ref(null)
		const cubeCamera = ref(null)
		const cubeRenderer = ref(null)
		const cubeMesh = ref(null)
		const animationFrameId = ref(null)
		const raycaster = ref(new THREE.Raycaster())
		const mouse = ref(new THREE.Vector2())

		// Face labels and their corresponding view positions
		const faceViews = {
			FRONT: { position: new THREE.Vector3(0, 0, 1), label: 'FRONT' },
			BACK: { position: new THREE.Vector3(0, 0, -1), label: 'BACK' },
			LEFT: { position: new THREE.Vector3(-1, 0, 0), label: 'LEFT' },
			RIGHT: { position: new THREE.Vector3(1, 0, 0), label: 'RIGHT' },
			TOP: { position: new THREE.Vector3(0, 1, 0), label: 'TOP' },
			BOTTOM: { position: new THREE.Vector3(0, -1, 0), label: 'BOTTOM' },
		}

		/**
		 * Create a canvas with text label
		 * @param {string} text - Label text
		 * @param {string} color - Background color
		 * @return {HTMLCanvasElement} Canvas with text
		 */
		const createTextCanvas = (text, color = '#4287f5') => {
			const canvas = document.createElement('canvas')
			const size = 256
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
		 * Initialize the view cube
		 */
		const initViewCube = () => {
			if (!containerRef.value) return

			try {
				// Create scene
				cubeScene.value = new THREE.Scene()

				// Create camera
				const size = props.isMobile ? 80 : 120
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
				const rendererSize = props.isMobile ? 80 : 120
				cubeRenderer.value.setSize(rendererSize, rendererSize)
				cubeRenderer.value.setClearColor(0x000000, 0)
				containerRef.value.appendChild(cubeRenderer.value.domElement)

				// Create cube with labeled faces
				const materials = [
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('RIGHT', '#e74c3c')) }), // Right - Red
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('LEFT', '#e67e22')) }), // Left - Orange
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('TOP', '#3498db')) }), // Top - Blue
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('BOTTOM', '#9b59b6')) }), // Bottom - Purple
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('FRONT', '#2ecc71')) }), // Front - Green
					new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(createTextCanvas('BACK', '#f39c12')) }), // Back - Yellow
				]

				const geometry = new THREE.BoxGeometry(80, 80, 80)
				cubeMesh.value = new THREE.Mesh(geometry, materials)
				cubeScene.value.add(cubeMesh.value)

				// Add ambient light
				const ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
				cubeScene.value.add(ambientLight)

				// Add edges to make cube structure clearer
				const edges = new THREE.EdgesGeometry(geometry)
				const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }))
				cubeMesh.value.add(line)

				// Setup click interaction
				setupClickHandler()

				// Start animation
				animate()

				logger.info('ViewCube', 'View cube initialized')
			} catch (error) {
				logger.error('ViewCube', 'Failed to initialize view cube', error)
			}
		}

		/**
		 * Setup click handler for face selection
		 */
		const setupClickHandler = () => {
			if (!cubeRenderer.value) return

			const canvas = cubeRenderer.value.domElement

			canvas.addEventListener('click', (event) => {
				// Calculate mouse position in normalized device coordinates
				const rect = canvas.getBoundingClientRect()
				mouse.value.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
				mouse.value.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

				// Update raycaster
				raycaster.value.setFromCamera(mouse.value, cubeCamera.value)

				// Check for intersections
				const intersects = raycaster.value.intersectObject(cubeMesh.value)

				if (intersects.length > 0) {
					const faceIndex = Math.floor(intersects[0].faceIndex / 2)
					const faceNames = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK']
					const faceName = faceNames[faceIndex]

					logger.info('ViewCube', 'Face clicked', { face: faceName })
					emit('face-click', faceViews[faceName])
				}
			})

			// Add hover effect
			canvas.style.cursor = 'pointer'
		}

		/**
		 * Update cube rotation to match main camera
		 */
		const updateCubeRotation = () => {
			if (!cubeMesh.value || !props.mainCamera) return

			try {
				// Copy the rotation from the main camera's inverse
				// This makes the cube rotate opposite to the camera, creating the effect
				// that the cube shows the same orientation as the scene
				const mainCameraQuaternion = props.mainCamera.quaternion.clone()
				mainCameraQuaternion.invert()
				cubeMesh.value.quaternion.copy(mainCameraQuaternion)
			} catch (error) {
				// Silently handle errors during rotation update
			}
		}

		/**
		 * Animation loop
		 */
		const animate = () => {
			animationFrameId.value = requestAnimationFrame(animate)

			// Update cube rotation to match main camera
			updateCubeRotation()

			// Render
			if (cubeRenderer.value && cubeScene.value && cubeCamera.value) {
				cubeRenderer.value.render(cubeScene.value, cubeCamera.value)
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

			logger.info('ViewCube', 'View cube disposed')
		}

		// Lifecycle
		onMounted(() => {
			initViewCube()
		})

		onBeforeUnmount(() => {
			dispose()
		})

		// Watch for camera changes
		watch(() => props.mainCamera, () => {
			updateCubeRotation()
		}, { deep: true })

		return {
			containerRef,
		}
	},
}
</script>

<style scoped>
.view-cube-container {
	position: absolute;
	bottom: 20px;
	right: 20px;
	width: 120px;
	height: 120px;
	z-index: 100;
	pointer-events: auto;
	background: rgba(0, 0, 0, 0.3);
	border-radius: 8px;
	border: 2px solid rgba(255, 255, 255, 0.2);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	backdrop-filter: blur(10px);
	display: flex;
	align-items: center;
	justify-content: center;
}

.view-cube-container.mobile {
	width: 80px;
	height: 80px;
	bottom: 80px;
	right: 10px;
}

.view-cube-container canvas {
	border-radius: 6px;
}

/* Hover effect */
.view-cube-container:hover {
	background: rgba(0, 0, 0, 0.4);
	border-color: rgba(255, 255, 255, 0.4);
	transform: scale(1.05);
	transition: all 0.2s ease;
}

/* Responsive adjustments */
@media (max-width: 768px) {
	.view-cube-container {
		width: 80px;
		height: 80px;
		bottom: 80px;
		right: 10px;
	}
}

/* RTL support */
[dir="rtl"] .view-cube-container {
	right: auto;
	left: 20px;
}

[dir="rtl"] .view-cube-container.mobile {
	right: auto;
	left: 10px;
}
</style>
