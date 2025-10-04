import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * 3DS loader class
 */
class ThreeDSLoader extends BaseLoader {

	constructor() {
		super('ThreeDSLoader', ['3ds'])
		this.loader = null
	}

	/**
	 * Load 3DS model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { THREE } = context

		// Create 3DS loader
		this.loader = new TDSLoader()

		// Parse the 3DS file directly from arrayBuffer
		const object3D = this.loader.parse(arrayBuffer)

		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in 3DS file')
		}

		this.logInfo('3DS model loaded successfully', {
			children: object3D.children.length,
		})

		// Process the result
		return this.processModel(object3D, context)
	}

}

// Export the class as default so the registry can instantiate it
export default ThreeDSLoader
