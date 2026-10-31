import { BaseLoader } from '../BaseLoader.js'
import { loadSplatModel } from './splatModel.js'

/**
 * Gaussian splats in antimatter15's .splat layout, read by Spark (splats/loadSplat.js).
 */
class SplatLoader extends BaseLoader {

	constructor() {
		super('SplatLoader', ['splat'])
	}

	/**
	 * @param {Blob|ArrayBuffer} input - The file
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(input, context) {
		return loadSplatModel(this, input, { ...context, fileExtension: 'splat' })
	}

}

export default SplatLoader
