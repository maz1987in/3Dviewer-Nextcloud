/**
 * Model scale utilities
 * Shared functions for calculating visual scale based on model bounding box
 */

import * as THREE from 'three'
import { logError } from './error-handler.js'

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
			if (child.isMesh && !shouldExcludeMesh(child, excludeNames)) {
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
 * @param {string} options.textColor - Text color (default: '#ffffff')
 * @param {string} options.bgColor - Background color (default: 'rgba(0, 0, 0, 0.8)')
 * @param {number} options.fontSize - Font size in pixels (default: 48)
 * @param {string} options.fontFamily - Font family (default: 'Arial')
 * @return {THREE.CanvasTexture} Canvas texture for use in materials
 */
export function createTextTexture(text, options = {}) {
	const {
		width = 512,
		height = 128,
		textColor = '#ffffff',
		bgColor = 'rgba(0, 0, 0, 0.8)',
		fontSize = 48,
		fontFamily = 'Arial',
	} = options

	try {
		// Create canvas
		const canvas = document.createElement('canvas')
		const context = canvas.getContext('2d')
		canvas.width = width
		canvas.height = height

		// Draw background
		context.fillStyle = bgColor
		context.fillRect(0, 0, width, height)

		// Draw text
		context.fillStyle = textColor
		context.font = `bold ${fontSize}px ${fontFamily}`
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		context.fillText(text, width / 2, height / 2)

		// Create texture
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
 * @param {number} options.color - Sphere color as hex (default: 0xffff00 yellow)
 * @param {number} options.sizeMultiplier - Size multiplier (default: 2)
 * @param {number} options.opacity - Material opacity (default: 0.9)
 * @param {number} options.renderOrder - Render order (default: 999)
 * @param {string} options.name - Mesh name (default: 'markerSphere')
 * @return {THREE.Mesh} Sphere mesh ready to add to scene
 */
export function createMarkerSphere(position, options = {}) {
	const {
		scale = 1,
		color = 0xffff00,
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
 * @param {string} options.textColor - Text color (default: '#ffffff')
 * @param {string} options.bgColor - Background color (default: 'rgba(0, 0, 0, 0.8)')
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
		textColor = '#ffffff',
		bgColor = 'rgba(0, 0, 0, 0.8)',
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

		// Calculate dimensions proportionally to model size
		// For all models, use the calculated dimensions directly for proportional sizing
		const calculatedWidth = scale * widthMultiplier
		const calculatedHeight = scale * heightMultiplier

		// Use calculated dimensions directly (no caps) for proportional sizing
		const textWidth = calculatedWidth
		const textHeight = calculatedHeight

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
