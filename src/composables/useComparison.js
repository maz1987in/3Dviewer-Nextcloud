/**
 * Comparison mode composable
 * Handles model comparison functionality, file selection, and dual model management
 */

import { ref, computed, readonly } from 'vue'
import * as THREE from 'three'
import { getFilePickerBuilder, FilePickerType } from '@nextcloud/dialogs'
import { translate as t } from '@nextcloud/l10n'
import { loadModelByExtension, isSupportedExtension } from '../loaders/registry.js'
import { logger } from '../utils/logger.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { disposeObject } from '../utils/three-utils.js'
import { getFileIdByPath } from '../loaders/multiFileHelpers.js'

export function useComparison() {
	// Comparison state
	const comparisonMode = ref(false)
	const comparisonModel = ref(null)
	const comparisonIndicator = ref(null)

	// File loading state
	const loadingComparison = ref(false)
	const comparisonError = ref(null)
	const abortController = ref(null)

	// Computed properties
	const isComparisonMode = computed(() => comparisonMode.value)
	const hasComparisonModel = computed(() => comparisonModel.value !== null)
	const isComparisonLoading = computed(() => loadingComparison.value)

	/**
	 * Toggle comparison mode
	 */
	const toggleComparisonMode = () => {
		comparisonMode.value = !comparisonMode.value

		if (comparisonMode.value) {
			setupComparisonMode()
		} else {
			clearComparison()
		}

		logger.info('useComparison', 'Comparison mode toggled', { enabled: comparisonMode.value })
	}

	/**
	 * Setup comparison mode
	 */
	const setupComparisonMode = () => {
		// This would typically open a file picker or modal
		// The actual implementation depends on the UI framework
		logger.info('useComparison', 'Comparison mode setup')
	}

	/**
	 * Open native Nextcloud file picker to select comparison model
	 * @return {Promise<string>} Selected file path
	 */
		const openFilePicker = async () => {
		try {
			// Supported 3D model mime types
			const mimeTypes = [
				'model/gltf-binary',
				'model/gltf+json',
				'model/obj',
				'model/stl',
				'model/x.fbx',
				'model/vnd.collada+xml',
				'model/x-ply',
				'application/x-3ds',
				'application/x-3mf',
				'model/x3d+xml',
				'model/vrml',
			]

			logger.info('useComparison', 'Opening native file picker with mime types', { mimeTypes })

			const picker = getFilePickerBuilder(t('threedviewer', 'Select 3D Model to Compare'))
				.setMultiSelect(false)
				.setMimeTypeFilter(mimeTypes)
				.setType(FilePickerType.Choose)
				.allowDirectories(false)
				.build()

			logger.info('useComparison', 'File picker built, calling pick()')
			const path = await picker.pick()
			logger.info('useComparison', 'File selected from picker', { path })
			
			return path
		} catch (error) {
			logger.error('useComparison', 'File picker error details', { 
				message: error.message, 
				name: error.name,
				stack: error.stack 
			})
			
			if (error.message === 'User canceled the picker' || error.message === 'FilePicker: No nodes selected') {
				logger.info('useComparison', 'File picker cancelled by user')
			} else {
				logger.error('useComparison', 'Failed to open file picker', error)
			}
			throw error
		}
	}

	/**
	 * Load comparison model from Nextcloud file path
	 * @param {string} filePath - File path from file picker
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 * @throws {Error} If filePath or context are invalid
	 */
	const loadComparisonModelFromPath = async (filePath, context) => {
		// Input validation
		if (!filePath || typeof filePath !== 'string') {
			logger.error('useComparison', 'Invalid file path provided')
			throw new Error('Valid file path is required')
		}
		if (!context) {
			logger.error('useComparison', 'Loading context is required')
			throw new Error('Loading context is required')
		}

		try {
			// Create new abort controller for this load operation
			abortController.value = new AbortController()
			
			loadingComparison.value = true
			comparisonError.value = null

			logger.info('useComparison', 'Loading comparison model from path', { filePath })

			// Extract filename and extension from the full path
			const pathParts = filePath.split('/')
			const filename = pathParts.pop()
			const extension = filename.split('.').pop().toLowerCase()
			
			// Get file ID from path using the same method as the main viewer
			const fileId = await getFileIdByPath(filePath)
			if (!fileId) {
				throw new Error(`Failed to get file ID for path: ${filePath}`)
			}
			
			logger.info('useComparison', 'Found file ID', { filePath, fileId, filename })
			
			// Download using the same endpoint as the main viewer
			const downloadUrl = `/apps/threedviewer/api/file/${fileId}`
			logger.info('useComparison', 'Attempting download', { downloadUrl, fileId, filename })
			
			const fileResponse = await fetch(downloadUrl, {
				method: 'GET',
				headers: {
					'Accept': 'application/octet-stream, */*',
					'X-Requested-With': 'XMLHttpRequest',
				},
				credentials: 'same-origin',
				signal: abortController.value?.signal,
			})

			if (!fileResponse.ok) {
				throw new Error(`Failed to load file: ${fileResponse.status}`)
			}

			const arrayBuffer = await fileResponse.arrayBuffer()
			logger.info('useComparison', 'File downloaded', { 
				filename, 
				fileId,
				size: arrayBuffer.byteLength,
				contentType: fileResponse.headers.get('content-type')
			})

			// Use common loading logic
			const loadingContext = { ...context, fileId }
			const result = await loadComparisonModelFromArrayBuffer(arrayBuffer, extension, filename, loadingContext)
			logger.info('useComparison', 'Comparison model loaded successfully from path')
			return result
		} catch (error) {
			comparisonError.value = error
			logger.error('useComparison', 'Error loading comparison model from path', error)
			throw error
		} finally {
			loadingComparison.value = false
		}
	}

	/**
	 * Load comparison model from Nextcloud (legacy method for backward compatibility)
	 * @param {object} file - File object
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	const loadComparisonModelFromNextcloud = async (file, context) => {
		try {
			// Create new abort controller for this load operation
			abortController.value = new AbortController()
			
			loadingComparison.value = true
			comparisonError.value = null

			logger.info('useComparison', 'Loading comparison model from Nextcloud', file, 'info')

			// Skip dummy files
			if (String(file.id).startsWith('dummy')) {
				throw new Error('Dummy file selected - no actual file to load')
			}

			// Try multiple API endpoints
			const apiEndpoints = [
				`/apps/threedviewer/api/file/${file.id}`,
				`/ocs/v2.php/apps/threedviewer/api/file/${file.id}`,
				`/index.php/apps/files/ajax/download.php?dir=${encodeURIComponent(file.path.split('/').slice(0, -1).join('/'))}&files=${encodeURIComponent(file.name)}`,
				`/remote.php/dav/files/admin${file.path}`,
			]

			let response = null
			let usedEndpoint = ''

			for (const endpoint of apiEndpoints) {
				try {
					const headers = {
						Accept: 'application/octet-stream',
						'X-Requested-With': 'XMLHttpRequest',
					}

					if (endpoint.includes('/ocs/')) {
						headers['OCS-APIRequest'] = 'true'
					}

					response = await fetch(endpoint, {
						headers,
						credentials: 'same-origin',
						signal: abortController.value?.signal,
					})

					if (response.ok) {
						usedEndpoint = endpoint
						break
					}
				} catch (e) {
					logger.info('useComparison', `API endpoint failed: ${endpoint}`, e)
				}
			}

			if (!response || !response.ok) {
				throw new Error(`Failed to load file from all endpoints. Last status: ${response?.status}`)
			}

			const arrayBuffer = await response.arrayBuffer()
			const extension = file.name.split('.').pop().toLowerCase()

			logger.info('useComparison', 'Successfully loaded file from', usedEndpoint, 'info')
			logger.info('useComparison', 'Detected file extension', extension, 'info')

			// Use common loading logic
			const loadingContext = { ...context, fileId: file.id }
			return await loadComparisonModelFromArrayBuffer(arrayBuffer, extension, file.name, loadingContext)
	} catch (error) {
		comparisonError.value = error
		logger.error('useComparison', 'Error loading comparison model from Nextcloud', error)
			throw error
		} finally {
			loadingComparison.value = false
		}
	}

	/**
	 * Load comparison model from file
	 * @param {File} file - File object
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	const loadComparisonModel = async (file, context) => {
		try {
			// Create new abort controller for this load operation
			abortController.value = new AbortController()
			
			loadingComparison.value = true
			comparisonError.value = null

			const arrayBuffer = await readFileAsArrayBuffer(file)
			const extension = file.name.split('.').pop().toLowerCase()

			// Use common loading logic
			const loadingContext = { ...context, fileId: 'comparison' }
			return await loadComparisonModelFromArrayBuffer(arrayBuffer, extension, file.name, loadingContext)
		} catch (error) {
			comparisonError.value = error
			logger.error('useComparison', 'Error loading comparison model', error)
			throw error
		} finally {
			loadingComparison.value = false
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
	 * Common model loading logic to reduce duplication
	 * @param {ArrayBuffer} arrayBuffer - Model data
	 * @param {string} extension - File extension
	 * @param {string} filename - File name
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	const loadComparisonModelFromArrayBuffer = async (arrayBuffer, extension, filename, context) => {
		const result = await loadModelByExtension(extension, arrayBuffer, {
			...context,
			fileId: context.fileId || 'comparison',
			filename,
			THREE: context.THREE,
			scene: context.scene,
			applyWireframe: context.applyWireframe,
			ensurePlaceholderRemoved: context.ensurePlaceholderRemoved,
			wireframe: context.wireframe,
		})

		if (result && result.object3D) {
			comparisonModel.value = result.object3D

			// Add comparison indicator with proper error handling
			if (context && context.scene) {
				addComparisonIndicator(result.object3D, filename, context.scene)
			}

			logger.info('useComparison', 'Comparison model loaded successfully')
			return result
		} else {
			throw new Error('No valid 3D object returned from loader')
		}
	}

	/**
	 * Add comparison indicator to model
	 * @param {THREE.Object3D} model - Model object
	 * @param {string} filename - File name
	 * @param {THREE.Scene} scene - Scene object
	 */
	const addComparisonIndicator = (model, filename, scene) => {
		try {
			if (!model || !scene) {
				return
			}

			// Create a small indicator above the model
			const geometry = new THREE.SphereGeometry(0.1, 8, 6)
			const material = new THREE.MeshBasicMaterial({
				color: VIEWER_CONFIG.comparison.defaultComparisonColor,
				transparent: true,
				opacity: 0.8,
			})

			const indicator = new THREE.Mesh(geometry, material)

			// Position indicator above the model
			const box = new THREE.Box3().setFromObject(model)
			const size = box.getSize(new THREE.Vector3())

			// Position indicator relative to model's center
			indicator.position.set(0, size.y / 2 + 0.2, 0)

			model.add(indicator)
			comparisonIndicator.value = indicator

			logger.info('useComparison', 'Comparison indicator added', {
				filename,
				modelPosition: model.position,
				indicatorPosition: indicator.position,
			})
		} catch (error) {
			// Error adding comparison indicator
			logger.error('useComparison', 'Failed to add comparison indicator', error)
		}
	}

	/**
	 * Fit both models to view
	 * @param {THREE.Object3D} model1 - First model
	 * @param {THREE.Object3D} model2 - Second model
	 * @param {Function} fitFunction - Function to fit camera to both models
	 */
	const fitBothModelsToView = (model1, model2, fitFunction) => {
		if (!model1 || !model2 || !fitFunction) {
			return
		}

		try {
			// Get bounding boxes for both models
			const box1 = new THREE.Box3().setFromObject(model1)
			const box2 = new THREE.Box3().setFromObject(model2)

			// Check if bounding boxes are valid
			if (box1.isEmpty() || box2.isEmpty()) {
				logger.warn('useComparison', 'Cannot fit models: one or both bounding boxes are empty')
				return
			}

			// Calculate sizes and centers
			const size1 = box1.getSize(new THREE.Vector3())
			const size2 = box2.getSize(new THREE.Vector3())
			const center1 = box1.getCenter(new THREE.Vector3())
			const center2 = box2.getCenter(new THREE.Vector3())

			// Calculate separation - use a reasonable gap between models
			const maxDimension = Math.max(size1.x, size1.y, size1.z, size2.x, size2.y, size2.z)
			const separation = maxDimension * 1.5 // Good separation for comparison

			// Reset both models to origin first to clear any existing positioning
			model1.position.set(0, 0, 0)
			model2.position.set(0, 0, 0)

			// Position models symmetrically around center (origin) at the same Y level
			// Layout: [model1]   •   [model2]
			// Where • is the center point (origin 0,0,0)
			// We need to position both models so their centers are at the same Y level
			
			// Calculate the target Y position for both models (use the lower of the two centers)
			const targetY = Math.min(center1.y, center2.y)
			
			// Position model1 (original) to the left of center
			model1.position.set(
				-separation,           // X: left of center
				targetY - center1.y,  // Y: align both models to same level
				0                     // Z: center at origin
			)

			// Position model2 (comparison) to the right of center
			model2.position.set(
				separation,           // X: right of center
				targetY - center2.y, // Y: align both models to same level
				0                    // Z: center at origin
			)

			// Force update the matrix to ensure position changes take effect
			model1.updateMatrixWorld(true)
			model2.updateMatrixWorld(true)

			logger.info('useComparison', 'Models positioned side by side centered around origin', {
				separation,
				model1Pos: { x: model1.position.x, y: model1.position.y, z: model1.position.z },
				model2Pos: { x: model2.position.x, y: model2.position.y, z: model2.position.z },
				model1Size: { x: size1.x, y: size1.y, z: size1.z },
				model2Size: { x: size2.x, y: size2.y, z: size2.z },
				model1Bounds: { min: box1.min, max: box1.max },
				model2Bounds: { min: box2.min, max: box2.max },
			})

			// Use the provided fit function to fit camera to both models
			fitFunction(model1, model2)
		} catch (error) {
			logger.error('useComparison', 'Failed to fit both models to view', error)
		}
	}

	/**
	 * Toggle original model visibility
	 * @param {THREE.Object3D} model - Model to toggle
	 */
	const toggleOriginalModel = (model) => {
		if (model) {
		model.visible = !model.visible
		logger.info('useComparison', 'Original model visibility toggled', { visible: model.visible })
		}
	}

	/**
	 * Toggle comparison model visibility
	 */
	const toggleComparisonModel = () => {
		if (comparisonModel.value) {
			comparisonModel.value.visible = !comparisonModel.value.visible
			logger.info('useComparison', 'Comparison model visibility toggled', {
				visible: comparisonModel.value.visible,
			})
		}
	}

	/**
	 * Clear comparison
	 */
	const clearComparison = () => {
		// Cancel any ongoing load operations
		if (abortController.value) {
			abortController.value.abort()
			abortController.value = null
		}

		if (comparisonModel.value) {
			// Dispose of the comparison model
			disposeObject(comparisonModel.value)
			comparisonModel.value = null
		}

		if (comparisonIndicator.value) {
			comparisonIndicator.value = null
		}

		comparisonError.value = null
		loadingComparison.value = false

		logger.info('useComparison', 'Comparison cleared')
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
	 * Dispose of comparison resources
	 */
	const dispose = () => {
		// Clear comparison
		clearComparison()
		
		// Abort any ongoing operations
		if (abortController.value) {
			abortController.value.abort()
			abortController.value = null
		}

		logger.info('useComparison', 'Comparison resources disposed')
	}

	return {
		// State
		comparisonMode: readonly(comparisonMode),
		comparisonModel: readonly(comparisonModel),
		comparisonIndicator: readonly(comparisonIndicator),
		loadingComparison: readonly(loadingComparison),
		comparisonError: readonly(comparisonError),

		// Computed
		isComparisonMode,
		hasComparisonModel,
		isComparisonLoading,

		// Methods
		toggleComparisonMode,
		setupComparisonMode,
		openFilePicker,
		loadComparisonModelFromPath,
		loadComparisonModelFromNextcloud,
		loadComparisonModel,
		addComparisonIndicator,
		fitBothModelsToView,
		toggleOriginalModel,
		toggleComparisonModel,
		clearComparison,
		formatFileSize,
		dispose,
	}
}
