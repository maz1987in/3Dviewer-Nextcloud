/**
 * Thumbnail capture composable
 * Handles capturing and uploading thumbnails of 3D models
 */

import { ref } from 'vue'
import { logger } from '../utils/logger.js'
import { generateUrl } from '@nextcloud/router'

export function useThumbnailCapture() {
	// Thumbnail capture state
	const isCapturing = ref(false)
	const lastCapture = ref(null)

	/**
	 * Capture and upload thumbnail for a 3D model
	 * @param {THREE.WebGLRenderer} renderer - Three.js renderer
	 * @param {number} fileId - File ID to upload thumbnail for
	 * @param {object} options - Capture options
	 * @param {number} options.width - Thumbnail width (default: 512)
	 * @param {number} options.height - Thumbnail height (default: 512)
	 * @param {string} options.format - Image format ('png' or 'jpeg', default: 'png')
	 * @param {number} options.quality - JPEG quality (0-1, default: 0.9)
	 * @return {Promise<boolean>} Success status
	 */
	const captureAndUpload = async (renderer, fileId, options = {}) => {
		if (!renderer || !renderer.domElement) {
			logger.error('useThumbnailCapture', 'Invalid renderer provided')
			return false
		}

		if (!fileId || fileId <= 0) {
			logger.error('useThumbnailCapture', 'Invalid file ID provided')
			return false
		}

		if (isCapturing.value) {
			logger.warn('useThumbnailCapture', 'Thumbnail capture already in progress')
			return false
		}

		isCapturing.value = true
		logger.info('useThumbnailCapture', 'Starting thumbnail capture', { fileId, options })

		try {
			const {
				width = 512,
				height = 512,
				format = 'png',
				quality = 0.9,
			} = options

			// Validate format
			const validFormats = ['png', 'jpeg', 'jpg']
			const imageFormat = validFormats.includes(format.toLowerCase()) ? format.toLowerCase() : 'png'
			const mimeType = imageFormat === 'png' ? 'image/png' : 'image/jpeg'

			// Get the canvas
			const canvas = renderer.domElement

			// Create thumbnail canvas at specified size
			const thumbnailCanvas = await resizeCanvas(canvas, width, height)

			// Convert canvas to blob
			const blob = await new Promise((resolve, reject) => {
				try {
					thumbnailCanvas.toBlob(
						(blob) => {
							if (blob) {
								resolve(blob)
							} else {
								reject(new Error('Failed to create blob from canvas'))
							}
						},
						mimeType,
						quality,
					)
				} catch (error) {
					reject(error)
				}
			})

			// Upload thumbnail to server
			const success = await uploadThumbnail(blob, fileId, mimeType)

			if (success) {
				lastCapture.value = {
					fileId,
					blob,
					timestamp: new Date(),
					format: imageFormat,
					size: blob.size,
				}

				logger.info('useThumbnailCapture', 'Thumbnail captured and uploaded successfully', {
					fileId,
					format: imageFormat,
					size: blob.size,
					width,
					height,
				})
			}

			return success
		} catch (error) {
			logger.error('useThumbnailCapture', 'Failed to capture and upload thumbnail', error)
			return false
		} finally {
			isCapturing.value = false
		}
	}

	/**
	 * Resize canvas to specific dimensions
	 * @param {HTMLCanvasElement} sourceCanvas - Source canvas
	 * @param {number} width - Target width
	 * @param {number} height - Target height
	 * @return {HTMLCanvasElement} Resized canvas
	 */
	const resizeCanvas = (sourceCanvas, width, height) => {
		const tempCanvas = document.createElement('canvas')
		tempCanvas.width = width
		tempCanvas.height = height

		const ctx = tempCanvas.getContext('2d')
		ctx.drawImage(sourceCanvas, 0, 0, width, height)

		return tempCanvas
	}

	/**
	 * Upload thumbnail blob to server
	 * @param {Blob} blob - Thumbnail blob
	 * @param {number} fileId - File ID
	 * @param {string} mimeType - MIME type
	 * @return {Promise<boolean>} Success status
	 */
	const uploadThumbnail = async (blob, fileId, mimeType) => {
		try {
			const url = generateUrl(`/apps/threedviewer/api/thumbnail/${fileId}`)

			// Convert blob to base64 data URL for upload
			const base64DataUrl = await blobToBase64(blob)

			// Send base64 data URL in request body
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'text/plain',
				},
				body: base64DataUrl,
			})

			if (!response.ok) {
				const errorText = await response.text()
				logger.warn('useThumbnailCapture', 'Upload failed', {
					status: response.status,
					statusText: response.statusText,
					error: errorText,
				})
				return false
			}

			logger.info('useThumbnailCapture', 'Thumbnail uploaded successfully', { fileId })
			return true
		} catch (error) {
			logger.error('useThumbnailCapture', 'Failed to upload thumbnail', error)
			return false
		}
	}

	/**
	 * Convert blob to base64 string
	 * @param {Blob} blob - Blob to convert
	 * @return {Promise<string>} Base64 string
	 */
	const blobToBase64 = (blob) => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => {
				const base64 = reader.result
				resolve(base64)
			}
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	}

	/**
	 * Cleanup thumbnail capture resources
	 */
	const cleanup = () => {
		if (lastCapture.value?.blob) {
			lastCapture.value = null
		}
		logger.info('useThumbnailCapture', 'Thumbnail capture resources cleaned up')
	}

	return {
		// State
		isCapturing,
		lastCapture,

		// Methods
		captureAndUpload,
		cleanup,
	}
}
