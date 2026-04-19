import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * Rhinoceros 3DM loader.
 *
 * Uses three.js's `Rhino3dmLoader`, which spawns a Web Worker that downloads
 * `rhino3dm.js` + `rhino3dm.wasm` (~4 MB) on first use. The WASM module is
 * pre-copied into the app's top-level `/rhino3dm/` directory by
 * `scripts/copy-decoders.mjs` so no CDN traffic happens at runtime — that
 * matters for air-gapped Nextcloud deployments.
 *
 * The loader handles: meshes, NURBS curves (tessellated to lines), points,
 * SubD objects (approximated), per-layer colors, and basic materials.
 * Rhino blocks (instances) are expanded automatically.
 */
class ThreeDMLoader extends BaseLoader {

	constructor() {
		super('Rhino3dmLoader', ['3dm'])
		this.loader = null
	}

	async loadModel(arrayBuffer, context) {
		this.loader = new Rhino3dmLoader()
		// Point at the bundled rhino3dm assets served by the Nextcloud app.
		// Trailing slash required — rhino3dm's internal loader appends the
		// filename directly.
		this.loader.setLibraryPath('/apps/threedviewer/rhino3dm/')

		// parse() is callback-based; wrap in a promise so we can await it.
		const object3D = await new Promise((resolve, reject) => {
			try {
				this.loader.parse(
					arrayBuffer,
					(result) => resolve(result),
					(error) => reject(error instanceof Error ? error : new Error(String(error))),
				)
			} catch (e) {
				reject(e)
			}
		})

		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in 3DM file')
		}

		this.logInfo('3DM model loaded successfully', {
			children: object3D.children.length,
		})

		return this.processModel(object3D, context)
	}

}

export default ThreeDMLoader
