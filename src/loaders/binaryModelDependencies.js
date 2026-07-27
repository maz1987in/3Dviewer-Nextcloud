/**
 * Texture declarations from the two binary model formats.
 *
 * OBJ, glTF, COLLADA and X3D all name their textures in text a client can read, so on a
 * public share they resolve by declaration through the token-keyed dependency route. FBX
 * and 3DS keep theirs in binary structures, so the loader used to list the model's folder
 * and take every image in it — and listing needs a session, which is why these two were
 * the formats still rendering untextured on a share.
 *
 * Both parsers walk the container structure rather than searching for the marker bytes.
 * A model's vertex data is supplied by whoever uploaded it, and `RelativeFilename`
 * occurring inside it is not a declaration. The server applies the same rules in
 * ModelDependencyResolver, which is what actually gates the route; this is the client
 * half, so it knows which names to ask for.
 */

/**
 * How many textures one model may declare.
 *
 * Each name becomes a request, and a crafted model can hold hundreds of thousands of
 * declarations. Real exporters emit a handful per material; 64 is already generous.
 */
export const MAX_DECLARED_TEXTURES = 64

/**
 * Unconditional bound on the walk.
 *
 * The per-record sanity checks below reject the malformed shapes that would stall a
 * cursor, but they are checks on values the document supplies. This is the backstop that
 * does not depend on getting every one of them right: with the budget removed as well,
 * a chunk declaring a zero length spins forever.
 */
const MAX_NODES = 50000

const MAX_DEPTH = 16

const FBX_MAGIC = 'Kaydara FBX Binary'

/** Offset of the version field, after the 21-byte magic and the 0x1A 0x00 pair. */
const FBX_VERSION_OFFSET = 23

const FBX_HEADER_BYTES = 27

/** FBX 7.5 widened the three node-record length fields from 32 to 64 bits. */
const FBX_WIDE_VERSION = 7500

/**
 * `RelativeFilename: "textures/wood.png"` in an ASCII document.
 *
 * Safe to share despite the `/g` flag: matchAll iterates a clone and leaves this one's
 * lastIndex alone. `exec` in a loop would not be.
 */
const FBX_ASCII_RELATIVE = /^[^\S\r\n]*RelativeFilename\s*:\s*"([^"]*)"/gm

/**
 * 3DS chunks worth descending into: the file root, the editor block, a material, and
 * every texture slot a material can carry. Anything else — meshes, keyframes — is
 * skipped whole, so bytes inside it are never read as chunks.
 */
const THREE_DS_CONTAINERS = new Set([
	0x4d4d, // M3DMAGIC
	0x3d3d, // MDATA
	0xafff, // MAT_ENTRY
	0xa200, // MAT_TEXMAP
	0xa204, // MAT_SPECMAP
	0xa210, // MAT_OPACMAP
	0xa220, // MAT_REFLMAP
	0xa230, // MAT_BUMPMAP
	0xa33a, // MAT_TEX2MAP
	0xa33c, // MAT_SHINMAP
	0xa33e, // MAT_SELFIMAP
])

const THREE_DS_MAPNAME = 0xa300

/**
 * @param {ArrayBuffer|Uint8Array} data - model bytes
 * @return {Uint8Array} a view over them
 */
function toBytes(data) {
	// Not `instanceof`: that compares against this realm's constructor, and a buffer
	// made in another one — a worker, an iframe, Node's TextEncoder under jsdom — fails
	// the check and would be read as an empty model with no textures at all. Silently
	// returning nothing is the worst shape this could fail in.
	if (ArrayBuffer.isView(data)) {
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
	}
	if (data !== null && typeof data === 'object' && typeof data.byteLength === 'number') {
		return new Uint8Array(data)
	}
	return new Uint8Array(0)
}

/**
 * FBX stores its strings as UTF-8, and a texture name is not always ASCII.
 *
 * Deliberately no fallback decoder: a byte-per-character stand-in silently mangles
 * anything outside ASCII, and having one meant tests took that path while browsers took
 * this one. jsdom installs no TextDecoder, so tests/setup.js supplies Node's.
 */
const utf8 = new TextDecoder('utf-8')

/**
 * @param {Uint8Array} bytes - UTF-8 encoded text
 * @return {string} decoded string
 */
const decodeText = (bytes) => utf8.decode(bytes)

/**
 * Reduce a declared reference to a path inside the model's own folder, or reject it.
 *
 * Mirrors ModelDependencyResolver::normalise() — the client must ask for the same names
 * the server is willing to serve.
 *
 * @param {string} raw - reference exactly as the document wrote it
 * @return {string|null} normalised relative path, or null if it is not one
 */
function normaliseRef(raw) {
	// Exporters on Windows write backslashes; every path here uses forward slashes.
	const path = String(raw).replace(/\\/g, '/').trim()

	// A leading slash is absolute, and a scheme — data:, https:, and Windows' "C:" —
	// means it is not a file beside the model.
	if (path === '' || path.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
		return null
	}

	const segments = []
	for (const segment of path.split('/')) {
		if (segment === '' || segment === '.') {
			continue
		}
		if (segment === '..') {
			if (segments.length === 0) {
				// Climbing out of the model's folder reaches files the share never covered.
				return null
			}
			segments.pop()
			continue
		}
		segments.push(segment)
	}

	return segments.length === 0 ? null : segments.join('/')
}

/**
 * @param {string[]} out - accumulator, deduplicated
 * @param {string} raw - reference as declared
 */
function collect(out, raw) {
	const path = normaliseRef(raw)
	if (path !== null && !out.includes(path)) {
		out.push(path)
	}
}

/**
 * Whether the walk should keep going.
 *
 * Checked at every nesting level rather than where a name is read: returning from the
 * innermost list only ends that one, and the parent would carry on to the next sibling.
 *
 * @param {string[]} out - accumulator
 * @param {object} budget - shared node allowance
 * @return {boolean} true while there is both budget and room
 */
const keepWalking = (out, budget) => budget.nodes > 0 && out.length < MAX_DECLARED_TEXTURES

/**
 * Texture paths an FBX document declares, in document order.
 *
 * Only `RelativeFilename` is read. FBX also carries an absolute `FileName`, but an
 * absolute path is rejected by normalisation anyway, and guessing at its basename would
 * declare names the document never pointed at beside the model.
 *
 * @param {ArrayBuffer|Uint8Array} data - the FBX file's bytes
 * @return {string[]} declared relative paths, deduplicated
 */
export function parseFbxDependencies(data) {
	const bytes = toBytes(data)
	if (bytes.length === 0) {
		return []
	}

	const out = []

	if (decodeText(bytes.subarray(0, FBX_MAGIC.length)) !== FBX_MAGIC) {
		// ASCII FBX, or not an FBX at all — either way the pattern is the whole parser.
		const text = decodeText(bytes)
		for (const match of text.matchAll(FBX_ASCII_RELATIVE)) {
			if (out.length >= MAX_DECLARED_TEXTURES) {
				break
			}
			collect(out, match[1])
		}
		return out
	}

	if (bytes.length < FBX_HEADER_BYTES) {
		return []
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const wide = view.getUint32(FBX_VERSION_OFFSET, true) >= FBX_WIDE_VERSION
	const budget = { nodes: MAX_NODES }

	readFbxNodeList(view, FBX_HEADER_BYTES, bytes.length, wide, 0, budget, out)

	return out
}

/**
 * Walk a run of sibling node records.
 *
 * @param {DataView} view - the document
 * @param {number} start - first record's offset
 * @param {number} end - one past the last byte the run may occupy
 * @param {boolean} wide - whether length fields are 64-bit
 * @param {number} depth - current nesting level
 * @param {object} budget - shared node allowance
 * @param {string[]} out - accumulator
 */
function readFbxNodeList(view, start, end, wide, depth, budget, out) {
	if (depth > MAX_DEPTH) {
		return
	}

	const fieldSize = wide ? 8 : 4
	const headerSize = fieldSize * 3 + 1
	let cursor = start

	while (cursor + headerSize <= end && keepWalking(out, budget)) {
		budget.nodes -= 1

		const readField = (at) => (wide ? Number(view.getBigUint64(at, true)) : view.getUint32(at, true))
		const endOffset = readField(cursor)
		const propCount = readField(cursor + fieldSize)
		const propBytes = readField(cursor + fieldSize * 2)
		const nameLength = view.getUint8(cursor + fieldSize * 3)

		// A record of all zeroes terminates the list.
		if (endOffset === 0) {
			return
		}
		// Anything that would not advance the cursor, or reaches past the run, is
		// malformed — stop rather than trust the rest of the structure.
		if (endOffset <= cursor || endOffset > end) {
			return
		}

		const nameStart = cursor + headerSize
		const nameEnd = nameStart + nameLength
		if (nameEnd > end) {
			return
		}

		const name = decodeText(new Uint8Array(view.buffer, view.byteOffset + nameStart, nameLength))
		const propsEnd = nameEnd + propBytes

		if (name === 'RelativeFilename' && propCount > 0 && propsEnd <= end) {
			const value = readFbxStringProperty(view, nameEnd, propsEnd)
			if (value !== null) {
				collect(out, value)
			}
		} else if (propsEnd < endOffset) {
			// Skipping the property list is what keeps a large mesh cheap: vertex arrays
			// are stepped over by length rather than read.
			readFbxNodeList(view, propsEnd, endOffset, wide, depth + 1, budget, out)
		}

		cursor = endOffset
	}
}

/**
 * The value of a node's first property, when that property is a string.
 *
 * @param {DataView} view - the document
 * @param {number} start - offset of the property's type tag
 * @param {number} end - one past the property list
 * @return {string|null} the string, or null if the first property is not one
 */
function readFbxStringProperty(view, start, end) {
	// 'S' — a 4-byte length followed by the bytes. Every other type tag is a number or
	// an array, neither of which names a file.
	if (start + 5 > end || view.getUint8(start) !== 0x53) {
		return null
	}

	const length = view.getUint32(start + 1, true)
	if (start + 5 + length > end) {
		return null
	}

	return decodeText(new Uint8Array(view.buffer, view.byteOffset + start + 5, length))
}

/**
 * Texture paths a 3DS document declares, in document order.
 *
 * @param {ArrayBuffer|Uint8Array} data - the 3DS file's bytes
 * @return {string[]} declared relative paths, deduplicated
 */
export function parse3dsDependencies(data) {
	const bytes = toBytes(data)
	if (bytes.length < 6) {
		return []
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	if (view.getUint16(0, true) !== 0x4d4d) {
		return []
	}

	const out = []
	read3dsChunks(view, bytes, 0, bytes.length, 0, { nodes: MAX_NODES }, out)

	return out
}

/**
 * @param {DataView} view - the document
 * @param {Uint8Array} bytes - the same document, for string reads
 * @param {number} start - first chunk's offset
 * @param {number} end - one past the last byte the run may occupy
 * @param {number} depth - current nesting level
 * @param {object} budget - shared chunk allowance
 * @param {string[]} out - accumulator
 */
function read3dsChunks(view, bytes, start, end, depth, budget, out) {
	if (depth > MAX_DEPTH) {
		return
	}

	let cursor = start
	while (cursor + 6 <= end && keepWalking(out, budget)) {
		budget.nodes -= 1

		const id = view.getUint16(cursor, true)
		const length = view.getUint32(cursor + 2, true)

		// A chunk shorter than its own header would not advance the cursor; one running
		// past the end is truncated. Either way the structure cannot be trusted onward.
		if (length < 6 || cursor + length > end) {
			return
		}

		if (id === THREE_DS_MAPNAME) {
			collect(out, read3dsName(bytes, cursor + 6, cursor + length))
		} else if (THREE_DS_CONTAINERS.has(id)) {
			read3dsChunks(view, bytes, cursor + 6, cursor + length, depth + 1, budget, out)
		}

		cursor += length
	}
}

/**
 * @param {Uint8Array} bytes - the document
 * @param {number} start - first byte of the name
 * @param {number} end - one past the chunk
 * @return {string} the name, up to its terminator
 */
function read3dsName(bytes, start, end) {
	let stop = start
	while (stop < end && bytes[stop] !== 0) {
		stop += 1
	}
	return decodeText(bytes.subarray(start, stop))
}
