/**
 * Texture optimization utility
 * Resizes and optimizes textures based on quality settings and device capabilities
 */

import { logger } from './logger.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'

/** Maximum texture resolution per quality level */
const QUALITY_MAX_RESOLUTION = {
	original: Infinity,
	high: 4096,
	medium: 2048,
	low: 1024,
}

/**
 * Get the current texture quality level from config
 * @return {string} Quality level: 'original', 'high', 'medium', 'low'
 */
export function getTextureQuality() {
	return VIEWER_CONFIG.textureOptimization?.quality || 'original'
}

/**
 * Get the max resolution for the current quality level
 * @param {string} [quality] - Override quality level
 * @return {number} Max resolution in pixels (width or height)
 */
export function getMaxResolution(quality) {
	const q = quality || getTextureQuality()
	return QUALITY_MAX_RESOLUTION[q] || Infinity
}

/**
 * Check if a texture needs downscaling
 * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
 * @param {string} [quality] - Override quality level
 * @return {boolean} True if the image exceeds the max resolution
 */
export function needsDownscale(image, quality) {
	if (!image || !image.width || !image.height) return false
	const maxRes = getMaxResolution(quality)
	return image.width > maxRes || image.height > maxRes
}

/**
 * Downscale a texture image using Canvas 2D
 * Returns the original image if no downscaling is needed.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
 * @param {string} [quality] - Override quality level
 * @return {HTMLCanvasElement|HTMLImageElement} Resized canvas or original image
 */
export function downscaleTexture(image, quality) {
	if (!needsDownscale(image, quality)) return image

	const maxRes = getMaxResolution(quality)
	const { width, height } = image
	const aspect = width / height

	let newW, newH
	if (width >= height) {
		newW = maxRes
		newH = Math.round(maxRes / aspect)
	} else {
		newH = maxRes
		newW = Math.round(maxRes * aspect)
	}

	const canvas = document.createElement('canvas')
	canvas.width = newW
	canvas.height = newH
	const ctx = canvas.getContext('2d')
	ctx.drawImage(image, 0, 0, newW, newH)

	logger.info('TextureOptimizer', `Downscaled ${width}x${height} → ${newW}x${newH}`)
	return canvas
}

/**
 * Optimize a Three.js texture in-place by downscaling its image
 * @param {THREE.Texture} texture - Texture to optimize
 * @param {object} THREE - Three.js namespace
 * @param {string} [quality] - Override quality level
 * @return {boolean} True if the texture was modified
 */
export function optimizeTexture(texture, THREE, quality) {
	if (!texture || !texture.image) return false
	if (!needsDownscale(texture.image, quality)) return false

	const original = texture.image
	texture.image = downscaleTexture(original, quality)
	texture.needsUpdate = true

	return true
}

/**
 * Optimize all textures on a Three.js object
 * @param {THREE.Object3D} object3D - Root object to traverse
 * @param {object} THREE - Three.js namespace
 * @param {string} [quality] - Override quality level
 * @return {{ optimized: number, skipped: number }} Counts
 */
export function optimizeAllTextures(object3D, THREE, quality) {
	const seen = new Set()
	let optimized = 0
	let skipped = 0

	const textureProps = [
		'map', 'normalMap', 'bumpMap', 'specularMap', 'emissiveMap',
		'aoMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'lightMap',
		'displacementMap', 'envMap',
	]

	object3D.traverse((child) => {
		if (!child.isMesh || !child.material) return
		const mats = Array.isArray(child.material) ? child.material : [child.material]

		for (const mat of mats) {
			for (const prop of textureProps) {
				const tex = mat[prop]
				if (!tex || seen.has(tex.uuid)) continue
				seen.add(tex.uuid)

				if (optimizeTexture(tex, THREE, quality)) {
					optimized++
				} else {
					skipped++
				}
			}
		}
	})

	if (optimized > 0) {
		logger.info('TextureOptimizer', `Optimized ${optimized} textures, skipped ${skipped}`)
	}

	return { optimized, skipped }
}

/**
 * Estimate VRAM usage for all textures on an object
 * @param {THREE.Object3D} object3D - Root object
 * @return {{ count: number, totalBytes: number, totalMB: string }} Texture memory stats
 */
export function estimateTextureMemory(object3D) {
	const seen = new Set()
	let totalBytes = 0
	let count = 0

	const textureProps = [
		'map', 'normalMap', 'bumpMap', 'specularMap', 'emissiveMap',
		'aoMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'lightMap',
		'displacementMap', 'envMap',
	]

	object3D.traverse((child) => {
		if (!child.isMesh || !child.material) return
		const mats = Array.isArray(child.material) ? child.material : [child.material]

		for (const mat of mats) {
			for (const prop of textureProps) {
				const tex = mat[prop]
				if (!tex || !tex.image || seen.has(tex.uuid)) continue
				seen.add(tex.uuid)

				const w = tex.image.width || 0
				const h = tex.image.height || 0
				// 4 bytes per pixel (RGBA), ~1.33x for mipmaps
				const bytes = w * h * 4 * 1.33
				totalBytes += bytes
				count++
			}
		}
	})

	return {
		count,
		totalBytes: Math.round(totalBytes),
		totalMB: (totalBytes / (1024 * 1024)).toFixed(1),
	}
}
