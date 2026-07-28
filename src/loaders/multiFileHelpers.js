/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Multi-file model loading helpers
 * Inspired by WARP-LAB/files_3dmodelviewer approach
 */

import { generateUrl } from '@nextcloud/router'
import { buildFileUrl, buildPublicDepUrl, isPublicShare } from '../composables/usePublicShare.js'
import { parse3dsDependencies, parseFbxDependencies } from './binaryModelDependencies.js'
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
 * Gets file ID by path using the file listing API.
 *
 * Returns `{ id, subdir }` where `subdir` is the subdirectory the file was
 * found in (relative to the requested directory), or `null` if found at the
 * root. Returns `null` instead of an object if the file is not found at all.
 *
 * @param {string} filePath - Path to the file
 * @return {Promise<{id: number, subdir: string|null}|null>}
 */
export async function getFileIdByPath(filePath) {
	let filename = ''
	let normalizedDirPath = ''

	// The file-listing API requires a session. On a public share every call here
	// would 401, so short-circuit: callers fall back to the token-keyed public
	// routes where one exists (the OBJ's .mtl), and skip the dependency otherwise.
	if (isPublicShare()) {
		return null
	}

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
				const findUrl = generateUrl('/apps/threedviewer/api/files/find') + `?path=${encodeURIComponent(fullPath)}`
				const findResponse = await fetch(findUrl)

				if (findResponse.ok) {
					const fileData = await findResponse.json()
					if (fileData && fileData.id) {
						logger.info('MultiFileHelpers', ' Found file by path:', fullPath, 'id:', fileData.id)
						return { id: fileData.id, subdir: null }
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
			const listUrl = generateUrl('/apps/threedviewer/api/files/list') + `?${params.toString()}`
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

		// If not found in root, search in subdirectories (like "Texture", "textures", "images", etc.)
		// `foundInSubdir` tracks which subdirectory the file was discovered in
		// so callers can preserve the original directory structure (e.g., for ZIP exports).
		let foundInSubdir = null
		if (!file) {
			const folderNames = Array.isArray(folders) ? folders.map(d => d?.name || d?.path || d) : []
			logger.warn('MultiFileHelpers', ' File not in root, checking subdirectories:', folderNames)

			// First, search in folders returned by the API
			for (const subdir of folders) {
				try {
					const subdirPath = subdir.path || (normalizedDirPath ? `${normalizedDirPath}/${subdir.name}` : subdir.name)
					const subdirListUrl = generateUrl('/apps/threedviewer/api/files/list') + `?folder=${encodeURIComponent(subdirPath)}`
					const subdirResponse = await fetch(subdirListUrl)

					if (subdirResponse.ok) {
						const subdirData = await subdirResponse.json()
						const subdirFiles = subdirData?.files || []
						file = subdirFiles.find(f => f.name.toLowerCase() === filename.toLowerCase())

						if (file) {
							foundInSubdir = subdir.name
							logger.info('MultiFileHelpers', ' Found file in subdirectory:', subdir.name, '/', filename)
							break
						}
					}
				} catch (subdirError) {
					logger.warn('MultiFileHelpers', ' Error searching subdirectory:', subdir.name, subdirError)
				}
			}
		}

		// If still not found, try the conventional texture directory names.
		if (!file) {
			const found = await findInCommonTextureDirs(filename, normalizedDirPath, listingSucceeded ? folders : null)
			if (found) {
				return found
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

		return file ? { id: file.id, subdir: foundInSubdir } : null
	} catch (error) {
		logger.warn('MultiFileHelpers', ' Error getting file ID for path:', filePath, error)

		// The listing has its own error handling, so reaching here means something
		// unexpected went wrong. The conventional directories are still worth one pass:
		// with no listing to trust, every candidate is tried rather than only the
		// folders known to exist.
		return await findInCommonTextureDirs(filename, normalizedDirPath, null)
	}
}

/**
 * Names exporters conventionally use for a texture directory the model does not mention.
 *
 * Both cases are listed because the lookup is by exact path when the listing is
 * unavailable; where a listing exists, matching against it is case-insensitive anyway.
 */
const COMMON_TEXTURE_DIRS = [
	'textures', 'texture', 'Texture', 'TEXTURE', 'TEXTURES',
	'images', 'image', 'Image', 'IMAGE',
	'tex', 'Tex', 'TEX',
	'maps', 'map', 'Map', 'MAP',
]

/**
 * Look for a file in the texture directories a model is likely to keep it in.
 *
 * A model often names `wood.png` for a file that lives in `textures/wood.png`, and the
 * declaration gives no way to know that. This is the guess of last resort — bounded to
 * the directories that actually exist wherever the caller could find that out.
 *
 * @param {string} filename - basename to look for
 * @param {string} dirPath - directory holding the model, without a leading slash
 * @param {object[]|null} folders - subdirectories known to exist, or null if unknown
 * @return {Promise<{id: number, subdir: string}|null>} the file, or null
 */
async function findInCommonTextureDirs(filename, dirPath, folders) {
	let candidates = COMMON_TEXTURE_DIRS

	// Knowing the folder listing turns sixteen speculative requests into only the ones
	// that can succeed — and into none at all when the model has no subdirectories.
	if (folders !== null) {
		const existing = new Set(folders.map(folder => (folder?.name || '').toLowerCase()))
		candidates = candidates.filter(dir => existing.has(dir.toLowerCase()))
	}

	if (candidates.length === 0) {
		return null
	}

	logger.debug('MultiFileHelpers', 'Trying conventional texture directories', { filename, dirPath, candidates })

	for (const textureDir of candidates) {
		const textureDirPath = dirPath ? `${dirPath}/${textureDir}` : textureDir
		try {
			const findUrl = generateUrl('/apps/threedviewer/api/files/find')
				+ `?path=${encodeURIComponent(`${textureDirPath}/${filename}`)}`
			const response = await fetch(findUrl)

			if (response.ok) {
				const fileData = await response.json()
				if (fileData?.id) {
					logger.info('MultiFileHelpers', 'Found file in a texture directory', { textureDir, filename, id: fileData.id })
					return { id: fileData.id, subdir: textureDir }
				}
			}
		} catch (findError) {
			// One unreachable candidate should not stop the others.
			logger.debug('MultiFileHelpers', 'Texture directory lookup failed', { textureDirPath, error: findError })
		}
	}

	logger.debug('MultiFileHelpers', 'Not in any conventional texture directory', { filename })

	return null
}

/**
 * Where to fetch a companion file the model names, in whichever context we are in.
 *
 * Two different questions behind one call. Signed in, a name has to become a file id
 * first, through the file-listing API. On a public share that API is unreachable, so the
 * name *is* the handle: the server resolves it against the model's own declarations,
 * which is why the model's id has to travel with it.
 *
 * @param {number} modelFileId - id of the model that declared the dependency
 * @param {string} refPath - dependency path as written in the model, subdirectory and all
 * @param {string} dirPath - directory holding the model (authenticated lookups only)
 * @return {Promise<{url: string, cacheId: number|string, subdir: string|null}|null>}
 *         null when the dependency cannot be located at all
 */
async function locateDependency(modelFileId, refPath, dirPath) {
	// The public route takes a plain filename; the server remembers which subdirectory
	// the model pointed at.
	const name = refPath.replace(/\\/g, '/').split('/').pop()
	const publicUrl = buildPublicDepUrl(modelFileId, name)
	if (publicUrl) {
		// Cache under the model's id: dependency ids are unknown here, and the key
		// already includes the filename.
		return { url: publicUrl, cacheId: modelFileId, subdir: null }
	}

	const lookup = await getFileIdByPath(dirPath ? `${dirPath}/${refPath}` : refPath)
	if (!lookup) {
		return null
	}

	return { url: buildFileUrl(lookup.id), cacheId: lookup.id, subdir: lookup.subdir }
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
	// Match lines like: map_Kd texture.jpg, map_Ka ambient.png, bump normal.jpg, refl env.jpg
	const matches = [...mtlContent.matchAll(/^\s*(?:map_[A-Za-z0-9_]+|bump|refl)[^\S\r\n]+(.*?)$/gm)]

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
 * Texture paths a COLLADA or X3D document declares, in document order.
 *
 * Matched with patterns rather than parsed with DOMParser: only the paths are needed,
 * and the document comes from whoever uploaded it. The server applies the same rules in
 * ModelDependencyResolver, which is what actually gates the public route — this is the
 * client half, so it knows which names to ask for.
 *
 * @param {string} content - Raw document text
 * @param {string} extension - "dae" or "x3d"
 * @return {string[]} Declared relative paths, deduplicated, embedded and remote dropped
 */
export function parseXmlModelDependencies(content, extension) {
	if (typeof content !== 'string' || content === '') {
		return []
	}

	const found = []
	const push = (raw) => {
		const value = String(raw).trim()
		// A scheme means it is not a file beside the model: data:, http:, https:, file:.
		if (value === '' || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('/')) {
			return
		}
		let decoded = value
		try {
			decoded = decodeURIComponent(value)
		} catch {
			// Leave a malformed escape sequence as written.
		}
		if (!found.includes(decoded)) {
			found.push(decoded)
		}
	}

	if (extension === 'dae') {
		// COLLADA 1.4 writes <init_from>path</init_from>; 1.5 wraps it in <ref>.
		const pattern = /<init_from\b[^>]*>\s*(?:<ref\b[^>]*>\s*)?([^<]+?)\s*(?:<\/ref>\s*)?<\/init_from>/gi
		let match
		while ((match = pattern.exec(content)) !== null) {
			push(match[1])
		}
	} else if (extension === 'x3d') {
		// url is an MFString: whitespace-separated, quoted alternatives.
		const pattern = /\burl\s*=\s*(["'])([\s\S]*?)\1/gi
		let match
		while ((match = pattern.exec(content)) !== null) {
			for (const entry of match[2].trim().split(/\s+/)) {
				push(entry.replace(/^["']|["']$/g, ''))
			}
		}
	}

	return found
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
			const mtlLocation = await locateDependency(fileId, mtlFilename, dirPath)

			if (!mtlLocation) {
				logger.warn('MultiFileHelpers', ' Could not find file ID for MTL:', mtlFilename)
				missingFiles.push(mtlFilename)
				return []
			}

			const file = await fetchFileFromUrl(mtlLocation.url, mtlFilename, 'model/mtl', { fileId: mtlLocation.cacheId })
			if (mtlLocation.subdir) {
				file._relativePath = `${mtlLocation.subdir}/${mtlFilename}`
			}
			logger.info('MultiFileHelpers', ' Fetched MTL:', mtlFilename)

			// Textures are named by the material, not by the OBJ, so this chain only
			// becomes visible once the MTL itself is in hand.
			const textureFiles = parseMtlTextureFiles(await file.text())

			const texturePromises = textureFiles.map(async (texFilename) => {
				try {
					const texLocation = await locateDependency(fileId, texFilename, dirPath)

					if (!texLocation) {
						logger.warn('MultiFileHelpers', ' Could not find file ID for texture:', texFilename)
						missingFiles.push(texFilename)
						return null
					}

					const texFile = await fetchFileFromUrl(texLocation.url, texFilename, 'application/octet-stream', { fileId: texLocation.cacheId })
					if (texLocation.subdir) {
						texFile._relativePath = `${texLocation.subdir}/${texFilename}`
					}
					logger.info('MultiFileHelpers', ' Fetched texture:', texFilename, texLocation.subdir ? `(in ${texLocation.subdir}/)` : '')
					return texFile
				} catch (err) {
					// A texture the share will not serve, or one that is simply gone:
					// either way the geometry still renders, just untextured.
					logger.warn('MultiFileHelpers', ' Failed to fetch texture:', texFilename, err)
					missingFiles.push(texFilename)
					return null
				}
			})

			const textures = getFulfilledValues(await Promise.allSettled(texturePromises))

			return [file, ...textures]
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
 * Fetch the textures a COLLADA or X3D document declares.
 *
 * Mirrors fetchGltfDependencies: the document names its files, so they resolve without
 * the folder listing that fetchFbxDependencies relies on — and that listing needs a
 * session, which is why these formats render untextured on a public share.
 *
 * @param {string} content - Raw document text
 * @param {string} extension - "dae" or "x3d"
 * @param {number} fileId - File id of the model
 * @param {string} dirPath - Directory holding the model
 * @return {Promise<{found: File[], missing: string[]}>} Fetched dependencies
 */
export async function fetchXmlDependencies(content, extension, fileId, dirPath) {
	return fetchDeclaredDependencies(parseXmlModelDependencies(content, extension), extension, fileId, dirPath)
}

/**
 * Fetch the textures an FBX or 3DS names in its binary structures.
 *
 * These were the last two formats resolving their textures by listing the model's folder
 * and taking every image in it, which needs a session — so they rendered untextured on a
 * public share. Parsed, they resolve by declaration like every other format, and the
 * request set narrows to what the model actually points at.
 *
 * @param {ArrayBuffer|Uint8Array} buffer - Raw bytes of the model
 * @param {string} extension - "fbx" or "3ds"
 * @param {number} fileId - File id of the model
 * @param {string} dirPath - Directory holding the model
 * @return {Promise<{found: File[], missing: string[]}>} Fetched dependencies
 */
export async function fetchBinaryDependencies(buffer, extension, fileId, dirPath) {
	const declared = extension === 'fbx'
		? parseFbxDependencies(buffer)
		: parse3dsDependencies(buffer)

	return fetchDeclaredDependencies(declared, extension, fileId, dirPath)
}

/**
 * Fetch every companion file a model declared, by the name it declared.
 *
 * Shared by the formats that name their dependencies — XML documents and the binary
 * ones. Signed in, `locateDependency` turns each name into a file id; on a share it
 * becomes a request to the token-keyed route, where the model's own declarations are
 * what authorise it.
 *
 * @param {string[]} declared - Relative paths as the model wrote them
 * @param {string} label - Format name, for logging
 * @param {number} fileId - File id of the model
 * @param {string} dirPath - Directory holding the model
 * @return {Promise<{found: File[], missing: string[]}>} Fetched dependencies
 */
async function fetchDeclaredDependencies(declared, label, fileId, dirPath) {
	const missingFiles = []

	logger.info('MultiFileHelpers', ` ${label.toUpperCase()} declares ${declared.length} texture(s)`, declared)

	const results = await Promise.allSettled(declared.map(async (ref) => {
		try {
			const location = await locateDependency(fileId, ref, dirPath)
			if (!location) {
				// An X3D url lists alternatives, and an exporter can name a texture that
				// was never shipped, so a miss is reported rather than thrown.
				missingFiles.push(ref)
				return null
			}
			// The loader matches these against the paths written in the model, so the
			// declared name is kept rather than just the basename.
			const name = ref.split('/').pop()
			const file = await fetchFileFromUrl(location.url, name, 'application/octet-stream', { fileId: location.cacheId })
			if (ref.includes('/')) {
				file._relativePath = ref
			} else if (location.subdir) {
				file._relativePath = `${location.subdir}/${ref}`
			}
			return file
		} catch (err) {
			logger.warn('MultiFileHelpers', ` Failed to fetch ${label} texture:`, ref, err)
			missingFiles.push(ref)
			return null
		}
	}))

	return { found: getFulfilledValues(results), missing: missingFiles }
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

		// Buffers and images resolve identically — both are URIs the glTF declares,
		// relative to the document.
		const fetchDeclared = async (uri, label) => {
			try {
				const location = await locateDependency(fileId, uri, dirPath)

				if (!location) {
					logger.warn('MultiFileHelpers', ` Could not find file ID for ${label}:`, uri)
					missingFiles.push(uri)
					return null
				}

				// The loader matches these against the URIs in the document, so the file
				// keeps the declared name, not just its basename.
				const name = uri.split('/').pop()
				const file = await fetchFileFromUrl(location.url, name, 'application/octet-stream', { fileId: location.cacheId })
				// GLTF URIs already encode the relative path, so use that directly
				if (uri.includes('/')) {
					file._relativePath = uri
				} else if (location.subdir) {
					file._relativePath = `${location.subdir}/${uri}`
				}
				logger.info('MultiFileHelpers', ` Fetched ${label}:`, uri)
				return file
			} catch (err) {
				logger.warn('MultiFileHelpers', ` Failed to fetch ${label}:`, uri, err)
				missingFiles.push(uri)
				return null
			}
		}

		const results = await Promise.allSettled([
			...deps.buffers.map(uri => fetchDeclared(uri, 'buffer')),
			...deps.images.map(uri => fetchDeclared(uri, 'image')),
		])
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

	// Strip leading slash from the model's root directory so we can compute
	// each texture's path relative to it (used for preserving structure in ZIP).
	const rootDir = (dirPath || '').replace(/^\//, '')

	const collectTexturesFromFolder = async (folderPath) => {
		const normalizedPath = folderPath ? folderPath.replace(/^\//, '') : ''
		const visitKey = normalizedPath || '/'
		if (visited.has(visitKey)) {
			return []
		}
		visited.add(visitKey)

		// Compute the subdirectory relative to the model's root directory.
		// e.g., if rootDir is "3D files/Eyeball" and normalizedPath is
		// "3D files/Eyeball/textures", relativeSubdir is "textures".
		let relativeSubdir = ''
		if (rootDir && normalizedPath.startsWith(rootDir + '/')) {
			relativeSubdir = normalizedPath.slice(rootDir.length + 1)
		} else if (!rootDir) {
			relativeSubdir = normalizedPath
		}

		const params = new URLSearchParams()
		if (normalizedPath) {
			params.set('folder', normalizedPath)
		}
		params.set('includeDependencies', '1')

		const listUrl = generateUrl('/apps/threedviewer/api/files/list') + `?${params.toString()}`
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
				const url = generateUrl(`/apps/threedviewer/api/file/${file.id}`)
				const texResponse = await fetch(url)
				if (texResponse.ok) {
					const arrayBuffer = await texResponse.arrayBuffer()
					const ext = (file.name?.split('.').pop() || '').toLowerCase()
					const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`
					const blob = new Blob([arrayBuffer], { type: mimeType })
					const fileObj = new File([blob], file.name, { type: mimeType })
					// Attach relative path so ZIP export can preserve subdirectory layout.
					// This property is invisible to Three.js loaders that key off `file.name`.
					if (relativeSubdir) {
						fileObj._relativePath = `${relativeSubdir}/${file.name}`
					}
					return fileObj
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
	// buildFileUrl resolves to the token-keyed public route on a share page.
	const response = await fetch(buildFileUrl(fileId))

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
	// Use basename only — avoids leading-slash / full-path issues in ZIP exports.
	// A public share can hand us the DAV root as the filename, whose basename is empty;
	// falling back to the raw '/' would leave callers with nothing to dispatch on.
	const mainBasename = filename.split('/').pop() || `model.${extension}`
	const mainFile = new File([blob], mainBasename, { type: getMimeType(extension) })

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
	} else if (extension === 'fbx' || extension === '3ds') {
		// Both name their textures in binary structures. Parsed, they resolve by
		// declaration like every other format — the only route open on a public share,
		// where the folder listing needs a session.
		dependencyResult = await fetchBinaryDependencies(arrayBuffer, extension, fileId, dirPath)

		// A document whose declarations resolved to nothing still finds its textures by
		// listing the folder when signed in. Keeping that means models the parsers do not
		// cover — an exporter writing only an absolute FileName, say — are no worse off
		// than before; on a share page there is nothing to fall back to.
		if (dependencyResult.found.length === 0 && !isPublicShare()) {
			dependencyResult = await fetchFbxDependencies(filename, fileId, dirPath)
		}
	} else if (extension === 'dae' || extension === 'x3d') {
		// COLLADA and X3D name their textures, so they resolve by declaration — the
		// only route open on a public share, where the folder listing needs a session.
		const xmlText = await mainFile.text()
		dependencyResult = await fetchXmlDependencies(xmlText, extension, fileId, dirPath)

		// Signed in, a document whose declarations resolved to nothing still used to
		// find its textures by listing the folder. Keep that as a fallback so this is
		// not a regression for files the patterns do not cover; on a share page the
		// listing is unavailable and there is nothing to fall back to.
		if (dependencyResult.found.length === 0 && !isPublicShare()) {
			dependencyResult = await fetchFbxDependencies(filename, fileId, dirPath)
		}
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
