import { AMFLoader } from 'three/examples/jsm/loaders/AMFLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * AMF (Additive Manufacturing Format) loader.
 *
 * AMF is the ISO/ASTM 52915 XML-based successor to STL. It supports multiple
 * objects, per-face colors, and constellation metadata. Files may be either
 * uncompressed XML or a ZIP-compressed variant — the stock three.js
 * `AMFLoader` handles both (ZIP path uses the fflate module bundled with
 * three/examples).
 *
 * Note: constellation / instancing metadata is not fully supported by
 * upstream three.js at the time of writing, but geometry + materials load
 * correctly for the common case.
 */
class AmfLoader extends BaseLoader {

	constructor() {
		super('AMFLoader', ['amf'])
		this.loader = null
	}

	async loadModel(arrayBuffer, context) {
		this.loader = new AMFLoader()
		const group = this.loader.parse(arrayBuffer)

		if (!group || group.children.length === 0) {
			throw new Error('No valid geometry found in AMF file')
		}

		this.logInfo('AMF model loaded successfully', {
			children: group.children.length,
		})

		return this.processModel(group, context)
	}

}

export default AmfLoader
