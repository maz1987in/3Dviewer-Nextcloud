import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * PLY loader class
 */
class PlyLoader extends BaseLoader {

	constructor() {
		super('PLYLoader', ['ply'])
		this.loader = null
	}

	/**
	 * Load PLY model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { THREE } = context

		// Create PLY loader
		this.loader = new PLYLoader()

		// Parse the PLY geometry
		const geometry = this.loader.parse(arrayBuffer)
		
		if (!geometry || geometry.attributes.position.count === 0) {
			throw new Error('No valid geometry found in PLY file')
		}

		// Compute vertex normals for better lighting
		geometry.computeVertexNormals()

		// Create material with PLY-specific defaults
		const material = this.createMaterial({
			color: 0xb0bec5,
			flatShading: false,
		})

		// Create mesh
		const mesh = this.createMesh(geometry, material)

		this.logInfo('PLY model loaded successfully', {
			vertices: geometry.attributes.position.count,
			faces: geometry.attributes.position.count / 3,
		})

		// Process the result
		return this.processModel(mesh, context)
	}

}

// Export the class as default so the registry can instantiate it
export default PlyLoader
