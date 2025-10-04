import { BaseLoader } from '../BaseLoader.js'

/**
 * VRML loader class
 */
class VrmlLoader extends BaseLoader {

	constructor() {
		super('VRMLLoader', ['vrml', 'wrl'])
		this.loader = null
	}

	/**
	 * Load VRML model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		// Convert ArrayBuffer to text for parsing
		const text = this.decodeText(arrayBuffer)

		// Check if it looks like a VRML file
		if (!text.toLowerCase().includes('vrml') && !text.toLowerCase().includes('#vrml')) {
			throw new Error('File does not appear to be a valid VRML file')
		}

		// Load VRML loader dynamically
		const { VRMLLoader } = await import('three/examples/jsm/loaders/VRMLLoader.js')
		this.loader = new VRMLLoader()

		return new Promise((resolve, reject) => {
			try {
				// Parse the VRML content
				this.loader.parse(text, (result) => {
					try {
						if (!result.scene) {
							throw new Error('No scene found in VRML file')
						}

						const vrmlScene = result.scene

						this.logInfo('VRML model loaded successfully', {
							animations: result.animations?.length || 0,
						})

						// Process the result
						const processedResult = this.processModel(vrmlScene, context)

						// Add animations if available
						if (result.animations && result.animations.length > 0) {
							processedResult.animations = result.animations
						}

						resolve(processedResult)
					} catch (error) {
						reject(new Error(`Failed to process VRML scene: ${error.message}`))
					}
				})
			} catch (error) {
				reject(new Error(`Failed to load VRML file: ${error.message}`))
			}
		})
	}

	/**
	 * Decode ArrayBuffer to text
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @return {string} Decoded text
	 */
	decodeText(arrayBuffer) {
		const textDecoder = new TextDecoder('utf-8', { fatal: false })
		const text = textDecoder.decode(arrayBuffer)

		if (!text || text.trim().length === 0) {
			throw new Error('Empty or invalid VRML file')
		}

		return text
	}

}

// Export the class as default so the registry can instantiate it
export default VrmlLoader
