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
		console.info('[OBJ Loader] Loading OBJ model with multi-file support')
		
		const { fileId, additionalFiles, THREE } = context

		// Decode the OBJ file content
		const objText = this.decodeText(arrayBuffer)

		// Look for MTL file reference
		const mtlName = this.findMtlReference(objText)

		// Create loaders
		this.objLoader = new OBJLoader()

		// Load MTL materials if referenced
		console.info('[OBJ Loader] MTL loading check:', {
			mtlName,
			hasAdditionalFiles: !!additionalFiles,
			additionalFilesCount: additionalFiles ? additionalFiles.length : 0,
			fileId
		})
		
		if (mtlName && additionalFiles && additionalFiles.length > 0) {
			// Use pre-fetched dependencies from multi-file loading
			console.info('[OBJ Loader] Using pre-fetched dependencies for MTL loading')
			await this.loadMtlMaterialsFromDependencies(mtlName, additionalFiles, THREE)
		} else if (mtlName && fileId) {
			// Fallback to old API approach for single-file loading
			console.info('[OBJ Loader] Using legacy API for MTL loading')
			await this.loadMtlMaterials(mtlName, fileId)
		}

		// Parse the OBJ content
		const object3D = this.objLoader.parse(objText)

		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in OBJ file')
		}

		// Debug the parsed OBJ before material assignment
		console.info('[OBJ Loader] OBJ parsed, checking children before material assignment:', {
			childrenCount: object3D.children.length,
			children: object3D.children.map(child => ({
				type: child.type,
				name: child.name,
				hasGeometry: !!child.geometry,
				hasMaterial: !!child.material,
				materialType: child.material ? child.material.type : 'none',
				geometryVertices: child.geometry ? child.geometry.attributes?.position?.count : 'no geometry'
			}))
		})

		this.logInfo('OBJ model parsed successfully', {
			children: object3D.children.length,
			hasMaterials: !!mtlName,
			usingPreFetched: !!(mtlName && additionalFiles && additionalFiles.length > 0),
		})

		// Force apply our custom material with texture to all children
		console.info('[OBJ Loader] Force applying custom material with texture to all children...')
		
		// Create a custom material with the loaded texture
		let customMaterial = null
		if (this.objLoader.materials && this.objLoader.materials.materials && this.objLoader.materials.materials.default) {
			customMaterial = this.objLoader.materials.materials.default
			console.info('[OBJ Loader] Using custom material with texture from MTL processing')
		} else {
			// Create a new material with the texture
			customMaterial = new THREE.MeshLambertMaterial({
				color: 0xffffff,
				side: THREE.DoubleSide
			})
			console.info('[OBJ Loader] Created new custom material')
		}
		
		for (const child of object3D.children) {
			console.info('[OBJ Loader] Processing child:', {
				name: child.name,
				type: child.type,
				hasGeometry: !!child.geometry,
				hasMaterial: !!child.material,
				geometryVertices: child.geometry ? child.geometry.attributes?.position?.count : 'no geometry'
			})
			
			if (child.geometry) {
				// Force apply our custom material to all children
				child.material = customMaterial
				console.info('[OBJ Loader] Applied custom material to child:', {
					childName: child.name,
					materialType: customMaterial.type,
					hasTexture: !!customMaterial.map
				})
			}
		}

		// Debug the loaded object
		console.info('[OBJ Loader] OBJ object loaded:', {
			type: object3D.type,
			childrenCount: object3D.children.length,
			children: object3D.children.map(child => ({
				type: child.type,
				name: child.name,
				geometry: child.geometry ? {
					type: child.geometry.type,
					vertices: child.geometry.attributes ? child.geometry.attributes.position?.count : 'unknown',
					faces: child.geometry.index ? child.geometry.index.count / 3 : 'no index',
					hasUV: !!child.geometry.attributes.uv,
					hasNormal: !!child.geometry.attributes.normal
				} : 'no geometry',
				material: child.material ? {
					type: child.material.type,
					hasMap: !!child.material.map,
					mapType: child.material.map ? child.material.map.type : 'no map',
					color: child.material.color ? child.material.color.getHexString() : 'no color',
					visible: child.material.visible,
					side: child.material.side
				} : 'no material',
				visible: child.visible,
				position: child.position,
				scale: child.scale,
				rotation: child.rotation
			}))
		})

		// Calculate bounding box and scale the model if it's too large
		console.info('[OBJ Loader] Calculating model bounds and scaling if necessary...')
		const box = new THREE.Box3().setFromObject(object3D)
		const size = box.getSize(new THREE.Vector3())
		const center = box.getCenter(new THREE.Vector3())
		
		console.info('[OBJ Loader] Model bounds:', {
			size: { x: size.x, y: size.y, z: size.z },
			center: { x: center.x, y: center.y, z: center.z },
			maxDimension: Math.max(size.x, size.y, size.z)
		})
		
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
					console.info('[OBJ Loader] Found MTL reference:', { mtlName, line: trimmedLine })
					this.logInfo('Found MTL reference', { mtlName })
					return mtlName
				}
			}
		}
		console.info('[OBJ Loader] No MTL reference found in OBJ file')
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
			console.info('[OBJ Loader] Searching for MTL file:', {
				mtlName,
				totalFiles: additionalFiles.length,
				sampleFileNames: additionalFiles.slice(0, 5).map(f => f.name.split('/').pop())
			})
			
			// Find the MTL file in the pre-fetched dependencies
			const mtlFile = additionalFiles.find(file => {
				// Handle both relative and absolute paths
				const fileName = file.name.split('/').pop()
				return fileName === mtlName || file.name.endsWith(mtlName)
			})
			
			console.info('[OBJ Loader] MTL file search result:', {
				found: !!mtlFile,
				mtlFileName: mtlFile ? mtlFile.name : null
			})

			if (mtlFile) {
				// Convert the MTL file to text
				const mtlText = await this.fileToText(mtlFile)
				
				if (mtlText && mtlText.trim().length > 0) {
					console.info('[OBJ Loader] MTL file content loaded, setting up materials...')
					
					try {
						this.mtlLoader = new MTLLoader()
						
						// Set up texture loading using pre-fetched dependencies
						this.mtlLoader.setPath('')
						
						console.info('[OBJ Loader] Parsing MTL content...')
						console.info('[OBJ Loader] MTL content preview:', {
							fullText: mtlText,
							lines: mtlText.split('\n').length,
							firstLines: mtlText.split('\n').slice(0, 10),
							allLines: mtlText.split('\n').map((line, index) => `${index + 1}: ${line}`)
						})
						
						const materials = this.mtlLoader.parse(mtlText, '')
						
						console.info('[OBJ Loader] MTL parsed, materials:', {
							materialCount: materials.materials ? Object.keys(materials.materials).length : 0,
							materialNames: materials.materials ? Object.keys(materials.materials) : [],
							materialsObject: materials,
							materialsType: typeof materials,
							materialsKeys: Object.keys(materials || {}),
							hasMaterialsProperty: 'materials' in materials
						})
						
						// Manually load textures for each material using pre-fetched dependencies
						if (materials.materials) {
							const textureLoader = this.createTextureLoader(additionalFiles)
							
							for (const [materialName, material] of Object.entries(materials.materials)) {
								console.info('[OBJ Loader] Processing material:', materialName)
								
								// Handle map (diffuse texture)
								if (material.map) {
									console.info('[OBJ Loader] Loading diffuse texture for material:', materialName, material.map)
									try {
										const texture = await this.loadTextureFromDependencies(material.map, textureLoader, additionalFiles, THREE)
										if (texture) {
											material.map = texture
											console.info('[OBJ Loader] Diffuse texture loaded successfully for:', materialName)
										}
									} catch (error) {
										console.warn('[OBJ Loader] Failed to load diffuse texture for:', materialName, error)
									}
								}
								
								// Handle normal map
								if (material.normalMap) {
									console.info('[OBJ Loader] Loading normal map for material:', materialName, material.normalMap)
									try {
										const texture = await this.loadTextureFromDependencies(material.normalMap, textureLoader, additionalFiles, THREE)
										if (texture) {
											material.normalMap = texture
											console.info('[OBJ Loader] Normal map loaded successfully for:', materialName)
										}
									} catch (error) {
										console.warn('[OBJ Loader] Failed to load normal map for:', materialName, error)
									}
								}
								
								// Handle other texture types as needed
								// You can add more texture types here (specularMap, bumpMap, etc.)
							}
						}
						
						// Check if materials were actually created
						if (!materials.materials || Object.keys(materials.materials).length === 0) {
							console.warn('[OBJ Loader] No materials found in MTL file, creating default material')
							
							// Create a default material with the texture if available
							const defaultMaterial = new THREE.MeshLambertMaterial({
								color: 0xffffff,
								side: THREE.DoubleSide,
								transparent: false,
								opacity: 1.0
							})
							
							console.info('[OBJ Loader] Created default material:', {
								type: defaultMaterial.type,
								color: defaultMaterial.color.getHexString(),
								side: defaultMaterial.side,
								transparent: defaultMaterial.transparent
							})
							
							// Try to load the texture manually
							const textureLoader = this.createTextureLoader(additionalFiles)
							const textureFile = additionalFiles.find(file => {
								const fileName = file.name.split('/').pop()
								return fileName === 'Tile_+186_+162_0.jpg' || fileName.endsWith('_0.jpg')
							})
							
							if (textureFile) {
								console.info('[OBJ Loader] Loading texture for default material:', textureFile.name)
							try {
								const texture = await this.loadTextureFromDependencies('Tile_+186_+162_0.jpg', textureLoader, additionalFiles, THREE)
								if (texture) {
									defaultMaterial.map = texture
									console.info('[OBJ Loader] Default material texture loaded successfully')
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
						
						console.info('[OBJ Loader] Preloading materials...')
						materials.preload()
						
						console.info('[OBJ Loader] Setting materials on OBJ loader...')
						this.objLoader.setMaterials(materials)
						
						console.info('[OBJ Loader] MTL materials setup completed successfully')
						
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
				console.info('[OBJ Loader] Loading texture from dependencies:', texturePath)
				
				textureLoader.load(
					texturePath,
					(image) => {
						console.info('[OBJ Loader] Texture loaded successfully:', texturePath)
						
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
						
						console.info('[OBJ Loader] Texture created with properties:', {
							width: texture.image.width,
							height: texture.image.height,
							format: texture.format,
							type: texture.type,
							flipY: texture.flipY,
							wrapS: texture.wrapS,
							wrapT: texture.wrapT,
							minFilter: texture.minFilter,
							magFilter: texture.magFilter,
							anisotropy: texture.anisotropy
						})
						
						resolve(texture)
					},
					(progress) => {
						console.info('[OBJ Loader] Texture loading progress:', texturePath, progress)
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
			console.info('[OBJ Loader] Converting file to text:', {
				fileName: file.name,
				fileSize: file.size,
				fileType: file.type
			})
			
			const arrayBuffer = await file.arrayBuffer()
			const textDecoder = new TextDecoder('utf-8', { fatal: false })
			const text = textDecoder.decode(arrayBuffer)
			
			console.info('[OBJ Loader] File converted to text:', {
				fileName: file.name,
				textLength: text.length,
				firstChars: text.substring(0, 200),
				isEmpty: text.trim().length === 0
			})
			
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

	/**
	 * Load MTL materials (legacy method for single-file loading)
	 * @param {string} mtlName - MTL file name
	 * @param {number} fileId - File ID for API request
	 */
	async loadMtlMaterials(mtlName, fileId) {
		try {
			const mtlUrl = `/apps/threedviewer/api/file/${fileId}/mtl/${encodeURIComponent(mtlName)}`

			const response = await fetch(mtlUrl, {
				headers: { Accept: 'text/plain' },
				signal: this.abortController?.signal || AbortSignal.timeout(10000),
			})

			if (response.ok) {
				const mtlText = await response.text()
				if (mtlText && mtlText.trim().length > 0) {
					this.mtlLoader = new MTLLoader()
					const materials = this.mtlLoader.parse(mtlText, '')
					materials.preload()
					this.objLoader.setMaterials(materials)
					this.logInfo('MTL materials loaded successfully', { mtlName })
				}
			} else {
				this.logWarning('MTL file not found or error loading', {
					mtlName,
					status: response.status,
				})
			}
		} catch (error) {
			this.logWarning('Failed to load MTL materials', {
				mtlName,
				error: error.message,
			})
		}
	}

}

// Export the class as default so the registry can instantiate it
export default ObjLoader
