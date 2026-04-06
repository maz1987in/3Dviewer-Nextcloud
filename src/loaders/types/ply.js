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
