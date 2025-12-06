import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * GLTF/GLB loader class
 */
class GltfLoader extends BaseLoader {

	constructor() {
		super('GLTFLoader', ['glb', 'gltf'])
		this.loader = null
	}

	/**
	 * Load GLTF/GLB model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { renderer, hasDraco, hasKtx2, hasMeshopt, additionalFiles } = context

		// Detect if we're in modal viewer context (CSP restrictions)
		// Check if we're in an iframe or if blob: URLs are likely to be blocked
		const isModalContext = this.detectModalContext()

		// Patch texture loading to handle CSP restrictions in modal context
		// Must be done BEFORE creating the GLTFLoader
		let textureLoaderPatch = null
		if (isModalContext) {
			textureLoaderPatch = await this.patchTextureLoaderForCSP()
			this.logInfo('GLTFLoader', 'Modal context detected - texture loader patched for CSP compatibility')
		}

		// Create loader (after patching)
		this.loader = new GLTFLoader()

		// Configure decoders
		await this.configureDecoders(renderer, hasDraco, hasKtx2, hasMeshopt)

		// Set up resource manager for multi-file loading
		if (additionalFiles && additionalFiles.length > 0) {
			await this.setupResourceManager(additionalFiles, isModalContext)
		}

		try {
			// Parse the model (pass extension for format detection)
			const extension = context.fileExtension || 'gltf'
			const gltf = await this.parseModel(arrayBuffer, extension)

			// Process the result
			return this.processModel(gltf.scene, context)
		} finally {
			// Restore original texture loader if we patched it
			if (textureLoaderPatch && textureLoaderPatch.restore) {
				textureLoaderPatch.restore()
			}
		}
	}

	/**
	 * Detect if we're in modal viewer context (where CSP might block blob URLs)
	 * @return {boolean} True if in modal context
	 */
	detectModalContext() {
		// Always log detection attempt for debugging
		this.logInfo('GLTFLoader', 'Checking for modal context...', {
			isIframe: window.self !== window.top,
			hasWrapper: !!document.querySelector('.threedviewer-wrapper'),
			hasAppRoot: !!document.getElementById('threedviewer'),
			appRootHasFileId: !!(document.getElementById('threedviewer')?.dataset?.fileId),
		})

		// Check if we're in an iframe (modal viewer is typically in an iframe)
		if (window.self !== window.top) {
			this.logInfo('GLTFLoader', 'Modal context detected: iframe detected')
			return true
		}

		// Check if ViewerComponent is present (modal viewer uses ViewerComponent)
		// ViewerComponent creates .threedviewer-wrapper but NOT #threedviewer
		// Standalone App.vue creates #threedviewer with data-fileId
		const hasWrapper = document.querySelector('.threedviewer-wrapper')
		const appRoot = document.getElementById('threedviewer')
		
		if (hasWrapper && (!appRoot || !appRoot.dataset?.fileId)) {
			this.logInfo('GLTFLoader', 'Modal context detected: ViewerComponent present without standalone app root')
			return true
		}

		this.logInfo('GLTFLoader', 'Standalone context detected - CSP patch not needed')
		return false
	}

	/**
	 * Patch FileLoader to handle blob URLs that may be blocked by CSP
	 * GLTFLoader uses FileLoader internally, so we need to patch FileLoader
	 * @return {object} Patch object with restore method
	 */
	async patchTextureLoaderForCSP() {
		// Note: We can't easily patch FileLoader due to build constraints,
		// but we can at least log that we're in modal context and textures may fail
		// The model will still load successfully, just without textures
		this.logInfo('GLTFLoader', 'Modal viewer detected - textures with embedded blob URLs may be blocked by CSP')
		this.logInfo('GLTFLoader', 'Model geometry will load, but some textures may be missing')
		this.logInfo('GLTFLoader', 'For full texture support, use the standalone viewer at /apps/threedviewer/f/{fileId}')
		
		// Return a no-op restore function
		return {
			restore: () => {
				// Nothing to restore
			}
		}
	}

	/**
	 * Set up resource manager for multi-file loading
	 * @param {Array<File>} additionalFiles - Array of dependency files
	 * @param {boolean} useDataURIs - Whether to use data URIs instead of blob URLs
	 */
	async setupResourceManager(additionalFiles, useDataURIs = false) {
		try {
			// Create a map of URLs (blob URLs or data URIs) for each file
			const resourceMap = new Map()

			// Convert each File to a blob URL or data URI
			for (const file of additionalFiles) {
				let url
				if (useDataURIs) {
					// Convert to data URI for CSP compatibility
					const blob = new Blob([file], { type: file.type || 'application/octet-stream' })
					url = await this.blobToDataURI(blob)
					this.logInfo('Created data URI for resource:', file.name, { type: file.type, size: file.size })
				} else {
					// Use blob URL (works in standalone viewer)
					const blob = new Blob([file], { type: file.type || 'application/octet-stream' })
					url = URL.createObjectURL(blob)
					this.logInfo('Created blob URL for resource:', file.name, { type: file.type, size: file.size })
				}
				resourceMap.set(file.name, url)
			}

			// Create a custom LoadingManager with URL modifier
			const manager = new THREE.LoadingManager()

			manager.setURLModifier((url) => {
				// Extract filename from URL
				const filename = url.split('/').pop().split('?')[0]

				// Check if we have this file
				if (resourceMap.has(filename)) {
					const resourceUrl = resourceMap.get(filename)
					this.logInfo('Resolving resource:', filename, { useDataURI: useDataURIs })
					return resourceUrl
				}

				// Return original URL if not found
				this.logWarning('Resource not found in map, using original URL:', filename)
				return url
			})

			// Set the custom manager on the loader
			this.loader.manager = manager

			this.logInfo('Resource manager setup complete', {
				resources: additionalFiles.length,
				files: Array.from(resourceMap.keys()),
				useDataURIs,
			})
		} catch (error) {
			this.logWarning('Failed to setup resource manager', {
				error: error.message,
			})
		}
	}

	/**
	 * Convert a Blob to a data URI
	 * @param {Blob} blob - Blob to convert
	 * @return {Promise<string>} Data URI string
	 */
	blobToDataURI(blob) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	}

	/**
	 * Configure decoders for compressed formats
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 * @param {boolean} hasDraco - Whether DRACO is available
	 * @param {boolean} hasKtx2 - Whether KTX2 is available
	 * @param {boolean} hasMeshopt - Whether Meshopt is available
	 */
	async configureDecoders(renderer, hasDraco, hasKtx2, hasMeshopt) {
		// Configure DRACO loader
		if (hasDraco) {
			try {
				const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js')
				const dracoLoader = new DRACOLoader()
				dracoLoader.setDecoderPath('/apps/threedviewer/draco/')
				this.loader.setDRACOLoader(dracoLoader)
				this.logInfo('DRACO loader configured', { path: '/apps/threedviewer/draco/' })
			} catch (error) {
				this.logWarning('DRACO loader unavailable', { error: error.message })
			}
		}

		// Configure KTX2 loader
		if (hasKtx2) {
			try {
				const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
				const ktx2Loader = new KTX2Loader()
				ktx2Loader.setTranscoderPath('/apps/threedviewer/basis/')
				ktx2Loader.detectSupport(renderer)
				this.loader.setKTX2Loader(ktx2Loader)
				this.logInfo('KTX2 loader configured', { path: '/apps/threedviewer/basis/' })
			} catch (error) {
				this.logWarning('KTX2 loader unavailable', { error: error.message })
			}
		}

		// Configure Meshopt decoder
		if (hasMeshopt) {
			try {
				const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js')
				if (MeshoptDecoder) {
					this.loader.setMeshoptDecoder(MeshoptDecoder)
					this.logInfo('Meshopt decoder configured')
				}
			} catch (error) {
				this.logWarning('Meshopt decoder unavailable', { error: error.message })
			}
		}
	}

	/**
	 * Parse the GLTF model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {string} extension - File extension (glb or gltf)
	 * @return {Promise<object>} Parsed GLTF
	 */
	async parseModel(arrayBuffer, extension = null) {
		return new Promise((resolve, reject) => {
			try {
				// Check if this is a GLB file (binary format)
				// GLB files start with magic number 0x46546C67 ("glTF" in ASCII)
				const isGLB = this.isGLBFormat(arrayBuffer, extension)

				if (isGLB) {
					this.logInfo('Detected GLB binary format', { size: arrayBuffer.byteLength })
				} else {
					this.logInfo('Detected GLTF JSON format', { size: arrayBuffer.byteLength })
				}

				this.loader.parse(arrayBuffer, '', (gltf) => {
					this.logInfo('GLTF model parsed successfully', {
						scenes: gltf.scenes?.length || 0,
						animations: gltf.animations?.length || 0,
						materials: gltf.materials?.length || 0,
					})
					resolve(gltf)
				}, (error) => {
					this.logError('Failed to parse GLTF model', error)
					reject(error)
				})
			} catch (error) {
				this.logError('Error in parseModel', error)
				reject(error)
			}
		})
	}

	/**
	 * Detect if arrayBuffer is GLB format (binary) or GLTF format (JSON)
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {string} extension - File extension hint
	 * @return {boolean} True if GLB (binary), false if GLTF (JSON)
	 */
	isGLBFormat(arrayBuffer, extension = null) {
		// Check file extension first
		if (extension) {
			return extension.toLowerCase() === 'glb'
		}

		// Check magic number: GLB files start with 0x46546C67 ("glTF" in ASCII)
		if (arrayBuffer.byteLength < 4) {
			return false
		}

		const view = new DataView(arrayBuffer)
		const magic = view.getUint32(0, true) // Little-endian
		const GLB_MAGIC = 0x46546C67 // "glTF" in ASCII

		return magic === GLB_MAGIC
	}

}

export { GltfLoader }
