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

import { normaliseRef } from './textureReferences.js'

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

/** The opening line of an ASCII `Video` node, the one that may carry embedded image data. */
const FBX_ASCII_VIDEO_OPEN = /^[^\S\r\n]*Video\s*:[^{]*\{\s*$/

/** A `RelativeFilename` line on its own, for reading one inside a `Video` node. */
const FBX_ASCII_RELATIVE_LINE = /^[^\S\r\n]*RelativeFilename\s*:\s*"([^"]*)"/

/** A `Filename` line on its own: a `Video` node's other name for its image. */
const FBX_ASCII_FILENAME_LINE = /^[^\S\r\n]*Filename\s*:\s*"([^"]*)"/

/** A `Content` line: the image data itself, or a lone comma with the data on the next line. */
const FBX_ASCII_CONTENT_LINE = /^[^\S\r\n]*Content\s*:(.*)$/

/**
 * Image types three's FBXLoader decodes from a Video node's Content (`parseImage`). For
 * any other it makes no image and asks for the file by name, so that name still counts.
 */
const FBX_EMBEDDABLE = /\.(bmp|jpe?g|png|tif|tga|webp)$/i

/** Property type tags that can hold a `Video` node's embedded bytes: raw ('R') or string ('S'). */
const FBX_RAW = 0x52
const FBX_STRING = 0x53

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
 * `RelativeFilename` names the file. three's FBXLoader asks for a `Video` node's
 * `RelativeFilename || Filename`, so where a video's `RelativeFilename` is empty or
 * missing, its `Filename` is read instead. An absolute name, as Windows exporters write
 * in `Filename` and often in `RelativeFilename` too, falls back to its bare file name
 * beside the model (see normaliseRef), and so does a relative one that climbs above the
 * model's folder, `..\..\textures\wood.jpg`, as 3ds Max writes. A `Texture` node's `FileName` is never asked for,
 * so it is not read.
 *
 * A texture whose image is embedded is not a dependency. Its `Video` node carries the
 * bytes as non-empty `Content`, and three's FBXLoader keys those bytes by the video's
 * filename, so every texture that names it renders from them. Such a name is left out,
 * here and from the `Texture` nodes that repeat it, or a model that needs nothing beside
 * it would be reported as missing its textures. A video without content still counts.
 *
 * @param {ArrayBuffer|Uint8Array} data - the FBX file's bytes
 * @return {string[]} declared relative paths, deduplicated
 */
export function parseFbxDependencies(data) {
	return parseFbxTextures(data).declared
}

/**
 * The textures an FBX document names, split by where their image lives.
 *
 * `declared` is what {@link parseFbxDependencies} returns. `embedded` lists the names
 * whose image the document carries itself, so a caller can tell a model that needs
 * nothing beside it from one the parser did not understand.
 *
 * @param {ArrayBuffer|Uint8Array} data - the FBX file's bytes
 * @return {{declared: string[], embedded: string[]}} normalised relative paths
 */
export function parseFbxTextures(data) {
	const bytes = toBytes(data)
	if (bytes.length === 0) {
		return { declared: [], embedded: [] }
	}

	const out = []

	if (decodeText(bytes.subarray(0, FBX_MAGIC.length)) !== FBX_MAGIC) {
		// ASCII FBX, or not an FBX at all — either way the pattern is the whole parser.
		const text = decodeText(bytes)
		const { embedded, filenames } = asciiVideos(text)
		for (const match of text.matchAll(FBX_ASCII_RELATIVE)) {
			if (out.length >= MAX_DECLARED_TEXTURES) {
				break
			}
			if (!embedded.has(normaliseRef(match[1]))) {
				collect(out, match[1])
			}
		}
		for (const filename of filenames) {
			if (out.length >= MAX_DECLARED_TEXTURES) {
				break
			}
			collect(out, filename)
		}
		return { declared: out, embedded: [...embedded] }
	}

	if (bytes.length < FBX_HEADER_BYTES) {
		return { declared: [], embedded: [] }
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const wide = view.getUint32(FBX_VERSION_OFFSET, true) >= FBX_WIDE_VERSION
	const budget = { nodes: MAX_NODES }
	const embedded = new Set()

	readFbxNodeList(view, FBX_HEADER_BYTES, bytes.length, wide, 0, budget, out, embedded)

	// Filtered afterwards because a Texture node can come before the Video it names.
	return { declared: out.filter((path) => !embedded.has(path)), embedded: [...embedded] }
}

/**
 * What the `Video` nodes of an ASCII document say beyond their `RelativeFilename` lines:
 * which names they carry the image of as content, and the `Filename` of each video whose
 * `RelativeFilename` is empty or missing and that carries no image, which three's
 * FBXLoader then asks for instead.
 *
 * Content is read the way three's text parser reads it: `Content: ,` puts the data on
 * the next line, any other value is the data itself, and either counts once it is not
 * empty. One pass over the lines.
 *
 * @param {string} text - the document
 * @return {{embedded: Set<string>, filenames: string[]}} normalised names whose image is
 *   embedded, and the `Filename` values to declare, as written
 */
function asciiVideos(text) {
	const embedded = new Set()
	const filenames = []
	if (!text.includes('Video')) {
		return { embedded, filenames }
	}

	const lines = text.split(/\r\n|\r|\n/)
	// Nesting below the Video node's opening line; 0 while outside one.
	let depth = 0
	let relative = null
	let filename = null
	let hasContent = false

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		if (depth === 0) {
			if (FBX_ASCII_VIDEO_OPEN.test(line)) {
				depth = 1
				relative = null
				filename = null
				hasContent = false
			}
			continue
		}

		// Only the Video node's own properties; Properties70 and the like sit deeper.
		if (depth === 1) {
			const rel = FBX_ASCII_RELATIVE_LINE.exec(line)
			if (rel) {
				relative = rel[1]
			}
			const file = FBX_ASCII_FILENAME_LINE.exec(line)
			if (file) {
				filename = file[1]
			}
			const content = FBX_ASCII_CONTENT_LINE.exec(line)
			if (content) {
				let value = content[1].trim()
				if (value === ',') {
					value = lines[i + 1] ?? ''
				}
				hasContent = value.replace(/"/g, '').replace(/,$/, '').trim() !== ''
			}
		}

		// Braces inside a quoted name are not structure.
		const bare = line.replace(/"[^"]*"/g, '')
		depth += (bare.match(/\{/g) ?? []).length - (bare.match(/\}/g) ?? []).length
		if (depth <= 0) {
			// The name three keys the video by: RelativeFilename || Filename
			const name = relative || filename
			const path = name ? normaliseRef(name) : null
			if (hasContent && path !== null && FBX_EMBEDDABLE.test(path)) {
				embedded.add(path)
			} else if (!relative && filename) {
				filenames.push(filename)
			}
			depth = 0
		}
	}

	return { embedded, filenames }
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
 * @param {Set<string>} embedded - names whose image the document carries itself
 */
function readFbxNodeList(view, start, end, wide, depth, budget, out, embedded) {
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
		} else if (name === 'Video' && propsEnd < endOffset) {
			readFbxVideo(view, propsEnd, endOffset, wide, budget, out, embedded)
		} else if (propsEnd < endOffset) {
			// Skipping the property list is what keeps a large mesh cheap: vertex arrays
			// are stepped over by length rather than read.
			readFbxNodeList(view, propsEnd, endOffset, wide, depth + 1, budget, out, embedded)
		}

		cursor = endOffset
	}
}

/**
 * A `Video` node's children: its `RelativeFilename` (or `Filename`, where that is empty),
 * and whether `Content` embeds the image.
 *
 * Only the direct children are read. Both properties sit there, and the order between
 * them is not fixed, so the decision waits until the whole list has been seen.
 *
 * @param {DataView} view - the document
 * @param {number} start - first child record's offset
 * @param {number} end - one past the Video node
 * @param {boolean} wide - whether length fields are 64-bit
 * @param {object} budget - shared node allowance
 * @param {string[]} out - accumulator for a name that must be fetched
 * @param {Set<string>} embedded - accumulator for a name the document carries
 */
function readFbxVideo(view, start, end, wide, budget, out, embedded) {
	const fieldSize = wide ? 8 : 4
	const headerSize = fieldSize * 3 + 1
	const readField = (at) => (wide ? Number(view.getBigUint64(at, true)) : view.getUint32(at, true))
	let cursor = start
	let relative = null
	let filename = null
	let hasContent = false

	while (cursor + headerSize <= end && budget.nodes > 0) {
		budget.nodes -= 1

		const endOffset = readField(cursor)
		const propCount = readField(cursor + fieldSize)
		const propBytes = readField(cursor + fieldSize * 2)
		const nameLength = view.getUint8(cursor + fieldSize * 3)

		if (endOffset === 0 || endOffset <= cursor || endOffset > end) {
			break
		}
		const nameEnd = cursor + headerSize + nameLength
		const propsEnd = nameEnd + propBytes
		if (nameEnd > end) {
			break
		}

		const name = decodeText(new Uint8Array(view.buffer, view.byteOffset + cursor + headerSize, nameLength))
		if (name === 'RelativeFilename' && propCount > 0 && propsEnd <= end) {
			relative = readFbxStringProperty(view, nameEnd, propsEnd) ?? relative
		} else if (name === 'Filename' && propCount > 0 && propsEnd <= end) {
			filename = readFbxStringProperty(view, nameEnd, propsEnd) ?? filename
		} else if (name === 'Content' && propCount > 0 && propsEnd <= end) {
			hasContent = hasContent || fbxPropertyHasBytes(view, nameEnd, propsEnd)
		}

		cursor = endOffset
	}

	// The name three's FBXLoader asks for: RelativeFilename || Filename
	const chosen = relative || filename
	if (!chosen) {
		return
	}
	const path = normaliseRef(chosen)
	if (hasContent && path !== null && FBX_EMBEDDABLE.test(path)) {
		embedded.add(path)
	} else if (out.length < MAX_DECLARED_TEXTURES) {
		collect(out, chosen)
	}
}

/**
 * Whether a node's first property is raw or string data of non-zero length.
 *
 * @param {DataView} view - the document
 * @param {number} start - offset of the property's type tag
 * @param {number} end - one past the property list
 * @return {boolean} true when it holds at least one byte
 */
function fbxPropertyHasBytes(view, start, end) {
	if (start + 5 > end) {
		return false
	}
	const tag = view.getUint8(start)
	if (tag !== FBX_RAW && tag !== FBX_STRING) {
		return false
	}
	const length = view.getUint32(start + 1, true)
	return length > 0 && start + 5 + length <= end
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
