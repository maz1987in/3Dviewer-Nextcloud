/**
 * Comparison mode composable
 * Handles model comparison functionality, file selection, and dual model management
 */

import { ref, shallowRef, computed, readonly, markRaw, toRaw } from 'vue'
import * as THREE from 'three'
import { AnimationMixer } from 'three'
import { generateUrl } from '@nextcloud/router'
import { getFilePickerBuilder } from '@nextcloud/dialogs'
import { loadModelByExtension } from '../loaders/registry.js'
import { logger } from '../utils/logger.js'
import { disposeObject } from '../utils/three-utils.js'
import { getFileIdByPath, loadModelWithDependencies } from '../loaders/multiFileHelpers.js'

export function useComparison() {
	// Comparison state
	const comparisonMode = ref(false)
	const comparisonModel = shallowRef(null)
	const comparisonIndicator = shallowRef(null)

	// Animation state for comparison model
	const comparisonMixer = shallowRef(null)
	const comparisonActions = ref([])
	const comparisonAnimations = ref([])

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
	 *
	 * TODO: Currently not working due to Nextcloud file picker API limitations
	 * The picker opens but file selection is not properly captured.
	 * This is a known issue with the @nextcloud/dialogs FilePicker API.
	 *
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

			// Build file picker with custom button
			let selectedNodes = null

			const picker = getFilePickerBuilder(t('threedviewer', 'Select 3D Model to Compare'))
				.setMultiSelect(false)
				.setMimeTypeFilter(mimeTypes)
				.allowDirectories(false)
				.addButton({
					label: t('threedviewer', 'Select'),
					type: 'primary',
					callback: (nodes) => {
						logger.info('useComparison', 'Selection callback invoked', { nodes, count: nodes ? nodes.length : 0 })
						selectedNodes = nodes
					},
				})
				.build()

			logger.info('useComparison', 'File picker built, calling pick()')

			// Use pick() - the callback will set selectedNodes
			const picked = await picker.pick()

			logger.info('useComparison', 'Pick result', { picked, selectedNodes, hasNodes: !!selectedNodes })

			// Check if we have selected nodes from the button callback
			if (selectedNodes && selectedNodes.length > 0) {
				const selectedPath = selectedNodes[0].path
				logger.info('useComparison', 'File selected via button', { path: selectedPath })
				return selectedPath
			}

			// Fallback to direct pick result
			if (picked && typeof picked === 'string' && picked.trim() !== '') {
				logger.info('useComparison', 'File selected via direct pick', { path: picked })
				return picked
			}

			logger.info('useComparison', 'File picker cancelled - no selection')
			return null
		} catch (error) {
			logger.error('useComparison', 'File picker error details', {
				message: error.message,
				name: error.name,
				stack: error.stack,
			})

			// Treat "No nodes selected" as user cancellation, not an error
			if (error.message === 'User canceled the picker' || error.message === 'FilePicker: No nodes selected') {
				logger.info('useComparison', 'File picker cancelled by user')
				return null
			}

			logger.error('useComparison', 'Failed to open file picker', error)
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
			// Clear existing comparison model before loading new one
			if (comparisonModel.value && context.scene) {
				clearComparison(context.scene)
			}

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

			// Extract directory path for multi-file loading
			const lastSlashIndex = filePath.lastIndexOf('/')
			const dirPath = lastSlashIndex >= 0 ? filePath.substring(0, lastSlashIndex) : null

			// Check if this is a multi-file format that needs dependencies
			const isMultiFile = ['obj', 'gltf', 'fbx', '3ds', 'dae'].includes(extension)

			let arrayBuffer
			let additionalFiles = []
			let multiFileLoaded = false

			if (isMultiFile) {
				logger.info('useComparison', 'Multi-file format detected, loading dependencies', { extension, fileId, dirPath })

				try {
					// Load model with dependencies (buffers, textures, etc.)
					const dependencyResult = await loadModelWithDependencies(fileId, filename, extension, dirPath)

					// Get the main file as ArrayBuffer
					arrayBuffer = await dependencyResult.mainFile.arrayBuffer()

					// Store dependencies for the loader
					additionalFiles = dependencyResult.dependencies || []
					multiFileLoaded = true

					logger.info('useComparison', 'Dependencies loaded', {
						filename,
						dependencies: additionalFiles.length,
						missing: dependencyResult.missingFiles?.length || 0,
					})
				} catch (multiFileError) {
					logger.warn('useComparison', 'Multi-file loading failed, falling back to single-file', multiFileError)
					// Fall through to single-file loading
				}
			}

			// Single-file loading (fallback or non-multi-file formats)
			if (!multiFileLoaded) {
				const downloadUrl = generateUrl(`/apps/threedviewer/api/file/${fileId}`)
				logger.info('useComparison', 'Attempting download', { downloadUrl, fileId, filename })

				const fileResponse = await fetch(downloadUrl, {
					method: 'GET',
					headers: {
						Accept: 'application/octet-stream, */*',
						'X-Requested-With': 'XMLHttpRequest',
					},
					credentials: 'same-origin',
					signal: abortController.value?.signal,
				})

				if (!fileResponse.ok) {
					throw new Error(`Failed to load file: ${fileResponse.status}`)
				}

				arrayBuffer = await fileResponse.arrayBuffer()
				logger.info('useComparison', 'File downloaded', {
					filename,
					fileId,
					size: arrayBuffer.byteLength,
					contentType: fileResponse.headers.get('content-type'),
				})
			}

			// Use common loading logic with additional files if available
			const loadingContext = {
				...context,
				fileId,
				additionalFiles,
				fileExtension: extension,
			}
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
			// Clear existing comparison model before loading new one
			if (comparisonModel.value && context && context.scene) {
				clearComparison(context.scene)
			}

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
				generateUrl(`/apps/threedviewer/api/file/${file.id}`),
				generateUrl(`/ocs/v2.php/apps/threedviewer/api/file/${file.id}`),
				generateUrl(`/index.php/apps/files/ajax/download.php?dir=${encodeURIComponent(file.path.split('/').slice(0, -1).join('/'))}&files=${encodeURIComponent(file.name)}`),
				generateUrl(`/remote.php/dav/files/admin${file.path}`),
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
			// Clear existing comparison model before loading new one
			if (comparisonModel.value && context && context.scene) {
				clearComparison(context.scene)
			}

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
		// Initialize decoder availability if not provided
		let hasDraco = context.hasDraco
		let hasKtx2 = context.hasKtx2
		let hasMeshopt = context.hasMeshopt

		if (hasDraco === undefined || hasKtx2 === undefined || hasMeshopt === undefined) {
			// Check decoder availability
			try {
				await import('three/examples/jsm/loaders/DRACOLoader.js')
				hasDraco = true
			} catch (e) {
				hasDraco = false
			}

			try {
				await import('three/examples/jsm/loaders/KTX2Loader.js')
				hasKtx2 = true
			} catch (e) {
				hasKtx2 = false
			}

			hasMeshopt = false // Disabled due to CSP restrictions
		}

		const result = await loadModelByExtension(extension, arrayBuffer, {
			...context,
			fileId: context.fileId || 'comparison',
			filename,
			THREE: context.THREE,
			scene: context.scene,
			renderer: context.renderer || null,
			hasDraco,
			hasKtx2,
			hasMeshopt,
			applyWireframe: context.applyWireframe,
			ensurePlaceholderRemoved: context.ensurePlaceholderRemoved,
			wireframe: context.wireframe,
		})

		if (result && result.object3D) {
			comparisonModel.value = markRaw(result.object3D)

			// Store animations if present
			if (result.animations && result.animations.length > 0) {
				comparisonAnimations.value = result.animations
				logger.info('useComparison', 'Comparison model has animations', {
					count: result.animations.length,
					clips: result.animations.map(clip => clip.name || 'unnamed'),
				})
			} else {
				comparisonAnimations.value = []
			}

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

			// Comparison indicator DISABLED per user request
			// No visual indicator - just side-by-side comparison
			comparisonIndicator.value = null

			logger.info('useComparison', 'Comparison mode active (indicator disabled)', {
				filename,
				modelPosition: model.position,
			})
		} catch (error) {
			// Error adding comparison indicator
			logger.error('useComparison', 'Failed to add comparison indicator', error)
		}
	}

	/**
	 * Ensure all objects in a scene hierarchy have valid matrices
	 * Recursively traverses the object tree and initializes matrices if missing
	 * This prevents "Cannot read properties of undefined (reading 'multiplyMatrices')" errors
	 * @param {THREE.Object3D} object - Root object to validate
	 * @param {number} depth - Current recursion depth (prevents infinite loops)
	 * @param {Set} visited - Set of visited objects to prevent cycles
	 */
	const ensureMatricesValid = (object, depth = 0, visited = new Set()) => {
		// Prevent infinite recursion
		if (!object || depth > 500) return

		// Skip if already validated
		if (visited.has(object)) return
		visited.add(object)

		try {
			// CRITICAL: Validate parent matrices FIRST before validating this object
			// updateMatrixWorld multiplies child.matrix with parent.matrixWorld
			// So parent matrices MUST be valid before we can safely update child matrices
			if (object.parent && depth < 100) {
				ensureMatricesValid(object.parent, depth + 1, visited)
			}

			// Validate Object3D instances or check if it has matrix properties
			if (object.isObject3D) {
				// Ensure matrix exists and is valid Matrix4 instance
				if (!object.matrix || !(object.matrix instanceof THREE.Matrix4)) {
					object.matrix = new THREE.Matrix4()
					object.matrix.identity()
				} else if (!object.matrix.elements || !Array.isArray(object.matrix.elements) || object.matrix.elements.length !== 16) {
					// Also ensure it's not corrupted (has valid elements array)
					object.matrix = new THREE.Matrix4()
					object.matrix.identity()
				}

				// Ensure matrixWorld exists and is valid Matrix4 instance
				if (!object.matrixWorld || !(object.matrixWorld instanceof THREE.Matrix4)) {
					object.matrixWorld = new THREE.Matrix4()
					object.matrixWorld.identity()
				} else if (!object.matrixWorld.elements || !Array.isArray(object.matrixWorld.elements) || object.matrixWorld.elements.length !== 16) {
					// Also ensure it's not corrupted (has valid elements array)
					object.matrixWorld = new THREE.Matrix4()
					object.matrixWorld.identity()
				}

				// Ensure modelViewMatrix exists (used by renderer)
				if (!object.modelViewMatrix || !(object.modelViewMatrix instanceof THREE.Matrix4)) {
					object.modelViewMatrix = new THREE.Matrix4()
				}
				// Ensure normalMatrix exists (used for lighting calculations)
				if (!object.normalMatrix || !(object.normalMatrix instanceof THREE.Matrix3)) {
					object.normalMatrix = new THREE.Matrix3()
				}
			} else {
				// Check for matrix properties or updateMatrixWorld method
				const hasMatrix = typeof object.matrix !== 'undefined'
				const hasMatrixWorld = typeof object.matrixWorld !== 'undefined'
				const hasUpdateMethod = typeof object.updateMatrixWorld === 'function'

				if (hasMatrix || hasMatrixWorld || hasUpdateMethod) {
					if (!object.matrix || !(object.matrix instanceof THREE.Matrix4)) {
						object.matrix = new THREE.Matrix4()
						object.matrix.identity()
					}
					if (!object.matrixWorld || !(object.matrixWorld instanceof THREE.Matrix4)) {
						object.matrixWorld = new THREE.Matrix4()
						object.matrixWorld.identity()
					}
				} else {
					return
				}
			}

			// Recursively validate children
			if (object.children && Array.isArray(object.children) && object.children.length > 0) {
				for (const child of object.children) {
					ensureMatricesValid(child, depth + 1, visited)
				}
			}

			// SPECIAL CASE: Validate Skeleton bones for SkinnedMesh
			// Bones might not be direct children but are accessed during render
			if (object.isSkinnedMesh && object.skeleton && Array.isArray(object.skeleton.bones)) {
				for (const bone of object.skeleton.bones) {
					ensureMatricesValid(bone, depth + 1, visited)
				}
			}
		} catch (error) {
			// Silently skip objects that can't be validated (e.g., materials, geometries)
			// This prevents errors from non-Object3D objects in the hierarchy
		}
	}

	/**
	 * Fit both models to view
	 * @param {THREE.Object3D} model1 - First model
	 * @param {THREE.Object3D} model2 - Second model
	 * @param {Function} fitFunction - Function to fit camera to both models
	 * @param scene
	 */
	const fitBothModelsToView = (model1, model2, fitFunction, scene) => {
		if (!model1 || !model2 || !fitFunction) {
			return
		}

		try {
			// Indicator feature disabled - skip indicator handling

			// CRITICAL: Validate entire scene hierarchy, not just models
			// Scene may contain grid, axes, lights, and other objects that need valid matrices
			if (scene) {
				ensureMatricesValid(scene, 0, new Set())
			}

			// CRITICAL: Validate all matrices BEFORE calling updateMatrixWorld
			// updateMatrixWorld multiplies with parent matrices, so all parents must be valid first
			ensureMatricesValid(model1, 0, new Set())
			ensureMatricesValid(model2, 0, new Set())

			// CRITICAL: Call updateMatrix() on all objects BEFORE updateMatrixWorld()
			// Ensure matrices exist before calling updateMatrix()
			const updateAllMatrices = (obj, depth = 0) => {
				if (!obj || depth > 500) return
				try {
					// Check if this is an Object3D-like object that has matrices
					const hasMatrix = typeof obj.matrix !== 'undefined'
					const hasMatrixWorld = typeof obj.matrixWorld !== 'undefined'

					if (obj.isObject3D) {
						if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
							obj.matrix = new THREE.Matrix4()
							obj.matrix.identity()
						}
						if (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4)) {
							obj.matrixWorld = new THREE.Matrix4()
							obj.matrixWorld.identity()
						}
						if (!obj.modelViewMatrix || !(obj.modelViewMatrix instanceof THREE.Matrix4)) {
							obj.modelViewMatrix = new THREE.Matrix4()
						}
						// Ensure normalMatrix exists (used for lighting calculations)
						if (!obj.normalMatrix || !(obj.normalMatrix instanceof THREE.Matrix3)) {
							obj.normalMatrix = new THREE.Matrix3()
						}
						if (typeof obj.updateMatrix === 'function') {
							obj.updateMatrix()
						}
					} else if (hasMatrix || hasMatrixWorld) {
						// Ensure matrices exist and are valid before calling updateMatrix()
						if (hasMatrix && (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4))) {
							obj.matrix = new THREE.Matrix4()
							obj.matrix.identity()
						}
						if (hasMatrixWorld && (!obj.matrixWorld || !(obj.matrixWorld instanceof THREE.Matrix4))) {
							obj.matrixWorld = new THREE.Matrix4()
							obj.matrixWorld.identity()
						}

						// Only call updateMatrix() if it exists and object is Object3D-like
						if (typeof obj.updateMatrix === 'function' && obj.isObject3D !== false) {
							obj.updateMatrix()
						}
					}

					// Recursively process children
					if (obj.children && Array.isArray(obj.children)) {
						for (const child of obj.children) {
							updateAllMatrices(child, depth + 1)
						}
					}

					// SPECIAL CASE: Validate Skeleton bones for SkinnedMesh
					if (obj.isSkinnedMesh && obj.skeleton && Array.isArray(obj.skeleton.bones)) {
						for (const bone of obj.skeleton.bones) {
							updateAllMatrices(bone, depth + 1)
						}
					}
				} catch (e) {
					// Skip objects that can't be updated (materials, geometries, etc.)
				}
			}

			// Update all local matrices first
			updateAllMatrices(model1, 0)
			updateAllMatrices(model2, 0)

			// Re-validate after updateMatrix() calls to catch any missed objects
			ensureMatricesValid(model1, 0, new Set())
			ensureMatricesValid(model2, 0, new Set())

			// Now safe to update matrices
			try {
				model1.updateMatrixWorld(true)
				model2.updateMatrixWorld(true)
			} catch (updateError) {
				logger.warn('useComparison', 'Initial updateMatrixWorld failed, re-validating', updateError)
				// Re-validate
				ensureMatricesValid(model1, 0, new Set())
				ensureMatricesValid(model2, 0, new Set())

				// Update local matrices again before retry
				updateAllMatrices(model1, 0)
				updateAllMatrices(model2, 0)

				model1.updateMatrixWorld(true)
				model2.updateMatrixWorld(true)
			}

			// CRITICAL FIX: model2's position is immutable (set by centerObject during loading)
			// Solution: Wrap model2 in a new Group and apply inverse offset to neutralize the baked position
			logger.info('useComparison', 'Model2 has immutable position, wrapping in Group', {
				model2Type: model2.type,
				model2Position: { x: model2.position.x, y: model2.position.y, z: model2.position.z },
			})

			// CRITICAL: Use toRaw to get the actual Three.js object, not Vue proxy
			// This ensures parent-child relationships work correctly and animations work properly
			const rawModel2 = toRaw(model2)

			// Store model2's current local position before wrapping
			const model2LocalOffset = new THREE.Vector3(
				rawModel2.position.x,
				rawModel2.position.y,
				rawModel2.position.z,
			)

			// Remove model2 from scene
			const originalParent = rawModel2.parent
			if (rawModel2.parent) {
				rawModel2.parent.remove(rawModel2)
			}

			// Create a new Group to wrap model2
			// Don't pre-position it - we'll calculate the final position after getting the bounding box
			const model2Wrapper = new THREE.Group()
			// CRITICAL: Ensure matrixAutoUpdate is enabled so wrapper updates during render loop
			model2Wrapper.matrixAutoUpdate = true

			// Add model2 to wrapper - this should set the parent automatically
			model2Wrapper.add(rawModel2)

			// CRITICAL: Force parent reference update (Three.js should do this, but ensure it's set)
			// Check both the raw object and the proxy
			if (rawModel2.parent !== model2Wrapper) {
				rawModel2.parent = model2Wrapper
			}
			// Also ensure the proxy's parent is updated if it's different
			if (model2 !== rawModel2 && model2.parent !== model2Wrapper) {
				model2.parent = model2Wrapper
			}

			// Force matrix updates to establish parent-child relationship
			rawModel2.updateMatrix()
			model2Wrapper.updateMatrix()
			model2Wrapper.updateMatrixWorld(true)

			// CRITICAL: Ensure wrapper and all children have matrixAutoUpdate enabled
			// This ensures they update during the render loop
			model2Wrapper.matrixAutoUpdate = true
			rawModel2.matrixAutoUpdate = true
			// Recursively enable matrixAutoUpdate for all children
			const enableMatrixAutoUpdate = (obj) => {
				if (obj && obj.isObject3D) {
					obj.matrixAutoUpdate = true
					if (obj.children) {
						obj.children.forEach(enableMatrixAutoUpdate)
					}
				}
			}
			enableMatrixAutoUpdate(rawModel2)

			scene.add(model2Wrapper)

			// CRITICAL: Update comparisonModel.value to point to the wrapper so it's properly tracked
			// This ensures the wrapper is part of the scene hierarchy and gets updated during rendering
			comparisonModel.value = markRaw(model2Wrapper)

			// CRITICAL: Force one more matrix update after adding to scene to ensure everything is synced
			scene.updateMatrixWorld(true)

			// VERIFY: Check if model2 is actually in the wrapper
			const isInWrapper = model2.parent === model2Wrapper
			const wrapperChildCount = model2Wrapper.children.length
			const model2ParentUUID = model2.parent ? model2.parent.uuid : 'null'
			const wrapperUUID = model2Wrapper.uuid
			const model2UUID = model2.uuid

			// Check what's ACTUALLY in the wrapper
			const wrapperChild0 = model2Wrapper.children[0]
			const child0UUID = wrapperChild0 ? wrapperChild0.uuid : 'null'
			const child0Type = wrapperChild0 ? wrapperChild0.type : 'null'
			const isChild0Model2 = wrapperChild0 === model2

			logger.info('useComparison', '🔍 WRAPPING VERIFICATION (immediately after wrapper.add)', {
				originalParentType: originalParent ? originalParent.type : 'null',
				wrapperUUID,
				model2ParentUUID,
				isModel2InWrapper: isInWrapper,
				wrapperChildCount,
				expectedChildCount: 1,
				model2Type: model2.type,
				model2UUID,
				wrapperChild0UUID: child0UUID,
				wrapperChild0Type: child0Type,
				isChild0SameAsModel2: isChild0Model2,
				UUIDsMatch: model2UUID === child0UUID,
			})

			// Now model2Wrapper is the object we'll position (model2's local position is neutralized)
			const model2Positionable = model2Wrapper

			logger.info('useComparison', 'Model2 wrapped in Group', {
				model2LocalOffset: { x: model2LocalOffset.x, y: model2LocalOffset.y, z: model2LocalOffset.z },
				wrapperInitialPosition: { x: model2Wrapper.position.x, y: model2Wrapper.position.y, z: model2Wrapper.position.z },
				note: 'Wrapper at (0,0,0), model2 has baked offset, will position wrapper to compensate',
			})

			// Reset model1 to origin
			model1.position.x = 0
			model1.position.y = 0
			model1.position.z = 0
			model1.updateMatrix()
			model1.updateMatrixWorld(true)

			// Update wrapper matrices
			model2Wrapper.updateMatrix()
			model2Wrapper.updateMatrixWorld(true)

			// Validate and ensure matrices are valid before updating
			ensureMatricesValid(model1, 0, new Set())
			ensureMatricesValid(model2, 0, new Set())

			// Update local matrices first
			const updateLocalMatrices = (obj, depth = 0) => {
				if (!obj || depth > 500) return
				try {
					const hasMatrix = typeof obj.matrix !== 'undefined'
					if (obj.isObject3D) {
						if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
							obj.matrix = new THREE.Matrix4()
							obj.matrix.identity()
						}
						if (!obj.modelViewMatrix || !(obj.modelViewMatrix instanceof THREE.Matrix4)) {
							obj.modelViewMatrix = new THREE.Matrix4()
						}
						// Ensure normalMatrix exists (used for lighting calculations)
						if (!obj.normalMatrix || !(obj.normalMatrix instanceof THREE.Matrix3)) {
							obj.normalMatrix = new THREE.Matrix3()
						}
						if (typeof obj.updateMatrix === 'function') {
							obj.updateMatrix()
						}
					} else if (hasMatrix) {
						if (!obj.matrix || !(obj.matrix instanceof THREE.Matrix4)) {
							obj.matrix = new THREE.Matrix4()
							obj.matrix.identity()
						}
						if (typeof obj.updateMatrix === 'function' && obj.isObject3D !== false) {
							obj.updateMatrix()
						}
					}
					if (obj.children && Array.isArray(obj.children)) {
						for (const child of obj.children) {
							updateLocalMatrices(child, depth + 1)
						}
					}

					// SPECIAL CASE: Validate Skeleton bones for SkinnedMesh
					if (obj.isSkinnedMesh && obj.skeleton && Array.isArray(obj.skeleton.bones)) {
						for (const bone of obj.skeleton.bones) {
							updateLocalMatrices(bone, depth + 1)
						}
					}
				} catch (e) {
					// Skip objects that can't be updated
				}
			}

			updateLocalMatrices(model1, 0)
			updateLocalMatrices(model2, 0)

			// Re-validate before calling updateMatrixWorld
			ensureMatricesValid(model1, 0, new Set())
			ensureMatricesValid(model2, 0, new Set())

			// Update matrices to ensure bounding boxes reflect new positions
			try {
				model1.updateMatrixWorld(true)
				model2.updateMatrixWorld(true)
			} catch (updateError) {
				logger.warn('useComparison', 'Error updating matrices after position reset', updateError)
				// Try to recover
				ensureMatricesValid(model1, 0, new Set())
				ensureMatricesValid(model2, 0, new Set())
				updateLocalMatrices(model1, 0)
				updateLocalMatrices(model2, 0)
				model1.updateMatrixWorld(true)
				model2.updateMatrixWorld(true)
			}

			// Get bounding boxes for both models AFTER resetting positions
			// These are now relative to each model's local origin
			const box1 = new THREE.Box3().setFromObject(model1)
			const box2 = new THREE.Box3().setFromObject(model2)

			// Check if bounding boxes are valid
			if (box1.isEmpty() || box2.isEmpty()) {
				logger.warn('useComparison', 'Cannot fit models: one or both bounding boxes are empty')
				return
			}

			// Calculate sizes and centers (relative to each model's local origin)
			const size1 = box1.getSize(new THREE.Vector3())
			const size2 = box2.getSize(new THREE.Vector3())
			const center1 = box1.getCenter(new THREE.Vector3())
			const center2 = box2.getCenter(new THREE.Vector3())

			// Calculate separation - use a reasonable gap between model CENTERS
			const maxDimension = Math.max(size1.x, size1.y, size1.z, size2.x, size2.y, size2.z)
			const separation = maxDimension * 1.5 // Distance between model centers

			// Position models symmetrically around center (origin) at the same Y level
			// Layout: [model1]   •   [model2]
			// Where • is the center point (origin 0,0,0)
			// The origin should be exactly between the two model centers

			// Calculate where each model's bottom is (relative to model's local origin)
			// The model's bottom is at center.y - size.y/2 relative to its local origin
			const bottom1Local = center1.y - size1.y / 2
			const bottom2Local = center2.y - size2.y / 2

			logger.info('useComparison', 'Bounding box details BEFORE indicator re-add', {
				box1: { min: { x: box1.min.x, y: box1.min.y, z: box1.min.z }, max: { x: box1.max.x, y: box1.max.y, z: box1.max.z } },
				box2: { min: { x: box2.min.x, y: box2.min.y, z: box2.min.z }, max: { x: box2.max.x, y: box2.max.y, z: box2.max.z } },
				center1: { x: center1.x, y: center1.y, z: center1.z },
				center2: { x: center2.x, y: center2.y, z: center2.z },
				size1: { x: size1.x, y: size1.y, z: size1.z },
				size2: { x: size2.x, y: size2.y, z: size2.z },
				bottom1Local,
				bottom2Local,
			})

			// Calculate INDIVIDUAL Y offsets for each model to place their bottoms at Y=0
			// Each model needs its own offset because they might have different bounding box centers
			const model1YOffset = -bottom1Local // Model 1's Y position to place its bottom at Y=0
			const model2YOffset = -bottom2Local // Model 2's Y position to place its bottom at Y=0

			// Position model1 (original) to the left of center
			// Model center should be at -separation/2 so origin is exactly between them
			model1.position.x = -separation / 2
			model1.position.y = model1YOffset
			model1.position.z = 0
			model1.updateMatrix()

			// Position model2's WRAPPER (comparison) to the right of center
			// Model center should be at +separation/2 so origin is exactly between them
			// For Y: model2YOffset already accounts for the local offset (calculated from world bbox)
			// For X/Z: we need to compensate for the local offset to position correctly
			const targetWrapperX = separation / 2 - model2LocalOffset.x
			const targetWrapperY = model2YOffset // DON'T subtract local offset here!
			const targetWrapperZ = 0 - model2LocalOffset.z

			model2Positionable.position.x = targetWrapperX
			model2Positionable.position.y = targetWrapperY
			model2Positionable.position.z = targetWrapperZ
			model2Positionable.updateMatrix()
			model2Positionable.updateMatrixWorld(true)

			// Calculate expected model2 world position
			const expectedModel2WorldY = targetWrapperY + model2LocalOffset.y

			logger.info('useComparison', 'Wrapper positioning calculation', {
				model2LocalOffsetY: model2LocalOffset.y,
				model2YOffset,
				targetWrapperY,
				expectedModel2WorldY,
				shouldBeZero: 'expectedModel2WorldY should be close to 0!',
			})

			logger.info('useComparison', 'Target positions set', {
				model1: { x: model1.position.x, y: model1.position.y, z: model1.position.z },
				model2Wrapper: { x: model2Positionable.position.x, y: model2Positionable.position.y, z: model2Positionable.position.z },
				model2Local: { x: model2.position.x, y: model2.position.y, z: model2.position.z },
			})

			// Log positions IMMEDIATELY after setting them
			logger.info('useComparison', 'Positions IMMEDIATELY after position.set()', {
				model1Pos: { x: model1.position.x, y: model1.position.y, z: model1.position.z },
				model2WrapperPos: { x: model2Positionable.position.x, y: model2Positionable.position.y, z: model2Positionable.position.z },
				expectedModel2WrapperPos: { x: separation / 2, y: model2YOffset, z: 0 },
			})

			// Reset validation cache

			// CRITICAL: Validate entire scene hierarchy, not just models
			// Scene may contain grid, axes, lights, and other objects that need valid matrices
			if (scene) {
				ensureMatricesValid(scene, 0, new Set())
			}

			// CRITICAL: Validate all matrices BEFORE calling updateMatrixWorld
			// updateMatrixWorld multiplies with parent matrices, so all parents must be valid first
			ensureMatricesValid(model1, 0, new Set())
			ensureMatricesValid(model2, 0, new Set())

			// CRITICAL: Call updateMatrix() on all objects BEFORE updateMatrixWorld()
			// Ensure matrices exist before calling updateMatrix()
			updateLocalMatrices(model1, 0)
			updateLocalMatrices(model2, 0)

			// Re-validate after updateMatrix() calls to catch any missed objects
			ensureMatricesValid(model1, 0, new Set())
			ensureMatricesValid(model2, 0, new Set())

			// Now safe to update all world matrices recursively
			try {
				model1.updateMatrixWorld(true)
				model2.updateMatrixWorld(true)
			} catch (updateError) {
				logger.error('useComparison', 'Failed to update matrices after positioning', updateError)
				// Try one more time with full re-validation
				ensureMatricesValid(model1, 0, new Set())
				ensureMatricesValid(model2, 0, new Set())
				updateLocalMatrices(model1, 0)
				updateLocalMatrices(model2, 0)

				try {
					model1.updateMatrixWorld(true)
					model2.updateMatrixWorld(true)
				} catch (retryError) {
					logger.error('useComparison', 'Matrix update retry also failed', retryError)
					throw new Error('Failed to update model matrices: ' + retryError.message)
				}
			}

			logger.info('useComparison', 'Models positioned side by side centered around origin', {
				separation,
				model1Pos: { x: model1.position.x, y: model1.position.y, z: model1.position.z },
				model2WrapperPos: { x: model2Positionable.position.x, y: model2Positionable.position.y, z: model2Positionable.position.z },
				model1YOffset,
				model2YOffset,
				model1Size: { x: size1.x, y: size1.y, z: size1.z },
				model2Size: { x: size2.x, y: size2.y, z: size2.z },
				model1Center: { x: center1.x, y: center1.y, z: center1.z },
				model2Center: { x: center2.x, y: center2.y, z: center2.z },
				model1Bottom: bottom1Local,
				model2Bottom: bottom2Local,
			})

			// Validate scene again before calling fit function
			if (scene) {
				ensureMatricesValid(scene, 0, new Set())
			}
			ensureMatricesValid(model1, 0, new Set())
			ensureMatricesValid(model2, 0, new Set())

			// Log positions BEFORE fitFunction
			logger.info('useComparison', 'Model positions BEFORE fitFunction', {
				model1Pos: { x: model1.position.x, y: model1.position.y, z: model1.position.z },
				model2WrapperPos: { x: model2Positionable.position.x, y: model2Positionable.position.y, z: model2Positionable.position.z },
			})

			// Use the provided fit function to fit camera to both models
			// The fit function should handle OrbitControls.update() to ensure matrices are valid
			// Pass the wrapper for model2 so fitFunction sees the correct position
			fitFunction(model1, model2Positionable)

			// Log positions AFTER fitFunction
			logger.info('useComparison', 'Model positions AFTER fitFunction', {
				model1Pos: { x: model1.position.x, y: model1.position.y, z: model1.position.z },
				model2WrapperPos: { x: model2Positionable.position.x, y: model2Positionable.position.y, z: model2Positionable.position.z },
			})

			// Force scene update and verify final positions
			model1.updateMatrixWorld(true)
			model2Positionable.updateMatrixWorld(true)
			model2.updateMatrixWorld(true)

			// Recalculate bounding boxes to verify positioning
			const verifyBox2 = new THREE.Box3().setFromObject(model2Positionable)
			const verifyBottom2 = verifyBox2.min.y

			logger.info('useComparison', '🔍 FINAL VERIFICATION after all positioning', {
				model2WrapperWorldY: model2Positionable.position.y,
				model2LocalY: model2.position.y,
				model2WorldY: model2.getWorldPosition(new THREE.Vector3()).y,
				recalculatedBottom: verifyBottom2,
				shouldBeZero: 'recalculatedBottom should be ≈ 0',
				isModel2InWrapper: model2.parent === model2Positionable,
				isWrapperInScene: model2Positionable.parent === scene,
			})

			// Initialize animations for comparison model if present
			// Use rawModel2 (the actual model) not the wrapper, as AnimationMixer needs the root object
			if (comparisonAnimations.value && comparisonAnimations.value.length > 0) {
				initComparisonAnimations(rawModel2, comparisonAnimations.value)
			}

			// Indicator feature disabled - models positioned, no indicator to add
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
	 * Initialize animations for comparison model
	 * @param {THREE.Object3D} object3D - The model object (should be the actual model, not the wrapper)
	 * @param {Array<THREE.AnimationClip>} animations - Array of animation clips
	 */
	const initComparisonAnimations = (object3D, animations) => {
		if (!object3D || !animations || animations.length === 0) {
			logger.warn('useComparison', 'Cannot initialize comparison animations: invalid input', {
				hasObject3D: !!object3D,
				animationsCount: animations?.length || 0,
			})
			return
		}

		try {
			// Dispose existing mixer if any
			disposeComparisonAnimations()

			// Create new AnimationMixer for comparison model
			comparisonMixer.value = new AnimationMixer(object3D)

			// Create clip actions for all animations
			comparisonActions.value = animations.map((clip) => {
				const action = comparisonMixer.value.clipAction(clip)
				action.setLoop(AnimationMixer.LoopRepeat) // Default to looping
				return action
			})

			// Auto-play animations
			comparisonActions.value.forEach((action) => {
				action.play()
			})

			logger.info('useComparison', 'Comparison animations initialized', {
				count: animations.length,
				clips: animations.map(clip => clip.name || 'unnamed'),
			})
		} catch (error) {
			logger.error('useComparison', 'Failed to initialize comparison animations', error)
			disposeComparisonAnimations()
		}
	}

	/**
	 * Update comparison animation mixer (call from animation loop)
	 * @param {number} deltaTime - Time delta in seconds
	 */
	const updateComparisonAnimations = (deltaTime) => {
		if (comparisonMixer.value) {
			comparisonMixer.value.update(deltaTime)
		}
	}

	/**
	 * Dispose of comparison animation resources
	 */
	const disposeComparisonAnimations = () => {
		if (comparisonMixer.value) {
			// Stop all actions
			comparisonActions.value.forEach((action) => {
				action.stop()
			})

			// Clear actions
			comparisonActions.value = []

			// Dispose mixer
			comparisonMixer.value = null
		}

		comparisonAnimations.value = []
		logger.info('useComparison', 'Comparison animations disposed')
	}

	/**
	 * Clear comparison
	 * @param {THREE.Scene} scene - Optional scene to remove model from
	 */
	const clearComparison = (scene = null) => {
		// Cancel any ongoing load operations
		if (abortController.value) {
			abortController.value.abort()
			abortController.value = null
		}

		// Dispose animations first
		disposeComparisonAnimations()

		if (comparisonModel.value) {
			// Remove from scene if scene is provided and model is in scene
			if (scene && comparisonModel.value.parent) {
				scene.remove(comparisonModel.value)
				logger.info('useComparison', 'Comparison model removed from scene')
			}

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
		comparisonAnimations: readonly(comparisonAnimations),
		comparisonMixer: readonly(comparisonMixer),

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
		ensureMatricesValid,
		fitBothModelsToView,
		toggleOriginalModel,
		toggleComparisonModel,
		clearComparison,
		formatFileSize,
		initComparisonAnimations,
		updateComparisonAnimations,
		disposeComparisonAnimations,
		dispose,
	}
}
