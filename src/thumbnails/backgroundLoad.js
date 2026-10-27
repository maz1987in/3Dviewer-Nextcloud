/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Downloads a model and its companion files for a background thumbnail, unattended.
 *
 * The viewer's loader (`loadModelWithDependencies`) is built for someone looking at the
 * model: when a model names no textures it can resolve, it lists the model's folder tree
 * and downloads every image in it, and it looks for a missing companion in every
 * subfolder. That is fine when one person opens one file; run by the background queue on
 * every model in a folder, one untextured FBX next to a photo library would download the
 * library. So this mode differs on purpose:
 *
 * - Only companions the model itself declares are fetched (OBJ `mtllib` and the MTL's
 *   maps, glTF buffers and images, FBX/3DS texture names, COLLADA/X3D references), each
 *   located by the exact path it declares or by its name beside the model. Nothing is
 *   ever found by listing or scanning a folder.
 * - Each companion's size, which the lookup already reports, is checked against what is
 *   left of the budget before it is fetched. A companion of unknown size is not fetched.
 * - Once one declared companion cannot be fetched, for the budget or because it is not
 *   there, no more are: the result says which are missing and whether the budget was the
 *   reason, and the queue makes no thumbnail from such a load. A thumbnail is written
 *   once per version, so one rendered without its companions would stay degraded.
 * - One AbortSignal runs through every request, so the caller can stop the whole load at
 *   its time limit or when the user leaves the folder.
 * - Bytes are reported as they arrive, so a load stopped midway still counts what it
 *   downloaded.
 * - The dependency cache is not used: a thumbnail is permanent, and a cached companion
 *   can be older than the file it stands for.
 */

import { generateUrl } from '@nextcloud/router'
import { buildFileUrl } from '../composables/usePublicShare.js'
import { parse3dsDependencies, parseFbxDependencies } from '../loaders/binaryModelDependencies.js'
import { parseGltfDependencies, parseObjMaterialFiles, parseXmlModelDependencies } from '../loaders/multiFileHelpers.js'
import { asciiTrim, isLocalAbsoluteRef, nameOnlyRef } from '../loaders/textureReferences.js'
import { logger } from '../utils/logger.js'
import { ThumbnailBudgetError, ThumbnailEnvironmentError } from './errors.js'

/** No model needs more companions than this for a thumbnail; the FBX parser caps at the same. */
const MAX_COMPANIONS = 64

/**
 * @typedef {object} BackgroundLoadOptions
 * @property {AbortSignal} [signal] - Stops every request of the load
 * @property {number} [budgetBytes] - Bytes the whole load may download, main file included
 * @property {(bytes: number) => void} [onBytes] - Told about every chunk of file data received
 */

/**
 * @typedef {object} BackgroundLoadResult
 * @property {File} mainFile - The model
 * @property {File[]} dependencies - The declared companions that were fetched
 * @property {string[]} missingFiles - The declared companions that were not: absent, of
 *   unknown size, refused by the server, past the budget, or not tried because an earlier
 *   one was missing. Empty when the model has everything it declares
 * @property {boolean} budgetReached - A companion was left out because it did not fit
 *   what was left of the budget; a fresh budget may fit it
 * @property {number} bytesNeeded - When `budgetReached`, the fewest bytes the whole load
 *   would have needed: everything downloaded plus the companion that did not fit. More
 *   than a whole folder budget means no visit can ever make this thumbnail. 0 otherwise
 */

/**
 * @param {unknown} error - What a fetch or body read rejected with
 * @return {boolean} True for the rejection an aborted signal causes
 */
function isAbort(error) {
	return error?.name === 'AbortError'
}

/**
 * fetch(), with a network failure turned into an environment error. An abort is passed on
 * as it is, for the caller to tell apart.
 *
 * @param {string} url - What to fetch
 * @param {AbortSignal} [signal] - Stops it
 * @return {Promise<Response>} The response, whatever its status
 */
async function request(url, signal) {
	try {
		return await fetch(url, { signal })
	} catch (error) {
		if (isAbort(error)) {
			throw error
		}
		throw new ThumbnailEnvironmentError(`Network error for ${url}`, { cause: error })
	}
}

/**
 * Read a response body, reporting each chunk and refusing to go past `maxBytes`.
 *
 * @param {Response} response - An ok response
 * @param {number} maxBytes - Most bytes the body may have
 * @param {(bytes: number) => void} onBytes - Told about every chunk
 * @return {Promise<ArrayBuffer>} The body
 * @throws {ThumbnailBudgetError} When the body is larger than `maxBytes`
 */
async function readBody(response, maxBytes, onBytes) {
	const declared = Number(response.headers?.get?.('content-length'))
	if (Number.isFinite(declared) && declared > maxBytes) {
		response.body?.cancel?.().catch(() => {})
		throw new ThumbnailBudgetError(maxBytes)
	}

	const reader = response.body?.getReader?.()
	if (!reader) {
		const buffer = await response.arrayBuffer()
		onBytes(buffer.byteLength)
		if (buffer.byteLength > maxBytes) {
			throw new ThumbnailBudgetError(maxBytes)
		}
		return buffer
	}

	const chunks = []
	let total = 0
	for (;;) {
		const { done, value } = await reader.read()
		if (done) {
			break
		}
		total += value.byteLength
		onBytes(value.byteLength)
		if (total > maxBytes) {
			reader.cancel().catch(() => {})
			throw new ThumbnailBudgetError(maxBytes)
		}
		chunks.push(value)
	}

	const body = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		body.set(chunk, offset)
		offset += chunk.byteLength
	}
	return body.buffer
}

/**
 * Throw for a failed download: an environment error for a 5xx, a plain one for a 4xx,
 * which says something about the file (gone, refused, too large for the server).
 *
 * @param {Response} response - A response that is not ok
 * @param {string} what - What was being downloaded, for the message
 */
function failDownload(response, what) {
	const message = `Could not download ${what}: HTTP ${response.status}`
	if (response.status >= 500) {
		throw new ThumbnailEnvironmentError(message)
	}
	throw new Error(message)
}

/**
 * @param {string} dirPath - Folder of the model, as the status reports it
 * @param {string} ref - Path relative to it
 * @return {string} The path below the user's root, without a leading slash
 */
function joinPath(dirPath, ref) {
	const dir = String(dirPath ?? '').replace(/^\/+|\/+$/g, '')
	return dir ? `${dir}/${ref}` : ref
}

/**
 * The texture paths an MTL names, as written. parseMtlTextureFiles keeps only the
 * basenames, because the viewer then searches subfolders for them; here the declared
 * path is the first place to look, so it is kept. An absolute or `file:` path is the
 * exception: its directories are on the author's machine, so only its name is kept, to
 * be looked for beside the model.
 *
 * @param {string} mtlContent - Text of the MTL
 * @return {string[]} Declared paths, with forward slashes, deduplicated
 */
function parseMtlTexturePaths(mtlContent) {
	const matches = [...mtlContent.matchAll(/^\s*(?:map_[A-Za-z0-9_]+|bump|refl)[^\S\r\n]+(.*?)$/gm)]
	const paths = matches.map((match) => {
		const path = asciiTrim(match[1])
		return isLocalAbsoluteRef(path) ? nameOnlyRef(path) : path.replace(/\\/g, '/')
	}).filter(Boolean)
	return [...new Set(paths)]
}

/**
 * Download one model for a background thumbnail, with only the companions it declares and
 * only as many as the budget allows. See the module comment for how this differs from the
 * viewer's loader.
 *
 * @param {number} fileId - File id of the model
 * @param {string} filename - Its name
 * @param {string} extension - Its extension, lower case, without the dot
 * @param {string} dirPath - Its folder below the user's root
 * @param {BackgroundLoadOptions} [options] - Signal, budget and progress
 * @return {Promise<BackgroundLoadResult>} The model, the companions that were fetched,
 *   and what was not
 * @throws {ThumbnailBudgetError} When the main file alone is larger than the budget
 * @throws {ThumbnailEnvironmentError} On a network error or a 5xx from any request
 * @throws {DOMException} An AbortError once the signal fires
 */
export async function loadModelForBackground(fileId, filename, extension, dirPath, options = {}) {
	const { signal, budgetBytes = Infinity, onBytes = () => {} } = options
	let used = 0
	const count = (bytes) => {
		used += bytes
		onBytes(bytes)
	}

	const response = await request(buildFileUrl(fileId), signal)
	if (!response.ok) {
		failDownload(response, filename)
	}
	const buffer = await readBody(response, budgetBytes, count)
	const mainFile = new File([buffer], String(filename).split('/').pop() || `model.${extension}`, {
		type: 'application/octet-stream',
	})

	const dependencies = []
	const missingFiles = []
	let budgetReached = false
	let bytesNeeded = 0

	/**
	 * Fetch one declared companion, if it exists and fits. Once one has not been fetched,
	 * none are: the load cannot make a thumbnail any more, so the rest would be wasted.
	 *
	 * @param {string} ref - The path the model declared
	 * @param {string} type - MIME type to give the file when the server sends none
	 * @return {Promise<?File>} The file, or null when it was not fetched
	 */
	const fetchCompanion = async (ref, type) => {
		if (missingFiles.length > 0 || dependencies.length >= MAX_COMPANIONS) {
			missingFiles.push(ref)
			return null
		}
		const located = await locate(ref, dirPath, signal)
		if (!located || !Number.isFinite(located.size) || located.size < 0) {
			// Not there, or of a size nobody can check against the budget
			missingFiles.push(ref)
			return null
		}
		const left = budgetBytes - used
		if (located.size > left) {
			budgetReached = true
			bytesNeeded = used + located.size
			missingFiles.push(ref)
			return null
		}

		const companion = await request(buildFileUrl(located.id), signal)
		if (!companion.ok) {
			if (companion.status >= 500) {
				failDownload(companion, ref)
			}
			missingFiles.push(ref)
			return null
		}
		const usedBefore = used
		let body
		try {
			body = await readBody(companion, left, count)
		} catch (error) {
			if (!(error instanceof ThumbnailBudgetError)) {
				throw error
			}
			// Larger than the lookup said, so more than was left; the bytes it did send
			// are already counted
			budgetReached = true
			bytesNeeded = Math.max(used, usedBefore + left + 1)
			missingFiles.push(ref)
			return null
		}
		const file = new File([body], ref.split('/').pop(), {
			type: companion.headers?.get?.('content-type') || type,
		})
		dependencies.push(file)
		return file
	}

	if (extension === 'obj') {
		for (const mtl of parseObjMaterialFiles(await mainFile.text())) {
			const material = await fetchCompanion(mtl, 'model/mtl')
			if (material) {
				for (const texture of parseMtlTexturePaths(await material.text())) {
					await fetchCompanion(texture, 'application/octet-stream')
				}
			}
		}
	} else {
		for (const ref of await declaredCompanions(extension, mainFile, buffer)) {
			await fetchCompanion(ref, 'application/octet-stream')
		}
	}

	if (missingFiles.length > 0) {
		logger.info('backgroundLoad', 'Some declared companions were not fetched', {
			fileId,
			missingFiles,
			budgetReached,
		})
	}
	return { mainFile, dependencies, missingFiles, budgetReached, bytesNeeded }
}

/**
 * The companions a non-OBJ model declares, in the order they should be fetched.
 *
 * @param {string} extension - Model extension
 * @param {File} mainFile - The model
 * @param {ArrayBuffer} buffer - Its bytes
 * @return {Promise<string[]>} Declared paths; empty for single-file formats
 */
async function declaredCompanions(extension, mainFile, buffer) {
	switch (extension) {
	case 'gltf': {
		let json
		try {
			json = JSON.parse(await mainFile.text())
		} catch {
			// The loader reports the broken document; there is nothing to fetch for it
			return []
		}
		// Buffers first: the geometry needs them, the images only colour it
		const { buffers, images } = parseGltfDependencies(json)
		return [...buffers, ...images]
	}
	case 'fbx':
		return parseFbxDependencies(buffer)
	case '3ds':
		return parse3dsDependencies(buffer)
	case 'dae':
	case 'x3d':
		return parseXmlModelDependencies(await mainFile.text(), extension)
	default:
		return []
	}
}

/**
 * Find a declared companion by exact path: first where the model says it is, then by its
 * name beside the model, as exporters often write a path from the machine they ran on.
 * Two lookups at most; no folder is listed. An absolute reference was already reduced to
 * its name by the parsers, so it is looked for beside the model only.
 *
 * @param {string} ref - The path the model declared
 * @param {string} dirPath - Folder of the model
 * @param {AbortSignal} [signal] - Stops the lookups
 * @return {Promise<?{id: number, size: number}>} The file, or null when neither path has one
 */
async function locate(ref, dirPath, signal) {
	const basename = ref.split('/').pop()
	const candidates = [...new Set([ref, basename].filter(Boolean))]
	for (const candidate of candidates) {
		const url = generateUrl('/apps/threedviewer/api/files/find')
			+ `?path=${encodeURIComponent(joinPath(dirPath, candidate))}`
		const response = await request(url, signal)
		if (response.status >= 500) {
			failDownload(response, `a lookup for ${ref}`)
		}
		if (!response.ok) {
			continue
		}
		const data = await response.json().catch(() => null)
		if (data?.id) {
			return { id: data.id, size: typeof data.size === 'number' ? data.size : NaN }
		}
	}
	return null
}
