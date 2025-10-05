/* global THREE */
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
			// Create a custom resource manager that serves files from our additional files
			const resourceMap = new Map()
			
			// Map filename to File object
			for (const file of additionalFiles) {
				resourceMap.set(file.name, file)
				this.logInfo('Added resource to map:', file.name)
			}

			// Override the GLTFLoader's load method to use our resource map
			const originalLoad = this.loader.load.bind(this.loader)
			this.loader.load = (url, onLoad, onProgress, onError) => {
				// Check if this URL matches one of our additional files
				const filename = url.split('/').pop()
				if (resourceMap.has(filename)) {
					const file = resourceMap.get(filename)
					
					// For binary files, we need to provide the ArrayBuffer directly
					// Create a mock response that the GLTF loader expects
					file.arrayBuffer().then(arrayBuffer => {
						this.logInfo('Providing binary data for:', filename, {
							size: arrayBuffer.byteLength,
							type: file.type
						})
						
						// Create a mock XMLHttpRequest response
						const mockResponse = {
							response: arrayBuffer,
							status: 200,
							statusText: 'OK',
							responseType: 'arraybuffer'
						}
						
						// Call the onLoad callback with the mock response
						if (onLoad) {
							onLoad(mockResponse)
						}
					}).catch(error => {
						this.logError('Failed to convert file to ArrayBuffer', { 
							filename, 
							error: error.message 
						})
						if (onError) {
							onError(error)
						}
					})
				} else {
					// Fall back to original load method for embedded resources
					originalLoad(url, onLoad, onProgress, onError)
				}
			}

			this.logInfo('Resource manager setup complete', { 
				resources: additionalFiles.length 
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
				dracoLoader.setDecoderPath('/apps/threedviewer/decoder/')
				this.loader.setDRACOLoader(dracoLoader)
				this.logInfo('DRACO loader configured')
			} catch (error) {
				this.logWarning('DRACO loader unavailable', { error: error.message })
			}
		}

		// Configure KTX2 loader
		if (hasKtx2) {
			try {
				const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
				const ktx2Loader = new KTX2Loader()
				ktx2Loader.setTranscoderPath('/apps/threedviewer/decoder/')
				ktx2Loader.detectSupport(renderer)
				this.loader.setKTX2Loader(ktx2Loader)
				this.logInfo('KTX2 loader configured')
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

