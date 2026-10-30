/**
 * PCD, the Point Cloud Library's format: a text header, then the points as ASCII, binary
 * (little-endian records) or binary_compressed (each field's values together, LZF).
 * Colours are packed into one 32-bit `rgb` or `rgba` field; `intensity` and `label` (read
 * as the classification) are kept when present. An organised cloud's empty points are NaN
 * and are left out.
 *
 * The header parsing, the packed colour and the LZF decoding follow three.js's PCDLoader
 * (MIT), which reads a whole file into JS arrays; this writes into the sink instead, a
 * window at a time. A compressed file is one LZF stream, so it is decompressed whole.
 */
import { readRange, readWindows } from '../blobReader.js'
import { PointSink } from '../pointSink.js'
import { ScanError } from '../scanFormats.js'

const HEADER_BYTES = 64 * 1024

/** The most a compressed PCD may take once decompressed, which is all held at once. */
const PCD_DECOMPRESSED_MAX_BYTES = 1024 ** 3
/** LZF's longest back-reference copies 264 bytes from a 3-byte token. */
const LZF_MAX_EXPANSION = 88

/**
 * @param {Uint8Array} bytes - The file's first bytes
 * @return {object} The header: fields with their size, type and count, the point count,
 *   the data kind, and where the data starts
 */
export function pcdHeader(bytes) {
	const text = new TextDecoder('latin1').decode(bytes)
	const data = /^DATA[ \t]+(\S+)[^\n]*\n/m.exec(text)
	if (!data) {
		throw new ScanError('its header has no DATA line')
	}
	const value = (key) => new RegExp(`^${key}[ \\t]+([^\\r\\n]*)`, 'm').exec(text.slice(0, data.index))?.[1].trim().split(/\s+/)
	const fields = value('FIELDS') ?? []
	const size = (value('SIZE') ?? []).map(Number)
	const type = value('TYPE') ?? []
	const count = (value('COUNT') ?? fields.map(() => '1')).map(Number)
	const width = Number(value('WIDTH')?.[0] ?? 0)
	const height = Number(value('HEIGHT')?.[0] ?? 1)
	const points = Number(value('POINTS')?.[0] ?? width * height)
	if (!fields.length || size.length !== fields.length || type.length !== fields.length || count.length !== fields.length) {
		throw new ScanError('its FIELDS, SIZE, TYPE and COUNT don\'t agree')
	}
	return { fields, size, type, count, points, data: data[1].toLowerCase(), headerLength: data.index + data[0].length }
}

/**
 * @param {string} type - F, I or U
 * @param {number} size - Bytes
 * @return {string} The DataView getter for it
 */
function getter(type, size) {
	const name = { F: { 4: 'getFloat32', 8: 'getFloat64' }, I: { 1: 'getInt8', 2: 'getInt16', 4: 'getInt32' }, U: { 1: 'getUint8', 2: 'getUint16', 4: 'getUint32' } }[type]?.[size]
	if (!name) {
		throw new ScanError(`a field is of a type PCD doesn't have, ${type}${size}`)
	}
	return name
}

/**
 * @param {object} header - From pcdHeader
 * @return {object} Where x, y, z, the colour, the intensity and the label are
 */
function layoutOf(header) {
	const at = (...names) => header.fields.findIndex((f) => names.includes(f.toLowerCase()))
	const fields = { x: at('x'), y: at('y'), z: at('z'), rgb: at('rgb', 'rgba'), i: at('intensity'), label: at('label') }
	if (fields.x < 0 || fields.y < 0 || fields.z < 0) {
		throw new ScanError('it has no x, y and z')
	}
	// Bytes per point, and each field's offset in a record
	const offsets = []
	let record = 0
	header.fields.forEach((_, f) => {
		offsets.push(record)
		record += header.size[f] * header.count[f]
	})
	// The token each field starts at, in an ASCII line
	const tokens = []
	let token = 0
	header.count.forEach((n) => {
		tokens.push(token)
		token += n
	})
	return {
		fields,
		offsets,
		tokens,
		record,
		getters: header.fields.map((_, f) => getter(header.type[f], header.size[f])),
		color: fields.rgb >= 0,
		intensity: fields.i >= 0,
		intensityIsFloat: fields.i >= 0 && header.type[fields.i] === 'F',
		classification: fields.label >= 0,
	}
}

/** An rgb field's value as its packed bits, whether it was written as a float or an integer. */
const packedView = new DataView(new ArrayBuffer(4))
function unpack(value, isFloat) {
	if (isFloat) {
		packedView.setFloat32(0, value, true)
		return packedView.getUint32(0, true)
	}
	return value >>> 0
}

const clamp = (v, max) => Math.min(max, Math.max(0, Math.round(v)))

/**
 * @param {Blob} blob - The file
 * @param {object} options - How to read it
 * @param {number} options.budget - Points kept at most
 * @param {function(number): void} [options.onProgress] - Told the fraction read
 * @param {AbortSignal} [options.signal] - Stops the read
 * @return {Promise<{sink: object, unit: null, format: string}>} The points
 */
export async function read(blob, { budget, onProgress = () => {}, signal }) {
	const header = pcdHeader(new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer()))
	const layout = layoutOf(header)
	const sink = new PointSink({
		total: header.points,
		budget,
		attributes: { color: layout.color, intensity: layout.intensity, classification: layout.classification },
	})
	const rgbIsFloat = layout.color && header.type[layout.fields.rgb] === 'F'
	let intensityScale = 1

	/** @param {function(number): number} value - A field's first value */
	const add = (value) => {
		const x = value(layout.fields.x)
		const y = value(layout.fields.y)
		const z = value(layout.fields.z)
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
			return
		}
		const packed = layout.color ? unpack(value(layout.fields.rgb), rgbIsFloat) : 0
		sink.add(
			x, y, z,
			(packed >> 16) & 255, (packed >> 8) & 255, packed & 255,
			layout.intensity ? clamp(value(layout.fields.i) * intensityScale, 65535) : 0,
			layout.classification ? clamp(value(layout.fields.label), 255) : 0,
		)
	}

	if (header.data === 'ascii') {
		const first = layout.intensityIsFloat ? await asciiIntensities(blob, header, layout) : []
		intensityScale = first.length && first.every((v) => v <= 1) ? 65535 : 1
		await readAscii(blob, header, layout, add, { onProgress, signal })
	} else if (header.data === 'binary') {
		const first = layout.intensityIsFloat ? await binaryIntensities(blob, header, layout) : []
		intensityScale = first.length && first.every((v) => v <= 1) ? 65535 : 1
		await readBinary(blob, header, layout, add, { onProgress, signal })
	} else if (header.data === 'binary_compressed') {
		await readCompressed(blob, header, layout, add, (first) => {
			intensityScale = first.length && first.every((v) => v <= 1) ? 65535 : 1
		}, { onProgress })
	} else {
		throw new ScanError(`its DATA, ${header.data}, isn't one PCD has`)
	}
	return { sink: sink.finish(), unit: null, format: 'pcd' }
}

async function readAscii(blob, header, layout, add, { onProgress, signal }) {
	const decoder = new TextDecoder()
	let rest = ''
	const line = (text) => {
		const trimmed = text.trim()
		if (trimmed === '') {
			return
		}
		const values = trimmed.split(/\s+/)
		add((field) => Number(values[layout.tokens[field]]))
	}
	for await (const { offset, bytes } of readWindows(blob, { start: header.headerLength, windowBytes: 8 * 1024 ** 2, signal })) {
		const lines = (rest + decoder.decode(bytes, { stream: true })).split('\n')
		rest = lines.pop()
		lines.forEach(line)
		onProgress(Math.min(1, (offset + bytes.length) / blob.size))
	}
	line(rest + decoder.decode())
}

async function readBinary(blob, header, layout, add, { onProgress, signal }) {
	const { record, offsets, getters } = layout
	const end = header.headerLength + header.points * record
	const windowBytes = Math.max(1, Math.floor((16 * 1024 ** 2) / record)) * record
	for await (const { offset, bytes } of readWindows(blob.slice(0, end), { start: header.headerLength, windowBytes, signal })) {
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
		const records = Math.floor(bytes.length / record)
		for (let r = 0; r < records; r++) {
			const base = r * record
			add((field) => view[getters[field]](base + offsets[field], true))
		}
		onProgress(Math.min(1, (offset + bytes.length - header.headerLength) / (end - header.headerLength)))
	}
}

async function readCompressed(blob, header, layout, add, setIntensityScale, { onProgress }) {
	const sizes = await readRange(blob, header.headerLength, 8)
	if (sizes.byteLength < 8) {
		throw new ScanError('its compressed data is cut short')
	}
	const compressedSize = sizes.getUint32(0, true)
	const size = sizes.getUint32(4, true)
	// Checked before anything is allocated: a crafted header can ask for gigabytes
	if (size !== header.points * layout.record) {
		throw new ScanError('its compressed data is not the size its header says')
	}
	if (compressedSize > blob.size - header.headerLength - 8 || size > compressedSize * LZF_MAX_EXPANSION) {
		throw new ScanError('its compressed data is damaged')
	}
	if (size > PCD_DECOMPRESSED_MAX_BYTES) {
		throw new ScanError('it is too large to decompress')
	}
	const packed = new Uint8Array(await blob.slice(header.headerLength + 8, header.headerLength + 8 + compressedSize).arrayBuffer())
	const view = new DataView(decompressLZF(packed, size).buffer)
	onProgress(0.5)
	// Each field's values together: field f's block starts at points × its record offset
	const n = header.points
	const { offsets, getters } = layout
	const fieldSize = (field) => header.size[field] * header.count[field]
	const value = (field, i) => view[getters[field]](n * offsets[field] + fieldSize(field) * i, true)
	if (layout.intensityIsFloat) {
		setIntensityScale(Array.from({ length: Math.min(1000, n) }, (_, i) => value(layout.fields.i, i)))
	}
	for (let i = 0; i < n; i++) {
		add((field) => value(field, i))
	}
	onProgress(1)
}

/**
 * @param {Uint8Array} input - LZF data
 * @param {number} length - Its decompressed size
 * @return {Uint8Array} The data
 */
function decompressLZF(input, length) {
	const out = new Uint8Array(length)
	let i = 0
	let o = 0
	while (i < input.length) {
		const ctrl = input[i++]
		if (ctrl < 32) {
			const run = ctrl + 1
			if (o + run > length || i + run > input.length) {
				throw new ScanError('its compressed data is damaged')
			}
			out.set(input.subarray(i, i + run), o)
			i += run
			o += run
		} else {
			let len = ctrl >> 5
			if (len === 7) {
				len += input[i++]
			}
			let ref = o - ((ctrl & 0x1f) << 8) - 1 - input[i++]
			if (ref < 0 || i > input.length || o + len + 2 > length) {
				throw new ScanError('its compressed data is damaged')
			}
			for (let k = 0; k < len + 2; k++) {
				out[o++] = out[ref++]
			}
		}
	}
	return out
}

async function asciiIntensities(blob, header, layout) {
	const text = new TextDecoder().decode(new Uint8Array(await blob.slice(header.headerLength, header.headerLength + 256 * 1024).arrayBuffer()))
	return text.split('\n').slice(0, 1000).filter((l) => l.trim()).map((l) => Number(l.trim().split(/\s+/)[layout.tokens[layout.fields.i]])).filter(Number.isFinite)
}

async function binaryIntensities(blob, header, layout) {
	const n = Math.min(1000, header.points)
	const view = await readRange(blob, header.headerLength, n * layout.record)
	const { fields, offsets, getters, record } = layout
	return Array.from({ length: Math.floor(view.byteLength / record) }, (_, r) => view[getters[fields.i]](r * record + offsets[fields.i], true)).filter(Number.isFinite)
}
