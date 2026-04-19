import { BaseLoader } from '../BaseLoader.js'
import { getOcct, buildGroupFromOccResult } from '../occt-runtime.js'

/**
 * BREP loader — OpenCascade's native B-Rep text format.
 *
 * Used by FreeCAD, Salome, and anything built on OCCT. Extensions `.brep`
 * and `.brp` both resolve here.
 */
class BrepLoader extends BaseLoader {

	constructor() {
		super('BREPLoader', ['brep', 'brp'])
	}

	async loadModel(arrayBuffer, context) {
		const occt = await getOcct()
		const result = occt.ReadBrepFile(new Uint8Array(arrayBuffer), null)
		const group = buildGroupFromOccResult(result, this.loaderName)

		this.logInfo('BREP model loaded successfully', {
			meshes: result.meshes.length,
		})

		return this.processModel(group, context)
	}

}

export default BrepLoader
