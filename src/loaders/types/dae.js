import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * DAE (Collada) loader class
 */
class DaeLoader extends BaseLoader {

	constructor() {
		super('DAELoader', ['dae'])
		this.loader = null
	}

	/**
	 * Load DAE model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		// Convert ArrayBuffer to text for XML parsing
		const text = this.decodeText(arrayBuffer)

		// Create Collada loader
		this.loader = new ColladaLoader()

		// Parse the DAE content
		const collada = this.loader.parse(text)

		// Get the scene from the parsed DAE
		const daeScene = collada.scene

		if (!daeScene) {
			throw new Error('No scene found in DAE file')
		}

		this.logInfo('DAE model loaded successfully', {
			animations: collada.animations?.length || 0,
		})

		// Process the result
		const result = this.processModel(daeScene, context)

		// Add animations if available
		if (collada.animations && collada.animations.length > 0) {
			result.animations = collada.animations
		}

		return result
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
			throw new Error('Empty or invalid DAE file content')
		}

		return text
	}

}

// Export the class as default so the registry can instantiate it
export default DaeLoader
