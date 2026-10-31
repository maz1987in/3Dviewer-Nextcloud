import { BaseLoader } from '../BaseLoader.js'
import { loadPointCloud } from './pointCloud.js'

/**
 * E57 laser scans (pointclouds/readers/e57.js), in metres.
 */
class E57Loader extends BaseLoader {

	constructor() {
		super('E57Loader', ['e57'])
	}

	/**
	 * @param {Blob|ArrayBuffer} input - The file
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(input, context) {
		return loadPointCloud(this, input, { ...context, fileExtension: 'e57' })
	}

}

export default E57Loader
