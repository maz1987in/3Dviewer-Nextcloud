import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { BaseLoader } from '../BaseLoader.js'

class ThreeMfLoader extends BaseLoader {
	/**
	 * Constructor
	 */
	constructor() {
		super('ThreeMFLoader', ['3mf'])
		this.loader = new ThreeMFLoader()
	}

	/**
	 * Load 3MF model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { fileId, filename } = context

		try {
			const object = this.loader.parse(arrayBuffer)
			return this.processModel(object, { fileId, filename })
		} catch (error) {
			this.logError('Failed to parse 3MF model', { error: error.message })
			throw new Error('Failed to parse 3MF model')
		}
	}
}

export { ThreeMfLoader }
