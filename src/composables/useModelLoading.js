/**
 * Model loading and file handling composable
 * Handles model loading, file processing, and error management
 */

import { ref, computed } from 'vue'
import * as THREE from 'three'
import { loadModelByExtension, isSupportedExtension } from '../loaders/registry.js'
import { loadModelWithDependencies } from '../loaders/multiFileHelpers.js'
import { createErrorState } from '../utils/error-handler.js'
import { logger } from '../utils/logger.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { LOADING_STAGES } from '../constants/index.js'
import { disposeObject } from '../utils/three-utils.js'

export function useModelLoading() {
	// Loading state
	const loading = ref(false)
	const progress = ref({
		loaded: 0,
		total: 0,
		message: null,
		stage: null,
		percentage: 0,
		estimatedTimeRemaining: null,
		speed: 0,
		startTime: null,
	})
	const retryCount = ref(0)
	const maxRetries = ref(VIEWER_CONFIG.limits.maxRetries)

	// Error state
	const error = ref(null)
	const errorState = ref(null)

	// Model state
	const modelRoot = ref(null)
	const currentFileId = ref(null)
	const abortController = ref(null)

	// Decoder availability
	const hasDraco = ref(false)
	const hasKtx2 = ref(false)
	const hasMeshopt = ref(false)

	// Computed properties
	const isLoading = computed(() => loading.value)
	const hasError = computed(() => error.value !== null)
	const canRetry = computed(() => retryCount.value < maxRetries.value && hasError.value)
	const progressPercentage = computed(() => {
		if (progress.value.total === 0) return 0
		return Math.round((progress.value.loaded / progress.value.total) * 100)
	})

	/**
	 * Initialize decoder availability
	 */
	const initDecoders = async () => {
		try {
			// Check DRACO availability
			try {
				await import('three/examples/jsm/loaders/DRACOLoader.js')
				hasDraco.value = true
			} catch (e) {
				hasDraco.value = false
			}

			// Check KTX2 availability
			try {
				await import('three/examples/jsm/loaders/KTX2Loader.js')
				hasKtx2.value = true
			} catch (e) {
				hasKtx2.value = false
			}

			// Check Meshopt availability (disabled due to CSP restrictions)
			try {
				// Meshopt decoder disabled due to CSP 'unsafe-eval' restrictions
				// await import('three/examples/jsm/libs/meshopt_decoder.module.js')
				hasMeshopt.value = false
			} catch (e) {
				hasMeshopt.value = false
			}

			logger.info('useModelLoading', 'Decoders initialized', {
				draco: hasDraco.value,
				ktx2: hasKtx2.value,
				meshopt: hasMeshopt.value,
			})
		} catch (error) {
			logger.error('useModelLoading', 'Failed to initialize decoders', error)
		}
	}

	/**
	 * Load model from file ID with multi-file support
	 * @param {number} fileId - File ID
	 * @param {string} filename - File name
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 * @throws {Error} If parameters are invalid or file format is unsupported
	 */
	const loadModelFromFileId = async (fileId, filename, context) => {
		// Input validation
		if (!fileId || (typeof fileId !== 'number' && typeof fileId !== 'string')) {
			logger.error('useModelLoading', 'Invalid file ID')
			throw new Error('Valid file ID is required')
		}
		if (!filename || typeof filename !== 'string') {
			logger.error('useModelLoading', 'Invalid filename')
			throw new Error('Valid filename is required')
		}
		if (!context) {
			logger.error('useModelLoading', 'Loading context is required')
			throw new Error('Loading context is required')
		}

		try {
			const extension = filename.split('.').pop().toLowerCase()

			if (!isSupportedExtension(extension)) {
				const error = new Error(`Unsupported file extension: ${extension}`)
				logger.error('useModelLoading', error.message)
				throw error
			}

			// Create abort controller for this load operation
			abortController.value = new AbortController()

			loading.value = true
			error.value = null
			errorState.value = null
			updateProgress(0, 0, LOADING_STAGES.INITIALIZING, 'Initializing model loading...')

			// Extract directory path for multi-file loading
			const dirPath = filename.substring(0, filename.lastIndexOf('/'))

			// Check if this is a multi-file format
			const isMultiFile = ['obj', 'gltf', 'fbx', '3ds', 'dae'].includes(extension)

			if (isMultiFile) {
				logger.info('useModelLoading', 'Multi-file format detected', { extension, fileId })

				try {
					// Update progress
					updateProgress(0, 0, LOADING_STAGES.DOWNLOADING, 'Loading model dependencies...')

					// Load model with dependencies
					const result = await loadModelWithDependencies(fileId, filename, extension, dirPath)

					logger.info('useModelLoading', 'Multi-file loading successful', {
						mainFile: result.mainFile.name,
						dependencies: result.dependencies.length,
					})

					// Update progress
					updateProgress(50, 100, LOADING_STAGES.PROCESSING, 'Processing model data...')

					// Convert main file to ArrayBuffer
					const arrayBuffer = await result.mainFile.arrayBuffer()

					// Prepare context with additional files
					const loadingContext = {
						...context,
						fileId,
						additionalFiles: result.dependencies,
						abortController: abortController.value,
						fileExtension: extension,
						updateProgress,
						hasDraco: hasDraco.value,
						hasKtx2: hasKtx2.value,
						hasMeshopt: hasMeshopt.value,
						progressive: true, // Enable progressive texture loading
					}

					// Load the model with dependencies
					const modelResult = await loadModelByExtension(extension, arrayBuffer, loadingContext)

					if (modelResult && modelResult.object3D) {
						modelRoot.value = modelResult.object3D
						currentFileId.value = fileId

						// Clear loading state
						loading.value = false
						updateProgress(100, 100, LOADING_STAGES.COMPLETE, 'Model loaded successfully')

						logger.info('useModelLoading', 'Multi-file model loaded successfully', {
							fileId,
							extension,
							children: modelResult.object3D.children.length,
							dependencies: result.dependencies.length,
						})

						// Add missing files info to result for error reporting
						modelResult.missingFiles = result.missingFiles || []
						modelResult.missingTextures = loadingContext.missingTextures || []

						return modelResult
					} else {
						throw new Error('No valid 3D object returned from loader')
					}
				} catch (multiFileError) {
					logger.warn('useModelLoading', 'Multi-file loading failed, falling back to single-file', multiFileError)
					// Fall through to single-file loading
				}
			}

			// Single-file loading (fallback or non-multi-file formats)
			progress.value = { loaded: 0, total: 0, message: 'Downloading model...' }

			const response = await fetch(`/apps/threedviewer/api/file/${fileId}`, {
				signal: abortController.value?.signal,
				headers: {
					Accept: 'application/octet-stream',
					'X-Requested-With': 'XMLHttpRequest',
				},
				credentials: 'same-origin',
			})

			if (!response.ok) {
				// Try to extract error message from response
				let errorMessage = `Failed to fetch model: ${response.status} ${response.statusText}`
				try {
					const errorData = await response.json()
					if (errorData?.error || errorData?.message) {
						errorMessage = errorData.error || errorData.message
					}
				} catch (e) {
					// Response is not JSON, use status text
				}

				logger.error('useModelLoading', 'Failed to fetch model file', {
					fileId,
					filename,
					status: response.status,
					statusText: response.statusText,
					errorMessage,
				})

				// Provide more helpful error messages based on status code
				if (response.status === 404) {
					throw new Error(
						`File not found (ID: ${fileId}). The file may have been deleted, moved, or you may not have access to it. ` +
						`Please try refreshing the file list or contact your administrator if the problem persists.`
					)
				} else if (response.status === 403) {
					throw new Error(
						`Access denied to file (ID: ${fileId}). You may not have permission to access this file.`
					)
				} else if (response.status === 401) {
					throw new Error(
						`Authentication required. Please log in again.`
					)
				} else {
					throw new Error(errorMessage)
				}
			}

			// Get content length for progress tracking
			const contentLength = parseInt(response.headers.get('content-length') || '0', 10)

			// Stream the response with progress tracking
			const reader = response.body.getReader()
			const chunks = []
			let receivedLength = 0

			while (true) {
				const { done, value } = await reader.read()

				if (done) break

				chunks.push(value)
				receivedLength += value.length

				// Update progress
				if (contentLength > 0) {
					progress.value = {
						loaded: receivedLength,
						total: contentLength,
						message: 'Downloading model...',
					}
				} else {
					// If no content-length, just show bytes downloaded
					progress.value = {
						loaded: receivedLength,
						total: 0,
						message: 'Downloading model...',
					}
				}
			}

			// Combine chunks into single ArrayBuffer
			const arrayBuffer = new Uint8Array(receivedLength)
			let position = 0
			for (const chunk of chunks) {
				arrayBuffer.set(chunk, position)
				position += chunk.length
			}

			progress.value = { loaded: receivedLength, total: receivedLength, message: 'Parsing model...' }

			// Prepare context
			const loadingContext = {
				...context,
				fileId,
				abortController: abortController.value,
				fileExtension: extension,
				updateProgress,
				hasDraco: hasDraco.value,
				hasKtx2: hasKtx2.value,
				hasMeshopt: hasMeshopt.value,
			}

			// Load the model (pass .buffer to get ArrayBuffer from Uint8Array)
			const result = await loadModelByExtension(extension, arrayBuffer.buffer, loadingContext)

			if (result && result.object3D) {
				modelRoot.value = result.object3D
				currentFileId.value = fileId

				// Clear loading state
				loading.value = false
				progress.value = { loaded: receivedLength, total: receivedLength, message: 'Complete' }

				logger.info('useModelLoading', 'Model loaded successfully', {
					fileId,
					extension,
					children: result.object3D.children.length,
				})

				return result
			} else {
				throw new Error('No valid 3D object returned from loader')
			}
		} catch (error) {
			handleLoadError(error, filename)
			throw error
		}
	}

	/**
	 * Load a model from ArrayBuffer
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {string} extension - File extension
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	const loadModel = async (arrayBuffer, extension, context) => {
		if (!isSupportedExtension(extension)) {
			throw new Error(`Unsupported file extension: ${extension}`)
		}

		loading.value = true
		error.value = null
		errorState.value = null
		progress.value = { loaded: 0, total: arrayBuffer.byteLength, message: 'Loading...' }

		try {
			// Create abort controller for this load
			abortController.value = new AbortController()

			// Prepare loading context
			const loadingContext = {
				THREE, // Pass THREE.js to loaders
				...context,
				abortController: abortController.value,
				fileExtension: extension,
				updateProgress,
				hasDraco: hasDraco.value,
				hasKtx2: hasKtx2.value,
				hasMeshopt: hasMeshopt.value,
			}

			// Load the model
			const result = await loadModelByExtension(extension, arrayBuffer, loadingContext)

			if (result && result.object3D) {
				modelRoot.value = result.object3D
				currentFileId.value = context.fileId || null

				// Clear loading state
				loading.value = false
				progress.value = { loaded: arrayBuffer.byteLength, total: arrayBuffer.byteLength, message: 'Complete' }

				logger.info('useModelLoading', 'Model loaded successfully', {
					fileId: currentFileId.value,
					extension,
					children: result.object3D.children.length,
				})

				return result
			} else {
				throw new Error('No valid 3D object returned from loader')
			}
		} catch (error) {
			handleLoadError(error, extension)
			throw error
		}
	}

	/**
	 * Load model from file
	 * @param {File} file - File object
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	const loadModelFromFile = async (file, context) => {
		try {
			const arrayBuffer = await readFileAsArrayBuffer(file)
			const extension = file.name.split('.').pop().toLowerCase()

			return await loadModel(arrayBuffer, extension, context)
		} catch (error) {
			handleLoadError(error, file.name)
			throw error
		}
	}

	/**
	 * Load model from URL
	 * @param {string} url - File URL
	 * @param {string} extension - File extension
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	const loadModelFromUrl = async (url, extension, context) => {
		try {
			const response = await fetch(url, {
				signal: abortController.value?.signal,
				headers: {
					Accept: 'application/octet-stream',
					'X-Requested-With': 'XMLHttpRequest',
				},
				credentials: 'same-origin',
			})

			if (!response.ok) {
				throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`)
			}

			const arrayBuffer = await response.arrayBuffer()
			return await loadModel(arrayBuffer, extension, context)
		} catch (error) {
			handleLoadError(error, url)
			throw error
		}
	}

	/**
	 * Read file as ArrayBuffer
	 * @param {File} file - File object
	 * @return {Promise<ArrayBuffer>} File data
	 */
	const readFileAsArrayBuffer = (file) => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()

			reader.onload = (e) => {
				resolve(e.target.result)
			}

			reader.onerror = (e) => {
				reject(new Error('Failed to read file'))
			}

			reader.readAsArrayBuffer(file)
		})
	}

	/**
	 * Update loading progress with enhanced tracking
	 * @param {number} loaded - Bytes loaded
	 * @param {number} total - Total bytes
	 * @param {string} stage - Loading stage
	 * @param {string} message - Detailed message
	 */
	const updateProgress = (loaded, total, stage = null, message = null) => {
		const now = Date.now()
		const currentProgress = progress.value

		// Initialize start time on first progress update
		if (!currentProgress.startTime) {
			currentProgress.startTime = now
		}

		// Calculate percentage
		const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0

		// Calculate speed (bytes per second)
		const elapsed = (now - currentProgress.startTime) / 1000
		const speed = elapsed > 0 ? loaded / elapsed : 0

		// Calculate estimated time remaining
		let estimatedTimeRemaining = null
		if (total > 0 && speed > 0 && loaded < total) {
			const remainingBytes = total - loaded
			estimatedTimeRemaining = Math.round(remainingBytes / speed)
		}

		// Update progress with enhanced information
		progress.value = {
			loaded,
			total,
			message: message || stage,
			stage,
			percentage,
			estimatedTimeRemaining,
			speed,
			startTime: currentProgress.startTime,
		}

		// Log progress updates (throttled to avoid spam)
		if (stage && (percentage % 10 === 0 || percentage === 100 || stage !== currentProgress.stage)) {
			logger.info('useModelLoading', 'Progress update', {
				loaded,
				total,
				stage,
				percentage,
				speed: Math.round(speed / 1024), // KB/s
				estimatedTimeRemaining,
			})
		}
	}

	/**
	 * Handle loading errors
	 * @param {Error} error - Error object
	 * @param {string} filename - File name
	 */
	const handleLoadError = (error, filename) => {
		// Don't treat abort as an error
		if (error.name === 'AbortError' || error.message?.includes('aborted')) {
			loading.value = false
			logger.info('useModelLoading', 'Load cancelled by user', { filename })
			return
		}

		loading.value = false
		error.value = error
		errorState.value = createErrorState(error, (key) => key) // Simple translation function

		logger.info('useModelLoading', 'Model loading failed', error, 'error', {
			filename,
			retryCount: retryCount.value,
			maxRetries: maxRetries.value,
		})
	}

	/**
	 * Retry loading the current model
	 * @param {Function} loadFunction - Function to retry
	 * @return {Promise<object>} Load result
	 */
	const retryLoad = async (loadFunction) => {
		if (retryCount.value >= maxRetries.value) {
			throw new Error('Maximum retry attempts reached')
		}

		retryCount.value++
		error.value = null
		errorState.value = null

		logger.info('useModelLoading', 'Retrying model load', {
			attempt: retryCount.value,
			maxRetries: maxRetries.value,
		})

		try {
			return await loadFunction()
		} catch (error) {
			handleLoadError(error, 'retry')
			throw error
		}
	}

	/**
	 * Cancel ongoing load
	 */
	const cancelLoad = () => {
		if (abortController.value) {
			abortController.value.abort()
			abortController.value = null
		}

		loading.value = false
		progress.value = { loaded: 0, total: 0, message: null }
		logger.info('useModelLoading', 'Load cancelled')

		// Test harness hook
		if (typeof window !== 'undefined') {
			window.__ABORTED = true
		}
	}

	/**
	 * Clear error state
	 */
	const clearError = () => {
		error.value = null
		errorState.value = null
		retryCount.value = 0
	}

	/**
	 * Clear model
	 */
	const clearModel = () => {
		if (modelRoot.value) {
			// Dispose of the model
			disposeObject(modelRoot.value)
			modelRoot.value = null
		}

		currentFileId.value = null
		clearError()

		logger.info('useModelLoading', 'Model cleared')
	}

	/**
	 * Get file size category
	 * @param {number} size - File size in bytes
	 * @return {string} Size category
	 */
	const getFileSizeCategory = (size) => {
		if (size < 1 * 1024 * 1024) return 'very_small'
		if (size < 10 * 1024 * 1024) return 'small'
		if (size < 100 * 1024 * 1024) return 'medium'
		if (size < 500 * 1024 * 1024) return 'large'
		return 'very_large'
	}

	/**
	 * Format file size
	 * @param {number} bytes - File size in bytes
	 * @return {string} Formatted size
	 */
	const formatFileSize = (bytes) => {
		const units = ['B', 'KB', 'MB', 'GB', 'TB']
		let size = bytes
		let unitIndex = 0

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024
			unitIndex++
		}

		return `${Math.round(size * 100) / 100} ${units[unitIndex]}`
	}

	/**
	 * Get loading stage text
	 * @param {string} stage - Loading stage
	 * @return {string} Human-readable stage text
	 */
	const getStageText = (stage) => {
		const stageTexts = {
			[LOADING_STAGES.INITIALIZING]: 'Initializing...',
			[LOADING_STAGES.DOWNLOADING]: 'Downloading...',
			[LOADING_STAGES.DOWNLOADED]: 'Downloaded',
			[LOADING_STAGES.PARSING]: 'Parsing...',
			[LOADING_STAGES.PROCESSING]: 'Processing...',
			[LOADING_STAGES.COMPLETE]: 'Complete',
			[LOADING_STAGES.RETRYING]: 'Retrying...',
			[LOADING_STAGES.ERROR]: 'Error',
		}

		return stageTexts[stage] || stage
	}

	/**
	 * Format estimated time remaining in human-readable format
	 * @param {number} seconds - Time in seconds
	 * @return {string} Formatted time string
	 */
	const formatTimeRemaining = (seconds) => {
		if (!seconds || seconds <= 0) return null

		if (seconds < 60) {
			return `${Math.round(seconds)}s`
		} else if (seconds < 3600) {
			const minutes = Math.round(seconds / 60)
			return `${minutes}m`
		} else {
			const hours = Math.round(seconds / 3600)
			return `${hours}h`
		}
	}

	/**
	 * Format download speed in human-readable format
	 * @param {number} bytesPerSecond - Speed in bytes per second
	 * @return {string} Formatted speed string
	 */
	const formatSpeed = (bytesPerSecond) => {
		if (!bytesPerSecond || bytesPerSecond <= 0) return '0 B/s'

		const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
		let size = bytesPerSecond
		let unitIndex = 0

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024
			unitIndex++
		}

		return `${Math.round(size * 100) / 100} ${units[unitIndex]}`
	}

	/**
	 * Get enhanced progress information for UI display
	 * @return {object} Enhanced progress information
	 */
	const getEnhancedProgressInfo = () => {
		const current = progress.value
		return {
			percentage: current.percentage,
			loaded: formatFileSize(current.loaded),
			total: current.total > 0 ? formatFileSize(current.total) : 'Unknown',
			speed: formatSpeed(current.speed),
			timeRemaining: formatTimeRemaining(current.estimatedTimeRemaining),
			stage: getStageText(current.stage),
			message: current.message,
			elapsed: current.startTime ? Math.round((Date.now() - current.startTime) / 1000) : 0,
		}
	}

	/**
	 * Dispose of model loading resources
	 */
	const dispose = () => {
		// Cancel any ongoing load operations
		cancelLoad()

		// Clear the current model
		clearModel()

		// Clear error state
		clearError()

		// Reset loading state
		loading.value = false
		progress.value = { loaded: 0, total: 0, message: '' }
		retryCount.value = 0

		logger.info('useModelLoading', 'Model loading resources disposed')
	}

	return {
		// State (mutable refs - consumer can modify these)
		loading,
		progress,
		error,
		errorState,
		modelRoot,
		currentFileId,
		retryCount,
		maxRetries,
		hasDraco,
		hasKtx2,
		hasMeshopt,

		// Computed (already readonly by nature)
		isLoading,
		hasError,
		canRetry,
		progressPercentage,

		// Methods
		initDecoders,
		loadModel,
		loadModelFromFile,
		loadModelFromFileId,
		loadModelFromUrl,
		readFileAsArrayBuffer,
		updateProgress,
		handleLoadError,
		retryLoad,
		cancelLoad,
		clearError,
		clearModel,
		getFileSizeCategory,
		formatFileSize,
		getStageText,
		formatTimeRemaining,
		formatSpeed,
		getEnhancedProgressInfo,
		dispose,
	}
}
