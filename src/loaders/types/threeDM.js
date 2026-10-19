import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js'
import { generateFilePath } from '@nextcloud/router'
import { BaseLoader } from '../BaseLoader.js'

/**
 * Rhinoceros 3DM loader.
 *
 * Uses three.js's `Rhino3dmLoader`, which spawns a Web Worker that downloads
 * `rhino3dm.js` + `rhino3dm.wasm` (~2.8 MB) on first use. Both come from the
 * `rhino3dm` npm package and are copied into the app's top-level `rhino3dm/`
 * directory by `scripts/copy-decoders.mjs`, so no CDN traffic happens at
 * runtime — that matters for air-gapped Nextcloud deployments. The copy also
 * rewrites the glue so it runs without `unsafe-eval` (#204).
 *
 * The loader handles: meshes, NURBS curves (tessellated to lines), points,
 * SubD objects (approximated), per-layer colors, and basic materials.
 * Rhino blocks (instances) are expanded automatically.
 */
/**
 * How long a decode may take before it is treated as a worker that will never answer.
 * Generous: it covers downloading the runtime as well as decoding the file.
 */
const PARSE_TIMEOUT_MS = 120000

/**
 * The error a Rhino3dmLoader rejection carries. Its worker reports failures as
 * `{ type: 'error', error: { message } }` rather than as an Error.
 *
 * @param {unknown} reason - What parse() rejected with
 * @return {Error}
 */
function toError(reason) {
	if (reason instanceof Error) {
		return reason
	}
	const message = reason?.error?.message || reason?.message
	return new Error(message ? `3DM decoding failed: ${message}` : String(reason))
}

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
		this.loader.setLibraryPath(generateFilePath('threedviewer', 'rhino3dm', ''))

		// parse() is callback-based; wrap in a promise so we can await it.
		// Rhino3dmLoader only hears from its worker by message, and a worker whose
		// runtime fails to start never sends one, so parse() would wait forever and
		// the viewer would spin with no error (#204). The deadline turns that into one.
		let timer
		let object3D
		try {
			object3D = await new Promise((resolve, reject) => {
				timer = setTimeout(() => {
					reject(new Error('3DM decoding did not finish: the rhino3dm runtime did not respond'))
				}, PARSE_TIMEOUT_MS)
				try {
					this.loader.parse(arrayBuffer, resolve, (reason) => reject(toError(reason)))
				} catch (e) {
					reject(e)
				}
			})
		} finally {
			clearTimeout(timer)
			// Each load creates its own loader; terminate its worker either way.
			this.loader.dispose()
		}

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
