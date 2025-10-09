import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { BaseLoader } from '../BaseLoader.js'
import { logger } from '../../utils/logger.js'

/**
 * FBX loader class
 */
class FbxLoader extends BaseLoader {

	constructor() {
		super('FBXLoader', ['fbx'])
		this.loader = null
	}

	/**
	 * Load FBX model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { THREE, additionalFiles = [] } = context

		// Create loading manager to handle texture paths
		const manager = new THREE.LoadingManager()
		
		// Always set up URL modifier to intercept texture loading
		manager.setURLModifier((url) => {
			// Extract texture filename from URL
			const textureName = url.split('/').pop().split('\\').pop()
			
			// Try to find texture in dependencies
			if (additionalFiles && additionalFiles.length > 0) {
				const textureFile = additionalFiles.find(file => {
					const fileName = file.name.split('/').pop()
					return fileName.toLowerCase() === textureName.toLowerCase()
				})
				
				if (textureFile) {
					// Create blob URL from dependency
					const blob = new Blob([textureFile], { type: textureFile.type })
					const blobUrl = URL.createObjectURL(blob)
					logger.info('FBXLoader', 'Loading texture from dependencies', { textureName, blobUrl })
					return blobUrl
				}
			}
			
			// Texture not found - return a 1x1 transparent PNG data URL to prevent 404 errors
			logger.warn('FBXLoader', 'Texture not found in dependencies, using blank placeholder', { textureName, url })
			return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
		})

		// Create FBX loader with the loading manager
		this.loader = new FBXLoader(manager)

	// Parse the FBX file directly from arrayBuffer
	const object3D = this.loader.parse(arrayBuffer, '')

	if (!object3D || object3D.children.length === 0) {
		throw new Error('No valid geometry found in FBX file')
	}

	// Remove texture maps and ensure materials are visible
	let meshCount = 0
	let texturesRemovedCount = 0
	object3D.traverse((child) => {
		if (child.isMesh) {
			meshCount++
			if (child.material) {
				const materials = Array.isArray(child.material) ? child.material : [child.material]
				
				materials.forEach((mat, idx) => {
					// Remove ALL texture maps since we don't have the actual textures
					// Leaving placeholder URLs can cause rendering issues
					const textureProps = ['map', 'normalMap', 'bumpMap', 'specularMap', 'emissiveMap', 
										   'aoMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'lightMap']
					
					textureProps.forEach(prop => {
						if (mat[prop]) {
							mat[prop] = null
							texturesRemovedCount++
						}
					})
					
					// Ensure material is visible and double-sided
					mat.side = THREE.DoubleSide
					mat.visible = true
					mat.needsUpdate = true
					
					logger.info('FBXLoader', 'Processed material', {
						childName: child.name || 'unnamed',
						materialIndex: idx,
						type: mat.type,
						color: mat.color ? { r: mat.color.r.toFixed(2), g: mat.color.g.toFixed(2), b: mat.color.b.toFixed(2) } : null,
						opacity: mat.opacity,
						transparent: mat.transparent,
					})
				})
			} else {
				// No material at all - create a basic one
				child.material = new THREE.MeshStandardMaterial({
					color: 0xcccccc,
					metalness: 0.3,
					roughness: 0.7,
					side: THREE.DoubleSide,
				})
				logger.info('FBXLoader', 'Created fallback material for mesh without material')
			}
		}
	})
	
	logger.info('FBXLoader', `Processed ${meshCount} meshes, removed ${texturesRemovedCount} texture references`)

		this.logInfo('FBX model loaded successfully', {
			children: object3D.children.length,
			dependencies: additionalFiles?.length || 0,
		})

		// Process the result
		return this.processModel(object3D, context)
	}

}

// Export the class as default so the registry can instantiate it
export default FbxLoader
