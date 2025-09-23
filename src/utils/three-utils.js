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
export function createGridHelper(size, divisions, options = {}) {
	const grid = new THREE.GridHelper(size, divisions)

	if (options.color) {
		grid.material.color.setHex(options.color)
	}
	if (options.opacity !== undefined) {
		grid.material.opacity = options.opacity
		grid.material.transparent = options.opacity < 1
	}

	return grid
}

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
