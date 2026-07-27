/**
 * FBX and 3DS name their textures in binary structures, which is why they were the two
 * formats still rendering untextured on a public share: the loader had no way to know
 * which names to ask for, so it listed the folder instead, and listing needs a session.
 *
 * Both parsers walk the container structure rather than scanning for the marker text.
 * A model's vertex data is attacker-supplied bytes, and "RelativeFilename" appearing
 * inside it is not a declaration — the tests below plant exactly that.
 */
import { parse3dsDependencies, parseFbxDependencies } from '../../../src/loaders/binaryModelDependencies.js'

const ascii = (s) => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0) & 0xff))

const u8 = (n) => Uint8Array.of(n & 0xff)

const u16 = (n) => {
	const bytes = new Uint8Array(2)
	new DataView(bytes.buffer).setUint16(0, n, true)
	return bytes
}

const u32 = (n) => {
	const bytes = new Uint8Array(4)
	new DataView(bytes.buffer).setUint32(0, n, true)
	return bytes
}

/**
 * @param {...Uint8Array} parts - byte runs to join
 * @return {Uint8Array} concatenation
 */
function cat(...parts) {
	const total = parts.reduce((n, p) => n + p.length, 0)
	const out = new Uint8Array(total)
	let at = 0
	for (const part of parts) {
		out.set(part, at)
		at += part.length
	}
	return out
}

// ---------------------------------------------------------------- FBX binary

const FBX_NULL_RECORD = 13

/** A string property: type tag 'S', 4-byte length, then the bytes. */
const strProp = (value) => cat(ascii('S'), u32(value.length), ascii(value))

/**
 * A raw byte-array property ('b'), used to plant bytes a scanner would trip over.
 *
 * @param {Uint8Array} bytes - payload stored in the array
 * @return {Uint8Array} encoded property
 */
const arrProp = (bytes) => cat(ascii('b'), u32(bytes.length), u32(0), u32(bytes.length), bytes)

/**
 * Build one FBX node record, deferred until its absolute start offset is known —
 * every record stores the absolute offset of its own end.
 *
 * @param {string} name - node name
 * @param {Uint8Array[]} props - encoded properties
 * @param {Function[]} children - nested node builders
 * @return {Function} (startOffset) => Uint8Array
 */
function fbxNode(name, props = [], children = []) {
	return (start) => {
		const nameBytes = ascii(name)
		const propBytes = cat(...props)
		const headerLen = 4 + 4 + 4 + 1 + nameBytes.length

		let cursor = start + headerLen + propBytes.length
		const childBytes = []
		for (const child of children) {
			const bytes = child(cursor)
			childBytes.push(bytes)
			cursor += bytes.length
		}
		if (children.length > 0) {
			cursor += FBX_NULL_RECORD
		}

		return cat(
			u32(cursor),
			u32(props.length),
			u32(propBytes.length),
			u8(nameBytes.length),
			nameBytes,
			propBytes,
			...childBytes,
			children.length > 0 ? new Uint8Array(FBX_NULL_RECORD) : new Uint8Array(0),
		)
	}
}

/**
 * @param {Function[]} nodes - top-level node builders
 * @return {ArrayBuffer} a binary FBX document
 */
function fbxBinary(nodes) {
	// 'Kaydara FBX Binary  ' + NUL, then 0x1A 0x00, then the version.
	const header = cat(ascii('Kaydara FBX Binary  '), Uint8Array.of(0x00, 0x1a, 0x00), u32(7400))

	const parts = [header]
	let cursor = header.length
	for (const node of nodes) {
		const bytes = node(cursor)
		parts.push(bytes)
		cursor += bytes.length
	}
	parts.push(new Uint8Array(FBX_NULL_RECORD))

	return cat(...parts).buffer
}

/**
 * @param {string[]} paths - RelativeFilename values, one Texture node each
 * @return {ArrayBuffer} a binary FBX declaring them
 */
const fbxWithTextures = (paths) => fbxBinary([
	fbxNode('Objects', [], paths.map((path) => fbxNode(
		'Texture',
		[strProp('Texture::map')],
		[fbxNode('RelativeFilename', [strProp(path)])],
	))),
])

// ------------------------------------------------------------------ 3DS

/**
 * @param {number} id - chunk id
 * @param {Uint8Array} payload - chunk body
 * @param {Uint8Array[]} children - encoded child chunks
 * @return {Uint8Array} encoded chunk, length field included
 */
function chunk(id, payload = new Uint8Array(0), children = []) {
	const body = cat(payload, ...children)
	return cat(u16(id), u32(6 + body.length), body)
}

const asciiz = (s) => cat(ascii(s), Uint8Array.of(0))

const MAPNAME = (name) => chunk(0xa300, asciiz(name))

/**
 * @param {Uint8Array[]} mapChunks - texture-slot chunks to place in one material
 * @return {ArrayBuffer} a 3DS document
 */
const threeDs = (mapChunks) => chunk(
	0x4d4d,
	new Uint8Array(0),
	[chunk(0x3d3d, new Uint8Array(0), [chunk(0xafff, new Uint8Array(0), mapChunks)])],
).buffer

describe('parseFbxDependencies', () => {
	it('reads a RelativeFilename out of a binary document', () => {
		expect(parseFbxDependencies(fbxWithTextures(['textures/wood.png'])))
			.toEqual(['textures/wood.png'])
	})

	it('normalises the backslashes Windows exporters write', () => {
		expect(parseFbxDependencies(fbxWithTextures(['textures\\wood.png'])))
			.toEqual(['textures/wood.png'])
	})

	it('ignores a filename planted inside geometry data', () => {
		// Vertex data is attacker-supplied bytes. A parser that scanned for the marker
		// text would report this; walking the node structure cannot see it.
		const doc = fbxBinary([
			fbxNode('Objects', [], [
				fbxNode('Geometry', [arrProp(cat(ascii('RelativeFilename'), strProp('evil.png')))]),
				fbxNode('Texture', [], [fbxNode('RelativeFilename', [strProp('real.png')])]),
			]),
		])

		expect(parseFbxDependencies(doc)).toEqual(['real.png'])
	})

	it('reads an ASCII document too', () => {
		const text = [
			'; FBX 7.4.0 project file',
			'Objects:  {',
			'\tTexture: 1234, "Texture::map", "" {',
			'\t\tRelativeFilename: "textures/wood.png"',
			'\t}',
			'}',
		].join('\n')

		expect(parseFbxDependencies(ascii(text).buffer)).toEqual(['textures/wood.png'])
	})

	it('accepts a buffer created in another realm', () => {
		// TextEncoder here is Node's, so the ArrayBuffer it produces is not an instance of
		// jsdom's ArrayBuffer — the same mismatch as a buffer arriving from a worker or an
		// iframe. Tested with `instanceof`, such a buffer read as an empty model that
		// declared no textures, which is a silent wrong answer rather than a failure.
		const buffer = new TextEncoder().encode('Objects: {\n\tRelativeFilename: "wood.png"\n}').buffer

		expect(parseFbxDependencies(buffer)).toEqual(['wood.png'])
	})

	it('reads the same document twice', () => {
		const doc = ascii('Objects: {\n\tRelativeFilename: "wood.png"\n}').buffer

		expect(parseFbxDependencies(doc)).toEqual(['wood.png'])
		expect(parseFbxDependencies(doc)).toEqual(['wood.png'])
	})

	it('drops absolute and remote references', () => {
		const doc = fbxWithTextures([
			'C:\\Users\\someone\\wood.png',
			'/var/data/wood.png',
			'https://example.invalid/wood.png',
			'local.png',
		])

		expect(parseFbxDependencies(doc)).toEqual(['local.png'])
	})

	it('deduplicates a texture shared by several materials', () => {
		expect(parseFbxDependencies(fbxWithTextures(['wood.png', 'wood.png'])))
			.toEqual(['wood.png'])
	})

	it('decodes a non-ASCII texture name as UTF-8', () => {
		// FBX strings are UTF-8. Decoding a byte per character instead yields "bÃ¤r.png",
		// which the server would refuse because the model never declared that name.
		const name = 'bär.png'
		const utf8 = new TextEncoder().encode(name)
		const doc = fbxBinary([fbxNode('Objects', [], [fbxNode('Texture', [], [
			fbxNode('RelativeFilename', [cat(ascii('S'), u32(utf8.length), utf8)]),
		])])])

		expect(parseFbxDependencies(doc)).toEqual([name])
	})

	it('caps how many textures one document may declare', () => {
		const many = Array.from({ length: 500 }, (_, i) => `t${i}.png`)

		expect(parseFbxDependencies(fbxWithTextures(many)).length).toBeLessThanOrEqual(64)
	})

	it('returns nothing for content that is not FBX', () => {
		expect(parseFbxDependencies(ascii('just some text').buffer)).toEqual([])
	})

	it('survives a truncated document instead of throwing', () => {
		const full = new Uint8Array(fbxWithTextures(['wood.png']))

		expect(parseFbxDependencies(full.slice(0, 40).buffer)).toEqual([])
	})

	it('yields nothing when a node claims to end before it began', () => {
		// Malformed structure must produce no declarations rather than resynchronising
		// onto whatever the following bytes happen to look like.
		const doc = new Uint8Array(fbxWithTextures(['wood.png']))
		new DataView(doc.buffer).setUint32(27, 4, true)

		expect(parseFbxDependencies(doc.buffer)).toEqual([])
	})
})

describe('parse3dsDependencies', () => {
	it('reads a map name out of a material chunk', () => {
		const doc = threeDs([chunk(0xa200, new Uint8Array(0), [MAPNAME('WOOD.JPG')])])

		expect(parse3dsDependencies(doc)).toEqual(['WOOD.JPG'])
	})

	it('reads every texture slot, not just the diffuse one', () => {
		const doc = threeDs([
			chunk(0xa200, new Uint8Array(0), [MAPNAME('diffuse.jpg')]),
			chunk(0xa230, new Uint8Array(0), [MAPNAME('bump.jpg')]),
			chunk(0xa210, new Uint8Array(0), [MAPNAME('opacity.jpg')]),
		])

		expect(parse3dsDependencies(doc)).toEqual(['diffuse.jpg', 'bump.jpg', 'opacity.jpg'])
	})

	it('stops the name at its terminator', () => {
		const padded = cat(ascii('WOOD.JPG'), Uint8Array.of(0), ascii('trailing junk'))
		const doc = threeDs([chunk(0xa200, new Uint8Array(0), [chunk(0xa300, padded)])])

		expect(parse3dsDependencies(doc)).toEqual(['WOOD.JPG'])
	})

	it('ignores map bytes planted inside a non-container chunk', () => {
		// 0xB000 (keyframer) is not descended into, so a map chunk forged in its payload
		// is never read.
		const forged = chunk(0xa300, asciiz('evil.jpg'))
		const doc = chunk(0x4d4d, new Uint8Array(0), [
			chunk(0xb000, forged),
			chunk(0x3d3d, new Uint8Array(0), [
				chunk(0xafff, new Uint8Array(0), [chunk(0xa200, new Uint8Array(0), [MAPNAME('real.jpg')])]),
			]),
		]).buffer

		expect(parse3dsDependencies(doc)).toEqual(['real.jpg'])
	})

	it('returns nothing for content that is not 3DS', () => {
		expect(parse3dsDependencies(ascii('just some text').buffer)).toEqual([])
	})

	it('yields nothing when a chunk declares an impossible length', () => {
		// A chunk shorter than its own 6-byte header advances the cursor by nothing.
		//
		// This asserts the output only. Termination here is held up by two independent
		// mechanisms — the length check and the node budget — and removing either one
		// alone leaves this passing; removing both hangs the parser. So no single guard
		// can be pinned by what this returns.
		const doc = cat(u16(0x4d4d), u32(0), u16(0x3d3d), u32(0)).buffer

		expect(parse3dsDependencies(doc)).toEqual([])
	})

	it('survives a chunk running past the end of the buffer', () => {
		const doc = cat(u16(0x4d4d), u32(4096), u16(0x3d3d), u32(4096)).buffer

		expect(parse3dsDependencies(doc)).toEqual([])
	})

	it('caps how many textures one document may declare', () => {
		const many = Array.from({ length: 500 }, (_, i) => chunk(0xa200, new Uint8Array(0), [MAPNAME(`t${i}.jpg`)]))

		expect(parse3dsDependencies(threeDs(many)).length).toBeLessThanOrEqual(64)
	})
})
