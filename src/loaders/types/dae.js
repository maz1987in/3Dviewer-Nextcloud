import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { BaseLoader } from '../BaseLoader.js'
import { decodeTextFromBuffer } from '../../utils/fileHelpers.js'

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
		const text = decodeTextFromBuffer(arrayBuffer)

		// Create Collada loader
		this.loader = new ColladaLoader()

		// Parse the DAE content
		const collada = this.loader.parse(text)

		// Get the scene from the parsed DAE
		const daeScene = collada.scene

		if (!daeScene) {
			throw new Error('No scene found in DAE file')
		}
		
		// DAE (Collada) uses Z-up coordinate system by specification
		// Rotate to Y-up (Three.js standard) by rotating -90° around X-axis
		daeScene.rotation.x = -Math.PI / 2

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
}

// Export the class as default so the registry can instantiate it
export default DaeLoader
