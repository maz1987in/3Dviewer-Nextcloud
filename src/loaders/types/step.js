import { BaseLoader } from '../BaseLoader.js'
import { getOcct, buildGroupFromOccResult } from '../occt-runtime.js'

/**
 * STEP (ISO 10303) loader.
 *
 * Delegates parsing + tessellation to the shared occt-import-js runtime.
 * The two extensions `.step` and `.stp` resolve to this same loader.
 */
class StepLoader extends BaseLoader {

	constructor() {
		super('STEPLoader', ['step', 'stp'])
	}

	async loadModel(arrayBuffer, context) {
		const occt = await getOcct()
		const result = occt.ReadStepFile(new Uint8Array(arrayBuffer), null)
		const group = buildGroupFromOccResult(result, this.loaderName)

		this.logInfo('STEP model loaded successfully', {
			meshes: result.meshes.length,
		})

		return this.processModel(group, context)
	}

}

export default StepLoader
