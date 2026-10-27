/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What the background thumbnail worker may load.
 *
 * The worker renders models from shared folders for someone who is only browsing Files,
 * and it may not run under the page's Content Security Policy. A model can name any URL
 * for a texture or a buffer, so a crafted one could otherwise make that person's browser
 * request a URL of the model author's choosing. The worker therefore loads only:
 *
 * - the files it was handed with the job, matched by name, as blob: URLs it makes itself
 * - data: URLs, and blob: URLs the worker itself made (loaders make them for embedded
 *   images, and decoders for their own workers)
 * - the decoder assets the app ships, under its own web root (draco/, basis/,
 *   rhino3dm/, occt/, web-ifc/), on the worker's own origin
 *
 * Anything else is refused before any request is made, and recorded, so the job fails
 * as a load error even when the loader would have shrugged off a missing texture.
 */

/** The app's decoder directories; see appAssetPath.js and scripts/copy-decoders.mjs. */
export const DECODER_DIRS = Object.freeze(['draco', 'basis', 'rhino3dm', 'occt', 'web-ifc'])

/** Longest stretch of a refused URL kept in a message. */
const MAX_URL_IN_MESSAGE = 120

/**
 * Thrown, or recorded, for a URL the worker will not load.
 */
export class RefusedResourceError extends Error {

	/**
	 * @param {string} url - The URL that was refused
	 */
	constructor(url) {
		const text = String(url)
		const shown = text.length > MAX_URL_IN_MESSAGE ? `${text.slice(0, MAX_URL_IN_MESSAGE)}…` : text
		super(`Refused to load ${shown}: not one of the model's files`)
		this.name = 'RefusedResourceError'
		this.url = text
	}

}

/**
 * @param {string} url - A URL or path as a model wrote it
 * @return {string} The last segment, without query or fragment
 */
function lastSegment(url) {
	return String(url).split(/[?#]/)[0].split(/[/\\]/).pop() || ''
}

/**
 * @param {string} text - Possibly percent-encoded
 * @return {string} Decoded, or as it was when it is not valid encoding
 */
function decoded(text) {
	try {
		return decodeURIComponent(text)
	} catch {
		return text
	}
}

/**
 * @typedef {object} WorkerResources
 * @property {(url: string) => string} resolve - The URL to load for one a loader asked
 *   for: a handed file's blob: URL, or the URL itself when it is allowed. Anything else
 *   is recorded as refused and handed back unchanged, for the request guard to stop
 * @property {(url: string) => boolean} isAllowed - Whether a request for this URL may be made
 * @property {(url: string) => void} refuse - Record a URL as refused
 * @property {(url: string) => void} noteObjectUrl - Record a blob: URL the worker made
 * @property {string[]} refused - Every URL refused so far, in order, without repeats
 */

/**
 * The resources of one job.
 *
 * @param {object} options - What the job brings
 * @param {File[]} [options.files] - The companion files the job was handed
 * @param {?string} [options.appWebRoot] - The app's web root, e.g. `/custom_apps/threedviewer/`;
 *   without it no decoder asset is allowed
 * @param {string} options.baseUrl - What relative URLs resolve against: the worker's own URL
 * @param {(file: File) => string} [options.createObjectURL] - Makes a blob: URL
 * @return {WorkerResources} The resolver
 */
export function createWorkerResources({ files = [], appWebRoot = null, baseUrl, createObjectURL = (file) => URL.createObjectURL(file) }) {
	const base = new URL(baseUrl)
	const decoderRoots = appWebRoot
		? DECODER_DIRS.map((dir) => `${new URL(appWebRoot, base).pathname.replace(/\/?$/, '/')}${dir}/`)
		: []
	const ownObjectUrls = new Set()
	const refused = new Set()

	// By exact name first, then case-insensitively; the first file of a name wins
	const byName = new Map()
	for (const file of files) {
		const name = lastSegment(file?.name ?? '')
		if (!name) {
			continue
		}
		if (!byName.has(name)) {
			byName.set(name, file)
		}
		if (!byName.has(name.toLowerCase())) {
			byName.set(name.toLowerCase(), file)
		}
	}
	const objectUrls = new Map()

	/**
	 * @param {string} url - Absolute or relative
	 * @return {boolean} True for a decoder asset of this app on the worker's origin
	 */
	const isDecoderAsset = (url) => {
		let parsed
		try {
			parsed = new URL(url, base)
		} catch {
			return false
		}
		if (parsed.origin !== base.origin) {
			return false
		}
		// The parser resolves ../ and %2e%2e, but leaves %2F and %5C encoded, and a
		// server that decodes them would read draco/..%2F..%2Fremote.php as a climb out
		// of the decoder folder. No decoder asset has a % in its name, so any is refused.
		// Only the part under the root is checked: the root itself is the install's own
		// path, which may be percent-encoded legitimately.
		return decoderRoots.some((root) => parsed.pathname.startsWith(root)
			&& !parsed.pathname.slice(root.length).includes('%'))
	}

	const isAllowed = (url) => {
		const text = String(url)
		if (/^data:/i.test(text)) {
			return true
		}
		if (/^blob:/i.test(text)) {
			return ownObjectUrls.has(text)
		}
		return isDecoderAsset(text)
	}

	/**
	 * @param {string} url - As a loader asked for it
	 * @return {?File} The handed file of that name, if any
	 */
	const handedFile = (url) => {
		const name = lastSegment(url)
		// The name as written, decoded, and the last segment of the decoded name: a
		// reference with an encoded separator, `..%2F..%2Fmaps%2Fwood.png`, was fetched by
		// that. Only a handed file can match, so nothing else becomes loadable
		for (const candidate of [name, decoded(name), lastSegment(decoded(name))]) {
			const file = byName.get(candidate) ?? byName.get(candidate.toLowerCase())
			if (file) {
				return file
			}
		}
		return null
	}

	const refuse = (url) => {
		refused.add(String(url))
	}

	return {
		resolve(url) {
			// Allowed URLs first, so a handed file named like a decoder never stands in for it
			if (isAllowed(url)) {
				return url
			}
			const file = handedFile(url)
			if (file) {
				let objectUrl = objectUrls.get(file)
				if (!objectUrl) {
					objectUrl = createObjectURL(file)
					ownObjectUrls.add(objectUrl)
					objectUrls.set(file, objectUrl)
				}
				return objectUrl
			}
			refuse(url)
			return url
		},
		isAllowed,
		refuse,
		noteObjectUrl(url) {
			ownObjectUrls.add(String(url))
		},
		get refused() {
			return [...refused]
		},
	}
}

/**
 * Make every request the worker's scope can send go through the job's resources: fetch()
 * and XMLHttpRequest refuse what they do not allow, before anything is sent, and every
 * blob: URL the worker makes is recorded as its own.
 *
 * @param {object} scope - The worker's global scope (`self`)
 * @param {() => WorkerResources} current - The resources of the job now running
 */
export function guardWorkerRequests(scope, current) {
	const nativeFetch = scope.fetch
	scope.fetch = function(input, init) {
		const url = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url ?? input)
		const resources = current()
		if (!resources.isAllowed(url)) {
			resources.refuse(url)
			return Promise.reject(new RefusedResourceError(url))
		}
		return nativeFetch.call(scope, input, init)
	}

	const XHR = scope.XMLHttpRequest
	if (XHR?.prototype?.open) {
		const nativeOpen = XHR.prototype.open
		XHR.prototype.open = function(method, url, ...rest) {
			const resources = current()
			if (!resources.isAllowed(String(url))) {
				resources.refuse(String(url))
				throw new RefusedResourceError(String(url))
			}
			return nativeOpen.call(this, method, url, ...rest)
		}
	}

	const nativeCreateObjectURL = scope.URL?.createObjectURL
	if (nativeCreateObjectURL) {
		scope.URL.createObjectURL = function(object) {
			const url = nativeCreateObjectURL.call(scope.URL, object)
			current().noteObjectUrl(url)
			return url
		}
	}
}
