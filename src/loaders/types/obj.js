import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * OBJ loader class with MTL material support
 */
class ObjLoader extends BaseLoader {

	constructor() {
		super('OBJLoader', ['obj'])
		this.objLoader = null
		this.mtlLoader = null
	}

	/**
	 * Load OBJ model with optional MTL materials
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		// Load OBJ model with multi-file support
		
		const { fileId, additionalFiles, THREE } = context

		// Decode the OBJ file content
		const objText = this.decodeText(arrayBuffer)

		// Look for MTL file reference
		const mtlName = this.findMtlReference(objText)

		// Create loaders
		this.objLoader = new OBJLoader()

		// Load MTL materials if referenced
		
		if (mtlName && additionalFiles && additionalFiles.length > 0) {
			// Use pre-fetched dependencies from multi-file loading
			await this.loadMtlMaterialsFromDependencies(mtlName, additionalFiles, THREE)
		}

		// Parse the OBJ content
		const object3D = this.objLoader.parse(objText)

		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in OBJ file')
		}

		// OBJ parsed successfully

		this.logInfo('OBJ model parsed successfully', {
			children: object3D.children.length,
			hasMaterials: !!mtlName,
			usingPreFetched: !!(mtlName && additionalFiles && additionalFiles.length > 0),
		})

		// MTL materials applied automatically by OBJLoader

		// Object loaded successfully

		// Calculate bounding box and scale the model if it's too large
		const box = new THREE.Box3().setFromObject(object3D)
		const size = box.getSize(new THREE.Vector3())
		const center = box.getCenter(new THREE.Vector3())
		
		// Model bounds calculated
		
		// If the model is too large, scale it down
		const maxDimension = Math.max(size.x, size.y, size.z)
		if (maxDimension > 1000) {
			const scaleFactor = 1000 / maxDimension
			object3D.scale.setScalar(scaleFactor)
			console.info('[OBJ Loader] Model scaled down by factor:', scaleFactor)
		}
		
		// Model processing complete
		console.info('[OBJ Loader] Model processing completed successfully')
		
		// Add camera positioning information to the context for the viewer
		console.info('[OBJ Loader] Adding camera positioning hints to context...')
		if (!context.cameraHints) context.cameraHints = {}
		context.cameraHints.modelBounds = {
			size: { x: size.x, y: size.y, z: size.z },
			center: { x: center.x, y: center.y, z: center.z },
			maxDimension: maxDimension
		}
		context.cameraHints.suggestedDistance = maxDimension * 2 // Suggest camera distance as 2x the model size

		// Process the result
		return this.processModel(object3D, context)
	}

	/**
	 * Decode ArrayBuffer to text
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @return {string} Decoded text
	 */
	decodeText(arrayBuffer) {
		const textDecoder = new TextDecoder('utf-8', { fatal: false })
		const text = textDecoder.decode(arrayBuffer)

		if (!text || text.trim().length === 0) {
			throw new Error('Empty or invalid OBJ file content')
		}

		return text
	}

	/**
	 * Manually parse MTL content since Three.js MTLLoader is failing
	 */
	parseMtlManually(mtlText, THREE) {
		// Parse MTL manually
		
		const materials = {}
		const lines = mtlText.split('\n')
		let currentMaterial = null
		
		for (const line of lines) {
			const trimmedLine = line.trim()
			if (!trimmedLine || trimmedLine.startsWith('#')) continue
			
			const parts = trimmedLine.split(/\s+/)
			const command = parts[0]
			
			if (command === 'newmtl') {
				// Create new material
				const materialName = parts[1]
				currentMaterial = new THREE.MeshLambertMaterial({
					color: 0xffffff,
					side: THREE.DoubleSide,
					transparent: false,
					opacity: 1.0
				})
				materials[materialName] = currentMaterial
			} else if (currentMaterial && command === 'map_Kd') {
				// Set diffuse texture
				const texturePath = parts[1]
				currentMaterial.map = texturePath // Store texture path for later loading
			} else if (currentMaterial && command === 'Kd') {
				// Set diffuse color
				const r = parseFloat(parts[1]) || 1.0
				const g = parseFloat(parts[2]) || 1.0
				const b = parseFloat(parts[3]) || 1.0
				currentMaterial.color.setRGB(r, g, b)
			} else if (currentMaterial && command === 'Ka') {
				// Set ambient color
				const r = parseFloat(parts[1]) || 0.2
				const g = parseFloat(parts[2]) || 0.2
				const b = parseFloat(parts[3]) || 0.2
				// Note: Three.js doesn't have separate ambient color, using it as base color influence
			} else if (currentMaterial && command === 'Ks') {
				// Set specular color
				const r = parseFloat(parts[1]) || 1.0
				const g = parseFloat(parts[2]) || 1.0
				const b = parseFloat(parts[3]) || 1.0
				// Note: Three.js Lambert material doesn't support specular, but we can store it
			} else if (currentMaterial && command === 'Ns') {
				// Set shininess
				const shininess = parseFloat(parts[1]) || 0.0
				// Note: Three.js Lambert material doesn't support shininess
			} else if (currentMaterial && command === 'Tr') {
				// Set transparency
				const transparency = parseFloat(parts[1]) || 1.0
				currentMaterial.transparent = transparency < 1.0
				currentMaterial.opacity = transparency
			} else if (currentMaterial && command === 'illum') {
				// Set illumination model
				const illum = parseInt(parts[1]) || 2
				// Note: Three.js doesn't directly support illumination models
			}
		}
		
		// Manual MTL parsing completed
		
		// Return in the same format as MTLLoader with create method
		return {
			materials: materials,
			preload: () => {
				// Preload function placeholder
			},
			setMaterials: (objLoader) => {
				// Set materials function placeholder
			},
			create: (materialName) => {
				// Create method that OBJLoader expects
				return materials[materialName] || null
			}
		}
	}

	/**
	 * Set up custom texture loader for native MTLLoader materials
	 * @param {Object} materials - Materials object from MTLLoader
	 * @param {Array} additionalFiles - Pre-fetched dependency files
	 * @param {Object} THREE - Three.js library instance
	 */
	setupCustomTextureLoader(materials, additionalFiles, THREE) {
		// Create a custom texture loader that uses pre-fetched files
		const customTextureLoader = this.createTextureLoader(additionalFiles)
		
		// Override the texture loading for native materials
		for (const [materialName, material] of Object.entries(materials.materials)) {
			// If material has texture paths (strings), load them from dependencies
			if (material.map && typeof material.map === 'string') {
				this.loadTextureFromDependencies(material.map, customTextureLoader, additionalFiles, THREE)
					.then(texture => {
						if (texture) {
							material.map = texture
						}
					})
					.catch(error => {
						console.warn('[OBJ Loader] Failed to load diffuse texture for native material:', materialName, error)
					})
			}
			
			if (material.normalMap && typeof material.normalMap === 'string') {
				this.loadTextureFromDependencies(material.normalMap, customTextureLoader, additionalFiles, THREE)
					.then(texture => {
						if (texture) {
							material.normalMap = texture
						}
					})
					.catch(error => {
						console.warn('[OBJ Loader] Failed to load normal texture for native material:', materialName, error)
					})
			}
			
			if (material.specularMap && typeof material.specularMap === 'string') {
				this.loadTextureFromDependencies(material.specularMap, customTextureLoader, additionalFiles, THREE)
					.then(texture => {
						if (texture) {
							material.specularMap = texture
						}
					})
					.catch(error => {
						console.warn('[OBJ Loader] Failed to load specular texture for native material:', materialName, error)
					})
			}
		}
	}

	/**
	 * Find MTL file reference in OBJ text
	 * @param {string} objText - OBJ file content
	 * @return {string|null} MTL file name
	 */
	findMtlReference(objText) {
		console.info('[OBJ Loader] Searching for MTL reference in OBJ file...')
		for (const line of objText.split(/\r?\n/)) {
			const trimmedLine = line.trim()
			if (trimmedLine.toLowerCase().startsWith('mtllib ')) {
				const mtlName = trimmedLine.split(/\s+/)[1]?.trim()
				if (mtlName) {
					// Found MTL reference
					return mtlName
				}
			}
		}
		// No MTL reference found
		return null
	}

	/**
	 * Load MTL materials from pre-fetched dependencies
	 * @param {string} mtlName - MTL file name
	 * @param {Array} additionalFiles - Pre-fetched dependency files
	 * @param {Object} THREE - Three.js library instance
	 */
	async loadMtlMaterialsFromDependencies(mtlName, additionalFiles, THREE) {
		try {
			// Search for MTL file in dependencies
			
			// Find the MTL file in the pre-fetched dependencies
			const mtlFile = additionalFiles.find(file => {
				// Handle both relative and absolute paths
				const fileName = file.name.split('/').pop()
				return fileName === mtlName || file.name.endsWith(mtlName)
			})
			
			// MTL file found

			if (mtlFile) {
				// Convert the MTL file to text
				const mtlText = await this.fileToText(mtlFile)
				
				if (mtlText && mtlText.trim().length > 0) {
					try {
						this.mtlLoader = new MTLLoader()
						this.mtlLoader.setPath('')
						
						// Try native Three.js MTLLoader first
						let materials
						try {
							console.info('[OBJ Loader] Attempting native MTLLoader...')
							materials = this.mtlLoader.parse(mtlText, '')
							
							// Check if native loader actually created materials
							if (!materials || !materials.materials || Object.keys(materials.materials).length === 0) {
								console.warn('[OBJ Loader] Native MTLLoader returned no materials, falling back to manual parser')
								materials = this.parseMtlManually(mtlText, THREE)
							} else {
								console.info('[OBJ Loader] Native MTLLoader successful:', Object.keys(materials.materials).length, 'materials')
								// Set up custom texture loader for native materials
								this.setupCustomTextureLoader(materials, additionalFiles, THREE)
							}
						} catch (error) {
							console.warn('[OBJ Loader] Native MTLLoader failed, falling back to manual parser:', error.message)
							materials = this.parseMtlManually(mtlText, THREE)
						}
						
						// MTL parsed successfully
						
						// Load textures for materials (only for manual parser - native parser handles this in setupCustomTextureLoader)
						if (materials.materials && Object.keys(materials.materials).length > 0) {
							// Check if this was parsed manually (textures are strings) or natively (textures are already loaded or will be loaded async)
							const firstMaterial = Object.values(materials.materials)[0]
							const isManualParser = firstMaterial.map && typeof firstMaterial.map === 'string'
							
							if (isManualParser) {
								// Processing materials with textures from manual parser
								const customTextureLoader = this.createTextureLoader(additionalFiles)
								
								// Load textures for each material synchronously
								for (const [materialName, material] of Object.entries(materials.materials)) {
									// Handle diffuse texture (map_Kd) - stored as string path in manual parser
									if (material.map && typeof material.map === 'string') {
										try {
											const texture = await this.loadTextureFromDependencies(material.map, customTextureLoader, additionalFiles, THREE)
											if (texture) {
												material.map = texture
											}
										} catch (error) {
											console.warn('[OBJ Loader] Failed to load diffuse texture for:', materialName, error)
										}
									}
									
									// Handle normal map (bump map)
									if (material.normalMap && typeof material.normalMap === 'string') {
										try {
											const texture = await this.loadTextureFromDependencies(material.normalMap, customTextureLoader, additionalFiles, THREE)
											if (texture) {
												material.normalMap = texture
											}
										} catch (error) {
											console.warn('[OBJ Loader] Failed to load normal map for:', materialName, error)
										}
									}
									
									// Handle specular map
									if (material.specularMap && typeof material.specularMap === 'string') {
										try {
											const texture = await this.loadTextureFromDependencies(material.specularMap, customTextureLoader, additionalFiles, THREE)
											if (texture) {
												material.specularMap = texture
											}
										} catch (error) {
											console.warn('[OBJ Loader] Failed to load specular map for:', materialName, error)
										}
									}
								}
							}
							// For native parser, textures are loaded asynchronously in setupCustomTextureLoader
						}
						
						// Check if materials were actually created
						if (!materials.materials || Object.keys(materials.materials).length === 0) {
							
							// Create a default material with the texture if available
							const defaultMaterial = new THREE.MeshLambertMaterial({
								color: 0xffffff,
								side: THREE.DoubleSide,
								transparent: false,
								opacity: 1.0
							})
							
							// Created default material
							
							// Try to load the first available texture for the default material
							const textureLoader = this.createTextureLoader(additionalFiles)
							const textureFiles = additionalFiles.filter(file => {
								const fileName = file.name.split('/').pop()
								return fileName.endsWith('.jpg') || fileName.endsWith('.png')
							})
							
							if (textureFiles.length > 0) {
								// Use the first texture file found - prefer files that match the OBJ name
								const objBaseName = mtlName.replace('./', '').replace('.mtl', '')
								let textureFile = textureFiles.find(file => {
									const fileName = file.name.split('/').pop()
									return fileName.includes(objBaseName)
								})
								
								// If no matching texture found, use the first available
								if (!textureFile) {
									textureFile = textureFiles[0]
								}
								
								try {
									const texture = await this.loadTextureFromDependencies(textureFile.name, textureLoader, additionalFiles, THREE)
									if (texture) {
										defaultMaterial.map = texture
									}
								} catch (error) {
									console.warn('[OBJ Loader] Failed to load texture for default material:', error)
								}
							}
							
							// Create a materials object with the default material
							materials.materials = {
								'default': defaultMaterial
							}
						}
						
						// Preload and set materials
						materials.preload()
						this.objLoader.setMaterials(materials)
						
						this.logInfo('MTL materials loaded from dependencies', { 
							mtlName,
							dependenciesCount: additionalFiles.length 
						})
					} catch (parseError) {
						console.error('[OBJ Loader] Error during MTL parsing/setup:', parseError)
						throw parseError
					}
				} else {
					this.logWarning('MTL file content is empty', { mtlName })
				}
			} else {
				this.logWarning('MTL file not found in pre-fetched dependencies', { 
					mtlName,
					availableFiles: additionalFiles.map(f => f.name.split('/').pop())
				})
			}
		} catch (error) {
			this.logWarning('Failed to load MTL materials from dependencies', {
				mtlName,
				error: error.message,
			})
		}
	}

	/**
	 * Create a custom texture loader that uses pre-fetched dependencies
	 * @param {Array} additionalFiles - Pre-fetched dependency files
	 * @return {object} Custom texture loader
	 */
	createTextureLoader(additionalFiles) {
		return {
			load: (url, onLoad, onProgress, onError) => {
				console.info('[OBJ Loader] Texture loader called for:', url)
				
				// Find the texture file in pre-fetched dependencies
				const textureFile = additionalFiles.find(file => {
					const fileName = file.name.split('/').pop()
					return fileName === url || file.name.endsWith(url)
				})

				if (textureFile) {
					console.info('[OBJ Loader] Texture found in dependencies:', textureFile.name)
					
					// Create a blob URL from the pre-fetched file
					const blob = new Blob([textureFile], { type: textureFile.type })
					const blobUrl = URL.createObjectURL(blob)
					
					// Use the standard Image loader with the blob URL
					const image = new Image()
					image.onload = () => {
						console.info('[OBJ Loader] Texture loaded successfully:', url)
						onLoad(image)
						URL.revokeObjectURL(blobUrl) // Clean up
					}
					image.onerror = () => {
						console.error('[OBJ Loader] Texture failed to load:', url)
						onError(new Error(`Failed to load texture: ${url}`))
						URL.revokeObjectURL(blobUrl) // Clean up
					}
					image.src = blobUrl
				} else {
					// Texture not found in dependencies
					console.warn('[OBJ Loader] Texture not found in dependencies:', {
						url,
						sampleAvailableFiles: additionalFiles.slice(0, 10).map(f => f.name.split('/').pop())
					})
					this.logWarning('Texture not found in pre-fetched dependencies', { 
						url,
						availableFiles: additionalFiles.map(f => f.name.split('/').pop())
					})
					if (onError) onError(new Error(`Texture not found: ${url}`))
				}
			}
		}
	}

	/**
	 * Load texture from pre-fetched dependencies
	 * @param {string} texturePath - Texture file path/name
	 * @param {Object} textureLoader - Custom texture loader
	 * @param {Array} additionalFiles - Pre-fetched dependency files
	 * @param {Object} THREE - Three.js library instance
	 * @return {Promise<THREE.Texture|null>} Loaded texture or null
	 */
	async loadTextureFromDependencies(texturePath, textureLoader, additionalFiles, THREE) {
		return new Promise((resolve, reject) => {
			try {
				// Loading texture from dependencies
				
				textureLoader.load(
					texturePath,
					(image) => {
						// Texture loaded successfully
						
						// Create THREE.js texture from the loaded image with proper settings
						const texture = new THREE.Texture(image)
						texture.needsUpdate = true
						
						// Configure texture properties based on the Medium article best practices
						texture.flipY = false // OBJ files typically use different Y orientation
						texture.wrapS = THREE.RepeatWrapping
						texture.wrapT = THREE.RepeatWrapping
						texture.minFilter = THREE.LinearMipmapLinearFilter // Better filtering
						texture.magFilter = THREE.LinearFilter
						texture.generateMipmaps = true
						texture.anisotropy = 4 // Improve texture quality
						
						// Ensure proper format and type
						texture.format = THREE.RGBAFormat
						texture.type = THREE.UnsignedByteType
						
						// Texture created with proper properties
						
						resolve(texture)
					},
					(progress) => {
						// Texture loading progress (optional)
					},
					(error) => {
						console.warn('[OBJ Loader] Texture loading failed:', texturePath, error)
						resolve(null) // Return null instead of rejecting to allow graceful fallback
					}
				)
			} catch (error) {
				console.error('[OBJ Loader] Error in loadTextureFromDependencies:', error)
				resolve(null)
			}
		})
	}

	/**
	 * Convert a File object to text
	 * @param {File} file - File object
	 * @return {Promise<string>} File content as text
	 */
	async fileToText(file) {
		try {
		// Converting file to text
			
			const arrayBuffer = await file.arrayBuffer()
			const textDecoder = new TextDecoder('utf-8', { fatal: false })
			const text = textDecoder.decode(arrayBuffer)
			
			// File converted to text successfully
			
			return text
		} catch (error) {
			console.error('[OBJ Loader] Failed to convert file to text:', error)
			this.logWarning('Failed to convert file to text', { 
				fileName: file.name, 
				error: error.message 
			})
			return ''
		}
	}

}

// Export the class as default so the registry can instantiate it
export default ObjLoader
