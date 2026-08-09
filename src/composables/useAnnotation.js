/**
 * Annotation system composable
 * Handles 3D annotation creation, management, and interaction
 */

import { ref, shallowRef, computed, readonly, toRaw } from 'vue'
import * as THREE from 'three'
import { generateUrl } from '@nextcloud/router'
import { logger } from '../utils/logger.js'
import { logError } from '../utils/error-handler.js'
import { VIEWER_CONFIG, MARKER_COLORS } from '../config/viewer-config.js'
import {
	calculateModelScale,
	createTextMesh,
	isHelperMesh,
	raycastIntersection,
	updateTextMesh,
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
			// The model, and nothing else — see the same filter in useMeasurement. Naming
			// this tool's own two markers left the gizmo picker in, and a note clicked onto
			// the model was placed on the picker instead.
			const point = raycastIntersection(event, camera, sceneRef.value, {
				filterMesh: (mesh) => mesh.isMesh && mesh.visible && !isHelperMesh(mesh),
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
			color: MARKER_COLORS.annotation,
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

			// Height as a percentage of the model, matching the measurement labels; width
			// follows the text. What was here derived a scale from three clamps and then a
			// width and height from that scale, so the label's size depended on four
			// interacting numbers and none of them was its height.
			const basePercent = typeof ANNOTATION_SIZING.labelHeightPercent === 'number' ? ANNOTATION_SIZING.labelHeightPercent : 4
			const labelHeight = modelMaxDim * (basePercent / 100)
			const yOffset = 0.15

			// Texture resolution, which is about crispness rather than size.
			const fontSize = 48
			const canvasHeight = 128

			// Use shared text mesh utility
			const textMesh = createTextMesh(annotation.text, annotation.point, {
				scale: labelHeight,
				heightMultiplier: 1,
				yOffset,
				textColor: MARKER_COLORS.annotation,
				bgColor: MARKER_COLORS.labelSurface,
				fontSize,
				canvasHeight,
				renderOrder: 1000, // Highest render order to ensure text is always on top
				name: 'annotationText',
			})

			if (textMesh) {
				// Store original dimensions in userData for consistent updates
				textMesh.userData.originalFontSize = fontSize
				textMesh.userData.originalCanvasHeight = canvasHeight
				textMesh.userData.originalTextScale = labelHeight
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
				// One updater, shared with the measurement labels: it re-measures the text,
				// so a note that grows longer is redrawn rather than clipped by the canvas
				// it was first drawn into.
				updateTextMesh(textMesh, newText, {
					textColor: MARKER_COLORS.annotation,
					bgColor: MARKER_COLORS.labelSurface,
				})

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
	 * @param {string} [modelFilename] - Source model filename, stored as a
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
	 * @param {boolean} [options.replace] - Clear existing annotations first
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
