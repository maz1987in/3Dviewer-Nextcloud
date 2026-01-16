/**
 * Thumbnail capture composable
 * Handles capturing and uploading thumbnails of 3D models
 */

import { ref } from 'vue'
import { logger } from '../utils/logger.js'
import { generateUrl } from '@nextcloud/router'
import axios from '@nextcloud/axios'

export function useThumbnailCapture() {
	const isCapturing = ref(false)
	const lastCapture = ref(null)

	/**
	 * Capture and upload thumbnail for a 3D model
	 * @param {THREE.WebGLRenderer} renderer - Three.js renderer
	 * @param {number} fileId - File ID to upload thumbnail for
	 * @param {object} options - Capture options
	 * @returns {Promise<boolean>} Success status
	 */
	const captureAndUpload = async (renderer, fileId, options = {}) => {
		if (!renderer?.domElement || !fileId || fileId <= 0 || isCapturing.value) {
			return false
		}

		isCapturing.value = true

		try {
			const { width = 512, height = 512, format = 'png', quality = 0.9 } = options
			const validFormats = ['png', 'jpeg', 'jpg']
			const imageFormat = validFormats.includes(format.toLowerCase()) ? format.toLowerCase() : 'png'
			const mimeType = imageFormat === 'png' ? 'image/png' : 'image/jpeg'

			const thumbnailCanvas = cropAndResizeCanvas(renderer.domElement, width, height)

			const blob = await new Promise((resolve, reject) => {
				thumbnailCanvas.toBlob(
					(blob) => blob ? resolve(blob) : reject(new Error('Failed to create blob')),
					mimeType,
					quality,
				)
			})

			const success = await uploadThumbnail(blob, fileId)

			if (success) {
				lastCapture.value = { fileId, blob, timestamp: new Date(), format: imageFormat, size: blob.size }
			}

			return success
		} catch (error) {
			logger.error('useThumbnailCapture', 'Failed to capture thumbnail', error)
			return false
		} finally {
			isCapturing.value = false
		}
	}

	/**
	 * Find the bounding box of non-background content in canvas
	 */
	const findContentBounds = (canvas, threshold = 10) => {
		const tempCanvas = document.createElement('canvas')
		tempCanvas.width = canvas.width
		tempCanvas.height = canvas.height
		const ctx = tempCanvas.getContext('2d')
		ctx.drawImage(canvas, 0, 0)

		const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height)
		const data = imageData.data
		const width = tempCanvas.width
		const height = tempCanvas.height

		let minX = width, minY = height, maxX = 0, maxY = 0

		// Get background color from corners
		const getPixel = (x, y) => {
			const i = (y * width + x) * 4
			return { r: data[i], g: data[i + 1], b: data[i + 2] }
		}

		const corners = [getPixel(0, 0), getPixel(width - 1, 0), getPixel(0, height - 1), getPixel(width - 1, height - 1)]
		const bgColor = {
			r: Math.round(corners.reduce((s, c) => s + c.r, 0) / 4),
			g: Math.round(corners.reduce((s, c) => s + c.g, 0) / 4),
			b: Math.round(corners.reduce((s, c) => s + c.b, 0) / 4),
		}

		// Scan for content that differs from background
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4
				const diff = Math.abs(data[i] - bgColor.r) + Math.abs(data[i + 1] - bgColor.g) + Math.abs(data[i + 2] - bgColor.b)
				if (diff > threshold) {
					minX = Math.min(minX, x)
					minY = Math.min(minY, y)
					maxX = Math.max(maxX, x)
					maxY = Math.max(maxY, y)
				}
			}
		}

		if (minX >= maxX || minY >= maxY) {
			return { x: 0, y: 0, width, height }
		}

		return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
	}

	/**
	 * Crop and resize canvas to focus on content
	 */
	const cropAndResizeCanvas = (sourceCanvas, width, height) => {
		const bounds = findContentBounds(sourceCanvas)

		// Add 10% padding
		const padding = Math.max(bounds.width, bounds.height) * 0.1
		const cropX = Math.max(0, bounds.x - padding)
		const cropY = Math.max(0, bounds.y - padding)
		const cropWidth = Math.min(sourceCanvas.width - cropX, bounds.width + padding * 2)
		const cropHeight = Math.min(sourceCanvas.height - cropY, bounds.height + padding * 2)

		// Make crop square
		const cropSize = Math.max(cropWidth, cropHeight)
		const centerX = cropX + cropWidth / 2
		const centerY = cropY + cropHeight / 2
		const squareCropX = Math.max(0, Math.min(sourceCanvas.width - cropSize, centerX - cropSize / 2))
		const squareCropY = Math.max(0, Math.min(sourceCanvas.height - cropSize, centerY - cropSize / 2))
		const finalCropSize = Math.min(cropSize, sourceCanvas.width - squareCropX, sourceCanvas.height - squareCropY)

		// Create output canvas
		const tempCanvas = document.createElement('canvas')
		tempCanvas.width = width
		tempCanvas.height = height
		const ctx = tempCanvas.getContext('2d')

		// Copy source to get background color (needed for WebGL canvases)
		const copyCanvas = document.createElement('canvas')
		copyCanvas.width = sourceCanvas.width
		copyCanvas.height = sourceCanvas.height
		const copyCtx = copyCanvas.getContext('2d')
		copyCtx.drawImage(sourceCanvas, 0, 0)

		// Fill with background color
		const bgPixel = copyCtx.getImageData(0, 0, 1, 1).data
		ctx.fillStyle = `rgb(${bgPixel[0]}, ${bgPixel[1]}, ${bgPixel[2]})`
		ctx.fillRect(0, 0, width, height)

		// Draw cropped content
		ctx.drawImage(sourceCanvas, squareCropX, squareCropY, finalCropSize, finalCropSize, 0, 0, width, height)

		return tempCanvas
	}

	/**
	 * Upload thumbnail blob to server
	 */
	const uploadThumbnail = async (blob, fileId) => {
		try {
			const url = generateUrl(`/apps/threedviewer/api/thumbnail/${fileId}`)
			const base64DataUrl = await blobToBase64(blob)

			const response = await axios.post(url, base64DataUrl, {
				headers: { 'Content-Type': 'text/plain' },
			})

			return response.status >= 200 && response.status < 300
		} catch (error) {
			logger.error('useThumbnailCapture', 'Upload failed', error)
			return false
		}
	}

	/**
	 * Convert blob to base64 string
	 */
	const blobToBase64 = (blob) => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	}

	/**
	 * Cleanup thumbnail capture resources
	 */
	const cleanup = () => {
		lastCapture.value = null
	}

	return {
		isCapturing,
		lastCapture,
		captureAndUpload,
		cleanup,
	}
}
