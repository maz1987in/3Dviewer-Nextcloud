/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * 
 * Multi-file model loading helpers
 * Inspired by WARP-LAB/files_3dmodelviewer approach
 */

/**
 * Fetch a file from URL and return as File object
 * @param {string} url - URL to fetch from
 * @param {string} name - Filename for the File object
 * @param {string} defaultType - Default MIME type if not detected
 * @returns {Promise<File>}
 */
export async function fetchFileFromUrl(url, name, defaultType = 'application/octet-stream') {
	const response = await fetch(url)
	
	if (!response.ok) {
		throw new Error(`${url} ${response.status} ${response.statusText}`)
	}
	
	const data = await response.blob()
	return new File([data], name, {
		type: data.type || defaultType,
	})
}

/**
 * Gets file ID by path using the file listing API
 * @param {string} filePath - Path to the file
 * @returns {Promise<number|null>} File ID or null if not found
 */
export async function getFileIdByPath(filePath) {
	try {
		// Get the directory path and filename
		const pathParts = filePath.split('/')
		const filename = pathParts.pop()
		const dirPath = pathParts.join('/') || '/'
		
		// List files in the directory
		const listUrl = `/apps/threedviewer/api/files/list?path=${encodeURIComponent(dirPath)}`
		const response = await fetch(listUrl)
		
		if (!response.ok) {
			console.warn('[MultiFileHelpers] Failed to list files:', response.status, response.statusText)
			return null
		}
		
	const files = await response.json()
	
	console.info('[MultiFileHelpers] Files in directory:', files.map(f => f.name))
	console.info('[MultiFileHelpers] Looking for file:', filename)
	
	// Find the file by name (case-insensitive to handle Windows/Linux differences)
	const file = files.find(f => f.name.toLowerCase() === filename.toLowerCase())
	
	if (!file) {
		console.warn('[MultiFileHelpers] File not found:', filename, 'Available files:', files.map(f => f.name))
	}
	
	return file ? file.id : null	} catch (error) {
		console.warn('[MultiFileHelpers] Error getting file ID for path:', filePath, error)
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
	})
	
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
 * @returns {Promise<Array<File>>} - Array of File objects (MTL + textures)
 */
export async function fetchObjDependencies(objContent, baseFilename, fileId, dirPath) {
	const dependencies = []
	
	// Parse MTL references
	const mtlFiles = parseObjMaterialFiles(objContent)
	
	if (mtlFiles.length === 0) {
		console.info('[MultiFileHelpers] No MTL files referenced in OBJ')
		return dependencies
	}
	
	console.info('[MultiFileHelpers] Found MTL files:', mtlFiles)
	
	// Fetch all MTL files
	const mtlPromises = mtlFiles.map(async (mtlFilename) => {
		try {
			// Construct relative path
			const mtlPath = dirPath ? `${dirPath}/${mtlFilename}` : mtlFilename
			
			// Use the file listing API to get file ID, then fetch by ID
			const fileId = await getFileIdByPath(mtlPath)
			
			if (fileId) {
				const url = `/apps/threedviewer/api/file/${fileId}`
				const file = await fetchFileFromUrl(url, mtlFilename, 'model/mtl')
				console.info('[MultiFileHelpers] Fetched MTL:', mtlFilename)
				
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
							const texFile = await fetchFileFromUrl(texUrl, texFilename)
							console.info('[MultiFileHelpers] Fetched texture:', texFilename)
							return texFile
						} else {
							console.warn('[MultiFileHelpers] Could not find file ID for texture:', texFilename)
							return null
						}
					} catch (err) {
						console.warn('[MultiFileHelpers] Failed to fetch texture:', texFilename, err)
						return null
					}
				})
			
				const textures = (await Promise.allSettled(texturePromises))
					.filter(r => r.status === 'fulfilled' && r.value)
					.map(r => r.value)
				
				return [file, ...textures]
			} else {
				console.warn('[MultiFileHelpers] Could not find file ID for MTL:', mtlFilename)
				return []
			}
			
		} catch (err) {
			console.warn('[MultiFileHelpers] Failed to fetch MTL:', mtlFilename, err)
			return []
		}
	})
	
	const results = await Promise.allSettled(mtlPromises)
	const allFiles = results
		.filter(r => r.status === 'fulfilled')
		.flatMap(r => r.value)
	
	return allFiles
}

/**
 * Fetch GLTF dependencies (binary buffers and textures)
 * Uses our secure API endpoint
 * 
 * @param {string} gltfContent - Text content of GLTF file
 * @param {string} baseFilename - Base filename of the GLTF (e.g., "model.gltf")
 * @param {number} fileId - File ID of the main GLTF file
 * @param {string} dirPath - Directory path
 * @returns {Promise<Array<File>>} - Array of File objects (bins + textures)
 */
export async function fetchGltfDependencies(gltfContent, baseFilename, fileId, dirPath) {
	const dependencies = []
	
	try {
		const gltfJson = JSON.parse(gltfContent)
		const deps = parseGltfDependencies(gltfJson)
		
		console.info('[MultiFileHelpers] GLTF dependencies:', deps)
		
		// Fetch buffers using file listing approach
		const bufferPromises = deps.buffers.map(async (bufferUri) => {
			try {
				// Use the file listing API to get file ID, then fetch by ID
				const bufferPath = dirPath ? `${dirPath}/${bufferUri}` : bufferUri
				const fileId = await getFileIdByPath(bufferPath)
				
				if (fileId) {
					const url = `/apps/threedviewer/api/file/${fileId}`
					const file = await fetchFileFromUrl(url, bufferUri, 'application/octet-stream')
					console.info('[MultiFileHelpers] Fetched buffer:', bufferUri)
					return file
				} else {
					console.warn('[MultiFileHelpers] Could not find file ID for buffer:', bufferUri)
					return null
				}
			} catch (err) {
				console.warn('[MultiFileHelpers] Failed to fetch buffer:', bufferUri, err)
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
					const file = await fetchFileFromUrl(url, imageUri)
					console.info('[MultiFileHelpers] Fetched image:', imageUri)
					return file
				} else {
					console.warn('[MultiFileHelpers] Could not find file ID for image:', imageUri)
					return null
				}
			} catch (err) {
				console.warn('[MultiFileHelpers] Failed to fetch image:', imageUri, err)
				return null
			}
		})
		
		const results = await Promise.allSettled([...bufferPromises, ...imagePromises])
		dependencies.push(...results
			.filter(r => r.status === 'fulfilled' && r.value)
			.map(r => r.value))
			
	} catch (err) {
		console.error('[MultiFileHelpers] Error parsing GLTF:', err)
	}
	
	return dependencies
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
	console.info('[MultiFileHelpers] Loading model with dependencies:', {
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
	
	console.info('[MultiFileHelpers] Created main file:', {
		name: mainFile.name,
		size: mainFile.size,
		type: mainFile.type,
		lastModified: mainFile.lastModified
	})
	
	// Fetch dependencies based on format
	let dependencies = []
	
	if (extension === 'obj') {
		const objText = await mainFile.text()
		dependencies = await fetchObjDependencies(objText, filename, fileId, dirPath)
	} else if (extension === 'gltf') {
		const gltfText = await mainFile.text()
		dependencies = await fetchGltfDependencies(gltfText, filename, fileId, dirPath)
	}
	// GLB, STL, PLY, etc. are single-file formats - no dependencies
	
	console.info('[MultiFileHelpers] Loaded dependencies:', dependencies.length)
	
	const result = {
		mainFile,
		dependencies,
		allFiles: [mainFile, ...dependencies],
	}
	
	console.info('[MultiFileHelpers] Returning result:', {
		mainFile: { name: result.mainFile.name, size: result.mainFile.size, type: result.mainFile.type },
		dependencies: result.dependencies.map(f => ({ name: f.name, size: f.size, type: f.type })),
		allFilesCount: result.allFiles.length
	})
	
	return result
}
