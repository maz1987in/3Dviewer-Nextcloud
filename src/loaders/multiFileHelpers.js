/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * 
 * Multi-file model loading helpers
 * Inspired by WARP-LAB/files_3dmodelviewer approach
 */

import { logger } from '../utils/logger.js'
import { findFileByName } from '../utils/fileHelpers.js'
import { getFulfilledValues } from '../utils/arrayHelpers.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { 
	getCached, 
	setCached, 
	generateCacheKey, 
	isCacheAvailable 
} from '../utils/dependencyCache.js'

/**
 * Fetch a file from URL and return as File object
 * @param {string} url - URL to fetch from
 * @param {string} name - Filename for the File object
 * @param {string} defaultType - Default MIME type if not detected
 * @param {object} options - Additional options
 * @param {boolean} options.useCache - Whether to use cache (default: true)
 * @param {number} options.fileId - File ID for caching
 * @returns {Promise<File>}
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
 * @returns {Promise<number|null>} File ID or null if not found
 */
export async function getFileIdByPath(filePath) {
	try {
		// Validate input
		if (!filePath || filePath.trim().length === 0) {
			return null
		}
		
		// Get the directory path and filename
		const pathParts = filePath.split('/')
		const filename = pathParts.pop()
		const dirPath = pathParts.join('/') || '/'
		
		// Validate filename after splitting
		if (!filename || filename.trim().length === 0) {
			return null
		}
		
		// List files in the directory
		const listUrl = `/apps/threedviewer/api/files/list?path=${encodeURIComponent(dirPath)}`
		const response = await fetch(listUrl)
		
		if (!response.ok) {
			logger.warn('MultiFileHelpers', ' Failed to list files:', response.status, response.statusText)
			return null
		}
		
	const files = await response.json()
	
	logger.info('MultiFileHelpers', ' Files in directory:', files.map(f => f.name))
	logger.info('MultiFileHelpers', ' Looking for file:', filename)
	
	// Find the file by name (case-insensitive to handle Windows/Linux differences)
	let file = files.find(f => f.name.toLowerCase() === filename.toLowerCase())
	
	// If not found in root, search in subdirectories (like "Texture", "textures", "images", etc.)
	if (!file) {
		// Filter for directories - check isFolder field or other directory indicators
		const subdirs = files.filter(f => f.isFolder === true || f.type === 'directory' || f.type === 'dir' || f.mime === 'httpd/unix-directory')
		logger.info('MultiFileHelpers', ' File not in root, checking subdirectories:', subdirs.map(d => d.name))
		
		for (const subdir of subdirs) {
			try {
				const subdirPath = `${dirPath}/${subdir.name}`
				const subdirListUrl = `/apps/threedviewer/api/files/list?path=${encodeURIComponent(subdirPath)}`
				const subdirResponse = await fetch(subdirListUrl)
				
				if (subdirResponse.ok) {
					const subdirFiles = await subdirResponse.json()
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
	
	if (!file) {
		logger.warn('MultiFileHelpers', ' File not found:', filename, 'Available files:', files.map(f => f.name))
	}
	
	return file ? file.id : null	} catch (error) {
		logger.warn('MultiFileHelpers', ' Error getting file ID for path:', filePath, error)
		return null
	}
}

/**
 * Parse OBJ file content to find referenced MTL files
 * @param {string} objContent - Text content of OBJ file
 * @returns {string[]} - Array of MTL filenames
 */
export function parseObjMaterialFiles(objContent) {
	// Match lines like: mtllib material.mtl
	const matches = [...objContent.matchAll(/^\s*mtllib[^\S\r\n]+(.*?)$/gm)]
	return [...new Set(matches.map(capture => capture[1].trim()))]
}

/**
 * Parse MTL file content to find referenced texture files
 * @param {string} mtlContent - Text content of MTL file
 * @returns {string[]} - Array of texture filenames
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
 * @returns {object} - Object with buffers and images arrays
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
 * @returns {Promise<object>} - Object with { found: File[], missing: string[] }
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
 * @returns {Promise<object>} - Object with { found: File[], missing: string[] }
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
 * @returns {Promise<object>} - Object with { found: File[], missing: string[] }
 */
async function fetchFbxDependencies(baseFilename, fileId, dirPath) {
	const dependencies = []
	const missingFiles = [] // FBX speculatively loads all textures, so missing is usually empty
	
	try {
		// Common texture extensions used by FBX
		const textureExtensions = ['png', 'jpg', 'jpeg', 'tga', 'tif', 'tiff', 'bmp']
		
		// List all files in the directory
		const listUrl = `/apps/threedviewer/api/files/list?path=${encodeURIComponent(dirPath)}`
		const response = await fetch(listUrl)
		
		if (!response.ok) {
			logger.warn('FBXDependencies', 'Failed to list directory files', { dirPath, status: response.status })
			return dependencies
		}
		
		const allFiles = await response.json()
		
		// Filter for image files based on extension
		const imageFiles = allFiles.filter(file => {
			const ext = file.name.split('.').pop().toLowerCase()
			return textureExtensions.includes(ext)
		})
		
		logger.info('FBXDependencies', 'Found potential texture files', {
			count: imageFiles.length,
			files: imageFiles.map(f => f.name),
		})
		
		// Fetch all image files
		const texturePromises = imageFiles.map(async (file) => {
			try {
				const url = `/apps/threedviewer/api/file/${file.id}`
				const response = await fetch(url)
				if (response.ok) {
					const arrayBuffer = await response.arrayBuffer()
					const ext = file.name.split('.').pop().toLowerCase()
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
		dependencies.push(...getFulfilledValues(results))
		
		logger.info('FBXDependencies', 'Found textures in directory', {
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
 * @returns {Promise<object>} - Object with { mainFile: File, dependencies: File[] }
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
		throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`)
	}
	
	const arrayBuffer = await response.arrayBuffer()
	
	// Determine MIME type based on extension
	const getMimeType = (ext) => {
		const mimeTypes = {
			'obj': 'model/obj',
			'gltf': 'model/gltf+json',
			'glb': 'model/gltf-binary',
			'mtl': 'model/mtl',
			'stl': 'model/stl',
			'ply': 'model/ply',
			'fbx': 'model/x.fbx',
			'3mf': 'model/3mf',
			'3ds': 'model/3ds',
			'dae': 'model/dae',
			'x3d': 'model/x3d',
			'wrl': 'model/vrml',
			'vrml': 'model/vrml'
		}
		return mimeTypes[ext] || 'application/octet-stream'
	}
	
	const blob = new Blob([arrayBuffer], { type: getMimeType(extension) })
	const mainFile = new File([blob], filename, { type: getMimeType(extension) })
	
	logger.info('MultiFileHelpers', ' Created main file:', {
		name: mainFile.name,
		size: mainFile.size,
		type: mainFile.type,
		lastModified: mainFile.lastModified
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
		allFilesCount: result.allFiles.length
	})
	
	return result
}
