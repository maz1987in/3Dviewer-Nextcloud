import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { BaseLoader } from '../BaseLoader.js'
import { logger } from '../../utils/logger.js'
import { findFileByName, decodeTextFromBuffer } from '../../utils/fileHelpers.js'
import { getBoundingInfo } from '../../utils/three-utils.js'

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

		const { fileId, additionalFiles, THREE, progressive = false } = context

		// Decode the OBJ file content
		const objText = decodeTextFromBuffer(arrayBuffer)

		// Look for MTL file reference
		const mtlName = this.findMtlReference(objText)
		logger.info('OBJLoader', 'MTL reference parsed from OBJ', { mtlName })

		// Create loaders
		this.objLoader = new OBJLoader()

		// Load MTL materials if referenced

		if (mtlName && additionalFiles && additionalFiles.length > 0) {
			// Use pre-fetched dependencies from multi-file loading
			await this.loadMtlMaterialsFromDependencies(mtlName, additionalFiles, THREE, progressive)
		}

		// Parse the OBJ content
		const object3D = this.objLoader.parse(objText)

		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in OBJ file')
		}

		// Safety net: Assign default materials to any meshes that somehow ended up with null materials
		object3D.traverse((node) => {
			if (node.isMesh && !node.material) {
				node.material = new THREE.MeshLambertMaterial({
					color: 0xcccccc,
					side: THREE.DoubleSide,
				})
				logger.warn('OBJLoader', ` Mesh "${node.name}" had null material, assigned default`)
			}
		})

		this.logInfo('OBJ model parsed successfully', {
			children: object3D.children.length,
			hasMaterials: !!mtlName,
			usingPreFetched: !!(mtlName && additionalFiles && additionalFiles.length > 0),
		})

		// MTL materials applied automatically by OBJLoader

		// Object loaded successfully

		// Calculate bounding box and scale the model if it's too large
		const { size, center, maxDimension } = getBoundingInfo(object3D)

		// Model bounds calculated

		// If the model is too large, scale it down
		if (maxDimension > 1000) {
			const scaleFactor = 1000 / maxDimension
			object3D.scale.setScalar(scaleFactor)
			logger.info('OBJLoader', ' Model scaled down by factor:', scaleFactor)
		}

		// Model processing complete
		logger.info('OBJLoader', ' Model processing completed successfully')

		// Add camera positioning information to the context for the viewer
		logger.info('OBJLoader', ' Adding camera positioning hints to context...')
		if (!context.cameraHints) context.cameraHints = {}
		context.cameraHints.modelBounds = {
			size: { x: size.x, y: size.y, z: size.z },
			center: { x: center.x, y: center.y, z: center.z },
			maxDimension,
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
	 * @param mtlText
	 * @param THREE
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
					opacity: 1.0,
					map: null, // Explicitly initialize to null
					normalMap: null,
					specularMap: null,
				})
				materials[materialName] = currentMaterial
			} else if (currentMaterial && command === 'map_Kd') {
				// Store texture path for later loading, but keep material.map as null
				// Never set material.map to a string - it must be null or THREE.Texture
				const texturePath = parts.slice(1).join(' ').trim() // Handle paths with spaces
				currentMaterial._mapPath = texturePath // Temporary storage for path
				currentMaterial.map = null // Keep as null until texture loads
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
		const materialsWrapper = {
			materials,
			preload: () => {
				// Preload function placeholder
			},
			setMaterials: (objLoader) => {
				// Set materials function placeholder
			},
			create: (materialName) => {
				// Create method that OBJLoader expects
				// Handle empty or whitespace-only material names (malformed OBJ files)
				const trimmedName = materialName?.trim() || ''
				if (!trimmedName) {
					const firstMaterialName = Object.keys(materials)[0]
					if (firstMaterialName) {
						logger.warn('OBJLoader', ` Empty material name in OBJ file, using "${firstMaterialName}" as fallback`)
						return materials[firstMaterialName]
					}
				}

				const material = materials[trimmedName]
				if (!material) {
					// Material name not found - could be typo in OBJ file
					const firstMaterialName = Object.keys(materials)[0]
					if (firstMaterialName) {
						logger.warn('OBJLoader', ` Material "${trimmedName}" not found, using "${firstMaterialName}" as fallback`)
						return materials[firstMaterialName]
					}
				}
				return material || null
			},
		}

		logger.info('OBJLoader', 'Manual MTL parse complete', { materialCount: Object.keys(materials).length, materialNames: Object.keys(materials) })

		return materialsWrapper
	}

	/**
	 * Set up custom texture loader for native MTLLoader materials
	 * @param {object} materials - Materials object from MTLLoader
	 * @param {Array} additionalFiles - Pre-fetched dependency files
	 * @param {object} THREE - Three.js library instance
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
						// Always set to texture or null, never leave as string
						material.map = texture || null
						if (texture) {
							material.needsUpdate = true // Ensure material updates to show texture
						}
					})
					.catch(error => {
						logger.warn('OBJLoader', ' Failed to load diffuse texture for native material:', materialName, error)
						material.map = null
					})
			}

			if (material.normalMap && typeof material.normalMap === 'string') {
				this.loadTextureFromDependencies(material.normalMap, customTextureLoader, additionalFiles, THREE)
					.then(texture => {
						// Always set to texture or null, never leave as string
						material.normalMap = texture || null
						if (texture) {
							material.needsUpdate = true
						}
					})
					.catch(error => {
						logger.warn('OBJLoader', ' Failed to load normal texture for native material:', materialName, error)
						material.normalMap = null
					})
			}

			if (material.specularMap && typeof material.specularMap === 'string') {
				this.loadTextureFromDependencies(material.specularMap, customTextureLoader, additionalFiles, THREE)
					.then(texture => {
						// Always set to texture or null, never leave as string
						material.specularMap = texture || null
						if (texture) {
							material.needsUpdate = true
						}
					})
					.catch(error => {
						logger.warn('OBJLoader', ' Failed to load specular texture for native material:', materialName, error)
						material.specularMap = null
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
		logger.info('OBJLoader', ' Searching for MTL reference in OBJ file...')
		for (const line of objText.split(/\r?\n/)) {
			const trimmedLine = line.trim()
			if (trimmedLine.toLowerCase().startsWith('mtllib ')) {
				// Preserve full filename (including spaces) after the first space
				const mtlName = trimmedLine.slice(7).trim()
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
	 * @param {object} THREE - Three.js library instance
	 * @param progressive
	 */
	async loadMtlMaterialsFromDependencies(mtlName, additionalFiles, THREE, progressive = false) {
		try {
			logger.info('OBJLoader', 'loadMtlMaterialsFromDependencies start', { mtlName, availableFiles: additionalFiles.map(f => f.name), availableFilesCount: additionalFiles.length, progressive })
			// Search for MTL file in dependencies

			// Find the MTL file in the pre-fetched dependencies
			const mtlFile = additionalFiles.find(file => {
				// Handle both relative and absolute paths
				const fileName = file.name.split('/').pop()
				return fileName === mtlName || file.name.endsWith(mtlName)
			})

			// MTL file found

			if (mtlFile) {
				logger.info('OBJLoader', 'MTL file found', { mtlName, mtlFileName: mtlFile.name, mtlSize: mtlFile.size })
				// Convert the MTL file to text
				const mtlText = await this.fileToText(mtlFile)

				if (mtlText && mtlText.trim().length > 0) {
					try {
						this.mtlLoader = new MTLLoader()
						this.mtlLoader.setPath('')

						// Try native Three.js MTLLoader first
						let materials
						try {
							logger.info('OBJLoader', ' Attempting native MTLLoader...')
							materials = this.mtlLoader.parse(mtlText, '')

							// Check if native loader actually created materials
							if (!materials || !materials.materials || Object.keys(materials.materials).length === 0) {
								logger.warn('OBJLoader', ' Native MTLLoader returned no materials, falling back to manual parser')
								materials = this.parseMtlManually(mtlText, THREE)
								logger.info('OBJLoader', 'Manual MTL parser used (native empty)', { mtlName })
							} else {
								logger.info('OBJLoader', ' Native MTLLoader successful:', Object.keys(materials.materials).length, 'materials')
								logger.info('OBJLoader', 'Native MTLLoader materials', { mtlName, materialCount: Object.keys(materials.materials || {}).length, materialNames: Object.keys(materials.materials || {}) })
								// Set up custom texture loader for native materials
								this.setupCustomTextureLoader(materials, additionalFiles, THREE)
							}
						} catch (error) {
							logger.warn('OBJLoader', ' Native MTLLoader failed, falling back to manual parser:', error.message)
							materials = this.parseMtlManually(mtlText, THREE)
						}

						// MTL parsed successfully

						// Load textures for materials (only for manual parser - native parser handles this in setupCustomTextureLoader)
						if (materials.materials && Object.keys(materials.materials).length > 0) {
							// Check if this was parsed manually (has _mapPath property) or natively (textures are already loaded or will be loaded async)
							// Need to check ALL materials, not just the first one - some materials might not have textures
							const isManualParser = Object.values(materials.materials).some(mat => mat._mapPath !== undefined)

							if (isManualParser) {
								// Processing materials with textures from manual parser
								const customTextureLoader = this.createTextureLoader(additionalFiles)

								if (progressive) {
									// Progressive mode: Set placeholders, textures will load in background
									for (const [materialName, material] of Object.entries(materials.materials)) {
										// Set placeholder color if texture paths exist
										if (material._mapPath || material._normalMapPath || material._specularMapPath) {
											// Keep color or use default gray
											if (!material.color || material.color.getHex() === 0x000000) {
												material.color.setHex(0xcccccc)
											}
										}

										// Load textures in background (non-blocking)
										if (material._mapPath) {
											this.loadTextureFromDependencies(material._mapPath, customTextureLoader, additionalFiles, THREE)
												.then(texture => {
													material.map = texture || null
													material.needsUpdate = true
												})
												.catch(error => logger.warn('OBJLoader', 'Progressive texture load failed:', materialName, error))
											delete material._mapPath
										}

										if (material._normalMapPath) {
											this.loadTextureFromDependencies(material._normalMapPath, customTextureLoader, additionalFiles, THREE)
												.then(texture => {
													material.normalMap = texture || null
													material.needsUpdate = true
												})
												.catch(error => logger.warn('OBJLoader', 'Progressive normal map load failed:', materialName, error))
											delete material._normalMapPath
										}

										if (material._specularMapPath) {
											this.loadTextureFromDependencies(material._specularMapPath, customTextureLoader, additionalFiles, THREE)
												.then(texture => {
													material.specularMap = texture || null
													material.needsUpdate = true
												})
												.catch(error => logger.warn('OBJLoader', 'Progressive specular map load failed:', materialName, error))
											delete material._specularMapPath
										}
									}

									logger.info('OBJLoader', 'Progressive texture loading initiated for manual parser materials')
								} else {
									// Synchronous mode: Load textures before displaying (original behavior)
									for (const [materialName, material] of Object.entries(materials.materials)) {
										// Handle diffuse texture (map_Kd) - path stored in _mapPath
										if (material._mapPath) {
											try {
												const texture = await this.loadTextureFromDependencies(material._mapPath, customTextureLoader, additionalFiles, THREE)
												material.map = texture || null
												if (texture) {
													material.needsUpdate = true // Ensure material updates to show texture
												}
												delete material._mapPath // Clean up temporary property
											} catch (error) {
												logger.warn('OBJLoader', ' Failed to load diffuse texture for:', materialName, error)
												material.map = null
												delete material._mapPath
											}
										}

										// Handle normal map (bump map)
										if (material._normalMapPath) {
											try {
												const texture = await this.loadTextureFromDependencies(material._normalMapPath, customTextureLoader, additionalFiles, THREE)
												material.normalMap = texture || null
												delete material._normalMapPath
											} catch (error) {
												logger.warn('OBJLoader', ' Failed to load normal map for:', materialName, error)
												material.normalMap = null
												delete material._normalMapPath
											}
										}

										// Handle specular map
										if (material._specularMapPath) {
											try {
												const texture = await this.loadTextureFromDependencies(material._specularMapPath, customTextureLoader, additionalFiles, THREE)
												material.specularMap = texture || null
												if (texture) {
													material.needsUpdate = true
												}
												delete material._specularMapPath
											} catch (error) {
												logger.warn('OBJLoader', ' Failed to load specular map for:', materialName, error)
												material.specularMap = null
												delete material._specularMapPath
											}
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
								opacity: 1.0,
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

								if (progressive) {
									// Progressive mode: Load texture in background
									this.loadTextureFromDependencies(textureFile.name, textureLoader, additionalFiles, THREE)
										.then(texture => {
											if (texture) {
												defaultMaterial.map = texture
												defaultMaterial.needsUpdate = true
											}
										})
										.catch(error => logger.warn('OBJLoader', 'Progressive default texture load failed:', error))

									logger.info('OBJLoader', 'Progressive texture loading for default material')
								} else {
									// Synchronous mode: Wait for texture
									try {
										const texture = await this.loadTextureFromDependencies(textureFile.name, textureLoader, additionalFiles, THREE)
										if (texture) {
											defaultMaterial.map = texture
										}
									} catch (error) {
										logger.warn('OBJLoader', ' Failed to load texture for default material:', error)
									}
								}
							}

							// Create a materials object with the default material
							materials.materials = {
								default: defaultMaterial,
							}
						}

						// Preload and set materials
						logger.info('OBJLoader', 'Materials ready to set on OBJLoader', { mtlName, materialCount: Object.keys(materials.materials || {}).length, materialNames: Object.keys(materials.materials || {}), progressive })
						materials.preload()
						this.objLoader.setMaterials(materials)

						this.logInfo('MTL materials loaded from dependencies', {
							mtlName,
							dependenciesCount: additionalFiles.length,
						})
					} catch (parseError) {
						logger.error('OBJLoader', ' Error during MTL parsing/setup:', parseError)
						throw parseError
					}
				} else {
					this.logWarning('MTL file content is empty', { mtlName })
				}
			} else {
				this.logWarning('MTL file not found in pre-fetched dependencies', {
					mtlName,
					availableFiles: additionalFiles.map(f => f.name.split('/').pop()),
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
				// Try to find texture with original path first (preserves directory structure)
				// Fall back to basename only if not found (handles flat file storage)
				const normalizedUrl = url.replace(/\\/g, '/') // Convert backslashes
				const basename = normalizedUrl.split('/').pop()

				// Try exact match first (case-insensitive)
				let textureFile = additionalFiles.find(file => {
					const filePath = file.name.replace(/\\/g, '/')
					return filePath.toLowerCase() === normalizedUrl.toLowerCase()
				})

				// Fall back to basename match if full path not found
				if (!textureFile) {
					textureFile = additionalFiles.find(file => {
						const fileName = file.name.split('/').pop()
						return fileName.toLowerCase() === basename.toLowerCase()
					})
				}

				if (textureFile) {
					// Check if texture format is supported by browsers
					const extension = textureFile.name.split('.').pop().toLowerCase()
					const unsupportedFormats = ['tif', 'tiff', 'tga', 'dds']

					if (unsupportedFormats.includes(extension)) {
						logger.warn('OBJLoader', ` Texture format .${extension} is not supported by browsers, skipping:`, url)
						onLoad(null) // Signal "no texture" so loading can continue
						return
					}

					// Create a blob URL from the pre-fetched file
					// File objects are already Blobs, so we can use them directly
					const blobUrl = URL.createObjectURL(textureFile)

					// Use the standard Image loader with the blob URL
					const image = new Image()
					image.onload = () => {
						onLoad(image)
						URL.revokeObjectURL(blobUrl) // Clean up
					}
					image.onerror = (error) => {
						logger.warn('OBJLoader', ' Texture failed to load:', url)
						onLoad(null) // Allow loading to continue without texture
						URL.revokeObjectURL(blobUrl) // Clean up
					}
					image.src = blobUrl
				} else {
					// Texture not found in dependencies
					this.logWarning('Texture not found in pre-fetched dependencies', {
						url,
						normalizedUrl,
						availableFiles: additionalFiles.map(f => f.name.split('/').pop()),
					})
					onLoad(null) // Allow loading to continue without texture
				}
			},
		}
	}

	/**
	 * Load texture from pre-fetched dependencies
	 * @param {string} texturePath - Texture file path/name
	 * @param {object} textureLoader - Custom texture loader
	 * @param {Array} additionalFiles - Pre-fetched dependency files
	 * @param {object} THREE - Three.js library instance
	 * @return {Promise<THREE.Texture|null>} Loaded texture or null
	 */
	async loadTextureFromDependencies(texturePath, textureLoader, additionalFiles, THREE) {
		logger.info('OBJLoader', 'loadTextureFromDependencies start', { texturePath, availableFiles: additionalFiles.map(f => f.name), availableFilesCount: additionalFiles.length })
		return new Promise((resolve, reject) => {
			try {
				textureLoader.load(
					texturePath,
					(image) => {
						// Check if image is null (texture unavailable/unsupported)
						if (!image) {
							resolve(null)
							return
						}

						// Create THREE.js texture from the loaded image with proper settings
						const texture = new THREE.Texture(image)
						texture.needsUpdate = true

						// Configure texture properties based on best practices
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

						logger.info('OBJLoader', 'loadTextureFromDependencies success', { texturePath, width: image?.width, height: image?.height })

						resolve(texture)
					},
					(progress) => {
						// Texture loading progress (optional)
					},
					(error) => {
						logger.warn('OBJLoader', ' Texture loading failed:', texturePath, error)
						logger.warn('OBJLoader', 'loadTextureFromDependencies error', { texturePath, error: error?.message })
						resolve(null) // Return null instead of rejecting to allow graceful fallback
					},
				)
			} catch (error) {
				logger.error('OBJLoader', ' Error in loadTextureFromDependencies:', error)
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
			const text = decodeTextFromBuffer(arrayBuffer)

			// File converted to text successfully

			return text
		} catch (error) {
			logger.error('OBJLoader', ' Failed to convert file to text:', error)
			this.logWarning('Failed to convert file to text', {
				fileName: file.name,
				error: error.message,
			})
			return ''
		}
	}

}

// Export the class as default so the registry can instantiate it
export default ObjLoader
