/**
 * Annotation system composable
 * Handles 3D annotation creation, management, and interaction
 */

import { ref, computed, readonly } from 'vue'
import * as THREE from 'three'
import { logger } from '../utils/logger.js'
import { logError } from '../utils/error-handler.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import {
	calculateModelScale,
	createTextTexture,
	createTextMesh,
	raycastIntersection,
} from '../utils/modelScaleUtils.js'

// Visual sizing configuration for annotations (percentages of model size)
const ANNOTATION_SIZING = (VIEWER_CONFIG.visualSizing && VIEWER_CONFIG.visualSizing.annotation) || {
	pointSizePercent: 1.5,
	labelWidthPercent: 20,
}

export function useAnnotation() {
	// Annotation state
	const isActive = ref(false)
	const annotations = ref([])
	const currentAnnotation = ref(null)
	const annotationGroup = ref(null)
	const textMeshes = ref([])
	const pointMeshes = ref([])
	const sceneRef = ref(null)
	const modelScale = ref(1) // Scale factor based on model size

	// Computed properties
	const hasAnnotations = computed(() => annotations.value.length > 0)
	const annotationCount = computed(() => annotations.value.length)

	// Initialize annotation system
	const init = (scene) => {
		// Input validation
		if (!scene) {
			logError('useAnnotation', 'Scene is required for initialization', new Error('Scene is required'))
			throw new Error('Scene is required to initialize annotation system')
		}
		if (!(scene instanceof THREE.Scene)) {
			logError('useAnnotation', 'Invalid scene object', new Error('Invalid scene'))
			throw new Error('Scene must be an instance of THREE.Scene')
		}

		try {
			// Store scene reference
			sceneRef.value = scene

			// Create annotation group
			annotationGroup.value = new THREE.Group()
			annotationGroup.value.name = 'annotationGroup'
			scene.add(annotationGroup.value)

			// Calculate initial model scale
			updateModelScale()
		} catch (error) {
			logError('useAnnotation', 'Failed to initialize annotation system', error)
			throw error
		}
	}

	// Calculate and update model scale based on bounding box
	const updateModelScale = () => {
		if (!sceneRef.value) return
		modelScale.value = calculateModelScale(sceneRef.value)
	}

	// Toggle annotation mode
	const toggleAnnotation = () => {
		isActive.value = !isActive.value
	}

	// Handle click events for annotation placement
	const handleClick = (event, camera) => {
		if (!isActive.value) {
			return
		}

		if (!sceneRef.value) {
			return
		}

		try {
			// Use shared raycasting utility with custom filter
			const point = raycastIntersection(event, camera, sceneRef.value, {
				filterMesh: (mesh) => mesh.isMesh && mesh.name !== 'annotationPoint' && mesh.name !== 'annotationText',
				recursive: false,
			})

			if (point) {
				addAnnotationPoint(point)
			}
		} catch (error) {
			logError('useAnnotation', 'Failed to handle annotation click', error)
		}
	}

	// Add annotation point
	const addAnnotationPoint = (point) => {
		try {
			// Create annotation object
			const annotation = {
				id: Date.now(),
				point: point.clone(),
				text: `Annotation ${annotations.value.length + 1}`,
				timestamp: new Date().toISOString(),
				pointMesh: null,
				textMesh: null,
			}

			annotations.value.push(annotation)
			currentAnnotation.value = annotation

			// Create visual elements and store references
			annotation.pointMesh = createAnnotationPoint(annotation)
			annotation.textMesh = createAnnotationText(annotation)
		} catch (error) {
			logError('useAnnotation', 'Failed to add annotation point', error)
		}
	}

	// Create visual point for annotation
	const createAnnotationPoint = (annotation) => {
		if (!annotationGroup.value) return null

		// Scale point size based on actual model size (percentage of bounding box)
		let modelMaxDim = modelScale.value / 0.005 // Fallback from modelScale

		if (sceneRef.value) {
			const box = new THREE.Box3()
			const meshes = []
			sceneRef.value.traverse((child) => {
				if (child.isMesh && !child.name?.startsWith('measurement') && !child.name?.startsWith('annotation')) {
					meshes.push(child)
					const meshBox = new THREE.Box3().setFromObject(child)
					box.union(meshBox)
				}
			})

			if (meshes.length > 0) {
				const size = new THREE.Vector3()
				box.getSize(size)
				const actualMaxDim = Math.max(size.x, size.y, size.z)
				if (actualMaxDim > 0) {
					modelMaxDim = actualMaxDim
				}
			}
		}

		// Use a small percentage of the model size for the annotation point radius,
		// driven by configuration (default ~1.5% of model size, clamped between ~1% and ~3%)
		const basePercent = typeof ANNOTATION_SIZING.pointSizePercent === 'number' ? ANNOTATION_SIZING.pointSizePercent : 1.5
		const targetRadius = modelMaxDim * (basePercent / 100)
		const minRadius = modelMaxDim * ((basePercent * 0.666) / 100) // ~2/3 of target → ~1% when base is 1.5%
		const maxRadius = modelMaxDim * ((basePercent * 2) / 100) // 2x target → ~3% when base is 1.5%
		const pointRadius = Math.min(Math.max(targetRadius, minRadius), maxRadius)

		const geometry = new THREE.SphereGeometry(pointRadius, 16, 16)
		const material = new THREE.MeshBasicMaterial({
			color: 0xff0000, // Red for annotations
			transparent: true,
			opacity: 0.9,
			depthTest: false,
			depthWrite: false,
		})
		const sphere = new THREE.Mesh(geometry, material)
		sphere.position.copy(annotation.point)
		sphere.name = 'annotationPoint'
		sphere.renderOrder = 999

		if (sphere) {
			annotationGroup.value.add(sphere)
			pointMeshes.value.push(sphere)
		}

		return sphere
	}

	// Create text for annotation
	const createAnnotationText = (annotation) => {
		try {
			// Get actual model size from scene bounding box (more accurate than using modelScale)
			let actualMaxDim = 0
			if (sceneRef.value) {
				const box = new THREE.Box3()
				sceneRef.value.traverse((child) => {
					if (child.isMesh
						&& child.name !== 'annotationPoint'
						&& child.name !== 'annotationText'
						&& !child.name.startsWith('measurement')) {
						const meshBox = new THREE.Box3().setFromObject(child)
						box.union(meshBox)
					}
				})
				const size = new THREE.Vector3()
				box.getSize(size)
				actualMaxDim = Math.max(size.x, size.y, size.z)
			}

			// Fallback to calculated modelMaxDim if we couldn't get actual size
			const calculatedModelMaxDim = modelScale.value / 0.005
			const modelMaxDim = actualMaxDim > 0 ? actualMaxDim : calculatedModelMaxDim

			// Calculate text scale proportionally to actual model size
			// For very small models, use smaller minimum to avoid oversized labels
			const minTextScale = modelMaxDim < 1 ? modelMaxDim * 0.1 : Math.min(modelMaxDim * 0.02, 2)
			const baseTextScale = Math.max(minTextScale, modelMaxDim * 0.02) // At least 2% of model
			const textScale = Math.min(baseTextScale, modelMaxDim * 0.1) // Cap at 10% of model size

			// Determine if this is a large model based on actual model size
			// Use modelMaxDim > 100 as threshold for large models (similar to measurements)
			const isLargeModel = modelMaxDim > 100

			// Determine font size and canvas dimensions based on model size
			// Scale font size proportionally: 48px for small, up to 96px for very large
			const fontSize = isLargeModel ? 96 : 48
			const canvasWidth = isLargeModel ? 1024 : 512
			const canvasHeight = isLargeModel ? 256 : 128

			// Position label above the point (positive yOffset moves label upward)
			const yOffset = isLargeModel ? 0.25 : 0.15 // Smaller offset for tiny models so text stays near the point

			// Compute width/height multipliers so the final plane size is a configurable
			// percentage of the model size. By default we target ~20% of the model width
			// and ~5% of the model height (ratio 1:0.25).
			const baseLabelWidthPercent = 20
			const configuredLabelWidthPercent = typeof ANNOTATION_SIZING.labelWidthPercent === 'number'
				? ANNOTATION_SIZING.labelWidthPercent
				: baseLabelWidthPercent
			const widthFraction = configuredLabelWidthPercent / 100
			const desiredWidth = modelMaxDim * widthFraction
			const desiredHeight = desiredWidth * 0.25 // Maintain ~5% height when width is 20%
			// Avoid division by zero: textScale is clamped above so it's never 0
			const widthMultiplier = desiredWidth / textScale
			const heightMultiplier = desiredHeight / textScale

			// Use shared text mesh utility
			const textMesh = createTextMesh(annotation.text, annotation.point, {
				scale: textScale, // Use calculated textScale instead of modelScale
				widthMultiplier,
				heightMultiplier,
				yOffset,
				textColor: '#ff0000',
				bgColor: 'rgba(0, 0, 0, 0.8)',
				fontSize,
				canvasWidth,
				canvasHeight,
				renderOrder: 1000, // Highest render order to ensure text is always on top
				name: 'annotationText',
			})

			if (textMesh) {
				// Store original dimensions in userData for consistent updates
				textMesh.userData.originalFontSize = fontSize
				textMesh.userData.originalCanvasWidth = canvasWidth
				textMesh.userData.originalCanvasHeight = canvasHeight
				textMesh.userData.originalTextScale = textScale
				textMesh.userData.originalYOffset = yOffset

				annotationGroup.value.add(textMesh)
				textMeshes.value.push(textMesh)
			}

			return textMesh
		} catch (error) {
			logError('useAnnotation', 'Failed to create annotation text', error)
			return null
		}
	}

	// Update annotation text
	const updateAnnotationText = (annotationId, newText) => {
		const annotation = annotations.value.find(a => a.id === annotationId)
		if (annotation) {
			annotation.text = newText

			// Update visual text mesh using stored reference
			const textMesh = annotation.textMesh

			if (textMesh) {
				// Get original dimensions from userData, fallback to defaults
				const originalFontSize = textMesh.userData?.originalFontSize || 48
				const originalCanvasWidth = textMesh.userData?.originalCanvasWidth || 512
				const originalCanvasHeight = textMesh.userData?.originalCanvasHeight || 128

				// Update existing texture canvas if it's a CanvasTexture, otherwise create new texture
				const existingTexture = textMesh.material.map
				let texture = null

				if (existingTexture && existingTexture.isCanvasTexture && existingTexture.image) {
					// Update existing canvas texture
					const canvas = existingTexture.image
					const context = canvas.getContext('2d')

					// Clear canvas completely first (important to prevent ghosting)
					context.clearRect(0, 0, canvas.width, canvas.height)

					// Draw background
					context.fillStyle = 'rgba(0, 0, 0, 0.8)'
					context.fillRect(0, 0, canvas.width, canvas.height)

					// Draw text with original font size
					context.fillStyle = '#ff0000'
					context.font = `bold ${originalFontSize}px Arial`
					context.textAlign = 'center'
					context.textBaseline = 'middle'
					context.fillText(newText, canvas.width / 2, canvas.height / 2)

					// Mark texture for update
					existingTexture.needsUpdate = true
					texture = existingTexture
				} else {
					// Create new texture with original dimensions
					texture = createTextTexture(newText, {
						width: originalCanvasWidth,
						height: originalCanvasHeight,
						textColor: '#ff0000',
						bgColor: 'rgba(0, 0, 0, 0.8)',
						fontSize: originalFontSize,
						fontFamily: 'Arial',
					})

					if (texture) {
						// Dispose old texture to prevent memory leaks
						if (existingTexture) {
							existingTexture.dispose()
						}
						textMesh.material.map = texture
						texture.needsUpdate = true
					}
				}

				// Update position with current yOffset (in case model scale changed)
				if (textMesh.userData?.originalTextScale && textMesh.userData?.originalYOffset) {
					const textScale = textMesh.userData.originalTextScale
					const yOffset = textMesh.userData.originalYOffset

					// Reset position to point and apply yOffset
					textMesh.position.copy(annotation.point)
					textMesh.position.y += textScale * yOffset
				}

				// Ensure renderOrder is highest to keep text on top
				textMesh.renderOrder = 1000

				// Always mark material for update
				if (texture) {
					textMesh.material.needsUpdate = true
				}
			}
		}
	}

	// Delete annotation
	const deleteAnnotation = (annotationId) => {
		const index = annotations.value.findIndex(a => a.id === annotationId)
		if (index !== -1) {
			const annotation = annotations.value[index]

			// Remove visual elements using stored references
			if (annotation.pointMesh && annotationGroup.value) {
				annotationGroup.value.remove(annotation.pointMesh)
				const pointIndex = pointMeshes.value.indexOf(annotation.pointMesh)
				if (pointIndex !== -1) {
					pointMeshes.value.splice(pointIndex, 1)
				}
			}

			if (annotation.textMesh && annotationGroup.value) {
				annotationGroup.value.remove(annotation.textMesh)
				const textIndex = textMeshes.value.indexOf(annotation.textMesh)
				if (textIndex !== -1) {
					textMeshes.value.splice(textIndex, 1)
				}
			}

			// Remove from annotations array
			annotations.value.splice(index, 1)
		}
	}

	// Clear all annotations
	const clearAllAnnotations = () => {
		try {
			// Force remove all children from annotation group
			if (annotationGroup.value) {
				// Remove all children by iterating backwards to avoid index issues
				while (annotationGroup.value.children.length > 0) {
					const child = annotationGroup.value.children[0]
					annotationGroup.value.remove(child)
				}
			}

			// Clear the annotation group completely
			if (annotationGroup.value) {
				annotationGroup.value.clear()
			}

			// Reset state arrays
			annotations.value = []
			currentAnnotation.value = null
			pointMeshes.value = []
			textMeshes.value = []
		} catch (error) {
			logError('useAnnotation', 'Failed to clear all annotations', error)
		}
	}

	// Get annotation summary
	const getAnnotationSummary = () => {
		return {
			active: isActive.value,
			annotationCount: annotations.value.length,
			annotations: annotations.value.map(a => ({
				id: a.id,
				text: a.text,
				point: { x: a.point.x, y: a.point.y, z: a.point.z },
				timestamp: a.timestamp,
			})),
		}
	}

	/**
	 * Dispose of annotation resources
	 */
	const dispose = () => {
		// Clear all annotations
		annotations.value = []
		currentAnnotation.value = null
		isActive.value = false
		modelScale.value = 1

		logger.info('useAnnotation', 'Annotation resources disposed')
	}

	return {
		// State
		isActive: readonly(isActive),
		annotations: readonly(annotations),
		currentAnnotation: readonly(currentAnnotation),
		modelScale: readonly(modelScale),

		// Computed
		hasAnnotations,
		annotationCount,

		// Methods
		init,
		updateModelScale,
		toggleAnnotation,
		handleClick,
		addAnnotationPoint,
		updateAnnotationText,
		deleteAnnotation,
		clearAllAnnotations,
		getAnnotationSummary,
		dispose,
	}
}
