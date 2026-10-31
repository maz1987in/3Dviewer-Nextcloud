import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { BaseLoader } from '../BaseLoader.js'
import { loadPointCloud } from './pointCloud.js'
import { loadSplatModel } from './splatModel.js'
import { isSplatPly } from '../../splats/splatPly.js'
import { isPointCloudPly, plyHeader } from '../../pointclouds/readers/plyPoints.js'
import { PLY_MESH_CEILING_BYTES } from '../../pointclouds/limits.js'
import { formatBytes } from '../../utils/validation.js'

/**
 * PLY loader class
 */
class PlyLoader extends BaseLoader {

	constructor() {
		super('PLYLoader', ['ply'])
		this.loader = null
	}

	/**
	 * Load a PLY: a Gaussian splat when its header says so (splats/splatPly.js), else a
	 * scan when it has no faces (pointclouds/readers/plyPoints.js), else a mesh.
	 * The page passes a Blob; the thumbnailer an ArrayBuffer.
	 *
	 * @param {Blob|ArrayBuffer} input - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(input, context) {
		const blob = input instanceof Blob ? input : new Blob([input])
		let header = null
		try {
			header = plyHeader(new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer()))
		} catch {
			// Not a header the scan reader knows: PLYLoader says what is wrong with it
		}
		// The page's Blob is streamed to Spark; the thumbnailer's bytes are handed over as
		// they are, as a stream would ask the worker's loading manager for a file by URL
		if (header && isSplatPly(header)) {
			return loadSplatModel(this, input, { ...context, fileExtension: 'ply' })
		}
		if (header && isPointCloudPly(header)) {
			return loadPointCloud(this, blob, { ...context, fileExtension: 'ply' })
		}
		// A mesh is loaded whole, so it keeps the ordinary limit
		if (blob.size > PLY_MESH_CEILING_BYTES) {
			throw new Error(t('threedviewer', 'This model is {size}. The viewer opens models up to 500 MB.', { size: formatBytes(blob.size) }))
		}
		return this.loadMesh(input instanceof Blob ? await input.arrayBuffer() : input, context)
	}

	/**
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadMesh(arrayBuffer, context) {
		const { THREE } = context

		// Create PLY loader
		this.loader = new PLYLoader()

		// Parse the PLY geometry
		const geometry = this.loader.parse(arrayBuffer)

		if (!geometry || geometry.attributes.position.count === 0) {
			throw new Error('No valid geometry found in PLY file')
		}

		// Only compute normals if the PLY doesn't already have them
		if (!geometry.attributes.normal) {
			geometry.computeVertexNormals()
		}

		// Check for vertex colors
		const hasVertexColors = !!geometry.attributes.color

		// Create material — use vertex colors if available, otherwise neutral gray
		const matProps = {
			flatShading: false,
			side: THREE.DoubleSide,
		}

		if (hasVertexColors) {
			matProps.vertexColors = true
		} else {
			matProps.color = 0xb0bec5
		}

		const material = new THREE.MeshPhongMaterial(matProps)

		// Create mesh
		const mesh = new THREE.Mesh(geometry, material)

		// PLY files are often exported with Z-up coordinate system
		// Rotate to Y-up (Three.js standard) by rotating -90° around X-axis
		mesh.rotation.x = -Math.PI / 2

		this.logInfo('PLY model loaded successfully', {
			vertices: geometry.attributes.position.count,
			hasVertexColors,
		})

		// Process the result
		return this.processModel(mesh, context)
	}

}

// Export the class as default so the registry can instantiate it
export default PlyLoader
