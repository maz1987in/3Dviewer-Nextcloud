import { BaseLoader } from '../BaseLoader.js'
import { getOcct, buildGroupFromOccResult } from '../occt-runtime.js'

/**
 * IGES (Initial Graphics Exchange Specification) loader.
 *
 * Older sibling of STEP — same OCCT pipeline. Extensions `.iges` and
 * `.igs` both resolve here.
 */
class IgesLoader extends BaseLoader {

	constructor() {
		super('IGESLoader', ['iges', 'igs'])
	}

	async loadModel(arrayBuffer, context) {
		const occt = await getOcct()
		const result = occt.ReadIgesFile(new Uint8Array(arrayBuffer), null)
		const group = buildGroupFromOccResult(result, this.loaderName)

		this.logInfo('IGES model loaded successfully', {
			meshes: result.meshes.length,
		})

		return this.processModel(group, context)
	}

}

export default IgesLoader
