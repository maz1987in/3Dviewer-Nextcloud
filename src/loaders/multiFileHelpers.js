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
	return [...new Set(matches.map(capture => capture[1].trim()))]
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
			
			// Fetch via our API (would need to implement file-by-path endpoint)
			// For now, construct URL relative to OBJ location
			const url = `/apps/threedviewer/api/file/by-path?path=${encodeURIComponent(mtlPath)}`
			
			const file = await fetchFileFromUrl(url, mtlFilename, 'model/mtl')
			console.info('[MultiFileHelpers] Fetched MTL:', mtlFilename)
			
			// Parse textures from MTL
			const mtlText = await file.text()
			const textureFiles = parseMtlTextureFiles(mtlText)
			
			// Fetch textures
			const texturePromises = textureFiles.map(async (texFilename) => {
				try {
					const texPath = dirPath ? `${dirPath}/${texFilename}` : texFilename
					const texUrl = `/apps/threedviewer/api/file/by-path?path=${encodeURIComponent(texPath)}`
					
					const texFile = await fetchFileFromUrl(texUrl, texFilename)
					console.info('[MultiFileHelpers] Fetched texture:', texFilename)
					return texFile
				} catch (err) {
					console.warn('[MultiFileHelpers] Failed to fetch texture:', texFilename, err)
					return null
				}
			})
			
			const textures = (await Promise.allSettled(texturePromises))
				.filter(r => r.status === 'fulfilled' && r.value)
				.map(r => r.value)
			
			return [file, ...textures]
			
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
		
		// Fetch buffers
		const bufferPromises = deps.buffers.map(async (bufferUri) => {
			try {
				const bufferPath = dirPath ? `${dirPath}/${bufferUri}` : bufferUri
				const url = `/apps/threedviewer/api/file/by-path?path=${encodeURIComponent(bufferPath)}`
				
				const file = await fetchFileFromUrl(url, bufferUri, 'application/octet-stream')
				console.info('[MultiFileHelpers] Fetched buffer:', bufferUri)
				return file
			} catch (err) {
				console.warn('[MultiFileHelpers] Failed to fetch buffer:', bufferUri, err)
				return null
			}
		})
		
		// Fetch images
		const imagePromises = deps.images.map(async (imageUri) => {
			try {
				const imagePath = dirPath ? `${dirPath}/${imageUri}` : imageUri
				const url = `/apps/threedviewer/api/file/by-path?path=${encodeURIComponent(imagePath)}`
				
				const file = await fetchFileFromUrl(url, imageUri)
				console.info('[MultiFileHelpers] Fetched image:', imageUri)
				return file
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
	const blob = new Blob([arrayBuffer])
	const mainFile = new File([blob], filename)
	
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
	
	return {
		mainFile,
		dependencies,
		allFiles: [mainFile, ...dependencies],
	}
}
