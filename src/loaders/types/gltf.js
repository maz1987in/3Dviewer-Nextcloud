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

		// Create loader
		this.loader = new GLTFLoader()

		// Configure decoders
		await this.configureDecoders(renderer, hasDraco, hasKtx2, hasMeshopt)

		// Set up resource manager for multi-file loading
		if (additionalFiles && additionalFiles.length > 0) {
			await this.setupResourceManager(additionalFiles)
		}

		// Parse the model
		const gltf = await this.parseModel(arrayBuffer)

		// Process the result
		return this.processModel(gltf.scene, context)
	}

	/**
	 * Set up resource manager for multi-file loading
	 * @param {Array<File>} additionalFiles - Array of dependency files
	 */
	async setupResourceManager(additionalFiles) {
		try {
			// Create a map of blob URLs for each file
			const resourceMap = new Map()
			
			// Convert each File to a blob URL
			for (const file of additionalFiles) {
				const blob = new Blob([file], { type: file.type || 'application/octet-stream' })
				const blobUrl = URL.createObjectURL(blob)
				resourceMap.set(file.name, blobUrl)
				this.logInfo('Created blob URL for resource:', file.name, { type: file.type, size: file.size })
			}

			// Create a custom LoadingManager with URL modifier
			const manager = new THREE.LoadingManager()
			
			manager.setURLModifier((url) => {
				// Extract filename from URL
				const filename = url.split('/').pop().split('?')[0]
				
				// Check if we have this file
				if (resourceMap.has(filename)) {
					const blobUrl = resourceMap.get(filename)
					this.logInfo('Resolving resource from blob:', filename)
					return blobUrl
				}
				
				// Return original URL if not found
				this.logWarning('Resource not found in map, using original URL:', filename)
				return url
			})
			
			// Set the custom manager on the loader
			this.loader.manager = manager

			this.logInfo('Resource manager setup complete', { 
				resources: additionalFiles.length,
				files: Array.from(resourceMap.keys())
			})
		} catch (error) {
			this.logWarning('Failed to setup resource manager', { 
				error: error.message 
			})
		}
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
	 * @return {Promise<object>} Parsed GLTF
	 */
	async parseModel(arrayBuffer) {
		return new Promise((resolve, reject) => {
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
		})
	}

}

export { GltfLoader }

