/**
 * Slicer Integration composable for sending 3D models to slicer applications
 * Supports URL schemes and fallback STL downloads for popular 3D printing slicers
 */

import { ref, readonly } from 'vue'
import { imagePath } from '@nextcloud/router'
import { logger } from '../utils/logger.js'

// Slicer configuration with URL schemes and metadata
// Generate slicer configs using Nextcloud's imagePath helper
// This ensures correct paths in all environments (local, production, subdirectory installations)
const SLICER_CONFIGS = [
	{
		id: 'prusaslicer',
		name: 'PrusaSlicer',
		icon: imagePath('threedviewer', 'slicers/prusaslicer.png'),
		urlScheme: 'prusaslicer',
		description: 'Open-source slicer from Prusa Research',
		supportLevel: 'full', // full, partial, download-only
		color: '#FA6831', // Prusa orange
	},
	{
		id: 'cura',
		name: 'UltiMaker Cura',
		icon: imagePath('threedviewer', 'slicers/cura.png'),
		urlScheme: 'cura',
		description: 'Popular open-source slicer',
		supportLevel: 'full',
		color: '#0E8EE9', // Cura blue
	},
	{
		id: 'bambu',
		name: 'BambuStudio',
		icon: imagePath('threedviewer', 'slicers/bambu.png'),
		urlScheme: 'bambustudio',
		description: 'Slicer for Bambu Lab printers',
		supportLevel: 'full',
		color: '#00AE42', // Bambu green
	},
	{
		id: 'orca',
		name: 'OrcaSlicer',
		icon: imagePath('threedviewer', 'slicers/orca.png'),
		urlScheme: 'orcaslicer',
		description: 'Fork of BambuStudio with advanced features',
		supportLevel: 'full',
		color: '#7B2CBF', // Orca purple
	},
	{
		id: 'simplify3d',
		name: 'Simplify3D',
		icon: imagePath('threedviewer', 'slicers/simplify3d.png'),
		urlScheme: 'simplify3d',
		description: 'Professional 3D printing software',
		supportLevel: 'partial',
		color: '#E85D25', // Simplify3D orange-red
	},
	{
		id: 'eufystudio',
		name: 'Eufy Studio',
		icon: imagePath('threedviewer', 'slicers/eufystudio.png'),
		urlScheme: 'eufystudio',
		description: 'Slicer for Eufy 3D printers',
		supportLevel: 'full',
		color: '#E91E63', // Eufy pink
	},
	{
		id: 'anycubicslicer',
		name: 'AnycubicSlicer',
		icon: imagePath('threedviewer', 'slicers/anycubicslicer.png'),
		urlScheme: 'anycubicslicer',
		description: 'Slicer for Anycubic 3D printers',
		supportLevel: 'full',
		color: '#FF6B00', // Anycubic orange
	},
]

export function useSlicerIntegration() {
	// State
	const processing = ref(false)
	const lastUsedSlicer = ref(null)
	const error = ref(null)

	/**
	 * Get all available slicer configurations
	 * @returns {Array} Array of slicer configurations
	 */
	const getSlicers = () => {
		return SLICER_CONFIGS
	}

	/**
	 * Get slicer configuration by ID
	 * @param {string} slicerId - Slicer ID
	 * @returns {Object|null} Slicer configuration or null
	 */
	const getSlicerById = (slicerId) => {
		return SLICER_CONFIGS.find(s => s.id === slicerId) || null
	}

	/**
	 * Load last used slicer from localStorage
	 */
	const loadLastUsedSlicer = () => {
		try {
			const saved = localStorage.getItem('3dviewer-last-slicer')
			if (saved) {
				const slicerId = JSON.parse(saved)
				const slicer = getSlicerById(slicerId)
				if (slicer) {
					lastUsedSlicer.value = slicerId
					logger.info('useSlicerIntegration', 'Loaded last used slicer', { slicerId })
				}
			}
		} catch (e) {
			logger.warn('useSlicerIntegration', 'Failed to load last used slicer', e)
		}
	}

	/**
	 * Save last used slicer to localStorage
	 * @param {string} slicerId - Slicer ID
	 */
	const saveLastUsedSlicer = (slicerId) => {
		try {
			localStorage.setItem('3dviewer-last-slicer', JSON.stringify(slicerId))
			lastUsedSlicer.value = slicerId
			logger.info('useSlicerIntegration', 'Saved last used slicer', { slicerId })
		} catch (e) {
			logger.warn('useSlicerIntegration', 'Failed to save last used slicer', e)
		}
	}

	/**
	 * Check if browser supports File System Access API
	 * @returns {boolean} True if supported
	 */
	const supportsFileSystemAccess = () => {
		return 'showSaveFilePicker' in window
	}

	/**
	 * Check if browser supports custom URL schemes
	 * @returns {boolean} True if supported
	 */
	const supportsUrlSchemes = () => {
		// Most modern browsers support custom URL schemes
		// However, they may show security prompts
		return true
	}

	/**
	 * Save blob to local file system using File System Access API
	 * @param {Blob} blob - File blob to save
	 * @param {string} suggestedName - Suggested filename
	 * @returns {Promise<string|null>} File path or null if cancelled
	 */
	const saveToLocalFileSystem = async (blob, suggestedName) => {
		if (!supportsFileSystemAccess()) {
			logger.warn('useSlicerIntegration', 'File System Access API not supported')
			return null
		}

		try {
			// Show save file picker
			const handle = await window.showSaveFilePicker({
				suggestedName: suggestedName,
				types: [
					{
						description: 'STL Files',
						accept: {
							'application/octet-stream': ['.stl'],
						},
					},
				],
			})

			// Write the file
			const writable = await handle.createWritable()
			await writable.write(blob)
			await writable.close()

			// Get the file path (this varies by browser)
			// Note: For security, browsers don't expose full file paths
			// We can only get the file name, not the full path
			logger.info('useSlicerIntegration', 'File saved to local file system', { name: handle.name })

			// Return the file handle for later use
			return handle

		} catch (error) {
			if (error.name === 'AbortError') {
				logger.info('useSlicerIntegration', 'User cancelled file save')
				return null
			}
			logger.error('useSlicerIntegration', 'Failed to save to file system', error)
			throw error
		}
	}

	/**
	 * Attempt to open file in slicer using URL scheme
	 * @param {string} slicerId - Slicer ID
	 * @param {string} filePath - Path or URL to the STL file
	 * @returns {Promise<boolean>} True if successful, false if needs fallback
	 */
	const openInSlicer = async (slicerId, filePath) => {
		const slicer = getSlicerById(slicerId)
		if (!slicer) {
			logger.error('useSlicerIntegration', 'Unknown slicer', { slicerId })
			return false
		}

		if (!supportsUrlSchemes() || slicer.supportLevel === 'download-only') {
			logger.info('useSlicerIntegration', 'URL schemes not supported, using download fallback')
			return false
		}

		processing.value = true
		error.value = null

		// Construct URL scheme based on slicer
		let url
		switch (slicerId) {
		case 'prusaslicer':
			// PrusaSlicer: prusaslicer://open?file=path
			url = `${slicer.urlScheme}://open?file=${encodeURIComponent(filePath)}`
			break
		case 'cura':
			// Cura: cura://open?file=path
			url = `${slicer.urlScheme}://open?file=${encodeURIComponent(filePath)}`
			break
		case 'bambu':
			// BambuStudio: bambustudio://open?file=path
			url = `${slicer.urlScheme}://open?file=${encodeURIComponent(filePath)}`
			break
		case 'orca':
			// OrcaSlicer: orcaslicer://open?file=path
			url = `${slicer.urlScheme}://open?file=${encodeURIComponent(filePath)}`
			break
		case 'simplify3d':
			// Simplify3D: simplify3d://import?file=path
			url = `${slicer.urlScheme}://import?file=${encodeURIComponent(filePath)}`
			break
		case 'eufystudio':
			// EufyStudio: eufystudio://open/?file=url&name=filename
			// Extract clean filename from URL query parameter if present
			const fileName = filePath.split('/').pop()
			const filenameMatch = fileName.match(/filename=([^&]+)/)
			if (filenameMatch) {
				url = `${slicer.urlScheme}://open/?file=${encodeURIComponent(filePath)}&name=${encodeURIComponent(decodeURIComponent(filenameMatch[1]))}`
			} else {
				url = `${slicer.urlScheme}://open/?file=${encodeURIComponent(filePath)}&name=${encodeURIComponent(fileName)}`
			}
			break
		case 'anycubicslicer':
			// AnycubicSlicer: anycubicslicer://open?file=path
			url = `${slicer.urlScheme}://open?file=${encodeURIComponent(filePath)}`
			break
		default:
			// Generic format
			url = `${slicer.urlScheme}://open?file=${encodeURIComponent(filePath)}`
		}

		logger.info('useSlicerIntegration', 'Attempting to open in slicer', { slicerId, url })

		// Try to open the URL scheme
		// Note: Modern browsers may block this or show a permission dialog
		try {
			// Set up timeout to detect if URL scheme failed
			let schemeCheckTimeout
			let hasFocusLost = false
			
			const focusLostHandler = () => {
				hasFocusLost = true
				clearTimeout(schemeCheckTimeout)
			}
			
			window.addEventListener('blur', focusLostHandler, { once: true })
			
			// If window doesn't lose focus in 2 seconds, scheme likely failed
			schemeCheckTimeout = setTimeout(() => {
				window.removeEventListener('blur', focusLostHandler)
				if (!hasFocusLost) {
					// URL scheme not registered - show error
					error.value = `${slicer.name} is not installed or registered on your system. Please install ${slicer.name} and try again, or use the download button to save the file manually.`
					processing.value = false
					logger.warn('useSlicerIntegration', 'URL scheme not registered', { slicerId, slicer: slicer.name })
				}
			}, 2000)
			
			window.location.href = url
			
			// Save as last used slicer (only if it might have worked)
			setTimeout(() => {
				if (hasFocusLost) {
					saveLastUsedSlicer(slicerId)
				}
			}, 100)
			
			processing.value = false
			return true
		} catch (e) {
			logger.error('useSlicerIntegration', 'Failed to open URL scheme', e)
			error.value = `Failed to open ${slicer.name}: ${e.message}`
			processing.value = false
			return false
		}
	}

	/**
	 * Create a temporary blob URL for the STL file
	 * @param {Blob} blob - STL file blob
	 * @returns {string} Blob URL
	 */
	const createBlobUrl = (blob) => {
		return URL.createObjectURL(blob)
	}

	/**
	 * Revoke a blob URL to free memory
	 * @param {string} url - Blob URL to revoke
	 */
	const revokeBlobUrl = (url) => {
		try {
			URL.revokeObjectURL(url)
		} catch (e) {
			logger.warn('useSlicerIntegration', 'Failed to revoke blob URL', e)
		}
	}

	/**
	 * Clear error state
	 */
	const clearError = () => {
		error.value = null
	}

	/**
	 * Reset state
	 */
	const reset = () => {
		processing.value = false
		error.value = null
	}

	// Load last used slicer on initialization
	loadLastUsedSlicer()

	return {
		// State (readonly)
		processing: readonly(processing),
		lastUsedSlicer: readonly(lastUsedSlicer),
		error: readonly(error),

		// Methods
		getSlicers,
		getSlicerById,
		supportsFileSystemAccess,
		supportsUrlSchemes,
		saveToLocalFileSystem,
		openInSlicer,
		createBlobUrl,
		revokeBlobUrl,
		saveLastUsedSlicer,
		clearError,
		reset,
	}
}

