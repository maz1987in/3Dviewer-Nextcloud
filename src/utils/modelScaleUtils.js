/**
 * Model scale utilities
 * Shared functions for calculating visual scale based on model bounding box
 */

import * as THREE from 'three'
import { logError } from './error-handler.js'
import { MARKER_COLORS } from '../config/viewer-config.js'

/**
 * True if an object is viewer furniture — a gizmo, a picker, a helper, or one of the
 * markers the measurement and annotation tools draw — rather than part of the loaded
 * model.
 *
 * Everything that sizes itself against "the model" has to ask this first. TransformControls
 * keeps an invisible picker plane in the scene, sized so a drag can never run off it: on a
 * real instance it measures 107,700 units across, beside a model of 0.4. A bounding box
 * taken over every mesh in the scene is therefore a bounding box of the picker, and a
 * marker at a fraction of a percent of it is still hundreds of units wide.
 *
 * This lived in three places and not in a fourth. The annotation composable carried it with
 * a comment naming the picker plane by size; the comparison composable carried a character-
 * for-character copy; `shouldExcludeMesh` below carried a name-list version that did not
 * know about gizmos at all. The measurement composable, which had the same scan inlined
 * three times, checked only for its own marker names — so the bug the other two had already
 * been fixed for was still live there, and drew a green wall across the viewport.
 *
 * @param {THREE.Object3D} obj - the object to test
 * @return {boolean} true if the object is not part of the model
 */
export function isHelperMesh(obj) {
	if (!obj) return false

	const name = obj.name || ''
	if (name.startsWith('annotation') || name.startsWith('measurement')) return true

	const type = obj.type || ''
	if (type.startsWith('TransformControls')) return true
	if (type === 'AxesHelper' || type === 'GridHelper' || type === 'Box3Helper') return true

	// The picker plane's own type is checked above, but a gizmo's parts are ordinary
	// meshes — what marks them is the gizmo they hang from.
	for (let p = obj.parent; p; p = p.parent) {
		if ((p.type || '').startsWith('TransformControls')) return true
	}
	return false
}

/**
 * The largest dimension of the loaded model, in Three.js units.
 *
 * The single source for every marker size in the viewer. It returns the fallback when the
 * scene holds no model yet — measuring nothing gives zero, and a marker sized from zero is
 * invisible rather than merely wrong.
 *
 * @param {THREE.Scene} scene - the scene to measure
 * @param {number} fallback - what to report when there is no model in it
 * @return {number} the model's largest dimension
 */
export function getModelMaxDimension(scene, fallback) {
	if (!scene) return fallback

	const box = new THREE.Box3()
	let found = false
	scene.traverse((child) => {
		if (!child.isMesh || isHelperMesh(child)) return
		found = true
		box.union(new THREE.Box3().setFromObject(child))
	})
	if (!found) return fallback

	const size = new THREE.Vector3()
	box.getSize(size)
	const maxDimension = Math.max(size.x, size.y, size.z)
	return maxDimension > 0 ? maxDimension : fallback
}

/**
 * Calculate visual scale based on model bounding box
 * Used for sizing annotations, measurements, and other visual elements
 *
 * @param {THREE.Scene} scene - The Three.js scene containing the model
 * @param {object} options - Configuration options
 * @param {number} options.percentage - Percentage of model size (default: 0.01 = 1%)
 * @param {number} options.minScale - Minimum scale value (default: 0.5)
 * @param {number} options.maxScale - Maximum scale value (default: 10)
 * @param {string[]} options.excludeNames - Mesh names to exclude from calculation
 * @return {number} Calculated scale factor
 */
export function calculateModelScale(scene, options = {}) {
	const {
		percentage = 0.005, // Reduced from 0.01 (1%) to 0.005 (0.5%) for smaller visual elements
		minScale = 0.3, // Reduced from 0.5
		maxScale = 3, // Reduced from 10 to prevent oversized elements on large models
		excludeNames = [
			'annotationPoint',
			'annotationText',
			'measurementPoint',
			'measurementLine',
		],
	} = options

	if (!scene) {
		return 1
	}

	try {
		// Find all meshes in the scene (excluding specified elements)
		const meshes = []
		scene.traverse((child) => {
			if (child.isMesh && !isHelperMesh(child) && !shouldExcludeMesh(child, excludeNames)) {
				meshes.push(child)
			}
		})

		if (meshes.length === 0) {
			return 1
		}

		// Calculate bounding box
		const box = new THREE.Box3()
		meshes.forEach(mesh => {
			const meshBox = new THREE.Box3().setFromObject(mesh)
			box.union(meshBox)
		})

		// Get the size of the bounding box
		const size = new THREE.Vector3()
		box.getSize(size)

		// Use the maximum dimension as reference
		const maxDimension = Math.max(size.x, size.y, size.z)

		// Scale proportionally (percentage of model size, clamped to min/max)
		const scale = Math.max(minScale, Math.min(maxScale, maxDimension * percentage))

		return scale

	} catch (error) {
		logError('modelScaleUtils', 'Failed to calculate model scale', error)
		return 1
	}
}

/**
 * Check if a mesh should be excluded from scale calculation
 * @param {THREE.Mesh} mesh - The mesh to check
 * @param {string[]} excludeNames - Names/patterns to exclude
 * @return {boolean} True if mesh should be excluded
 */
function shouldExcludeMesh(mesh, excludeNames) {
	if (!mesh.name) return false

	return excludeNames.some(name => {
		// Exact match
		if (mesh.name === name) return true
		// Starts with pattern (for names like 'measurementLine1', 'measurementLine2', etc.)
		if (mesh.name.startsWith(name)) return true
		return false
	})
}

/**
 * Create a canvas texture for text labels
 * Shared function for consistent text rendering across annotations and measurements
 *
 * @param {string} text - The text to render
 * @param {object} options - Configuration options
 * @param {number} options.width - Canvas width (default: 512)
 * @param {number} options.height - Canvas height (default: 128)
 * @param {string} options.textColor - Text colour (default: the shared measurement accent)
 * @param {string} options.bgColor - Background colour (default: the shared label surface)
 * @param {number} options.fontSize - Font size in pixels (default: 48)
 * @param {string} options.fontFamily - Font family (default: the shared marker font)
 * @return {THREE.CanvasTexture} Canvas texture for use in materials
 */
export function createTextTexture(text, options = {}) {
	const {
		width = 512,
		height = 128,
		textColor = MARKER_COLORS.measurement,
		bgColor = MARKER_COLORS.labelSurface,
		fontSize = 48,
		fontFamily = MARKER_COLORS.font,
	} = options

	try {
		const canvas = document.createElement('canvas')
		const context = canvas.getContext('2d')
		const font = `bold ${fontSize}px ${fontFamily}`

		/*
		 * The pill is sized to the text rather than the text placed inside a fixed pill.
		 *
		 * Every label used a 512x128 canvas whatever it said, so "0.98 mm" was eight small
		 * characters in the middle of a wide black bar — and because the mesh is only a few
		 * pixels tall on screen, almost all of those pixels went to the bar. Measuring first
		 * spends them on the text instead.
		 *
		 * The caller's `width` becomes a floor, not the width: a label may not be narrower
		 * than the space the caller reserved for it, which keeps short labels from
		 * collapsing to a sliver.
		 */
		context.font = font
		const padding = fontSize * 0.6
		const measured = context.measureText(text).width + padding * 2
		canvas.width = Math.max(Math.ceil(measured), Math.ceil(width / 4))
		canvas.height = height

		// Setting canvas.width resets the context, so the font is applied again below.
		const radius = Math.min(canvas.height / 2, fontSize * 0.5)
		context.fillStyle = bgColor
		context.beginPath()
		if (typeof context.roundRect === 'function') {
			context.roundRect(0, 0, canvas.width, canvas.height, radius)
		} else {
			// jsdom's canvas, and browsers older than the label design.
			context.rect(0, 0, canvas.width, canvas.height)
		}
		context.fill()

		context.fillStyle = textColor
		context.font = font
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		context.fillText(text, canvas.width / 2, canvas.height / 2)

		const texture = new THREE.CanvasTexture(canvas)
		texture.needsUpdate = true

		return texture

	} catch (error) {
		logError('modelScaleUtils', 'Failed to create text texture', error)
		return null
	}
}

/**
 * Create a marker sphere for annotations or measurements
 * Shared function for consistent point markers across the app
 *
 * @param {THREE.Vector3} position - Position for the marker
 * @param {object} options - Configuration options
 * @param {number} options.scale - Visual scale factor (default: 1)
 * @param {string} options.color - Sphere colour (default: the shared measurement accent)
 * @param {number} options.sizeMultiplier - Size multiplier (default: 2)
 * @param {number} options.opacity - Material opacity (default: 0.9)
 * @param {number} options.renderOrder - Render order (default: 999)
 * @param {string} options.name - Mesh name (default: 'markerSphere')
 * @return {THREE.Mesh} Sphere mesh ready to add to scene
 */
export function createMarkerSphere(position, options = {}) {
	const {
		scale = 1,
		color = MARKER_COLORS.measurement,
		sizeMultiplier = 2,
		opacity = 0.9,
		renderOrder = 999,
		name = 'markerSphere',
	} = options

	try {
		// Cap point size to prevent oversized markers on large models
		const pointSize = Math.min(scale * sizeMultiplier, 0.02) // Maximum 0.02 units radius (very small)
		const geometry = new THREE.SphereGeometry(pointSize, 16, 16)
		const material = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity,
			depthTest: false, // Always render on top
		})
		const sphere = new THREE.Mesh(geometry, material)

		sphere.position.copy(position)
		sphere.name = name
		sphere.renderOrder = renderOrder

		return sphere

	} catch (error) {
		logError('modelScaleUtils', 'Failed to create marker sphere', error)
		return null
	}
}

/**
 * Create a text label mesh with texture
 * Shared function for creating 3D text labels
 *
 * @param {string} text - Text to display
 * @param {THREE.Vector3} position - Position for the label
 * @param {object} options - Configuration options
 * @param {number} options.scale - Visual scale factor (default: 1)
 * @param {number} options.widthMultiplier - Width multiplier (default: 30)
 * @param {number} options.heightMultiplier - Height multiplier (default: 7.5)
 * @param {number} options.yOffset - Y-axis offset multiplier (default: 0)
 * @param {string} options.textColor - Text colour (default: the shared measurement accent)
 * @param {string} options.bgColor - Background colour (default: the shared label surface)
 * @param {number} options.fontSize - Font size in pixels (default: 48)
 * @param {number} options.canvasWidth - Canvas width (default: 512)
 * @param {number} options.canvasHeight - Canvas height (default: 128)
 * @param {number} options.renderOrder - Render order (default: 997)
 * @param {string} options.name - Mesh name (default: 'textLabel')
 * @return {THREE.Mesh} Text mesh ready to add to scene
 */
export function createTextMesh(text, position, options = {}) {
	const {
		scale = 1,
		widthMultiplier = 30,
		heightMultiplier = 7.5,
		yOffset = 0,
		textColor = MARKER_COLORS.measurement,
		bgColor = MARKER_COLORS.labelSurface,
		fontSize = 48,
		canvasWidth = 512,
		canvasHeight = 128,
		renderOrder = 997,
		name = 'textLabel',
	} = options

	try {
		// Create text texture
		const texture = createTextTexture(text, {
			width: canvasWidth,
			height: canvasHeight,
			textColor,
			bgColor,
			fontSize,
		})

		if (!texture) return null

		/*
		 * Height comes from the caller; width follows the texture.
		 *
		 * The plane used to take both from the caller's multipliers while the canvas kept
		 * its own 4:1 shape, so any label whose text did not happen to fill that ratio was
		 * rendered stretched or squashed. Deriving one from the other means a label is
		 * whatever width its own text needs and never distorted.
		 */
		const textHeight = scale * heightMultiplier
		const aspect = texture.image.width / texture.image.height
		const textWidth = Math.max(textHeight * aspect, scale * widthMultiplier * 0.25)

		// Ensure minimum sizes for visibility (only for extremely small scales to prevent invisible text)
		const finalWidth = Math.max(textWidth, 0.01)
		const finalHeight = Math.max(textHeight, 0.0025)

		// Create plane geometry
		const geometry = new THREE.PlaneGeometry(finalWidth, finalHeight)
		const material = new THREE.MeshBasicMaterial({
			map: texture,
			transparent: true,
			alphaTest: 0.1,
			depthTest: false,
			depthWrite: false, // Don't write to depth buffer to ensure text renders on top
			side: THREE.DoubleSide,
			fog: false, // Disable fog for text labels
		})
		const textMesh = new THREE.Mesh(geometry, material)

		// Position text
		textMesh.position.copy(position)
		if (yOffset !== 0) {
			textMesh.position.y += scale * yOffset
		}
		textMesh.name = name
		textMesh.renderOrder = renderOrder
		// What updateTextMesh needs to rebuild the plane when the text changes length.
		textMesh.userData.labelHeight = finalHeight

		// Mark as billboard - will be updated to face camera in animation loop
		textMesh.userData.isBillboard = true

		return textMesh

	} catch (error) {
		logError('modelScaleUtils', 'Failed to create text mesh', error)
		return null
	}
}

// Raycasting cache to avoid repeated scene traversal
const raycasterCache = new Map()
const raycaster = new THREE.Raycaster() // Reuse raycaster instance
const mouse = new THREE.Vector2() // Reuse mouse vector

/**
 * Clear raycasting cache (call when scene changes significantly)
 * @param {string} sceneId - Scene identifier (optional)
 */
export function clearRaycastCache(sceneId = null) {
	if (sceneId) {
		raycasterCache.delete(sceneId)
	} else {
		raycasterCache.clear()
	}
}

/**
 * Get cached intersectable objects for a scene
 * @param {THREE.Scene} scene - Scene to cache objects for
 * @param {Function} filterMesh - Filter function for meshes
 * @param {string} cacheKey - Cache key for this filter combination
 * @return {THREE.Object3D[]} Array of intersectable objects
 */
function getCachedIntersectableObjects(scene, filterMesh, cacheKey) {
	// Check cache first
	if (raycasterCache.has(cacheKey)) {
		const cached = raycasterCache.get(cacheKey)
		const now = Date.now()

		// Cache is valid for 5 seconds or until scene changes
		if (now - cached.timestamp < 5000 && cached.scene === scene) {
			return cached.objects
		}
	}

	// Build cache
	const intersectableObjects = []
	scene.traverse((child) => {
		// Early exit conditions for better performance
		if (!child.isMesh || !child.visible || !child.geometry || !child.material) {
			return
		}

		// Apply custom filter
		if (filterMesh(child)) {
			intersectableObjects.push(child)
		}
	})

	// Cache the result
	raycasterCache.set(cacheKey, {
		objects: intersectableObjects,
		scene,
		timestamp: Date.now(),
	})

	return intersectableObjects
}

/**
 * Replace a label's text.
 *
 * The label keeps the height it was built with and takes its width from the new text, so a
 * reading that changes from "0.98 mm" to "0.039 in" is redrawn rather than squeezed into
 * the shape of the old one.
 *
 * This exists because both callers had grown their own version, and both drew straight
 * into the existing canvas at its existing width — which meant a longer string was clipped
 * by the canvas it was drawn into, and a shorter one left the plane too wide. Each also
 * repeated the label's colours inline, so the two update paths had drifted from the two
 * creation paths and from each other.
 *
 * @param {THREE.Mesh} mesh - the label mesh to update
 * @param {string} text - the new text
 * @param {object} options - colour and font overrides, as for createTextTexture
 * @return {boolean} true if the label was updated
 */
export function updateTextMesh(mesh, text, options = {}) {
	if (!mesh || !mesh.material) return false

	try {
		const texture = createTextTexture(text, {
			width: mesh.userData?.originalCanvasWidth ?? 512,
			height: mesh.userData?.originalCanvasHeight ?? 128,
			fontSize: mesh.userData?.originalFontSize ?? 48,
			...options,
		})
		if (!texture) return false

		const previous = mesh.material.map
		mesh.material.map = texture
		mesh.material.needsUpdate = true
		if (previous && previous !== texture) previous.dispose()

		const height = mesh.userData?.labelHeight
		if (height) {
			const aspect = texture.image.width / texture.image.height
			mesh.geometry.dispose()
			mesh.geometry = new THREE.PlaneGeometry(
				Math.max(height * aspect, 0.01),
				Math.max(height, 0.0025),
			)
		}
		return true

	} catch (error) {
		logError('modelScaleUtils', 'Failed to update text mesh', error)
		return false
	}
}

/**
 * Perform raycasting to find 3D intersection point from mouse click
 * Optimized version with caching and early exit conditions
 *
 * @param {MouseEvent} event - Mouse click event
 * @param {THREE.Camera} camera - Camera for raycasting
 * @param {THREE.Scene} scene - Scene to raycast against
 * @param {object} options - Configuration options
 * @param {Function} options.filterMesh - Optional filter function (mesh => boolean)
 * @param {boolean} options.recursive - Recursive intersection (default: true)
 * @param {boolean} options.useCache - Whether to use object caching (default: true)
 * @param {number} options.maxDistance - Maximum raycast distance (default: 1000)
 * @return {THREE.Vector3|null} Intersection point or null if no intersection
 */
export function raycastIntersection(event, camera, scene, options = {}) {
	const {
		filterMesh = (mesh) => mesh.isMesh && mesh.visible,
		recursive = true,
		useCache = true,
		maxDistance = 1000,
	} = options

	try {
		// Early exit if no scene or camera
		if (!scene || !camera) {
			return null
		}

		// Calculate mouse position in normalized device coordinates
		const rect = event.target.getBoundingClientRect()
		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

		// Set up raycaster with distance limit for performance
		raycaster.setFromCamera(mouse, camera)
		raycaster.far = maxDistance

		// Get intersectable objects (cached if enabled)
		let intersectableObjects
		if (useCache) {
			const cacheKey = `${scene.id || 'default'}_${filterMesh.toString().slice(0, 50)}`
			intersectableObjects = getCachedIntersectableObjects(scene, filterMesh, cacheKey)
		} else {
			intersectableObjects = []
			scene.traverse((child) => {
				if (child.isMesh && child.visible && child.geometry && child.material && filterMesh(child)) {
					intersectableObjects.push(child)
				}
			})
		}

		// Early exit if no objects to test
		if (intersectableObjects.length === 0) {
			return null
		}

		// Perform raycasting
		const intersects = raycaster.intersectObjects(intersectableObjects, recursive)

		if (intersects.length > 0) {
			return intersects[0].point.clone()
		}

		return null

	} catch (error) {
		logError('modelScaleUtils', 'Failed to perform raycasting', error)
		return null
	}
}
