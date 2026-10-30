import { BaseLoader } from '../BaseLoader.js'
import { loadPointCloud } from './pointCloud.js'

/**
 * PCD scans (pointclouds/readers/pcd.js).
 */
class PcdLoader extends BaseLoader {

	constructor() {
		super('PCDLoader', ['pcd'])
	}

	/**
	 * @param {Blob|ArrayBuffer} input - The file
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(input, context) {
		return loadPointCloud(this, input, { ...context, fileExtension: 'pcd' })
	}

}

export default PcdLoader
