import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { BaseLoader } from '../BaseLoader.js'
import { logger } from '../../utils/logger.js'

/**
 * Helper function to convert ArrayBuffer to string
 * @param {ArrayBuffer} buffer - ArrayBuffer to convert
 * @return {string} Decoded string
 */
function convertArrayBufferToString(buffer) {
	const uint8Array = new Uint8Array(buffer)
	let binaryString = ''
	for (let i = 0; i < uint8Array.length; i++) {
		binaryString += String.fromCharCode(uint8Array[i])
	}
	return binaryString
}

/**
 * Check if FBX file is ASCII format
 * @param {string} text - FBX file content as string
 * @return {boolean} True if ASCII format
 */
function isFbxFormatASCII(text) {
	return text.indexOf('FBX') !== -1 && text.indexOf('FBXVersion') !== -1
}

/**
 * Get FBX version from text
 * @param {string} text - FBX file content as string
 * @return {number} FBX version number
 */
function getFbxVersion(text) {
	const versionRegExp = /FBXVersion:\s*(\d+)/i
	const match = text.match(versionRegExp)
	if (match) {
		return parseInt(match[1], 10)
	}
	return 0
}

/**
 * Check if FBX file is binary format
 * @param {ArrayBuffer} buffer - FBX file buffer
 * @return {boolean} True if binary format
 */
function isFbxFormatBinary(buffer) {
	// Binary FBX files start with specific magic bytes
	// Check for FBX binary magic: "Kaydara FBX Binary  \0" (23 bytes)
	if (buffer.byteLength < 23) return false

	const magic = convertArrayBufferToString(buffer.slice(0, 23))
	return magic.startsWith('Kaydara FBX Binary')
}

/**
 * Get FBX version from binary file
 * @param {ArrayBuffer} buffer - FBX file buffer
 * @return {number} FBX version number
 */
function getFbxVersionBinary(buffer) {
	const view = new DataView(buffer)
	// Version is at offset 23 (after 23-byte magic)
	if (buffer.byteLength < 27) return 0
	return view.getUint32(23, true) // little-endian
}

/**
 * FBX loader class with support for FBX 6.1
 */
class FbxLoader extends BaseLoader {

	constructor() {
		super('FBXLoader', ['fbx'])
		this.loader = null
	}

	/**
	 * Load FBX model with support for version 6.1
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {

		// Check FBX version first
		let fbxVersion = 0
		let isBinary = false

		// Try to detect format and version
		const text = convertArrayBufferToString(arrayBuffer)
		if (isFbxFormatASCII(text)) {
			fbxVersion = getFbxVersion(text)
			logger.info('FBXLoader', 'Detected ASCII FBX file', { version: fbxVersion })
		} else if (isFbxFormatBinary(arrayBuffer)) {
			isBinary = true
			fbxVersion = getFbxVersionBinary(arrayBuffer)
			logger.info('FBXLoader', 'Detected binary FBX file', { version: fbxVersion })
		}

		// If version is 6.1 (6100), we need to patch the loader
		if (fbxVersion === 6100) {
			logger.info('FBXLoader', 'FBX version 6.1 detected, applying compatibility patch')
			return this.loadFbx61(arrayBuffer, context, isBinary)
		}

		// For other versions, use standard loader
		return this.loadFbxStandard(arrayBuffer, context)
	}

	/**
	 * Load FBX 6.1 file by patching the version number
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @param {boolean} isBinary - Whether file is binary format
	 * @return {Promise<object>} Load result
	 */
	async loadFbx61(arrayBuffer, context, isBinary) {

		logger.info('FBXLoader', 'Patching FBX 6.1 file to compatible version', { isBinary })

		// Patch the version number before parsing
		let patchedBuffer
		if (isBinary) {
			// For binary files, upgrade version from 6.1 (6100) to 6.4 (6400)
			// This is the minimum version the loader supports for binary files
			patchedBuffer = this.patchFbxVersionBinary(arrayBuffer, 6400)
			logger.info('FBXLoader', 'Patched binary FBX version from 6100 to 6400')
		} else {
			// For ASCII files, upgrade version from 6.1 (6100) to 7.0 (7000)
			// This is the minimum version the loader supports for ASCII files
			const text = convertArrayBufferToString(arrayBuffer)
			const patchedText = text.replace(/FBXVersion:\s*6100/gi, 'FBXVersion: 7000')
			patchedBuffer = new TextEncoder().encode(patchedText).buffer
			logger.info('FBXLoader', 'Patched ASCII FBX version from 6100 to 7000')
		}

		// Try to load using standard loader with patched version
		// Note: FBX 6.1 has structural differences that may cause parsing to fail
		try {
			return await this.loadFbxStandard(patchedBuffer, context)
		} catch (error) {
			// If parsing fails, it's likely due to format incompatibility, not just version
			logger.error('FBXLoader', 'FBX 6.1 file failed to parse after version patch', {
				error: error.message,
				isBinary,
			})

			// Detect specific error patterns that indicate structural incompatibility
			const isStructuralError = error.message.includes('Cannot read properties of undefined')
				|| error.message.includes("reading 'name'")
				|| error.message.includes('is not defined')

			// Provide a helpful error message
			let errorMessage = 'FBX 6.1 format is not fully compatible with the Three.js FBXLoader. '

			if (isStructuralError) {
				errorMessage += 'The file structure contains elements that the loader cannot parse (missing or undefined properties). '
			} else {
				errorMessage += 'The file structure differs from supported versions (7.0+ for ASCII, 6.4+ for binary). '
			}

			errorMessage += 'Please convert the file to a supported FBX version (7.0 or later) using Autodesk FBX Converter, Blender, or another 3D tool. '
				+ 'Alternatively, use an alternative format like glTF, OBJ, or DAE. '
				+ `Original error: ${error.message}`

			throw new Error(errorMessage)
		}
	}

	/**
	 * Patch binary FBX version number
	 * @param {ArrayBuffer} buffer - Original buffer
	 * @param {number} newVersion - New version number to set
	 * @return {ArrayBuffer} Patched buffer
	 */
	patchFbxVersionBinary(buffer, newVersion) {
		const patched = buffer.slice(0) // Copy buffer
		const view = new DataView(patched)
		// Version is at offset 23
		if (patched.byteLength >= 27) {
			view.setUint32(23, newVersion, true) // little-endian
		}
		return patched
	}

	/**
	 * Load FBX file using standard loader (for supported versions)
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	/**
	 * Find texture file in dependencies with flexible matching
	 * Handles spaces, underscores, case variations, and partial matches
	 * @param {string} textureName - Texture name from FBX file
	 * @param {Array} additionalFiles - Available texture files
	 * @return {File|null} Matching file or null
	 */
	findTextureFile(textureName, additionalFiles) {
		if (!additionalFiles || additionalFiles.length === 0) {
			return null
		}

		// Normalize the texture name (lowercase, remove path separators)
		const normalizedTextureName = textureName.split('/').pop().split('\\').pop().toLowerCase()
		const textureNameWithoutExt = normalizedTextureName.replace(/\.[^.]+$/, '')
		const textureExt = normalizedTextureName.split('.').pop()

		// Extract just the filenames for logging
		const availableFileNames = additionalFiles.map(f => {
			const name = f.name.split('/').pop().split('\\').pop()
			return name.toLowerCase()
		})
		const availableFileNamesStr = availableFileNames.join(', ')

		logger.debug('FBXLoader', `Matching texture "${textureName}" (normalized: "${normalizedTextureName}") against: ${availableFileNamesStr}`, {
			textureName,
			normalizedTextureName,
			textureNameWithoutExt,
			textureExt,
			availableFileNames: availableFileNamesStr,
			availableFileNamesCount: availableFileNames.length,
		})

		// Try multiple matching strategies
		for (const file of additionalFiles) {
			const fileName = file.name.split('/').pop().split('\\').pop()
			const normalizedFileName = fileName.toLowerCase()
			const fileNameWithoutExt = normalizedFileName.replace(/\.[^.]+$/, '')
			const fileExt = normalizedFileName.split('.').pop()

			// Strategy 1: Exact match (case-insensitive)
			if (normalizedFileName === normalizedTextureName) {
				logger.debug('FBXLoader', 'Matched texture (exact)', { textureName, fileName })
				return file
			}

			// Strategy 2: Match with spaces normalized to underscores and vice versa
			const textureNameVariations = [
				textureNameWithoutExt,
				textureNameWithoutExt.replace(/\s+/g, '_'),
				textureNameWithoutExt.replace(/_/g, ' '),
				textureNameWithoutExt.replace(/\s+/g, ''),
				textureNameWithoutExt.replace(/_/g, ''),
			]

			const fileNameVariations = [
				fileNameWithoutExt,
				fileNameWithoutExt.replace(/\s+/g, '_'),
				fileNameWithoutExt.replace(/_/g, ' '),
				fileNameWithoutExt.replace(/\s+/g, ''),
				fileNameWithoutExt.replace(/_/g, ''),
			]

			// Check if any variation matches (with same extension)
			if (textureExt === fileExt) {
				for (const textureVar of textureNameVariations) {
					for (const fileVar of fileNameVariations) {
						if (textureVar === fileVar) {
							logger.debug('FBXLoader', 'Matched texture (variation)', {
								textureName,
								fileName,
								textureVar,
								fileVar,
							})
							return file
						}
					}
				}
			}

			// Strategy 3: Partial match (texture name contains file name or vice versa)
			if (textureExt === fileExt) {
				if (textureNameWithoutExt.includes(fileNameWithoutExt)
					|| fileNameWithoutExt.includes(textureNameWithoutExt)) {
					// Only use partial match if lengths are similar (within 20% difference)
					const lengthDiff = Math.abs(textureNameWithoutExt.length - fileNameWithoutExt.length)
					const avgLength = (textureNameWithoutExt.length + fileNameWithoutExt.length) / 2
					if (lengthDiff / avgLength < 0.2) {
						logger.debug('FBXLoader', 'Matched texture (partial)', {
							textureName,
							fileName,
							textureNameWithoutExt,
							fileNameWithoutExt,
						})
						return file
					}
				}
			}

			// Strategy 4: Handle common naming variations generically
			// - Singular/plural variations (eye/eyes, body/bodies, etc.)
			// - Remove common word prefixes (word_ or word followed by space/underscore)
			// - Common texture name mappings (col/color = body/diffuse)
			if (textureExt === fileExt) {
				let textureBase = textureNameWithoutExt
				let fileBase = fileNameWithoutExt

				// Remove common word prefixes from file name (e.g., "model_texture" -> "texture")
				// Pattern: word followed by underscore or space
				const prefixMatch = fileBase.match(/^[a-z]+[_\s](.+)$/i)
				if (prefixMatch) {
					fileBase = prefixMatch[1]
				}

				// Remove common word prefixes from texture name (e.g., "model texture" -> "texture")
				const texturePrefixMatch = textureBase.match(/^[a-z]+[_\s](.+)$/i)
				if (texturePrefixMatch) {
					textureBase = texturePrefixMatch[1]
				}

				// Handle singular/plural variations generically
				const normalizePlural = (str) => {
					// Handle cases like "eyes_2" -> "eye_2" or "eyes" -> "eye"
					// Match word ending in 's' followed by underscore and number, or just ending in 's'
					const pluralMatch = str.match(/^(.+?)(s)(_\d+)?$/i)
					if (pluralMatch && pluralMatch[1].length > 0) {
						// Return singular form with optional number suffix
						return pluralMatch[3] ? `${pluralMatch[1]}${pluralMatch[3]}` : pluralMatch[1]
					}
					return str
				}

				const textureNormalized = normalizePlural(textureBase)
				const fileNormalized = normalizePlural(fileBase)

				// Check if normalized names match exactly
				if (textureNormalized === fileNormalized) {
					logger.debug('FBXLoader', 'Matched texture (normalized)', {
						textureName,
						fileName,
						textureBase,
						fileBase,
						textureNormalized,
						fileNormalized,
					})
					return file
				}

				// Check if one contains the other (for partial matches)
				if (textureNormalized.includes(fileNormalized)
					|| fileNormalized.includes(textureNormalized)) {
					// Only use partial match if lengths are similar (within 30% difference)
					const lengthDiff = Math.abs(textureNormalized.length - fileNormalized.length)
					const avgLength = (textureNormalized.length + fileNormalized.length) / 2
					if (avgLength > 0 && lengthDiff / avgLength < 0.3) {
						logger.debug('FBXLoader', 'Matched texture (normalized partial)', {
							textureName,
							fileName,
							textureBase,
							fileBase,
							textureNormalized,
							fileNormalized,
						})
						return file
					}
				}

				// Common texture name mappings (generic)
				// "col" or "color" often refers to diffuse/base/body texture
				const colorTerms = ['col', 'color', 'colour', 'diffuse', 'base', 'albedo']
				const bodyTerms = ['body', 'diffuse', 'base', 'albedo', 'main']

				const textureIsColor = colorTerms.some(term => textureBase.includes(term))
				const fileIsBody = bodyTerms.some(term => fileBase.includes(term))

				if (textureIsColor && fileIsBody) {
					logger.debug('FBXLoader', 'Matched texture (color=body mapping)', {
						textureName,
						fileName,
						textureBase,
						fileBase,
					})
					return file
				}
			}
		}

		logger.debug('FBXLoader', `No texture match found for "${textureName}". Available files: ${availableFileNamesStr}`, {
			textureName,
			normalizedTextureName,
			availableFileNames: availableFileNamesStr,
			availableFileNamesCount: availableFileNames.length,
		})

		return null
	}

	async loadFbxStandard(arrayBuffer, context) {
		const { THREE, additionalFiles = [] } = context

		// Create loading manager to handle texture paths
		const manager = new THREE.LoadingManager()

		// Set up URL modifier to intercept texture loading
		manager.setURLModifier((url) => {
			const textureName = url.split('/').pop().split('\\').pop()

			const textureFile = this.findTextureFile(textureName, additionalFiles)

			if (textureFile) {
				const blob = new Blob([textureFile], { type: textureFile.type })
				const blobUrl = URL.createObjectURL(blob)
				logger.info('FBXLoader', 'Loading texture from dependencies', {
					textureName,
					matchedFileName: textureFile.name,
					blobUrl,
				})
				return blobUrl
			}

			// Extract just filenames for clearer logging
			const availableFileNames = additionalFiles.map(f => {
				const name = f.name.split('/').pop().split('\\').pop()
				return name
			})
			const availableFileNamesStr = availableFileNames.join(', ')

			logger.warn('FBXLoader', `Texture "${textureName}" not found in dependencies. Available files: ${availableFileNamesStr}`, {
				textureName,
				url,
				availableFiles: availableFileNamesStr,
				availableFilesCount: availableFileNames.length,
			})
			return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
		})

		// Create FBX loader with the loading manager
		this.loader = new FBXLoader(manager)

		// Parse the FBX file directly from arrayBuffer
		let object3D
		try {
			object3D = this.loader.parse(arrayBuffer, '')
		} catch (parseError) {
			logger.error('FBXLoader', 'FBX parsing failed', {
				error: parseError.message,
				stack: parseError.stack,
			})
			throw parseError
		}

		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in FBX file')
		}

		return this.processFbxResult(object3D, context, additionalFiles)
	}

	/**
	 * Process FBX result (common logic for both standard and 6.1 loading)
	 * @param {THREE.Object3D} object3D - Loaded 3D object
	 * @param {object} context - Loading context
	 * @param {Array} additionalFiles - Additional dependency files
	 * @return {object} Processed result
	 */
	processFbxResult(object3D, context, additionalFiles) {
		const { THREE } = context

		// Ensure materials are visible and count textures
		let meshCount = 0
		let texturesKeptCount = 0
		object3D.traverse((child) => {
			if (child.isMesh) {
				meshCount++
				if (child.material) {
					const materials = Array.isArray(child.material) ? child.material : [child.material]

					materials.forEach((mat, idx) => {
						// Count textures for logging
						const textureProps = ['map', 'normalMap', 'bumpMap', 'specularMap', 'emissiveMap',
										   'aoMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'lightMap']

						textureProps.forEach(prop => {
							if (mat[prop]) {
								texturesKeptCount++
							}
						})

						// Ensure material is visible and opaque
						mat.side = THREE.DoubleSide
						mat.visible = true
						mat.opacity = 1.0
						mat.transparent = false
						mat.needsUpdate = true

						logger.info('FBXLoader', 'Processed material', {
							childName: child.name || 'unnamed',
							materialIndex: idx,
							type: mat.type,
							color: mat.color ? { r: mat.color.r.toFixed(2), g: mat.color.g.toFixed(2), b: mat.color.b.toFixed(2) } : null,
							opacity: mat.opacity,
							transparent: mat.transparent,
							hasMap: !!mat.map,
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

		logger.info('FBXLoader', `Processed ${meshCount} meshes with ${texturesKeptCount} textures`)

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
