import { BaseLoader } from '../BaseLoader.js'
import { loadPointCloud } from './pointCloud.js'

/**
 * LAS and LAZ scans (pointclouds/readers/las.js), with the unit their coordinate system names.
 */
class LasLoader extends BaseLoader {

	constructor() {
		super('LASLoader', ['las', 'laz'])
	}

	/**
	 * @param {Blob|ArrayBuffer} input - The file
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(input, context) {
		return loadPointCloud(this, input, { ...context, fileExtension: context.fileExtension === 'laz' ? 'laz' : 'las' })
	}

}

export default LasLoader
