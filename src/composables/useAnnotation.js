/**
 * Annotation system composable
 * Handles 3D annotation creation, management, and interaction
 */

import { ref, shallowRef, computed, readonly, toRaw } from 'vue'
import * as THREE from 'three'
import { generateUrl } from '@nextcloud/router'
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

/**
 * True if a mesh is a viewer helper (gizmo, picker, measurement, annotation
 * marker) rather than part of the loaded model. Used to keep helpers out of
 * the model bounding-box calculation that drives marker sizing — without this
 * filter, the TransformControlsPlane (a 100,000-unit invisible picker plane)
 * inflates `modelMaxDim` and pushes annotation labels hundreds of units away.
 *
 * @param {THREE.Object3D} obj - Mesh to test
 * @return {boolean}
 */
function isHelperMesh(obj) {
	if (!obj) return false
	// Filter by name pattern
	const name = obj.name || ''
	if (name.startsWith('annotation') || name.startsWith('measurement')) return true
	// Filter Three.js built-in helpers and TransformControls
	const type = obj.type || ''
	if (type.startsWith('TransformControls')) return true
	if (type === 'AxesHelper' || type === 'GridHelper' || type === 'Box3Helper') return true
	// Walk ancestors to catch the picker plane (whose ancestor is TransformControls)
	let p = obj.parent
	while (p) {
		if ((p.type || '').startsWith('TransformControls')) return true
		p = p.parent
	}
	return false
}

export function useAnnotation() {
	// Annotation state
	const isActive = ref(false)
	const annotations = ref([])
	const currentAnnotation = ref(null)
	const annotationGroup = shallowRef(null)
	const textMeshes = ref([])
	const pointMeshes = ref([])
	const sceneRef = shallowRef(null)
	const modelScale = ref(1) // Scale factor based on model size

	// Persistence state — drives the small status pill in the annotation overlay
	// and lets ThreeViewer suppress auto-save while it's bulk-loading from the
	// backend (so the load itself doesn't trigger a re-save round trip).
	const persistenceStatus = ref('idle') // 'idle' | 'loading' | 'saving' | 'saved' | 'error'
	const persistenceError = ref(null)
	const persistenceSuppressed = ref(false)

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
				if (child.isMesh && !isHelperMesh(child)) {
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
					if (child.isMesh && !isHelperMesh(child)) {
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

			// Remove visual elements using stored references (toRaw to match Three.js scene reference)
			if (annotation.pointMesh && annotationGroup.value) {
				annotationGroup.value.remove(toRaw(annotation.pointMesh))
				const rawPoint = toRaw(annotation.pointMesh)
				const pointIndex = pointMeshes.value.findIndex(m => toRaw(m) === rawPoint)
				if (pointIndex !== -1) {
					pointMeshes.value.splice(pointIndex, 1)
				}
			}

			if (annotation.textMesh && annotationGroup.value) {
				annotationGroup.value.remove(toRaw(annotation.textMesh))
				const rawText = toRaw(annotation.textMesh)
				const textIndex = textMeshes.value.findIndex(m => toRaw(m) === rawText)
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
	 * Export annotations as a JSON document.
	 *
	 * The schema is versioned so older exports remain importable when fields
	 * are added later. The `format` discriminator lets the importer reject
	 * unrelated JSON files (e.g., bookmarks or model exports) before parsing.
	 *
	 * @param {string} [modelFilename=''] - Source model filename, stored as a
	 *   hint for the user but not used for matching
	 * @return {object} Serializable annotation document
	 */
	const exportAsJSON = (modelFilename = '') => {
		return {
			format: 'threedviewer-annotations',
			version: 1,
			exportedAt: new Date().toISOString(),
			modelFilename,
			annotations: annotations.value.map(a => ({
				id: a.id,
				point: { x: a.point.x, y: a.point.y, z: a.point.z },
				text: a.text,
				timestamp: a.timestamp,
			})),
		}
	}

	/**
	 * Import annotations from a JSON document produced by `exportAsJSON`.
	 *
	 * Validates the schema, then re-creates each annotation with its original
	 * world-space position and label. Existing annotations are preserved by
	 * default — pass `{ replace: true }` to clear them first.
	 *
	 * @param {object|string} json - Parsed object or raw JSON string
	 * @param {object} [options]
	 * @param {boolean} [options.replace=false] - Clear existing annotations first
	 * @return {{ added: number, skipped: number }}
	 */
	const importFromJSON = (json, options = {}) => {
		const { replace = false } = options

		const data = typeof json === 'string' ? JSON.parse(json) : json

		if (!data || typeof data !== 'object') {
			throw new Error('Invalid annotation file: not an object')
		}
		if (data.format !== 'threedviewer-annotations') {
			throw new Error('Invalid annotation file: format mismatch')
		}
		if (!Array.isArray(data.annotations)) {
			throw new Error('Invalid annotation file: missing annotations array')
		}

		if (replace) {
			clearAllAnnotations()
		}

		let added = 0
		let skipped = 0

		for (const item of data.annotations) {
			if (!item || !item.point
				|| typeof item.point.x !== 'number'
				|| typeof item.point.y !== 'number'
				|| typeof item.point.z !== 'number') {
				skipped++
				continue
			}

			const point = new THREE.Vector3(item.point.x, item.point.y, item.point.z)
			addAnnotationPoint(point)

			// Apply the imported text/timestamp to the freshly created annotation
			const fresh = annotations.value[annotations.value.length - 1]
			if (fresh) {
				if (typeof item.text === 'string' && item.text.length > 0) {
					updateAnnotationText(fresh.id, item.text)
				}
				if (typeof item.timestamp === 'string') {
					fresh.timestamp = item.timestamp
				}
			}
			added++
		}

		logger.info('useAnnotation', 'Annotations imported', { added, skipped, total: data.annotations.length })
		return { added, skipped }
	}

	/**
	 * Load any saved annotations for a model from the Nextcloud backend.
	 *
	 * Calls `GET /api/annotations/{fileId}`. On success it suppresses the
	 * auto-save watcher (so re-creating the annotations from the imported JSON
	 * doesn't immediately PUT them back) and replaces existing annotations.
	 * On 204 (no saved doc) the call is a no-op so a fresh model starts blank.
	 *
	 * @param {number|string} fileId - Nextcloud file ID
	 * @param {string} [modelFilename] - Model filename (used as the import hint)
	 * @return {Promise<{loaded: boolean, count: number}>}
	 */
	const loadFromBackend = async (fileId, modelFilename = '') => {
		if (!fileId || fileId === 'comparison') {
			return { loaded: false, count: 0 }
		}

		persistenceStatus.value = 'loading'
		persistenceError.value = null

		try {
			const url = generateUrl(`/apps/threedviewer/api/annotations/${fileId}`)
			const res = await fetch(url, {
				method: 'GET',
				credentials: 'same-origin',
				headers: { Accept: 'application/json' },
			})

			// 204 = nothing saved yet for this (user, file) — leave annotations untouched.
			if (res.status === 204) {
				persistenceStatus.value = 'idle'
				return { loaded: false, count: 0 }
			}

			if (!res.ok) {
				throw new Error(`Backend returned ${res.status}`)
			}

			const body = await res.json()
			const doc = body && body.annotations
			if (!doc || typeof doc !== 'object') {
				persistenceStatus.value = 'idle'
				return { loaded: false, count: 0 }
			}

			// Suppress auto-save while we replay the saved doc through importFromJSON
			// — otherwise every addAnnotationPoint call would mark dirty and trigger
			// a PUT, racing with the load and creating a save loop.
			persistenceSuppressed.value = true
			let result
			try {
				result = importFromJSON(doc, { replace: true })
			} finally {
				persistenceSuppressed.value = false
			}

			persistenceStatus.value = 'saved'
			logger.info('useAnnotation', 'Annotations loaded from backend', {
				fileId,
				added: result.added,
				skipped: result.skipped,
			})
			return { loaded: true, count: result.added }
		} catch (error) {
			persistenceStatus.value = 'error'
			persistenceError.value = error
			logger.warn('useAnnotation', 'Failed to load annotations from backend', {
				fileId,
				error: error.message,
			})
			return { loaded: false, count: 0 }
		}
	}

	/**
	 * Persist the current annotations to the Nextcloud backend.
	 *
	 * No-op when:
	 *   - the load is in progress (persistenceSuppressed)
	 *   - fileId is missing or the synthetic 'comparison' marker
	 *
	 * When the in-memory list is empty we issue a DELETE so the backend file
	 * is removed too — that way clearing all annotations actually clears them
	 * across reloads, instead of leaving an empty document behind.
	 *
	 * @param {number|string} fileId
	 * @param {string} [modelFilename]
	 * @return {Promise<{saved: boolean}>}
	 */
	const saveToBackend = async (fileId, modelFilename = '') => {
		if (!fileId || fileId === 'comparison' || persistenceSuppressed.value) {
			return { saved: false }
		}

		persistenceStatus.value = 'saving'
		persistenceError.value = null

		try {
			const url = generateUrl(`/apps/threedviewer/api/annotations/${fileId}`)

			// Empty list → delete the backend doc rather than persist [].
			if (annotations.value.length === 0) {
				const res = await fetch(url, {
					method: 'DELETE',
					credentials: 'same-origin',
					headers: { requesttoken: getRequestToken() },
				})
				if (!res.ok && res.status !== 404) {
					throw new Error(`Backend returned ${res.status}`)
				}
				persistenceStatus.value = 'saved'
				return { saved: true }
			}

			const body = JSON.stringify(exportAsJSON(modelFilename))
			const res = await fetch(url, {
				method: 'PUT',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					requesttoken: getRequestToken(),
				},
				body,
			})

			if (!res.ok) {
				throw new Error(`Backend returned ${res.status}`)
			}

			persistenceStatus.value = 'saved'
			logger.info('useAnnotation', 'Annotations saved to backend', {
				fileId,
				count: annotations.value.length,
			})
			return { saved: true }
		} catch (error) {
			persistenceStatus.value = 'error'
			persistenceError.value = error
			logger.warn('useAnnotation', 'Failed to save annotations to backend', {
				fileId,
				error: error.message,
			})
			return { saved: false }
		}
	}

	/**
	 * Read the Nextcloud requesttoken from the page so PUT/DELETE survive
	 * the CSRF guard. We grab it lazily because the meta tag is injected by
	 * the Nextcloud server template, not by Vite.
	 */
	function getRequestToken() {
		if (typeof document === 'undefined') return ''
		const meta = document.head?.querySelector('meta[name="requesttoken"]')
		return meta?.getAttribute('content') || ''
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
		persistenceStatus: readonly(persistenceStatus),
		persistenceError: readonly(persistenceError),

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
		exportAsJSON,
		importFromJSON,
		loadFromBackend,
		saveToBackend,
		dispose,
	}
}
