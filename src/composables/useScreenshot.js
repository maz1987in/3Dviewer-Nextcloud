/**
 * Screenshot composable
 * Handles capturing and downloading screenshots of the 3D scene
 */

import { ref } from 'vue'
import { logger } from '../utils/logger.js'

export function useScreenshot() {
	// Screenshot state
	const isCapturing = ref(false)
	const lastScreenshot = ref(null)

	/**
	 * Capture screenshot from renderer
	 * @param {THREE.WebGLRenderer} renderer - Three.js renderer
	 * @param {object} options - Screenshot options
	 * @param {string} options.format - Image format ('png' or 'jpeg')
	 * @param {number} options.quality - JPEG quality (0-1)
	 * @param {number} options.width - Custom width (null for canvas size)
	 * @param {number} options.height - Custom height (null for canvas size)
	 * @param {string} options.filename - Custom filename
	 * @returns {Promise<Blob>} Screenshot blob
	 */
	const captureScreenshot = async (renderer, options = {}) => {
		if (!renderer || !renderer.domElement) {
			logger.error('useScreenshot', 'Invalid renderer provided')
			throw new Error('Renderer is required for screenshot')
		}

		if (isCapturing.value) {
			logger.warn('useScreenshot', 'Screenshot capture already in progress')
			return null
		}

		isCapturing.value = true
		logger.info('useScreenshot', 'Starting screenshot capture', options)

		try {
			const {
				format = 'png',
				quality = 0.95,
				width = null,
				height = null,
			} = options

			// Validate format
			const validFormats = ['png', 'jpeg', 'jpg']
			const imageFormat = validFormats.includes(format.toLowerCase()) ? format.toLowerCase() : 'png'
			const mimeType = imageFormat === 'png' ? 'image/png' : 'image/jpeg'

			// Get the canvas
			const canvas = renderer.domElement

			// If custom size requested, create a temporary canvas
			let sourceCanvas = canvas
			if (width && height) {
				sourceCanvas = await resizeCanvas(canvas, width, height)
			}

			// Convert canvas to blob
			const blob = await new Promise((resolve, reject) => {
				try {
					sourceCanvas.toBlob(
						(blob) => {
							if (blob) {
								resolve(blob)
							} else {
								reject(new Error('Failed to create blob from canvas'))
							}
						},
						mimeType,
						quality
					)
				} catch (error) {
					reject(error)
				}
			})

			lastScreenshot.value = {
				blob,
				url: URL.createObjectURL(blob),
				timestamp: new Date(),
				format: imageFormat,
				size: blob.size,
			}

			logger.info('useScreenshot', 'Screenshot captured successfully', {
				format: imageFormat,
				size: blob.size,
				width: sourceCanvas.width,
				height: sourceCanvas.height,
			})

			return blob
		} catch (error) {
			logger.error('useScreenshot', 'Failed to capture screenshot', error)
			throw error
		} finally {
			isCapturing.value = false
		}
	}

	/**
	 * Resize canvas to specific dimensions
	 * @param {HTMLCanvasElement} sourceCanvas - Source canvas
	 * @param {number} width - Target width
	 * @param {number} height - Target height
	 * @returns {HTMLCanvasElement} Resized canvas
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
	 * Download screenshot as file
	 * @param {Blob} blob - Screenshot blob
	 * @param {string} filename - Download filename
	 */
	const downloadScreenshot = (blob, filename = null) => {
		if (!blob) {
			logger.error('useScreenshot', 'No blob provided for download')
			throw new Error('Blob is required for download')
		}

		try {
			// Generate filename if not provided
			if (!filename) {
				const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
				const extension = blob.type === 'image/png' ? 'png' : 'jpg'
				filename = `3dviewer-screenshot-${timestamp}.${extension}`
			}

			// Create download link
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = filename
			link.style.display = 'none'

			// Trigger download
			document.body.appendChild(link)
			link.click()

			// Cleanup
			setTimeout(() => {
				document.body.removeChild(link)
				URL.revokeObjectURL(url)
			}, 100)

			logger.info('useScreenshot', 'Screenshot download triggered', { filename })
		} catch (error) {
			logger.error('useScreenshot', 'Failed to download screenshot', error)
			throw error
		}
	}

	/**
	 * Capture and download screenshot in one operation
	 * @param {THREE.WebGLRenderer} renderer - Three.js renderer
	 * @param {object} options - Screenshot options
	 * @returns {Promise<void>}
	 */
	const captureAndDownload = async (renderer, options = {}) => {
		try {
			const blob = await captureScreenshot(renderer, options)
			if (blob) {
				downloadScreenshot(blob, options.filename)
			}
		} catch (error) {
			logger.error('useScreenshot', 'Failed to capture and download screenshot', error)
			throw error
		}
	}

	/**
	 * Copy screenshot to clipboard (if supported)
	 * @param {Blob} blob - Screenshot blob
	 * @returns {Promise<boolean>} Success status
	 */
	const copyToClipboard = async (blob) => {
		if (!blob) {
			logger.error('useScreenshot', 'No blob provided for clipboard')
			return false
		}

		try {
			// Check if clipboard API is available
			if (!navigator.clipboard || !navigator.clipboard.write) {
				logger.warn('useScreenshot', 'Clipboard API not supported')
				return false
			}

			// Create clipboard item
			const clipboardItem = new ClipboardItem({
				[blob.type]: blob,
			})

			// Write to clipboard
			await navigator.clipboard.write([clipboardItem])
			logger.info('useScreenshot', 'Screenshot copied to clipboard')
			return true
		} catch (error) {
			logger.error('useScreenshot', 'Failed to copy screenshot to clipboard', error)
			return false
		}
	}

	/**
	 * Get data URL from blob
	 * @param {Blob} blob - Screenshot blob
	 * @returns {Promise<string>} Data URL
	 */
	const blobToDataURL = async (blob) => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	}

	/**
	 * Cleanup screenshot resources
	 */
	const cleanup = () => {
		if (lastScreenshot.value?.url) {
			URL.revokeObjectURL(lastScreenshot.value.url)
		}
		lastScreenshot.value = null
		logger.info('useScreenshot', 'Screenshot resources cleaned up')
	}

	return {
		// State
		isCapturing,
		lastScreenshot,

		// Methods
		captureScreenshot,
		downloadScreenshot,
		captureAndDownload,
		copyToClipboard,
		blobToDataURL,
		cleanup,
	}
}

