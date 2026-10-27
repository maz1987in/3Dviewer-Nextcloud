/**
 * Base loader class providing common functionality for all 3D model loaders
 */

import * as THREE from 'three'
import {
	createStandardMaterial,
	calculateBoundingBox,
	centerObject,
	applyWireframe,
	disposeObject,
} from '../utils/three-utils.js'
import { optimizeAllTextures, estimateTextureMemory } from '../utils/textureOptimizer.js'
import {
	handleLoaderError,
	createErrorState,
	withErrorBoundary,
} from '../utils/error-handler.js'
import {
	validateArrayBuffer,
	validateFileExtension,
} from '../utils/validation.js'
import {
	LOADING_STAGES,
} from '../constants/index.js'
import { logger } from '../utils/logger.js'

/**
 * The names a loader's request for a texture may match a fetched companion by.
 *
 * Loaders ask for the reference as the model wrote it, `C:\textures\wood.jpg` or
 * `file:///C:/My%20Textures/wood%20grain.jpg?v=2`, while the companion was fetched under
 * the bare, decoded name normaliseRef() in textureReferences.js gives it. So: the last
 * segment after either separator, that segment percent-decoded when it differs, and,
 * where the decoding holds a separator, the last segment of what it decodes to. A
 * `file:` URL loses its query and fragment first, as normaliseRef drops them; any other
 * reference keeps them, since `#` and `?` are legal in a file name on disk. A `file:`
 * URL's decoded name comes first, since that is the name its companion was fetched by;
 * for anything else the name as written does.
 *
 * Kept here rather than beside normaliseRef: every loader chunk already imports this
 * module, and importing that one from them would split it into a chunk of its own, which
 * the main entry then pays for in its preload list.
 *
 * @param {string} url - what the loader asked for
 * @return {string[]} one to three candidate names, the likelier first
 */
export function requestedFileNames(url) {
	let text = String(url)
	const fileUrl = /^[ \t\n\r\v\f]*file:/i.test(text)
	if (fileUrl) {
		const end = text.search(/[?#]/)
		if (end !== -1) {
			text = text.slice(0, end)
		}
	}
	const name = text.split(/[/\\]/).pop() || ''
	let decoded = name
	try {
		decoded = decodeURIComponent(name)
	} catch {
		// A malformed escape is kept as written, as normaliseRef keeps it
	}
	if (decoded === name) {
		return [name]
	}
	if (fileUrl) {
		// A file: URL's name is decoded once and must hold no separator, as normaliseRef
		// refuses one that does
		return [decoded, name]
	}
	// Anything else was decoded before it was normalised, so an encoded separator,
	// `..%2F..%2Fmaps%2Fwood.png` or `C:%5Cx%5Cwood.png`, divides it into folders like any
	// other: its companion was fetched by the last segment of the decoded reference
	const decodedName = decoded.split(/[/\\]/).pop() || ''
	return [...new Set([name, decoded, decodedName])].filter(Boolean)
}

/**
 * An opaque white pixel: a texture that requests nothing and leaves the material's own
 * colour as it is.
 */
export const NO_TEXTURE_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP4DwQACfsD/Wj6HMwAAAAASUVORK5CYII='

/**
 * What a loader's URL modifier hands back for a URL that matches none of the model's
 * companions, so that the browser never requests it.
 *
 * A model names its textures with any URL it likes, `https://elsewhere/x.png` or a UNC
 * path that a browser reads as `https://host/x.png`; requested as written, the viewer's
 * browser would contact a host of the model author's choosing, with only the page's
 * Content Security Policy in the way. So:
 *
 * - `data:` and `blob:` URLs are the loader's own (an embedded image, a GLB's images) and
 *   are kept: a `blob:` URL can only name an object made by this origin
 * - in the thumbnail worker, three's default manager carries the worker's resolver, which
 *   maps a handed file to an object URL or records a refusal that fails the job; its
 *   answer is used
 * - anywhere else, on the page, the URL becomes NO_TEXTURE_URL, and nothing is requested
 *
 * The app's decoder assets never come here: DRACO, KTX2 and the other decoders load them
 * through their own loaders and managers.
 *
 * @param {string} url - what the loader asked for, matched to no companion
 * @return {string} the URL to load instead
 */
export function unmatchedResourceUrl(url) {
	const text = String(url)
	if (/^(data|blob):/i.test(text)) {
		return text
	}
	const resolved = THREE.DefaultLoadingManager.resolveURL(text)
	return resolved !== text ? resolved : NO_TEXTURE_URL
}

/**
 * A loading manager whose URL modifier maps a request to a companion with `match`, and
 * anything it does not match to unmatchedResourceUrl(), so that nothing a model names
 * is requested from the network.
 *
 * @param {(url: string) => ?string} [match] - a companion's URL for a request, or null
 * @return {THREE.LoadingManager} the manager
 */
export function companionLoadingManager(match = () => null) {
	const manager = new THREE.LoadingManager()
	manager.setURLModifier((url) => {
		if (/^(data|blob):/i.test(String(url))) {
			return url
		}
		return match(url) ?? unmatchedResourceUrl(url)
	})
	return manager
}

/**
 * Base loader class with common functionality
 */
export class BaseLoader {

	constructor(loaderName, supportedExtensions = []) {
		this.loaderName = loaderName
		this.supportedExtensions = supportedExtensions
		this.isLoading = false
		this.abortController = null
	}

	/**
	 * Load a 3D model from ArrayBuffer
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async load(arrayBuffer, context) {
		return withErrorBoundary(async () => {
			this.isLoading = true
			this.abortController = new AbortController()

			try {
				// Validate input
				this.validateInput(arrayBuffer, context)

				// Update progress
				this.updateProgress(context, 0, 100, LOADING_STAGES.PARSING)

				// Load the model
				const result = await this.loadModel(arrayBuffer, context)

				// Update progress
				this.updateProgress(context, 100, 100, LOADING_STAGES.COMPLETE)

				return result
			} finally {
				this.isLoading = false
				this.abortController = null
			}
		}, this.loaderName)
	}

	/**
	 * Validate input parameters
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @throws {Error} If validation fails
	 */
	validateInput(arrayBuffer, context) {
		validateArrayBuffer(arrayBuffer, `${this.loaderName} file`)

		if (context.extension) {
			validateFileExtension(context.extension, this.supportedExtensions, `${this.loaderName} file`)
		}
	}

	/**
	 * Load the actual model (to be implemented by subclasses)
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		throw new Error(`${this.loaderName} must implement loadModel method`)
	}

	/**
	 * Create a standard material for the model
	 * @param {object} options - Material options
	 * @return {THREE.Material} Material
	 */
	createMaterial(options = {}) {
		return createStandardMaterial({
			color: 0x888888,
			metalness: 0.1,
			roughness: 0.8,
			...options,
		})
	}

	/**
	 * Create a basic material for simple objects
	 * @param {object} options - Material options
	 * @return {THREE.Material} Material
	 */
	createBasicMaterial(options = {}) {
		return new THREE.MeshBasicMaterial({
			color: 0x666666,
			transparent: true,
			opacity: 0.6,
			...options,
		})
	}

	/**
	 * Process the loaded model
	 * @param {THREE.Object3D} object3D - Loaded object
	 * @param {object} context - Loading context
	 * @return {object} Processed result
	 */
	processModel(object3D, context) {
		// Validate object
		if (!object3D || !object3D.isObject3D) {
			throw new Error('Invalid 3D object loaded')
		}

		// Remove placeholder objects
		this.ensurePlaceholderRemoved(context)

		// Apply wireframe if needed
		if (context.wireframe) {
			applyWireframe(object3D, true)
		}

		// Update matrix world to ensure all transformations (rotations, scales) are applied
		// This is especially important for DAE files which have a Z-up to Y-up rotation
		object3D.updateMatrixWorld(true)

		// Optimize textures based on quality settings
		const texStats = optimizeAllTextures(object3D, THREE)
		const texMemory = estimateTextureMemory(object3D)

		// Calculate bounding box
		const { box, center, size } = calculateBoundingBox(object3D)

		// Center the model
		centerObject(object3D)

		// Add to scene if provided
		if (context.scene) {
			context.scene.add(object3D)
		}

		return {
			object3D,
			boundingBox: box,
			center,
			size,
			isEmpty: box.isEmpty(),
			textureStats: {
				...texStats,
				memory: texMemory,
			},
		}
	}

	/**
	 * Ensure placeholder objects are removed
	 * @param {object} context - Loading context
	 */
	ensurePlaceholderRemoved(context) {
		if (context.ensurePlaceholderRemoved && typeof context.ensurePlaceholderRemoved === 'function') {
			context.ensurePlaceholderRemoved()
		}
	}

	/**
	 * Update loading progress
	 * @param {object} context - Loading context
	 * @param {number} loaded - Bytes loaded
	 * @param {number} total - Total bytes
	 * @param {string} stage - Loading stage
	 */
	updateProgress(context, loaded, total, stage) {
		if (context.updateProgress && typeof context.updateProgress === 'function') {
			context.updateProgress(loaded, total, stage)
		}
	}

	/**
	 * Log information message
	 * @param {string} message - Message to log
	 * @param {object} data - Additional data
	 */
	logInfo(message, data = {}) {
		logger.info(this.loaderName, message, data)
	}

	/**
	 * Log warning message
	 * @param {string} message - Message to log
	 * @param {object} data - Additional data
	 */
	logWarning(message, data = {}) {
		logger.warn(this.loaderName, message, data)
	}

	/**
	 * Log error message
	 * @param {string} message - Message to log
	 * @param {Error} error - Error object
	 */
	logError(message, error) {
		logger.error(this.loaderName, message, error)
	}

	/**
	 * Create a mesh with geometry and material
	 * @param {THREE.BufferGeometry} geometry - Geometry
	 * @param {THREE.Material} material - Material
	 * @param {object} options - Additional options
	 * @return {THREE.Mesh} Mesh
	 */
	createMesh(geometry, material, options = {}) {
		const mesh = new THREE.Mesh(geometry, material)

		if (options.position) {
			mesh.position.copy(options.position)
		}
		if (options.rotation) {
			mesh.rotation.copy(options.rotation)
		}
		if (options.scale) {
			mesh.scale.copy(options.scale)
		}

		return mesh
	}

	/**
	 * Create a group to hold multiple objects
	 * @param {THREE.Object3D[]} objects - Objects to group
	 * @return {THREE.Group} Group
	 */
	createGroup(objects = []) {
		const group = new THREE.Group()
		objects.forEach(obj => group.add(obj))
		return group
	}

	/**
	 * Dispose of resources to prevent memory leaks
	 * @param {THREE.Object3D} object3D - Object to dispose
	 */
	dispose(object3D) {
		if (object3D) {
			disposeObject(object3D)
		}
	}

	/**
	 * Cancel ongoing loading operation
	 */
	cancel() {
		if (this.abortController) {
			this.abortController.abort()
		}
		this.isLoading = false
	}

	/**
	 * Check if loader is currently loading
	 * @return {boolean} Loading state
	 */
	getLoadingState() {
		return this.isLoading
	}

	/**
	 * Get supported file extensions
	 * @return {string[]} Supported extensions
	 */
	getSupportedExtensions() {
		return [...this.supportedExtensions]
	}

	/**
	 * Check if extension is supported
	 * @param {string} extension - File extension
	 * @return {boolean} Whether extension is supported
	 */
	isSupported(extension) {
		return this.supportedExtensions.includes(extension.toLowerCase())
	}

	/**
	 * Create error state for UI display
	 * @param {Error} error - Error object
	 * @param {object} context - Additional context
	 * @return {object} Error state
	 */
	createErrorState(error, context = {}) {
		return createErrorState(error, {
			loaderName: this.loaderName,
			...context,
		})
	}

	/**
	 * Handle loading errors
	 * @param {Error} error - Error object
	 * @param {object} context - Additional context
	 * @return {Error} Processed error
	 */
	handleError(error, context = {}) {
		return handleLoaderError(this.loaderName, error, context)
	}

}

/**
 * Factory function to create loader instances
 * @param {string} loaderName - Name of the loader
 * @param {string[]} supportedExtensions - Supported file extensions
 * @return {BaseLoader} Loader instance
 */
export function createLoader(loaderName, supportedExtensions) {
	return new BaseLoader(loaderName, supportedExtensions)
}

/**
 * Mixin for loaders that need to handle materials
 */
export const MaterialLoaderMixin = {
	/**
	 * Load material from URL
	 * @param {string} url - Material URL
	 * @param {object} options - Loading options
	 * @return {Promise<THREE.Material>} Loaded material
	 */
	async loadMaterial(url, options = {}) {
		try {
			const response = await fetch(url, {
				signal: this.abortController?.signal,
				...options,
			})

			if (!response.ok) {
				throw new Error(`Failed to load material: ${response.status}`)
			}

			const text = await response.text()
			return this.parseMaterial(text, options)
		} catch (error) {
			this.logWarning('Failed to load material', { url, error: error.message })
			return null
		}
	},

	/**
	 * Parse material text (to be implemented by subclasses)
	 * @param {string} text - Material text
	 * @param {object} options - Parsing options
	 */
	parseMaterial(text, options) {
		throw new Error('parseMaterial must be implemented by subclasses')
	},
}

/**
 * Mixin for loaders that need to handle textures
 */
export const TextureLoaderMixin = {
	/**
	 * Load texture from URL
	 * @param {string} url - Texture URL
	 * @param {object} options - Loading options
	 * @return {Promise<THREE.Texture>} Loaded texture
	 */
	async loadTexture(url, options = {}) {
		try {
			const loader = new THREE.TextureLoader()
			return new Promise((resolve, reject) => {
				const texture = loader.load(
					url,
					resolve,
					undefined,
					reject,
				)

				if (this.abortController) {
					this.abortController.signal.addEventListener('abort', () => {
						texture.dispose()
						reject(new Error('Loading aborted'))
					})
				}
			})
		} catch (error) {
			this.logWarning('Failed to load texture', { url, error: error.message })
			return null
		}
	},
}
