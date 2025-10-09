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

export function useComparison() {
	// Comparison state
	const comparisonMode = ref(false)
	const comparisonModel = ref(null)
	const comparisonIndicator = ref(null)

	// File loading state
	const loadingComparison = ref(false)
	const comparisonError = ref(null)

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
	 */
	const loadComparisonModelFromPath = async (filePath, context) => {
		try {
			loadingComparison.value = true
			comparisonError.value = null

			logger.info('useComparison', 'Loading comparison model from path', { filePath })

			// Extract filename from path
			const filename = filePath.split('/').pop()
			const extension = filename.split('.').pop().toLowerCase()

			// Get file info from path using Nextcloud API
			const response = await fetch(`/apps/threedviewer/api/files/info?path=${encodeURIComponent(filePath)}`, {
				headers: {
					'X-Requested-With': 'XMLHttpRequest',
				},
				credentials: 'same-origin',
			})

			if (!response.ok) {
				throw new Error(`Failed to get file info: ${response.status}`)
			}

			const fileInfo = await response.json()
			const fileId = fileInfo.id || fileInfo.fileid

			// Download the file
			const fileResponse = await fetch(`/apps/threedviewer/api/file/${fileId}`, {
				headers: {
					Accept: 'application/octet-stream',
					'X-Requested-With': 'XMLHttpRequest',
				},
				credentials: 'same-origin',
				signal: context.abortController?.signal,
			})

			if (!fileResponse.ok) {
				throw new Error(`Failed to load file: ${fileResponse.status}`)
			}

			const arrayBuffer = await fileResponse.arrayBuffer()

			// Load the model using the appropriate loader
			const result = await loadModelByExtension(extension, arrayBuffer, {
				...context,
				fileId,
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

				logger.info('useComparison', 'Comparison model loaded successfully from path')
				return result
			} else {
				throw new Error('No valid 3D object returned from loader')
			}
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
			loadingComparison.value = true
			comparisonError.value = null

			logger.info('useComparison', 'Loading comparison model from Nextcloud', file, 'info')
			// Loading comparison model

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
						signal: context.abortController?.signal,
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

			// Load the model using the appropriate loader
			const result = await loadModelByExtension(extension, arrayBuffer, {
				...context,
				fileId: file.id,
				filename: file.name,
				THREE: context.THREE,
				scene: context.scene,
				applyWireframe: context.applyWireframe,
				ensurePlaceholderRemoved: context.ensurePlaceholderRemoved,
				wireframe: context.wireframe,
			})

			if (result && result.object3D) {
				comparisonModel.value = result.object3D
				// Comparison model loaded

				// Add comparison indicator with proper error handling
				if (context && context.scene) {
					addComparisonIndicator(result.object3D, file.name, context.scene)
				} else {
					// Context or scene not available for comparison indicator
				}

			// Comparison model positioned

			logger.info('useComparison', 'Comparison model loaded successfully')
			return result
		} else {
			throw new Error('No valid 3D object returned from loader')
		}
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
			loadingComparison.value = true
			comparisonError.value = null

			const arrayBuffer = await readFileAsArrayBuffer(file)
			const extension = file.name.split('.').pop().toLowerCase()

			// Load the model using the appropriate loader
			const result = await loadModelByExtension(extension, arrayBuffer, {
				...context,
				fileId: 'comparison',
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
				addComparisonIndicator(result.object3D, file.name, context.scene)
			} else {
				// Context or scene not available for comparison indicator
			}

			logger.info('useComparison', 'Comparison model loaded successfully')
			return result
		} else {
			throw new Error('No valid 3D object returned from loader')
		}
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
		// Fitting both models to view

		if (!model1 || !model2 || !fitFunction) {
			return
		}

		try {
			// Ensure models are valid before proceeding
			if (!model1 || !model2) {
				return
			}

			// Get bounding boxes for both models
			const box1 = new THREE.Box3().setFromObject(model1)
			const box2 = new THREE.Box3().setFromObject(model2)

			// Check if bounding boxes are valid
			if (box1.isEmpty() || box2.isEmpty()) {
				return
			}

			// Calculate sizes
			const size1 = box1.getSize(new THREE.Vector3())
			const size2 = box2.getSize(new THREE.Vector3())

			// Calculate the offset needed to position models side by side
			// Use a larger multiplier to ensure clear separation
			const offset = Math.max(size1.x, size1.z, size2.x, size2.z) * 1.2

			// Position models side by side
			// Keep original model at its current position
			// Move comparison model to the right
			model2.position.x = offset

			// Force update the matrix to ensure position changes take effect
			model2.updateMatrixWorld(true)

			// Model positioning applied

			// Use the provided fit function to fit camera to both models
			fitFunction(model1, model2)

			logger.info('useComparison', 'Both models fitted to view', {
				offset,
				model1Pos: { x: model1.position.x, y: model1.position.y, z: model1.position.z },
				model2Pos: { x: model2.position.x, y: model2.position.y, z: model2.position.z },
				model1Visible: model1.visible,
				model2Visible: model2.visible,
			})
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
		if (comparisonModel.value) {
			// Dispose of the comparison model
			disposeObject(comparisonModel.value)
			comparisonModel.value = null
		}

		if (comparisonIndicator.value) {
			comparisonIndicator.value = null
		}

		comparisonError.value = null

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
	}
}
