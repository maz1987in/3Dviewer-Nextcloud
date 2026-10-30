import { BaseLoader } from '../BaseLoader.js'
import { loadPointCloud } from './pointCloud.js'

/**
 * XYZ scans (pointclouds/readers/xyz.js); a chemistry .xyz is refused there.
 */
class XyzLoader extends BaseLoader {

	constructor() {
		super('XYZLoader', ['xyz'])
	}

	/**
	 * @param {Blob|ArrayBuffer} input - The file
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(input, context) {
		return loadPointCloud(this, input, { ...context, fileExtension: 'xyz' })
	}

}

export default XyzLoader
