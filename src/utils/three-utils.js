/**
 * Three.js utility functions for common object creation and manipulation
 */

import * as THREE from 'three'

/**
 * Create a standard material with consistent defaults
 * @param {object} options - Material options
 * @param {number} options.color - Material color (hex)
 * @param {number} options.metalness - Metalness value (0-1)
 * @param {number} options.roughness - Roughness value (0-1)
 * @param {boolean} options.doubleSide - Enable double-sided rendering
 * @param {number} options.opacity - Material opacity (0-1)
 * @param {boolean} options.transparent - Enable transparency
 * @return {THREE.Material} Configured material
 */
export function createStandardMaterial(options = {}) {
	const defaults = {
		color: 0x888888,
		metalness: 0.1,
		roughness: 0.8,
		side: options.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
		opacity: options.opacity || 1.0,
		transparent: options.transparent || false,
	}

	return new THREE.MeshStandardMaterial({ ...defaults, ...options })
}

/**
 * Create a basic material for simple objects
 * @param {object} options - Material options
 * @return {THREE.Material} Configured material
 */
export function createBasicMaterial(options = {}) {
	const defaults = {
		color: 0x666666,
		transparent: true,
		opacity: 0.6,
	}

	return new THREE.MeshBasicMaterial({ ...defaults, ...options })
}

/**
 * Calculate bounding box for an object
 * @param {THREE.Object3D} object3D - Three.js object
 * @return {object} Bounding box data
 */
export function calculateBoundingBox(object3D) {
	const box = new THREE.Box3().setFromObject(object3D)
	const center = box.getCenter(new THREE.Vector3())
	const size = box.getSize(new THREE.Vector3())

	return {
		box,
		center,
		size,
		isEmpty: box.isEmpty(),
	}
}

/**
 * Center an object at the origin
 * @param {THREE.Object3D} object3D - Three.js object to center
 * @return {THREE.Vector3} Original center position
 */
export function centerObject(object3D) {
	const { center } = calculateBoundingBox(object3D)
	object3D.position.sub(center)
	return center
}

/**
 * Create geometry with consistent error handling
 * @param {string} type - Geometry type
 * @param {object} options - Geometry options
 * @return {THREE.BufferGeometry} Created geometry
 */
export function createGeometry(type, options = {}) {
	try {
		switch (type.toLowerCase()) {
		case 'box':
			return new THREE.BoxGeometry(
				options.width || 1,
				options.height || 1,
				options.depth || 1,
			)
		case 'sphere':
			return new THREE.SphereGeometry(
				options.radius || 1,
				options.widthSegments || 32,
				options.heightSegments || 16,
			)
		case 'plane':
			return new THREE.PlaneGeometry(
				options.width || 1,
				options.height || 1,
			)
		default:
			throw new Error(`Unsupported geometry type: ${type}`)
		}
	} catch (error) {
		throw new Error(`Failed to create ${type} geometry: ${error.message}`)
	}
}

/**
 * Create a mesh with geometry and material
 * @param {THREE.BufferGeometry} geometry - Geometry
 * @param {THREE.Material} material - Material
 * @param {object} options - Additional options
 * @return {THREE.Mesh} Created mesh
 */
export function createMesh(geometry, material, options = {}) {
	const mesh = new THREE.Mesh(geometry, material)

	if (options.position) {
		mesh.position.copy(options.position)
	}
	if (options.rotation) {
		mesh.rotation.copy(options.rotation)
	}
	if (options.scale) {
		mesh.scale.copy(options.scale)
	}

	return mesh
}

/**
 * Apply wireframe mode to an object and its children
 * @param {THREE.Object3D} object3D - Object to apply wireframe to
 * @param {boolean} enabled - Whether to enable wireframe
 */
export function applyWireframe(object3D, enabled) {
	object3D.traverse((child) => {
		if (child.isMesh && child.material) {
			if (Array.isArray(child.material)) {
				child.material.forEach(mat => {
					mat.wireframe = enabled
				})
			} else {
				child.material.wireframe = enabled
			}
		}
	})
}

/**
 * Dispose of Three.js objects to prevent memory leaks
 * @param {THREE.Object3D} object3D - Object to dispose
 */
export function disposeObject(object3D) {
	object3D.traverse((child) => {
		if (child.geometry) {
			child.geometry.dispose()
		}
		if (child.material) {
			if (Array.isArray(child.material)) {
				child.material.forEach(mat => mat.dispose())
			} else {
				child.material.dispose()
			}
		}
	})
}

/**
 * Create a grid helper with consistent styling
 * @param {number} size - Grid size
 * @param {number} divisions - Number of divisions
 * @param {object} options - Grid options
 * @return {THREE.GridHelper} Grid helper
 */
/**
 * Create a grid helper with consistent styling
 * @param {number} size - Grid size
 * @param {number} divisions - Number of divisions
 * @param {object} options - Grid options
 * @return {THREE.GridHelper} Grid helper
 */
export function createGridHelper(size = 10, divisions = 10, options = {}) {
	const {
		colorCenterLine = 0x444444,
		colorGrid = 0x888888,
		visible = true,
	} = options

	const grid = new THREE.GridHelper(size, divisions, colorCenterLine, colorGrid)
	grid.visible = visible
	grid.userData.isHelper = true

	return grid
}

/**
 * Get comprehensive bounding box information for an object
 * @param {THREE.Object3D} object3D - Object to analyze
 * @param {THREE.Box3} [existingBox] - Optional existing Box3 to reuse
 * @return {object} Bounding box information
 */
export function getBoundingInfo(object3D, existingBox = null) {
	const box = existingBox || new THREE.Box3()
	box.setFromObject(object3D)

	const size = new THREE.Vector3()
	const center = new THREE.Vector3()

	box.getSize(size)
	box.getCenter(center)

	const maxDimension = Math.max(size.x, size.y, size.z)
	const minDimension = Math.min(size.x, size.y, size.z)
	const volume = size.x * size.y * size.z
	const diagonalLength = size.length()

	return {
		box,
		size,
		center,
		maxDimension,
		minDimension,
		volume,
		diagonalLength,
		isEmpty: box.isEmpty(),
		min: box.min.clone(),
		max: box.max.clone(),
	}
}

/**
 * Create axes helper with consistent styling
 * @param {number} size - Axes size
 * @param {object} options - Axes options
 * @return {THREE.AxesHelper} Axes helper
 */

/**
 * Create axes helper with consistent styling
 * @param {number} size - Axes size
 * @param {object} options - Axes options
 * @return {THREE.AxesHelper} Axes helper
 */
export function createAxesHelper(size, options = {}) {
	return new THREE.AxesHelper(size)
}

/**
 * Create a bounding box helper for debugging
 * @param {THREE.Object3D} object3D - Object to create bounding box for
 * @param {object} options - Helper options
 * @return {THREE.Box3Helper} Bounding box helper
 */
export function createBoundingBoxHelper(object3D, options = {}) {
	const { box } = calculateBoundingBox(object3D)
	const helper = new THREE.Box3Helper(box, options.color || 0x00ff00)
	return helper
}

/**
 * Create placeholder material for progressive loading
 * @param {THREE.Material} originalMaterial - Original material
 * @return {THREE.Material} Placeholder material
 */
export function createPlaceholderMaterial(originalMaterial) {
	if (!originalMaterial) {
		return createStandardMaterial({ color: 0xcccccc })
	}

	const placeholder = originalMaterial.clone()

	// Remove all texture maps
	placeholder.map = null
	placeholder.normalMap = null
	placeholder.specularMap = null
	placeholder.emissiveMap = null
	placeholder.bumpMap = null
	placeholder.roughnessMap = null
	placeholder.metalnessMap = null
	placeholder.alphaMap = null
	placeholder.aoMap = null

	// Use material color or default gray
	if (!placeholder.color || placeholder.color.getHex() === 0x000000) {
		placeholder.color.setHex(0xcccccc)
	}

	// Increase roughness for better visibility without textures
	if (placeholder.roughness !== undefined) {
		placeholder.roughness = 0.8
	}

	// Ensure material updates
	placeholder.needsUpdate = true

	return placeholder
}

/**
 * Apply texture to material progressively
 * @param {THREE.Material} material - Target material
 * @param {string} propertyName - Texture property ('map', 'normalMap', etc.)
 * @param {THREE.Texture} texture - Loaded texture
 */
export function applyTextureToMaterial(material, propertyName, texture) {
	if (!material || !propertyName || !texture) {
		return
	}

	material[propertyName] = texture
	material.needsUpdate = true

	// Adjust material properties when texture is applied
	if (propertyName === 'map') {
		// Reduce roughness when diffuse map is applied (for more realistic look)
		if (material.roughness !== undefined && material.roughness > 0.5) {
			material.roughness = 0.5
		}
	}

	logger.info('three-utils', 'Texture applied to material', {
		propertyName,
		materialName: material.name || 'unnamed',
	})
}
