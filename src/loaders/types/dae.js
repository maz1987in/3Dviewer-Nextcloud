import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { BaseLoader } from '../BaseLoader.js'
import { decodeTextFromBuffer } from '../../utils/fileHelpers.js'

/**
 * DAE (Collada) loader class
 */
class DaeLoader extends BaseLoader {

	constructor() {
		super('DAELoader', ['dae'])
		this.loader = null
	}

	/**
	 * Load DAE model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { THREE, additionalFiles = [] } = context

		// Convert ArrayBuffer to text for XML parsing
		const text = decodeTextFromBuffer(arrayBuffer)

		// Set up texture loading from dependencies (data URIs for CSP)
		let loadingManager
		if (additionalFiles.length > 0 && THREE) {
			const dataUriMap = new Map()
			for (const file of additionalFiles) {
				const fileName = file.name.split(/[/\\]/).pop().toLowerCase()
				if (/\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName)) {
					try {
						const dataUri = await new Promise((resolve, reject) => {
							const reader = new FileReader()
							reader.onload = () => resolve(reader.result)
							reader.onerror = reject
							reader.readAsDataURL(file)
						})
						dataUriMap.set(fileName, dataUri)
					} catch (e) {
						this.logWarning('Failed to convert texture to data URI', { fileName })
					}
				}
			}
			if (dataUriMap.size > 0) {
				loadingManager = new THREE.LoadingManager()
				loadingManager.setURLModifier((url) => {
					const textureName = url.split(/[/\\]/).pop()
					const dataUri = dataUriMap.get(textureName.toLowerCase())
					if (dataUri) {
						this.logInfo('Loading DAE texture from dependencies', { textureName })
						return dataUri
					}
					return url
				})
			}
		}

		// Create Collada loader
		this.loader = new ColladaLoader(loadingManager)

		// Parse the DAE content
		const collada = this.loader.parse(text)

		// Get the scene from the parsed DAE
		const daeScene = collada.scene

		if (!daeScene) {
			throw new Error('No scene found in DAE file')
		}

		// DAE (Collada) uses Z-up coordinate system by specification
		// Rotate to Y-up (Three.js standard) by rotating -90° around X-axis
		daeScene.rotation.x = -Math.PI / 2

		// Access animations through scene.animations (new way) to avoid deprecation warning
		// Do not access collada.animations directly as it triggers deprecation warnings
		const animations = daeScene.animations || []

		this.logInfo('DAE model loaded successfully', {
			animations: animations.length,
		})

		// Process the result
		const result = this.processModel(daeScene, context)

		// Add animations if available
		if (animations.length > 0) {
			result.animations = animations
		}

		return result
	}

}

// Export the class as default so the registry can instantiate it
export default DaeLoader
