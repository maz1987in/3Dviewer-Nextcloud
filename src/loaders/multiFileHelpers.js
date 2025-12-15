/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Multi-file model loading helpers
 * Inspired by WARP-LAB/files_3dmodelviewer approach
 */

import { logger } from '../utils/logger.js'
import { getFulfilledValues } from '../utils/arrayHelpers.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import {
	getCached,
	setCached,
	generateCacheKey,
	isCacheAvailable,
} from '../utils/dependencyCache.js'

/**
 * Fetch a file from URL and return as File object
 * @param {string} url - URL to fetch from
 * @param {string} name - Filename for the File object
 * @param {string} defaultType - Default MIME type if not detected
 * @param {object} options - Additional options
 * @param {boolean} options.useCache - Whether to use cache (default: true)
 * @param {number} options.fileId - File ID for caching
 * @return {Promise<File>}
 */
export async function fetchFileFromUrl(url, name, defaultType = 'application/octet-stream', options = {}) {
	const { useCache = true, fileId = null } = options

	// Try cache first if enabled and fileId is available
	if (useCache && fileId && isCacheAvailable()) {
		try {
			const cacheKey = generateCacheKey(fileId, name)
			const cached = await getCached(cacheKey)

			if (cached && !cached.expired) {
				logger.info('MultiFileHelpers', 'Using cached dependency', { name, cacheHit: true })
				return new File([cached.data], name, { type: cached.mimeType })
			}
		} catch (error) {
			logger.warn('MultiFileHelpers', 'Cache read failed, fetching from network', error)
		}
	}

	// Fetch from network
	logger.info('MultiFileHelpers', 'Fetching from network', { name, cacheHit: false })
	const response = await fetch(url)

	if (!response.ok) {
		throw new Error(`${url} ${response.status} ${response.statusText}`)
	}

	const arrayBuffer = await response.arrayBuffer()
	const mimeType = response.headers.get('content-type') || defaultType
	const sizeMB = arrayBuffer.byteLength / (1024 * 1024)

	// Store in cache (skip if file is too large to prevent memory issues)
	const maxFileSizeMB = VIEWER_CONFIG.cache?.maxFileSizeMB || 10
	if (useCache && fileId && isCacheAvailable() && sizeMB <= maxFileSizeMB) {
		try {
			const cacheKey = generateCacheKey(fileId, name)
			await setCached(cacheKey, {
				fileId,
				filename: name,
				data: arrayBuffer,
				mimeType,
				size: arrayBuffer.byteLength,
			})
			logger.info('MultiFileHelpers', 'Dependency cached', { name, sizeMB: sizeMB.toFixed(2) })
		} catch (error) {
			logger.warn('MultiFileHelpers', 'Cache write failed, continuing', error)
		}
	} else if (sizeMB > maxFileSizeMB) {
		logger.info('MultiFileHelpers', 'File too large to cache, skipping', { name, sizeMB: sizeMB.toFixed(2) })
	}

	const blob = new Blob([arrayBuffer], { type: mimeType })
	return new File([blob], name, { type: mimeType })
}

/**
 * Gets file ID by path using the file listing API
 * @param {string} filePath - Path to the file
 * @return {Promise<number|null>} File ID or null if not found
 */
export async function getFileIdByPath(filePath) {
	let filename = ''
	let normalizedDirPath = ''

	try {
		// Validate input
		if (!filePath || filePath.trim().length === 0) {
			return null
		}

		// Get the directory path and filename
		const pathParts = filePath.split('/')
		filename = pathParts.pop()
		const dirPath = pathParts.join('/') || '/'

		// Validate filename after splitting
		if (!filename || filename.trim().length === 0) {
			return null
		}

		// Normalize dirPath: remove leading slash and handle root case
		normalizedDirPath = dirPath === '/' ? '' : dirPath.replace(/^\//, '')

		// Check if this is a texture/image file - these are often in subdirectories
		const fileExt = (filename.split('.').pop() || '').toLowerCase()
		const isImageFile = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tga', 'tiff', 'webp'].includes(fileExt)

		// First, try to find the file directly by full path (for dependency files like MTL)
		// Skip direct lookup for image files as they're often in subdirectories, avoiding unnecessary 404s
		const fullPath = normalizedDirPath ? `${normalizedDirPath}/${filename}` : filename
		if (!isImageFile) {
			try {
				const findUrl = `/apps/threedviewer/api/files/find?path=${encodeURIComponent(fullPath)}`
				const findResponse = await fetch(findUrl)

				if (findResponse.ok) {
					const fileData = await findResponse.json()
					if (fileData && fileData.id) {
						logger.info('MultiFileHelpers', ' Found file by path:', fullPath, 'id:', fileData.id)
						return fileData.id
					}
				} else {
					logger.debug('MultiFileHelpers', ' Direct path lookup returned:', findResponse.status, 'for:', fullPath)
				}
			} catch (findError) {
				// If direct path lookup fails, continue with directory listing
				logger.debug('MultiFileHelpers', ' Direct path lookup failed, trying directory listing:', findError)
			}
		}

		// Try to list files in the directory, but don't fail if it doesn't work
		let files = []
		let folders = []
		let listingSucceeded = false
		try {
			const params = new URLSearchParams()
			if (normalizedDirPath) {
				params.set('folder', normalizedDirPath)
			}
			params.set('includeDependencies', '1')
			const listUrl = `/apps/threedviewer/api/files/list?${params.toString()}`
			const response = await fetch(listUrl)

			if (response.ok) {
				const data = await response.json()
				// Backend returns { files: [], folders: [] } structure
				// Ensure files and folders are arrays
				files = Array.isArray(data?.files) ? data.files : (data?.files ? Object.values(data.files) : [])
				folders = Array.isArray(data?.folders) ? data.folders : (data?.folders ? Object.values(data.folders) : [])
				listingSucceeded = true
				logger.warn('MultiFileHelpers', ' Files in directory:', Array.isArray(files) ? files.map(f => f?.name || f) : 'not an array')
			} else {
				logger.warn('MultiFileHelpers', ' Failed to list files:', response.status, response.statusText)
			}
		} catch (listError) {
			logger.warn('MultiFileHelpers', ' Error listing directory, will try texture subdirectories:', listError)
		}

		logger.warn('MultiFileHelpers', ' Looking for file:', filename, 'in path:', normalizedDirPath)

		// Ensure files is an array before using .find()
		if (!Array.isArray(files)) {
			files = []
		}

		// Find the file by name (case-insensitive to handle Windows/Linux differences)
		let file = files.find(f => f?.name && f.name.toLowerCase() === filename.toLowerCase())

		// If exact match not found, try flexible matching (for cases like "Wolf_done_obj.mtl" -> "Wolf_obj.mtl")
		// or texture files like "eye_2.jpg" -> "Wolf_Eyes_2.jpg", "wolf col.jpg" -> "Wolf_Body.jpg"
		if (!file && files.length > 0) {
			const normalizedFilename = filename.toLowerCase()
			const filenameWithoutExt = normalizedFilename.replace(/\.[^.]+$/, '')
			const fileExt = normalizedFilename.split('.').pop()
			const isImageFile = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tga', 'tiff', 'webp'].includes(fileExt)

			// Try to find a similar file
			for (const candidate of files) {
				if (!candidate?.name) continue

				const candidateName = candidate.name.toLowerCase()
				const candidateWithoutExt = candidateName.replace(/\.[^.]+$/, '')
				const candidateExt = candidateName.split('.').pop()

				// Must have same extension
				if (candidateExt !== fileExt) continue

				// For image files, use sophisticated texture matching (like FBX loader)
				if (isImageFile) {
					// Strategy 1: Normalize spaces/underscores and compare
					const normalizeSpaces = (str) => str.replace(/[\s_]/g, '_')
					const searchNormalized = normalizeSpaces(filenameWithoutExt)
					const candidateNormalized = normalizeSpaces(candidateWithoutExt)

					if (searchNormalized === candidateNormalized) {
						logger.info('MultiFileHelpers', ' Matched texture (normalized spaces):', filename, '->', candidate.name)
						file = candidate
						break // Exit outer loop immediately
					}

					// Strategy 2: Remove common word prefixes and compare
					const removePrefix = (str) => {
						// Remove word followed by underscore or space
						const match = str.match(/^[a-z]+[_\s](.+)$/i)
						return match ? match[1] : str
					}

					// Normalize spaces first
					const normalizeSpacesFn = normalizeSpaces

					// Try matching with and without prefixes removed
					const searchBase = normalizeSpacesFn(filenameWithoutExt)
					const candidateBase = normalizeSpacesFn(candidateWithoutExt)

					// Also try with prefixes removed
					const searchBaseNoPrefix = normalizeSpacesFn(removePrefix(filenameWithoutExt))
					const candidateBaseNoPrefix = normalizeSpacesFn(removePrefix(candidateWithoutExt))

					// Strategy 3: Handle singular/plural variations
					const normalizePlural = (str) => {
						// Handle cases like "eyes_2" -> "eye_2" or "eyes" -> "eye"
						const pluralMatch = str.match(/^(.+?)(s)(_\d+)?$/i)
						if (pluralMatch && pluralMatch[1].length > 0) {
							return pluralMatch[3] ? `${pluralMatch[1]}${pluralMatch[3]}` : pluralMatch[1]
						}
						return str
					}

					// Try all combinations: with/without prefix, with/without plural normalization
					const combinations = [
						[searchBase, candidateBase],
						[searchBaseNoPrefix, candidateBase],
						[searchBase, candidateBaseNoPrefix],
						[searchBaseNoPrefix, candidateBaseNoPrefix],
					]

					// Use a flag to track if we found a match in the inner loop
					let foundMatch = false
					for (const [searchStr, candidateStr] of combinations) {
						const searchNormalizedPlural = normalizePlural(searchStr)
						const candidateNormalizedPlural = normalizePlural(candidateStr)

						if (searchNormalizedPlural === candidateNormalizedPlural) {
							logger.info('MultiFileHelpers', ' Matched texture (normalized plural):', filename, '->', candidate.name)
							file = candidate
							foundMatch = true
							break // Exit inner loop
						}

						// Strategy 4: Partial matching with length check
						if (searchNormalizedPlural.includes(candidateNormalizedPlural)
							|| candidateNormalizedPlural.includes(searchNormalizedPlural)) {
							const lengthDiff = Math.abs(searchNormalizedPlural.length - candidateNormalizedPlural.length)
							const avgLength = (searchNormalizedPlural.length + candidateNormalizedPlural.length) / 2
							if (avgLength > 0 && lengthDiff / avgLength < 0.3) {
								logger.info('MultiFileHelpers', ' Matched texture (partial):', filename, '->', candidate.name)
								file = candidate
								foundMatch = true
								break // Exit inner loop
							}
						}
					}

					// If match found in inner loop, exit outer loop
					if (foundMatch) {
						break
					}

					// Strategy 5: Color/body mapping (col/color -> body/diffuse)
					const colorTerms = ['col', 'color', 'colour', 'diffuse', 'base', 'albedo']
					const bodyTerms = ['body', 'diffuse', 'base', 'albedo', 'main']

					const searchIsColor = colorTerms.some(term => searchBaseNoPrefix.includes(term) || searchBase.includes(term))
					const candidateIsBody = bodyTerms.some(term => candidateBaseNoPrefix.includes(term) || candidateBase.includes(term))

					if (searchIsColor && candidateIsBody) {
						logger.info('MultiFileHelpers', ' Matched texture (color=body):', filename, '->', candidate.name)
						file = candidate
						break // Exit outer loop
					}
				} else {
					// For non-image files (like MTL), use simpler matching
					// Strategy 1: One name contains the other (for cases like "done_obj" vs "obj")
					if (filenameWithoutExt.includes(candidateWithoutExt)
						|| candidateWithoutExt.includes(filenameWithoutExt)) {
						// Only match if lengths are similar (within 50% difference to avoid false matches)
						const lengthDiff = Math.abs(filenameWithoutExt.length - candidateWithoutExt.length)
						const avgLength = (filenameWithoutExt.length + candidateWithoutExt.length) / 2
						if (avgLength > 0 && lengthDiff / avgLength < 0.5) {
							logger.info('MultiFileHelpers', ' Matched file (flexible):', filename, '->', candidate.name)
							file = candidate
							break
						}
					}

					// Strategy 2: Remove common suffixes/prefixes and compare
					// Handle cases like "Wolf_done_obj" -> "Wolf_obj" (remove middle word)
					const removeCommonWords = (str) => {
						// Remove common words like "done", "final", "v1", "v2", etc.
						return str.replace(/_(done|final|v\d+|version\d+|old|new|backup|copy)(_|$)/gi, '_')
							.replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
					}

					const normalizedSearch = removeCommonWords(filenameWithoutExt)
					const normalizedCandidate = removeCommonWords(candidateWithoutExt)

					if (normalizedSearch === normalizedCandidate && normalizedSearch.length > 0) {
						logger.info('MultiFileHelpers', ' Matched file (normalized):', filename, '->', candidate.name)
						file = candidate
						break
					}
				}
			}
		}

		// If not found in root, search in subdirectories (like "Texture", "textures", "images", etc.)
		if (!file) {
			const folderNames = Array.isArray(folders) ? folders.map(d => d?.name || d?.path || d) : []
			logger.warn('MultiFileHelpers', ' File not in root, checking subdirectories:', folderNames)

			// First, search in folders returned by the API
			for (const subdir of folders) {
				try {
					const subdirPath = subdir.path || (normalizedDirPath ? `${normalizedDirPath}/${subdir.name}` : subdir.name)
					const subdirListUrl = `/apps/threedviewer/api/files/list?folder=${encodeURIComponent(subdirPath)}`
					const subdirResponse = await fetch(subdirListUrl)

					if (subdirResponse.ok) {
						const subdirData = await subdirResponse.json()
						const subdirFiles = subdirData?.files || []
						file = subdirFiles.find(f => f.name.toLowerCase() === filename.toLowerCase())

						if (file) {
							logger.info('MultiFileHelpers', ' Found file in subdirectory:', subdir.name, '/', filename)
							break
						}
					}
				} catch (subdirError) {
					logger.warn('MultiFileHelpers', ' Error searching subdirectory:', subdir.name, subdirError)
				}
			}
		}

		// If still not found, try common texture subdirectory names using the find endpoint
		// Include both lowercase and capitalized versions
		// This should ALWAYS run, even if directory listing failed
		if (!file) {
			try {
				let commonTextureDirs = ['textures', 'texture', 'Texture', 'TEXTURE', 'TEXTURES', 'images', 'image', 'Image', 'IMAGE', 'tex', 'Tex', 'TEX', 'maps', 'map', 'Map', 'MAP']

				// Optimization: If directory listing succeeded, only search in folders that actually exist
				if (listingSucceeded) {
					if (folders.length === 0) {
						// No subdirectories exist, so no point searching
						commonTextureDirs = []
					} else {
						// Only search in folders that exist (case-insensitive check)
						const existingFolderNames = new Set(folders.map(f => (f.name || '').toLowerCase()))
						commonTextureDirs = commonTextureDirs.filter(dir => existingFolderNames.has(dir.toLowerCase()))
					}
				}

				if (commonTextureDirs.length > 0) {
					logger.warn('MultiFileHelpers', ' File not found in API folders, trying common texture subdirectories for:', filename, 'in:', normalizedDirPath)
				}

				for (const textureDir of commonTextureDirs) {
					try {
						const textureDirPath = normalizedDirPath ? `${normalizedDirPath}/${textureDir}` : textureDir
						const textureFilePath = `${textureDirPath}/${filename}`
						const findUrl = `/apps/threedviewer/api/files/find?path=${encodeURIComponent(textureFilePath)}`
						logger.warn('MultiFileHelpers', ' Trying texture path:', textureFilePath)
						const findResponse = await fetch(findUrl)

						if (findResponse.ok) {
							const fileData = await findResponse.json()
							if (fileData && fileData.id) {
								logger.warn('MultiFileHelpers', ' ✓ Found file in texture subdirectory:', textureDir, '/', filename, 'id:', fileData.id)
								return fileData.id
							}
						} else {
							logger.warn('MultiFileHelpers', ' Texture path not found:', textureFilePath, 'status:', findResponse.status)
						}
					} catch (findError) {
						logger.warn('MultiFileHelpers', ' Error trying texture path:', textureDir, findError)
						// Continue searching
					}
				}
				logger.warn('MultiFileHelpers', ' ✗ File not found in any common texture subdirectories:', filename)
			} catch (textureSearchError) {
				logger.warn('MultiFileHelpers', ' Error in texture subdirectory search:', textureSearchError)
			}
		}

		if (!file) {
			try {
				const fileNames = Array.isArray(files) ? files.map(f => f?.name || f) : []
				logger.warn('MultiFileHelpers', ' File not found:', filename, 'Available files:', fileNames)
			} catch (logError) {
				logger.warn('MultiFileHelpers', ' File not found:', filename, '(error logging available files)')
			}
		}

		return file ? file.id : null
	} catch (error) {
		logger.warn('MultiFileHelpers', ' Error getting file ID for path:', filePath, error)
		// Even if there's an error, try the texture subdirectory search as a last resort
		try {
			logger.warn('MultiFileHelpers', ' Attempting texture subdirectory search as fallback for:', filename, 'in:', normalizedDirPath)
			const commonTextureDirs = ['textures', 'texture', 'Texture', 'TEXTURE', 'TEXTURES', 'images', 'image', 'Image', 'IMAGE', 'tex', 'Tex', 'TEX', 'maps', 'map', 'Map', 'MAP']
			for (const textureDir of commonTextureDirs) {
				try {
					const textureDirPath = normalizedDirPath ? `${normalizedDirPath}/${textureDir}` : textureDir
					const textureFilePath = `${textureDirPath}/${filename}`
					const findUrl = `/apps/threedviewer/api/files/find?path=${encodeURIComponent(textureFilePath)}`
					logger.warn('MultiFileHelpers', ' Trying texture path (fallback):', textureFilePath)
					const findResponse = await fetch(findUrl)

					if (findResponse.ok) {
						const fileData = await findResponse.json()
						if (fileData && fileData.id) {
							logger.warn('MultiFileHelpers', ' ✓ Found file in texture subdirectory (fallback):', textureDir, '/', filename, 'id:', fileData.id)
							return fileData.id
						}
					}
				} catch (findError) {
					// Continue searching
				}
			}
		} catch (fallbackError) {
			logger.warn('MultiFileHelpers', ' Fallback texture search also failed:', fallbackError)
		}
		return null
	}
}

/**
 * Parse OBJ file content to find referenced MTL files
 * @param {string} objContent - Text content of OBJ file
 * @return {string[]} - Array of MTL filenames
 */
export function parseObjMaterialFiles(objContent) {
	// Match lines like: mtllib material.mtl
	const matches = [...objContent.matchAll(/^\s*mtllib[^\S\r\n]+(.*?)$/gm)]
	return [...new Set(matches.map(capture => capture[1].trim()))]
}

/**
 * Parse MTL file content to find referenced texture files
 * @param {string} mtlContent - Text content of MTL file
 * @return {string[]} - Array of texture filenames
 */
export function parseMtlTextureFiles(mtlContent) {
	// Match lines like: map_Kd texture.jpg, map_Ka ambient.png, etc.
	const matches = [...mtlContent.matchAll(/^\s*map_[A-Za-z0-9_]+[^\S\r\n]+(.*?)$/gm)]

	// Extract basenames only (strip directory paths and normalize separators)
	// OBJ/MTL files often reference textures in subdirectories (e.g., 'images\texture.jpg')
	// but Nextcloud stores all files flat in the same directory
	const filenames = matches.map(capture => {
		const fullPath = capture[1].trim()
		// Normalize both forward and backward slashes, then get basename
		const normalized = fullPath.replace(/\\/g, '/')
		const basename = normalized.split('/').pop()
		return basename
	}).filter(name => name && name.length > 0) // Filter out empty or undefined names

	return [...new Set(filenames)]
}

/**
 * Parse GLTF JSON to find referenced binary buffers and textures
 * @param {object} gltfJson - Parsed GLTF JSON
 * @return {object} - Object with buffers and images arrays
 */
export function parseGltfDependencies(gltfJson) {
	const dependencies = {
		buffers: [],
		images: [],
	}

	// Extract buffer URIs (skip embedded data URIs)
	if (gltfJson.buffers) {
		for (const buffer of gltfJson.buffers) {
			if (buffer.uri && !buffer.uri.startsWith('data:')) {
				dependencies.buffers.push(buffer.uri)
			}
		}
	}

	// Extract image URIs (skip embedded data URIs)
	if (gltfJson.images) {
		for (const image of gltfJson.images) {
			if (image.uri && !image.uri.startsWith('data:')) {
				dependencies.images.push(image.uri)
			}
		}
	}

	return dependencies
}

/**
 * Fetch OBJ dependencies (MTL files and their textures)
 * Uses our secure API endpoint
 *
 * @param {string} objContent - Text content of OBJ file
 * @param {string} baseFilename - Base filename of the OBJ (e.g., "model.obj")
 * @param {number} fileId - File ID of the main OBJ file
 * @param {string} dirPath - Directory path (e.g., "/models")
 * @return {Promise<object>} - Object with { found: File[], missing: string[] }
 */
export async function fetchObjDependencies(objContent, baseFilename, fileId, dirPath) {
	const dependencies = []
	const missingFiles = []

	// Parse MTL references
	const mtlFiles = parseObjMaterialFiles(objContent)

	if (mtlFiles.length === 0) {
		logger.info('MultiFileHelpers', ' No MTL files referenced in OBJ')
		return { found: dependencies, missing: missingFiles }
	}

	logger.info('MultiFileHelpers', ' Found MTL files:', mtlFiles)

	// Fetch all MTL files
	const mtlPromises = mtlFiles.map(async (mtlFilename) => {
		try {
			// Construct relative path
			const mtlPath = dirPath ? `${dirPath}/${mtlFilename}` : mtlFilename

			// Use the file listing API to get file ID, then fetch by ID
			const fileId = await getFileIdByPath(mtlPath)

			if (fileId) {
				const url = `/apps/threedviewer/api/file/${fileId}`
				const file = await fetchFileFromUrl(url, mtlFilename, 'model/mtl', { fileId })
				logger.info('MultiFileHelpers', ' Fetched MTL:', mtlFilename)

				// Parse textures from MTL
				const mtlText = await file.text()
				const textureFiles = parseMtlTextureFiles(mtlText)

				// Fetch textures using file listing approach
				const texturePromises = textureFiles.map(async (texFilename) => {
					try {
						const texPath = dirPath ? `${dirPath}/${texFilename}` : texFilename
						const fileId = await getFileIdByPath(texPath)

						if (fileId) {
							const texUrl = `/apps/threedviewer/api/file/${fileId}`
							const texFile = await fetchFileFromUrl(texUrl, texFilename, 'application/octet-stream', { fileId })
							logger.info('MultiFileHelpers', ' Fetched texture:', texFilename)
							return { file: texFile, name: texFilename, found: true }
						} else {
							logger.warn('MultiFileHelpers', ' Could not find file ID for texture:', texFilename)
							missingFiles.push(texFilename)
							return { file: null, name: texFilename, found: false }
						}
					} catch (err) {
						logger.warn('MultiFileHelpers', ' Failed to fetch texture:', texFilename, err)
						missingFiles.push(texFilename)
						return { file: null, name: texFilename, found: false }
					}
				})

				const textureResults = await Promise.allSettled(texturePromises)
				const textures = textureResults
					.filter(r => r.status === 'fulfilled' && r.value?.found)
					.map(r => r.value.file)

				return [file, ...textures]
			} else {
				logger.warn('MultiFileHelpers', ' Could not find file ID for MTL:', mtlFilename)
				missingFiles.push(mtlFilename)
				return []
			}

		} catch (err) {
			logger.warn('MultiFileHelpers', ' Failed to fetch MTL:', mtlFilename, err)
			missingFiles.push(mtlFilename)
			return []
		}
	})

	const results = await Promise.allSettled(mtlPromises)
	const allFiles = getFulfilledValues(results, false).flatMap(r => r)

	return { found: allFiles, missing: missingFiles }
}

/**
 * Fetch GLTF dependencies (binary buffers and textures)
 * Uses our secure API endpoint
 *
 * @param {string} gltfContent - Text content of GLTF file
 * @param {string} baseFilename - Base filename of the GLTF (e.g., "model.gltf")
 * @param {number} fileId - File ID of the main GLTF file
 * @param {string} dirPath - Directory path
 * @return {Promise<object>} - Object with { found: File[], missing: string[] }
 */
export async function fetchGltfDependencies(gltfContent, baseFilename, fileId, dirPath) {
	const dependencies = []
	const missingFiles = []

	try {
		const gltfJson = JSON.parse(gltfContent)
		const deps = parseGltfDependencies(gltfJson)

		logger.info('MultiFileHelpers', ' GLTF dependencies:', deps)

		// Fetch buffers using file listing approach
		const bufferPromises = deps.buffers.map(async (bufferUri) => {
			try {
				// Use the file listing API to get file ID, then fetch by ID
				const bufferPath = dirPath ? `${dirPath}/${bufferUri}` : bufferUri
				const fileId = await getFileIdByPath(bufferPath)

				if (fileId) {
					const url = `/apps/threedviewer/api/file/${fileId}`
					const file = await fetchFileFromUrl(url, bufferUri, 'application/octet-stream', { fileId })
					logger.info('MultiFileHelpers', ' Fetched buffer:', bufferUri)
					return file
				} else {
					logger.warn('MultiFileHelpers', ' Could not find file ID for buffer:', bufferUri)
					missingFiles.push(bufferUri)
					return null
				}
			} catch (err) {
				logger.warn('MultiFileHelpers', ' Failed to fetch buffer:', bufferUri, err)
				missingFiles.push(bufferUri)
				return null
			}
		})

		// Fetch images using file listing approach
		const imagePromises = deps.images.map(async (imageUri) => {
			try {
				// Use the file listing API to get file ID, then fetch by ID
				const imagePath = dirPath ? `${dirPath}/${imageUri}` : imageUri
				const fileId = await getFileIdByPath(imagePath)

				if (fileId) {
					const url = `/apps/threedviewer/api/file/${fileId}`
					const file = await fetchFileFromUrl(url, imageUri, 'application/octet-stream', { fileId })
					logger.info('MultiFileHelpers', ' Fetched image:', imageUri)
					return file
				} else {
					logger.warn('MultiFileHelpers', ' Could not find file ID for image:', imageUri)
					missingFiles.push(imageUri)
					return null
				}
			} catch (err) {
				logger.warn('MultiFileHelpers', ' Failed to fetch image:', imageUri, err)
				missingFiles.push(imageUri)
				return null
			}
		})

		const results = await Promise.allSettled([...bufferPromises, ...imagePromises])
		dependencies.push(...getFulfilledValues(results))

	} catch (err) {
		console.error('[MultiFileHelpers] Error parsing GLTF:', err)
	}

	return { found: dependencies, missing: missingFiles }
}

/**
 * Fetch FBX dependencies (texture files)
 * FBX files often reference external textures
 *
 * @param {string} baseFilename - Base filename of the FBX (e.g., "model.fbx")
 * @param {number} fileId - File ID of the main FBX file
 * @param {string} dirPath - Directory path (e.g., "/models")
 * @return {Promise<object>} - Object with { found: File[], missing: string[] }
 */
async function fetchFbxDependencies(baseFilename, fileId, dirPath) {
	const dependencies = []
	const missingFiles = [] // FBX/3DS speculatively loads all textures, so missing is usually empty

	const textureExtensions = ['png', 'jpg', 'jpeg', 'tga', 'tif', 'tiff', 'bmp', 'gif']
	const visited = new Set()

	const collectTexturesFromFolder = async (folderPath) => {
		const normalizedPath = folderPath ? folderPath.replace(/^\//, '') : ''
		const visitKey = normalizedPath || '/'
		if (visited.has(visitKey)) {
			return []
		}
		visited.add(visitKey)

		const params = new URLSearchParams()
		if (normalizedPath) {
			params.set('folder', normalizedPath)
		}
		params.set('includeDependencies', '1')

		const listUrl = `/apps/threedviewer/api/files/list?${params.toString()}`
		const response = await fetch(listUrl)

		if (!response.ok) {
			logger.warn('FBXDependencies', 'Failed to list directory files', { dirPath: normalizedPath, status: response.status })
			return []
		}

		const data = await response.json()
		const files = Array.isArray(data?.files) ? data.files : []
		const folders = Array.isArray(data?.folders) ? data.folders : []

		const imageFiles = files.filter(file => {
			const ext = (file.name?.split('.').pop() || '').toLowerCase()
			return textureExtensions.includes(ext)
		})

		logger.info('FBXDependencies', 'Found potential texture files', {
			folder: normalizedPath || '/',
			count: imageFiles.length,
			files: imageFiles.map(f => f.name),
		})

		const texturePromises = imageFiles.map(async (file) => {
			try {
				const url = `/apps/threedviewer/api/file/${file.id}`
				const texResponse = await fetch(url)
				if (texResponse.ok) {
					const arrayBuffer = await texResponse.arrayBuffer()
					const ext = (file.name?.split('.').pop() || '').toLowerCase()
					const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`
					const blob = new Blob([arrayBuffer], { type: mimeType })
					return new File([blob], file.name, { type: mimeType })
				}
				return null
			} catch (err) {
				logger.warn('FBXDependencies', 'Failed to fetch texture', { filename: file.name, error: err })
				return null
			}
		})

		const results = await Promise.allSettled(texturePromises)
		const foundTextures = getFulfilledValues(results)

		for (const subfolder of folders) {
			const childPath = subfolder.path || (normalizedPath ? `${normalizedPath}/${subfolder.name}` : subfolder.name)
			if (childPath) {
				const childTextures = await collectTexturesFromFolder(childPath)
				foundTextures.push(...childTextures)
			}
		}

		return foundTextures
	}

	try {
		const initialTextures = await collectTexturesFromFolder(dirPath || '')
		dependencies.push(...initialTextures)

		logger.info('FBXDependencies', 'Found textures in directory tree', {
			count: dependencies.length,
			files: dependencies.map(f => f.name),
		})
	} catch (err) {
		logger.error('FBXDependencies', 'Error fetching FBX dependencies', err)
	}

	return { found: dependencies, missing: missingFiles }
}

/**
 * Load model with all dependencies
 * Main entry point for multi-file loading
 *
 * @param {number} fileId - File ID of the main model file
 * @param {string} filename - Filename (e.g., "model.obj")
 * @param {string} extension - File extension (e.g., "obj")
 * @param {string} dirPath - Directory path (e.g., "/models")
 * @return {Promise<object>} - Object with { mainFile: File, dependencies: File[] }
 */
export async function loadModelWithDependencies(fileId, filename, extension, dirPath) {
	logger.info('MultiFileHelpers', ' Loading model with dependencies:', {
		fileId,
		filename,
		extension,
		dirPath,
	})

	// Fetch main file
	const response = await fetch(`/apps/threedviewer/api/file/${fileId}`)

	if (!response.ok) {
		// Try to extract error message from response
		let errorMessage = `Failed to fetch model: ${response.status} ${response.statusText}`
		try {
			const errorData = await response.json()
			if (errorData?.error || errorData?.message) {
				errorMessage = errorData.error || errorData.message
			}
		} catch (e) {
			// Response is not JSON, use status text
		}

		logger.error('MultiFileHelpers', 'Failed to fetch main model file', {
			fileId,
			filename,
			status: response.status,
			statusText: response.statusText,
			errorMessage,
		})

		// Provide more helpful error messages based on status code
		if (response.status === 404) {
			throw new Error(
				`File not found (ID: ${fileId}, name: ${filename}). `
				+ 'The file may have been deleted, moved, or you may not have access to it.',
			)
		} else if (response.status === 403) {
			throw new Error(
				`Access denied to file (ID: ${fileId}, name: ${filename}). `
				+ 'You may not have permission to access this file.',
			)
		} else {
			throw new Error(errorMessage)
		}
	}

	const arrayBuffer = await response.arrayBuffer()

	// Determine MIME type based on extension
	const getMimeType = (ext) => {
		const mimeTypes = {
			obj: 'model/obj',
			gltf: 'model/gltf+json',
			glb: 'model/gltf-binary',
			mtl: 'model/mtl',
			stl: 'model/stl',
			ply: 'model/ply',
			fbx: 'model/x.fbx',
			'3mf': 'model/3mf',
			'3ds': 'model/3ds',
			dae: 'model/dae',
			x3d: 'model/x3d',
			wrl: 'model/vrml',
			vrml: 'model/vrml',
		}
		return mimeTypes[ext] || 'application/octet-stream'
	}

	const blob = new Blob([arrayBuffer], { type: getMimeType(extension) })
	const mainFile = new File([blob], filename, { type: getMimeType(extension) })

	logger.info('MultiFileHelpers', ' Created main file:', {
		name: mainFile.name,
		size: mainFile.size,
		type: mainFile.type,
		lastModified: mainFile.lastModified,
	})

	// Fetch dependencies based on format
	let dependencyResult = { found: [], missing: [] }

	if (extension === 'obj') {
		const objText = await mainFile.text()
		dependencyResult = await fetchObjDependencies(objText, filename, fileId, dirPath)
	} else if (extension === 'gltf') {
		const gltfText = await mainFile.text()
		dependencyResult = await fetchGltfDependencies(gltfText, filename, fileId, dirPath)
	} else if (extension === 'fbx') {
		dependencyResult = await fetchFbxDependencies(filename, fileId, dirPath)
	} else if (extension === '3ds' || extension === 'dae') {
		// 3DS and DAE files can reference external textures
		// Fetch all texture files in the directory (similar to FBX)
		dependencyResult = await fetchFbxDependencies(filename, fileId, dirPath)
	}
	// GLB, STL, PLY, etc. are single-file formats - no dependencies

	const dependencies = dependencyResult.found || []
	const missingFiles = dependencyResult.missing || []

	logger.info('MultiFileHelpers', ' Loaded dependencies:', dependencies.length)
	if (missingFiles.length > 0) {
		logger.warn('MultiFileHelpers', ' Missing files:', missingFiles)
	}

	const result = {
		mainFile,
		dependencies,
		missingFiles,
		allFiles: [mainFile, ...dependencies],
	}

	logger.info('MultiFileHelpers', ' Returning result:', {
		mainFile: { name: result.mainFile.name, size: result.mainFile.size, type: result.mainFile.type },
		dependencies: result.dependencies.map(f => ({ name: f.name, size: f.size, type: f.type })),
		missingFiles: result.missingFiles,
		allFilesCount: result.allFiles.length,
	})

	return result
}
