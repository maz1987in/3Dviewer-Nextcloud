/**
 * Face Labels composable
 * Handles labeling of visible faces (TOP, BOTTOM, FRONT, BACK, LEFT, RIGHT)
 */

import { ref, computed } from 'vue'
import * as THREE from 'three'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { logger } from '../utils/logger.js'

export function useFaceLabels() {
	// State
	const labelsEnabled = ref(false)
	const labelRenderer = ref(null)
	const labels = ref([])
	const labelContainer = ref(null)

	// Label positions relative to bounding box faces
	const FACE_POSITIONS = {
		TOP: { position: [0, 1, 0], offset: [0, 0.2, 0] },
		BOTTOM: { position: [0, -1, 0], offset: [0, -0.2, 0] },
		FRONT: { position: [0, 0, 1], offset: [0, 0, 0.2] },
		BACK: { position: [0, 0, -1], offset: [0, 0, -0.2] },
		LEFT: { position: [-1, 0, 0], offset: [-0.2, 0, 0] },
		RIGHT: { position: [1, 0, 0], offset: [0.2, 0, 0] },
	}

	/**
	 * Initialize CSS2D renderer for labels
	 * @param {HTMLElement} container - Container element
	 * @param {number} width - Viewport width
	 * @param {number} height - Viewport height
	 */
	const initLabelRenderer = (container, width, height) => {
		try {
			// Create CSS2D renderer
			labelRenderer.value = new CSS2DRenderer()
			labelRenderer.value.setSize(width, height)
			labelRenderer.value.domElement.style.position = 'absolute'
			labelRenderer.value.domElement.style.top = '0'
			labelRenderer.value.domElement.style.left = '0'
			labelRenderer.value.domElement.style.pointerEvents = 'none'
			labelRenderer.value.domElement.style.zIndex = '100'

			container.appendChild(labelRenderer.value.domElement)
			labelContainer.value = labelRenderer.value.domElement

			logger.info('useFaceLabels', 'Label renderer initialized', { width, height })
		} catch (error) {
			logger.error('useFaceLabels', 'Failed to initialize label renderer', error)
			throw error
		}
	}

	/**
	 * Create a CSS2D label element
	 * @param {string} text - Label text
	 * @return {HTMLElement} Label element
	 */
	const createLabelElement = (text) => {
		const div = document.createElement('div')
		div.className = 'face-label'
		div.textContent = text
		div.style.cssText = `
			background: rgba(0, 0, 0, 0.8);
			color: #ffffff;
			padding: 8px 16px;
			border-radius: 6px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			font-size: 14px;
			font-weight: 600;
			border: 2px solid #00ff00;
			box-shadow: 0 4px 12px rgba(0, 255, 0, 0.3);
			pointer-events: none;
			user-select: none;
			letter-spacing: 1px;
			text-transform: uppercase;
		`
		return div
	}

	/**
	 * Add face labels to model
	 * @param {THREE.Object3D} model - 3D model to label
	 * @param {THREE.Scene} scene - Three.js scene
	 */
	const addFaceLabels = (model, scene) => {
		if (!model || !scene) {
			logger.warn('useFaceLabels', 'Cannot add labels: model or scene missing')
			return
		}

		try {
			// Remove existing labels
			clearLabels(scene)

			// Calculate model bounding box
			const box = new THREE.Box3().setFromObject(model)
			if (box.isEmpty()) {
				logger.warn('useFaceLabels', 'Model bounding box is empty')
				return
			}

			const size = box.getSize(new THREE.Vector3())
			const center = box.getCenter(new THREE.Vector3())

			// Create labels for each face
			Object.entries(FACE_POSITIONS).forEach(([face, config]) => {
				// Calculate label position
				const labelPos = new THREE.Vector3(
					center.x + (size.x / 2) * config.position[0] + config.offset[0],
					center.y + (size.y / 2) * config.position[1] + config.offset[1],
					center.z + (size.z / 2) * config.position[2] + config.offset[2]
				)

				// Create label element
				const labelDiv = createLabelElement(face)
				const label = new CSS2DObject(labelDiv)
				label.position.copy(labelPos)
				label.userData = { isFaceLabel: true, face }

				// Add to scene
				scene.add(label)
				labels.value.push(label)

				logger.info('useFaceLabels', `Added ${face} label`, {
					position: { x: labelPos.x, y: labelPos.y, z: labelPos.z }
				})
			})

			labelsEnabled.value = true
			logger.info('useFaceLabels', 'All face labels added', { count: labels.value.length })
		} catch (error) {
			logger.error('useFaceLabels', 'Failed to add face labels', error)
		}
	}

	/**
	 * Remove all face labels from scene
	 * @param {THREE.Scene} scene - Three.js scene
	 */
	const clearLabels = (scene) => {
		if (!scene) return

		labels.value.forEach(label => {
			scene.remove(label)
			if (label.element) {
				label.element.remove()
			}
		})

		labels.value = []
		logger.info('useFaceLabels', 'Face labels cleared')
	}

	/**
	 * Toggle face labels visibility
	 * @param {THREE.Object3D} model - 3D model
	 * @param {THREE.Scene} scene - Three.js scene
	 */
	const toggleLabels = (model, scene) => {
		if (labelsEnabled.value) {
			clearLabels(scene)
			labelsEnabled.value = false
		} else {
			addFaceLabels(model, scene)
			labelsEnabled.value = true
		}

		logger.info('useFaceLabels', 'Labels toggled', { enabled: labelsEnabled.value })
	}

	/**
	 * Update label renderer size
	 * @param {number} width - New width
	 * @param {number} height - New height
	 */
	const onWindowResize = (width, height) => {
		if (labelRenderer.value) {
			labelRenderer.value.setSize(width, height)
			logger.info('useFaceLabels', 'Label renderer resized', { width, height })
		}
	}

	/**
	 * Render labels
	 * @param {THREE.Scene} scene - Three.js scene
	 * @param {THREE.Camera} camera - Camera
	 */
	const renderLabels = (scene, camera) => {
		if (labelRenderer.value && labelsEnabled.value && scene && camera) {
			labelRenderer.value.render(scene, camera)
		}
	}

	/**
	 * Dispose label renderer and clear labels
	 */
	const dispose = () => {
		if (labelRenderer.value) {
			if (labelContainer.value && labelContainer.value.parentNode) {
				labelContainer.value.parentNode.removeChild(labelContainer.value)
			}
			labelRenderer.value = null
			labelContainer.value = null
		}

		labels.value = []
		labelsEnabled.value = false

		logger.info('useFaceLabels', 'Face labels disposed')
	}

	return {
		// State
		labelsEnabled,
		labels,
		labelRenderer,

		// Methods
		initLabelRenderer,
		addFaceLabels,
		clearLabels,
		toggleLabels,
		onWindowResize,
		renderLabels,
		dispose,
	}
}

