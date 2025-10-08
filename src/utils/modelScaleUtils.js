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
 * @param {Object} options - Configuration options
 * @param {number} options.percentage - Percentage of model size (default: 0.01 = 1%)
 * @param {number} options.minScale - Minimum scale value (default: 0.5)
 * @param {number} options.maxScale - Maximum scale value (default: 10)
 * @param {string[]} options.excludeNames - Mesh names to exclude from calculation
 * @returns {number} Calculated scale factor
 */
export function calculateModelScale(scene, options = {}) {
	const {
		percentage = 0.01,
		minScale = 0.5,
		maxScale = 10,
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
 * @returns {boolean} True if mesh should be excluded
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
 * @param {Object} options - Configuration options
 * @param {number} options.width - Canvas width (default: 512)
 * @param {number} options.height - Canvas height (default: 128)
 * @param {string} options.textColor - Text color (default: '#ffffff')
 * @param {string} options.bgColor - Background color (default: 'rgba(0, 0, 0, 0.8)')
 * @param {number} options.fontSize - Font size in pixels (default: 48)
 * @param {string} options.fontFamily - Font family (default: 'Arial')
 * @returns {THREE.CanvasTexture} Canvas texture for use in materials
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
