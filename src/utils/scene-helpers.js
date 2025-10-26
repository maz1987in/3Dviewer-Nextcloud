/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Scene utility helpers for Three.js scene management
 * Provides utilities for removing objects by userData properties
 */

/**
 * Remove placeholder objects from scene
 * @param {THREE.Scene} scene - Scene to clean
 * @return {number} Number of placeholders removed
 */
export function removePlaceholders(scene) {
	if (!scene || !scene.children) {
		return 0
	}

	const placeholders = scene.children.filter(c => c.userData?.isPlaceholder)
	placeholders.forEach(p => scene.remove(p))

	return placeholders.length
}

/**
 * Remove objects from scene by userData key-value pair
 * @param {THREE.Scene} scene - Scene to clean
 * @param {string} key - userData key to match
 * @param {*} value - userData value to match (optional, matches any truthy if not provided)
 * @return {number} Number of objects removed
 */
export function removeByUserData(scene, key, value = undefined) {
	if (!scene || !scene.children) {
		return 0
	}

	const matching = scene.children.filter(c => {
		if (value === undefined) {
			// If no value provided, match any truthy value for the key
			return c.userData?.[key]
		}
		// Match specific value
		return c.userData?.[key] === value
	})

	matching.forEach(obj => scene.remove(obj))

	return matching.length
}

/**
 * Find objects in scene by userData key-value pair
 * @param {THREE.Scene} scene - Scene to search
 * @param {string} key - userData key to match
 * @param {*} value - userData value to match (optional, matches any truthy if not provided)
 * @return {THREE.Object3D[]} Array of matching objects
 */
export function findByUserData(scene, key, value = undefined) {
	if (!scene || !scene.children) {
		return []
	}

	return scene.children.filter(c => {
		if (value === undefined) {
			return c.userData?.[key]
		}
		return c.userData?.[key] === value
	})
}

/**
 * Clear all objects from scene (except camera)
 * @param {THREE.Scene} scene - Scene to clear
 * @return {number} Number of objects removed
 */
export function clearScene(scene) {
	if (!scene || !scene.children) {
		return 0
	}

	const count = scene.children.length

	// Remove all children (iterate backwards to avoid index issues)
	for (let i = scene.children.length - 1; i >= 0; i--) {
		const child = scene.children[i]
		// Don't remove cameras
		if (!child.isCamera) {
			scene.remove(child)
		}
	}

	return count
}

/**
 * Count objects in scene by type
 * @param {THREE.Scene} scene - Scene to analyze
 * @return {object} Object with counts by type
 */
export function countObjectsByType(scene) {
	if (!scene) {
		return {}
	}

	const counts = {}

	scene.traverse((object) => {
		const type = object.type || 'Unknown'
		counts[type] = (counts[type] || 0) + 1
	})

	return counts
}

/**
 * Get all meshes from scene
 * @param {THREE.Scene} scene - Scene to search
 * @return {THREE.Mesh[]} Array of meshes
 */
export function getAllMeshes(scene) {
	if (!scene) {
		return []
	}

	const meshes = []
	scene.traverse((object) => {
		if (object.isMesh) {
			meshes.push(object)
		}
	})

	return meshes
}

/**
 * Get all lights from scene
 * @param {THREE.Scene} scene - Scene to search
 * @return {THREE.Light[]} Array of lights
 */
export function getAllLights(scene) {
	if (!scene) {
		return []
	}

	const lights = []
	scene.traverse((object) => {
		if (object.isLight) {
			lights.push(object)
		}
	})

	return lights
}
