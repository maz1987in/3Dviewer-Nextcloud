import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * FBX loader class
 */
class FbxLoader extends BaseLoader {

	constructor() {
		super('FBXLoader', ['fbx'])
		this.loader = null
	}

	/**
	 * Load FBX model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { THREE } = context

		// Create FBX loader
		this.loader = new FBXLoader()

		// Parse the FBX file directly from arrayBuffer
		const object3D = this.loader.parse(arrayBuffer)

		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in FBX file')
		}

		this.logInfo('FBX model loaded successfully', {
			children: object3D.children.length,
		})

		// Process the result
		return this.processModel(object3D, context)
	}

}

// Export the class as default so the registry can instantiate it
export default FbxLoader
