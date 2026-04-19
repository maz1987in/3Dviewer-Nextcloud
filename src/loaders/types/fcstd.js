import * as THREE from 'three'
import { unzip } from 'three/examples/jsm/libs/fflate.module.js'
import { BaseLoader } from '../BaseLoader.js'
import { getOcct, buildGroupFromOccResult } from '../occt-runtime.js'

/**
 * FCSTD loader — FreeCAD native document format.
 *
 * An FCSTD file is a ZIP archive containing one `Document.xml` (assembly
 * metadata) and one or more `*.brep` files (the actual geometry). We
 * extract every `.brep` entry and parse each one with the shared OCCT
 * runtime, combining the results into a single Three.js group.
 *
 * The loader does not parse `Document.xml` at all — FreeCAD's assembly
 * placement is stored there as XML, but the `.brep` entries already
 * contain geometry in world space (FreeCAD writes transformed copies
 * when saving), so we can skip the XML without losing placement.
 *
 * Compressed entries (most FCSTD bodies are deflate-compressed) are
 * handled transparently by fflate's `unzip`.
 */
class FcstdLoader extends BaseLoader {

	constructor() {
		super('FCSTDLoader', ['fcstd'])
	}

	async loadModel(arrayBuffer, context) {
		const entries = await this.unzipEntries(arrayBuffer)
		const brepNames = Object.keys(entries).filter(name => /\.brep$/i.test(name))

		if (brepNames.length === 0) {
			throw new Error('FCSTD archive contains no .brep geometry entries')
		}

		const occt = await getOcct()
		const root = new THREE.Group()
		root.name = 'FCSTD'

		let totalMeshes = 0
		for (const name of brepNames) {
			try {
				const result = occt.ReadBrepFile(entries[name], null)
				// Tolerate per-body parse failures — a bad body shouldn't take
				// out the whole document. Log and keep going.
				if (!result?.success || !Array.isArray(result.meshes) || result.meshes.length === 0) {
					this.logWarning('FCSTD: skipped body with no tessellation', { name })
					continue
				}
				const group = buildGroupFromOccResult(result, this.loaderName)
				group.name = name.replace(/\.brep$/i, '')
				root.add(group)
				totalMeshes += result.meshes.length
			} catch (e) {
				this.logWarning('FCSTD: body parse failed', { name, error: e.message })
			}
		}

		if (root.children.length === 0) {
			throw new Error('FCSTD: no bodies could be tessellated')
		}

		this.logInfo('FCSTD model loaded successfully', {
			bodies: root.children.length,
			totalMeshes,
		})

		return this.processModel(root, context)
	}

	/**
	 * fflate's `unzip` is callback-based; wrap in a Promise for await.
	 *
	 * @param {ArrayBuffer} arrayBuffer - the .fcstd zip
	 * @return {Promise<Record<string, Uint8Array>>} name → decompressed bytes
	 */
	async unzipEntries(arrayBuffer) {
		const bytes = new Uint8Array(arrayBuffer)
		return new Promise((resolve, reject) => {
			unzip(bytes, (err, unzipped) => {
				if (err) reject(err)
				else resolve(unzipped)
			})
		})
	}

}

export default FcstdLoader
