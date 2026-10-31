import { BaseLoader } from '../BaseLoader.js'
import { loadSplatModel } from './splatModel.js'

/**
 * Gaussian splats in Niantic's compressed .spz, read by Spark (splats/loadSplat.js).
 */
class SpzLoader extends BaseLoader {

	constructor() {
		super('SpzLoader', ['spz'])
	}

	/**
	 * @param {Blob|ArrayBuffer} input - The file
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(input, context) {
		return loadSplatModel(this, input, { ...context, fileExtension: 'spz' })
	}

}

export default SpzLoader
