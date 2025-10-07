import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * STL loader class
 */
class StlLoader extends BaseLoader {

	constructor() {
		super('STLLoader', ['stl'])
		this.loader = null
	}

	/**
	 * Load STL model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { THREE } = context

		// Create STL loader
		this.loader = new STLLoader()

		// Parse the STL geometry
		const geometry = this.loader.parse(arrayBuffer)

		if (!geometry || geometry.attributes.position.count === 0) {
			throw new Error('No valid geometry found in STL file')
		}

		// Create material with STL-specific defaults
		const material = this.createMaterial({
			side: THREE.DoubleSide, // STL files often need double-sided rendering
		})

		// Create mesh
		const mesh = this.createMesh(geometry, material)
		
		// STL files are often exported with Z-up coordinate system
		// Rotate to Y-up (Three.js standard) by rotating -90° around X-axis
		mesh.rotation.x = -Math.PI / 2

		this.logInfo('STL model loaded successfully', {
			vertices: geometry.attributes.position.count,
			faces: geometry.attributes.position.count / 3,
		})

		// Process the result
		return this.processModel(mesh, context)
	}

}

// Export the class as default so the registry can instantiate it
export default StlLoader
