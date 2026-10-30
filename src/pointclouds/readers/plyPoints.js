/**
 * A PLY of points and no faces, as scanners and phone apps write them. The vertices are
 * read a window at a time, ASCII or binary either way round, with their colours and an
 * intensity when the file has them. The count is in the header, so thinning is even.
 *
 * Only a file whose vertices are its first element is read: anything before them would
 * have to be skipped record by record, and no scanner writes one.
 */
import { readRange, readWindows } from '../blobReader.js'
import { PointSink } from '../pointSink.js'
import { ScanError } from '../scanFormats.js'

/** Bytes looked at for the header; a longer one is refused. */
const HEADER_BYTES = 64 * 1024

const TYPES = {
	char: [1, 'getInt8'],
	int8: [1, 'getInt8'],
	uchar: [1, 'getUint8'],
	uint8: [1, 'getUint8'],
	short: [2, 'getInt16'],
	int16: [2, 'getInt16'],
	ushort: [2, 'getUint16'],
	uint16: [2, 'getUint16'],
	int: [4, 'getInt32'],
	int32: [4, 'getInt32'],
	uint: [4, 'getUint32'],
	uint32: [4, 'getUint32'],
	float: [4, 'getFloat32'],
	float32: [4, 'getFloat32'],
	double: [8, 'getFloat64'],
	float64: [8, 'getFloat64'],
}

const INTEGER = new Set(['char', 'int8', 'uchar', 'uint8', 'short', 'int16', 'ushort', 'uint16', 'int', 'int32', 'uint', 'uint32'])

/**
 * @param {Uint8Array} bytes - The file's first bytes
 * @return {{format: string, elements: {name: string, count: number, properties: {name: string, type: string, list?: boolean}[]}[], headerLength: number}}
 *   The header, and where the data starts
 */
export function plyHeader(bytes) {
	const text = new TextDecoder('latin1').decode(bytes)
	if (!/^ply\r?\n/.test(text)) {
		throw new ScanError('it isn\'t a PLY file')
	}
	const end = /end_header\r?\n/.exec(text)
	if (!end) {
		throw new ScanError('its header has no end')
	}
	const header = { format: '', elements: [], headerLength: end.index + end[0].length }
	for (const line of text.slice(0, end.index).split(/\r?\n/)) {
		const words = line.trim().split(/\s+/)
		if (words[0] === 'format') {
			header.format = words[1]
		} else if (words[0] === 'element') {
			header.elements.push({ name: words[1], count: Number(words[2]), properties: [] })
		} else if (words[0] === 'property' && header.elements.length) {
			const properties = header.elements[header.elements.length - 1].properties
			properties.push(words[1] === 'list' ? { name: words[4], type: words[3], list: true } : { name: words[2], type: words[1] })
		}
	}
	return header
}

/**
 * @param {{elements: {name: string, count: number, properties: {name: string}[]}[]}} header - From plyHeader
 * @return {boolean} Whether the PLY is a scan: no faces, and not a Gaussian splat
 */
export function isPointCloudPly(header) {
	const faces = header.elements.some(({ name, count }) => (name === 'face' || name === 'tristrips') && count > 0)
	const vertex = header.elements.find(({ name }) => name === 'vertex')
	const splat = vertex?.properties.some(({ name }) => name === 'f_dc_0')
	return Boolean(vertex) && !faces && !splat
}

/**
 * Where each wanted value is in a vertex record.
 *
 * @param {{name: string, type: string, list?: boolean}[]} properties - The vertex element's
 * @return {object} Field indices, and for binary their offsets and the record's size
 */
function layoutOf(properties) {
	if (properties.some((p) => p.list)) {
		throw new ScanError('its vertices hold lists')
	}
	const index = (...names) => properties.findIndex((p) => names.includes(p.name.toLowerCase()))
	const fields = {
		x: index('x'),
		y: index('y'),
		z: index('z'),
		r: index('red', 'r', 'diffuse_red'),
		g: index('green', 'g', 'diffuse_green'),
		b: index('blue', 'b', 'diffuse_blue'),
		i: index('intensity', 'scalar_intensity'),
	}
	if (fields.x < 0 || fields.y < 0 || fields.z < 0) {
		throw new ScanError('its vertices have no x, y and z')
	}
	const offsets = []
	let size = 0
	for (const property of properties) {
		const type = TYPES[property.type]
		if (!type) {
			throw new ScanError(`a vertex property is of an unknown type, ${property.type}`)
		}
		offsets.push(size)
		size += type[0]
	}
	const color = fields.r >= 0 && fields.g >= 0 && fields.b >= 0
	const typeOf = (field) => properties[field]?.type
	return {
		fields,
		offsets,
		readers: properties.map((p) => TYPES[p.type][1]),
		recordSize: size,
		color,
		intensity: fields.i >= 0,
		// 0–255 is stored as is; a float colour is 0–1, a 16-bit one 0–65535
		colorScale: color ? (INTEGER.has(typeOf(fields.r)) ? (TYPES[typeOf(fields.r)][0] === 1 ? 1 : 1 / 257) : 255) : 1,
		intensityIsFloat: fields.i >= 0 && !INTEGER.has(typeOf(fields.i)),
	}
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
	const header = plyHeader(new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer()))
	if (header.elements[0]?.name !== 'vertex') {
		throw new ScanError('its vertices aren\'t its first element')
	}
	const { count, properties } = header.elements[0]
	const layout = layoutOf(properties)
	const sink = new PointSink({ total: count, budget, attributes: { color: layout.color, intensity: layout.intensity } })
	// A float intensity may be 0–1 or the scanner's own range: decided from the first values
	let intensityScale = 1
	if (layout.intensityIsFloat) {
		intensityScale = (await firstIntensities(blob, header, layout)).every((v) => v <= 1) ? 65535 : 1
	}
	const add = (value) => {
		const { fields, colorScale } = layout
		sink.add(
			value(fields.x), value(fields.y), value(fields.z),
			layout.color ? clamp(value(fields.r) * colorScale, 255) : 0,
			layout.color ? clamp(value(fields.g) * colorScale, 255) : 0,
			layout.color ? clamp(value(fields.b) * colorScale, 255) : 0,
			layout.intensity ? clamp(value(fields.i) * intensityScale, 65535) : 0,
		)
	}

	if (header.format === 'ascii') {
		await readAscii(blob, header.headerLength, count, add, { onProgress, signal })
	} else if (header.format === 'binary_little_endian' || header.format === 'binary_big_endian') {
		await readBinary(blob, header, layout, add, { onProgress, signal })
	} else {
		throw new ScanError(`its format, ${header.format || 'none'}, isn't one PLY has`)
	}
	return { sink: sink.finish(), unit: null, format: 'ply' }
}

async function readAscii(blob, start, count, add, { onProgress, signal }) {
	const decoder = new TextDecoder()
	let rest = ''
	let read = 0
	const line = (text) => {
		const trimmed = text.trim()
		if (read >= count || trimmed === '') {
			return
		}
		const values = trimmed.split(/\s+/).map(Number)
		add((field) => values[field])
		read++
	}
	for await (const { offset, bytes } of readWindows(blob, { start, windowBytes: 8 * 1024 ** 2, signal })) {
		const lines = (rest + decoder.decode(bytes, { stream: true })).split('\n')
		rest = lines.pop()
		lines.forEach(line)
		onProgress(Math.min(1, (offset + bytes.length) / blob.size))
		if (read >= count) {
			return
		}
	}
	line(rest + decoder.decode())
}

async function readBinary(blob, header, layout, add, { onProgress, signal }) {
	const little = header.format === 'binary_little_endian'
	const { count } = header.elements[0]
	const { recordSize, offsets, readers } = layout
	const end = header.headerLength + count * recordSize
	// Whole records per window
	const windowBytes = Math.max(1, Math.floor((16 * 1024 ** 2) / recordSize)) * recordSize
	for await (const { offset, bytes } of readWindows(blob.slice(0, end), { start: header.headerLength, windowBytes, signal })) {
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
		const records = Math.floor(bytes.length / recordSize)
		for (let r = 0; r < records; r++) {
			const base = r * recordSize
			add((field) => view[readers[field]](base + offsets[field], little))
		}
		onProgress(Math.min(1, (offset + bytes.length - header.headerLength) / (end - header.headerLength)))
	}
}

/**
 * @param {Blob} blob - The file
 * @param {object} header - From plyHeader
 * @param {object} layout - From layoutOf
 * @return {Promise<number[]>} Up to a thousand intensities from the start of the file
 */
async function firstIntensities(blob, header, layout) {
	const { fields, offsets, readers, recordSize } = layout
	const n = Math.min(1000, header.elements[0].count)
	if (header.format === 'ascii') {
		const text = new TextDecoder().decode(new Uint8Array(await blob.slice(header.headerLength, header.headerLength + 256 * 1024).arrayBuffer()))
		return text.split('\n').slice(0, n).filter((l) => l.trim()).map((l) => Number(l.trim().split(/\s+/)[fields.i]))
	}
	const view = await readRange(blob, header.headerLength, n * recordSize)
	const little = header.format === 'binary_little_endian'
	return Array.from({ length: Math.floor(view.byteLength / recordSize) }, (_, r) => view[readers[fields.i]](r * recordSize + offsets[fields.i], little))
}
