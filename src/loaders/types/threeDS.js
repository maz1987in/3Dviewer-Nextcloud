import * as THREE from 'three'
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * 3DS loader class
 */
class ThreeDSLoader extends BaseLoader {

	constructor() {
		super('ThreeDSLoader', ['3ds'])
		this.loader = null
	}

	/**
	 * Load 3DS model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { THREE, additionalFiles } = context

		// Create a custom LoadingManager for texture loading
		let loadingManager = THREE.DefaultLoadingManager
		const missingTextures = []

		// Pre-create data URIs for textures (blob: URLs are blocked by Nextcloud CSP)
		const dataUriMap = new Map()

		if (additionalFiles && additionalFiles.length > 0) {
			// Convert texture files to data URIs before parsing
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
						this.logWarning('Failed to convert texture to data URI', { fileName, error: e.message })
					}
				}
			}

			loadingManager = new THREE.LoadingManager()

			// Override URL modifier to use data URIs
			loadingManager.setURLModifier((url) => {
				const textureName = url.split(/[/\\]/).pop()
				const dataUri = dataUriMap.get(textureName.toLowerCase())

				if (dataUri) {
					this.logInfo('Loading 3DS texture from dependencies', { textureName })
					return dataUri
				}

				missingTextures.push(textureName)
				this.logWarning('3DS texture not found in dependencies', { textureName, url })
				return url
			})

			this.logInfo('3DS loader configured with external texture support', {
				textureCount: dataUriMap.size,
			})
		}

		// Create 3DS loader with custom manager
		this.loader = new TDSLoader(loadingManager)
		this.loader.setResourcePath('')

		// Parse the 3DS file directly from arrayBuffer
		const object3D = this.loader.parse(arrayBuffer)

		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in 3DS file')
		}

		// 3DS format has no reliable up-axis metadata. Tools export either
		// Z-up (3ds Max, CAD) or Y-up (Blender, Maya, modern exporters),
		// and bbox-based heuristics fail on both sides: a tall building has
		// up=biggest-axis but a flat cottage has up=smallest-axis. We default
		// to "no rotation" (assume authored in Three.js's Y-up convention)
		// since most modern content is Y-up; Z-up outliers can be fixed with
		// the manual orientation toggle in the toolbar.
		const preRotationBox = new THREE.Box3().setFromObject(object3D)
		const preRotationSize = new THREE.Vector3()
		preRotationBox.getSize(preRotationSize)

		this.logInfo('3DS model loaded successfully', {
			children: object3D.children.length,
			preRotationSize: {
				x: preRotationSize.x.toFixed(2),
				y: preRotationSize.y.toFixed(2),
				z: preRotationSize.z.toFixed(2),
			},
			rotatedToYUp: false,
		})

		// Add missing textures info to context for error reporting
		if (missingTextures.length > 0) {
			this.logWarning('3DS textures not found', {
				count: missingTextures.length,
				files: missingTextures,
			})
			context.missingTextures = missingTextures
		}

		// Process the result
		return this.processModel(object3D, context)
	}

}

// Export the class as default so the registry can instantiate it
export default ThreeDSLoader
