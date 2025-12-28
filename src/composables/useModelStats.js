/**
 * Model statistics composable
 * Analyzes and provides detailed statistics about 3D models
 */

import { ref, readonly } from 'vue'
import * as THREE from 'three'
import { logger } from '../utils/logger.js'
import { getBoundingInfo } from '../utils/three-utils.js'

export function useModelStats() {
	// State
	const modelStats = ref(null)
	const showStats = ref(false)

	/**
	 * Get unique materials from a 3D object
	 * @param {THREE.Object3D} object3D - Object to analyze
	 * @return {Array} Array of unique materials
	 */
	const getMaterials = (object3D) => {
		const materials = new Map()

		object3D.traverse((child) => {
			if (child.isMesh && child.material) {
				const mats = Array.isArray(child.material) ? child.material : [child.material]
				mats.forEach((mat) => {
					if (!materials.has(mat.uuid)) {
						materials.set(mat.uuid, {
							uuid: mat.uuid,
							name: mat.name || 'Unnamed',
							type: mat.type || 'Unknown',
						})
					}
				})
			}
		})

		return Array.from(materials.values())
	}

	/**
	 * Get textures and calculate memory usage
	 * @param {THREE.Object3D} object3D - Object to analyze
	 * @return {object} Texture information
	 */
	const getTextures = (object3D) => {
		const textures = new Map()
		let totalMemory = 0

		object3D.traverse((child) => {
			if (child.material) {
				const mats = Array.isArray(child.material) ? child.material : [child.material]
				mats.forEach((mat) => {
					// Check all material properties for textures
					Object.keys(mat).forEach((key) => {
						const value = mat[key]
						if (value && value.isTexture) {
							if (!textures.has(value.uuid)) {
								// Calculate texture memory
								const width = value.image?.width || 512
								const height = value.image?.height || 512
								const memory = width * height * 4 // RGBA = 4 bytes per pixel

								textures.set(value.uuid, {
									uuid: value.uuid,
									name: value.name || key,
									width,
									height,
									memory,
								})

								totalMemory += memory
							}
						}
					})
				})
			}
		})

		return {
			textures: Array.from(textures.values()),
			count: textures.size,
			memoryBytes: totalMemory,
			memoryMB: totalMemory / (1024 * 1024),
		}
	}

	/**
	 * Get geometry statistics
	 * @param {THREE.Object3D} object3D - Object to analyze
	 * @return {object} Geometry statistics
	 */
	const getGeometryStats = (object3D) => {
		let vertices = 0
		let faces = 0
		let meshes = 0

		object3D.traverse((child) => {
			if (child.isMesh) {
				meshes++
				if (child.geometry) {
					// Count vertices
					if (child.geometry.attributes.position) {
						vertices += child.geometry.attributes.position.count
					}

					// Count faces
					if (child.geometry.index) {
						faces += child.geometry.index.count / 3
					} else if (child.geometry.attributes.position) {
						faces += child.geometry.attributes.position.count / 3
					}
				}
			} else if (child.isLine) {
				// Count G-code or other line segments
				if (child.geometry && child.geometry.attributes.position) {
					vertices += child.geometry.attributes.position.count
				}
			}
		})

		return {
			vertices,
			faces: Math.floor(faces),
			meshes,
		}
	}

	/**
	 * Calculate volume of bounding box
	 * @param {THREE.Vector3} size - Bounding box size
	 * @return {number} Volume in cubic units
	 */
	const calculateVolume = (size) => {
		return size.x * size.y * size.z
	}

	/**
	 * Format bytes to human-readable string
	 * @param {number} bytes - Bytes to format
	 * @return {string} Formatted string
	 */
	const formatBytes = (bytes) => {
		if (bytes === 0) return '0 B'

		const k = 1024
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
		const i = Math.floor(Math.log(bytes) / Math.log(k))

		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
	}

	/**
	 * Analyze a 3D model and calculate all statistics
	 * @param {THREE.Object3D} object3D - Object to analyze
	 * @param {string} filename - Model filename
	 * @param {number} fileSize - File size in bytes
	 * @return {object} Complete statistics
	 */
	const analyzeModel = (object3D, filename = '', fileSize = 0) => {
		if (!object3D) {
			logger.warn('useModelStats', 'No object provided for analysis')
			return null
		}

		try {
			logger.info('useModelStats', 'Starting model analysis', { filename })

			// Get geometry statistics
			const geometryStats = getGeometryStats(object3D)

			// Get materials
			const materials = getMaterials(object3D)

			// Get textures
			const textureInfo = getTextures(object3D)

			// Get bounding box
			const boundingInfo = getBoundingInfo(object3D)
			const volume = calculateVolume(boundingInfo.size)

			// Extract file extension
			const format = filename.split('.').pop().toLowerCase()

			// Create statistics object
			const stats = {
				// Geometry
				vertices: geometryStats.vertices,
				faces: geometryStats.faces,
				meshes: geometryStats.meshes,

				// Materials
				materials: materials.slice(0, 10), // Limit to 10 for display
				materialCount: materials.length,

				// Textures
				textures: textureInfo.textures,
				textureCount: textureInfo.count,
				textureMemoryMB: textureInfo.memoryMB,

				// Dimensions
				boundingBox: {
					x: boundingInfo.size.x,
					y: boundingInfo.size.y,
					z: boundingInfo.size.z,
				},
				center: {
					x: boundingInfo.center.x,
					y: boundingInfo.center.y,
					z: boundingInfo.center.z,
				},
				volume,

				// File
				fileSize,
				fileSizeMB: fileSize / (1024 * 1024),
				format,
			}

			modelStats.value = stats

			logger.info('useModelStats', 'Model analysis complete', {
				vertices: stats.vertices,
				faces: stats.faces,
				materials: stats.materialCount,
				textures: stats.textureCount,
			})

			return stats
		} catch (error) {
			logger.error('useModelStats', 'Model analysis failed', error)
			return null
		}
	}

	/**
	 * Toggle statistics panel visibility
	 */
	const toggleStatsPanel = () => {
		showStats.value = !showStats.value
		logger.info('useModelStats', 'Statistics panel toggled', { visible: showStats.value })
	}

	/**
	 * Clear statistics
	 */
	const clearStats = () => {
		modelStats.value = null
		showStats.value = false
		logger.info('useModelStats', 'Statistics cleared')
	}

	return {
		// State (readonly)
		modelStats: readonly(modelStats),
		showStats: readonly(showStats),

		// Methods
		analyzeModel,
		getMaterials,
		getTextures,
		getGeometryStats,
		calculateVolume,
		formatBytes,
		toggleStatsPanel,
		clearStats,
	}
}
