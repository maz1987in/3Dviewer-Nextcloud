/**
 * LAS 1.0–1.4, the ASPRS format surveys and LiDAR come in: a header, variable-length
 * records (the coordinate system among them), then fixed-length point records of one of
 * eleven formats. Coordinates are integers times the header's scale plus its offset, so
 * they are computed in double precision and re-centred on the header's minimum before
 * they become 32-bit. The length unit comes from the coordinate system (lasCrsUnit.js).
 *
 * A compressed file (LAZ) is read chunk by chunk: where each chunk is comes from its chunk
 * table (lazChunks.js), laz-perf decodes it into the same records, and the records are
 * read as an uncompressed file's are. Point formats 4, 5, 9 and 10 (waveforms) aren't
 * supported by laz-perf.
 */
import { readRange, readWindows } from '../blobReader.js'
import { crsUnit } from '../lasCrsUnit.js'
import { laszipRecord, readChunkTable } from './lazChunks.js'
import { PointSink } from '../pointSink.js'
import { ScanError, abortError } from '../scanFormats.js'

/** The longest header and VLRs read up front; a file with more is refused. */
const PREAMBLE_MAX_BYTES = 16 * 1024 ** 2

/** Where each format's colour starts, for the formats that have one. */
const RGB_OFFSET = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 }
/** The shortest record of each format. */
const MIN_RECORD = { 0: 20, 1: 28, 2: 26, 3: 34, 4: 57, 5: 63, 6: 30, 7: 36, 8: 38, 9: 59, 10: 67 }

/** Records looked at first, to decide the attributes and the colour depth. */
const SAMPLE = 1000

function text(view, at, length) {
	let s = ''
	for (let i = 0; i < length; i++) {
		const c = view.getUint8(at + i)
		if (c === 0) { break }
		s += String.fromCharCode(c)
	}
	return s
}

/**
 * @param {DataView} view - The file from its start; the VLRs are read when it reaches them
 * @return {object} The header: version, point format and record length, point count,
 *   where the points start, scale, offset, bounds, the VLRs it covers, and whether it is
 *   compressed; and for 1.4, where the extended VLRs are
 */
export function lasHeader(view) {
	if (view.byteLength < 227 || text(view, 0, 4) !== 'LASF') {
		throw new ScanError('it isn\'t a LAS file')
	}
	const version = [view.getUint8(24), view.getUint8(25)]
	const headerSize = view.getUint16(94, true)
	const formatByte = view.getUint8(104)
	const f64 = (at) => view.getFloat64(at, true)
	const header = {
		version,
		headerSize,
		offsetToPoints: view.getUint32(96, true),
		vlrCount: view.getUint32(100, true),
		pointFormat: formatByte & 0x3f,
		// LASzip sets the top bits of the format byte
		compressed: (formatByte & 0xc0) !== 0,
		recordLength: view.getUint16(105, true),
		pointCount: view.getUint32(107, true),
		scale: [f64(131), f64(139), f64(147)],
		offset: [f64(155), f64(163), f64(171)],
		max: [f64(179), f64(195), f64(211)],
		min: [f64(187), f64(203), f64(219)],
		evlrStart: 0,
		evlrCount: 0,
		vlrs: [],
	}
	if (version[0] === 1 && version[1] >= 4 && view.byteLength >= 375) {
		header.evlrStart = Number(view.getBigUint64(235, true))
		header.evlrCount = view.getUint32(243, true)
		const count = Number(view.getBigUint64(247, true))
		if (count > 0) {
			header.pointCount = count
		}
	}
	let at = headerSize
	for (let v = 0; v < header.vlrCount && at + 54 <= view.byteLength && at + 54 <= header.offsetToPoints; v++) {
		const length = view.getUint16(at + 20, true)
		if (at + 54 + length > view.byteLength) {
			break
		}
		header.vlrs.push({
			userId: text(view, at + 2, 16),
			recordId: view.getUint16(at + 18, true),
			data: new Uint8Array(view.buffer, view.byteOffset + at + 54, length),
		})
		at += 54 + length
	}
	return header
}

/**
 * The extended VLRs at the end of a 1.4 file, where a WKT may be.
 *
 * @param {Blob} blob - The file
 * @param {object} header - From lasHeader
 * @return {Promise<object[]>} Them
 */
async function readEvlrs(blob, header) {
	const evlrs = []
	let at = header.evlrStart
	for (let v = 0; v < header.evlrCount && at > 0 && at + 60 <= blob.size; v++) {
		const head = await readRange(blob, at, 60)
		const length = Number(head.getBigUint64(20, true))
		if (length > PREAMBLE_MAX_BYTES || at + 60 + length > blob.size) {
			break
		}
		evlrs.push({ userId: text(head, 2, 16), recordId: head.getUint16(18, true), data: new Uint8Array(await blob.slice(at + 60, at + 60 + length).arrayBuffer()) })
		at += 60 + length
	}
	return evlrs
}

/**
 * How a record of the file's format is read.
 *
 * @param {object} header - From lasHeader
 * @return {object} Offsets of colour and classification, and whether the colour is there
 */
export function recordLayout(header) {
	const format = header.pointFormat
	if (!(format in MIN_RECORD)) {
		throw new ScanError(`LAS point format ${format} doesn't exist`)
	}
	if (header.recordLength < MIN_RECORD[format]) {
		throw new ScanError('its point records are shorter than their format')
	}
	return {
		rgb: RGB_OFFSET[format],
		// 0–5 keep the class in the low five bits of byte 15; 6–10 give it byte 16
		classAt: format <= 5 ? 15 : 16,
		classMask: format <= 5 ? 0x1f : 0xff,
	}
}

/**
 * Decides, from the first records, what the points record: colours (and whether they are
 * 16-bit, as the specification says, or 8-bit values in 16-bit fields, as some writers
 * leave them), intensities and classes. Fields that are zero throughout say nothing.
 *
 * @param {DataView} view - The first records
 * @param {number} records - How many
 * @param {object} header - From lasHeader
 * @param {object} layout - From recordLayout
 * @return {{color: boolean, colorShift: number, intensity: boolean, classification: boolean}}
 */
function attributesOf(view, records, header, layout) {
	let colourMax = 0
	let intensityMax = 0
	let classMax = 0
	for (let r = 0; r < records; r++) {
		const base = r * header.recordLength
		intensityMax = Math.max(intensityMax, view.getUint16(base + 12, true))
		classMax = Math.max(classMax, view.getUint8(base + layout.classAt) & layout.classMask)
		if (layout.rgb !== undefined) {
			for (let c = 0; c < 3; c++) {
				colourMax = Math.max(colourMax, view.getUint16(base + layout.rgb + c * 2, true))
			}
		}
	}
	return {
		color: layout.rgb !== undefined,
		colorShift: colourMax > 255 ? 8 : 0,
		intensity: intensityMax > 0,
		classification: classMax > 0,
	}
}

/**
 * What adds one point record to the sink.
 *
 * @param {object} header - From lasHeader
 * @param {object} layout - From recordLayout
 * @param {object} attributes - From attributesOf
 * @param {PointSink} sink - Where they go
 * @return {function(DataView, number): void} Adds one record, at a byte offset, to the sink
 */
export function recordReader(header, layout, attributes, sink) {
	const [sx, sy, sz] = header.scale
	const [ox, oy, oz] = header.offset
	return (view, base) => {
		let r = 0
		let g = 0
		let b = 0
		if (attributes.color) {
			r = view.getUint16(base + layout.rgb, true) >> attributes.colorShift
			g = view.getUint16(base + layout.rgb + 2, true) >> attributes.colorShift
			b = view.getUint16(base + layout.rgb + 4, true) >> attributes.colorShift
		}
		sink.add(
			view.getInt32(base, true) * sx + ox,
			view.getInt32(base + 4, true) * sy + oy,
			view.getInt32(base + 8, true) * sz + oz,
			r, g, b,
			view.getUint16(base + 12, true),
			view.getUint8(base + layout.classAt) & layout.classMask,
		)
	}
}

/**
 * @param {Blob} blob - The file
 * @param {object} options - How to read it
 * @param {number} options.budget - Points kept at most
 * @param {function(number): void} [options.onProgress] - Told the fraction read
 * @param {AbortSignal} [options.signal] - Stops the read
 * @return {Promise<{sink: object, unit: ?string, format: string}>} The points, and the
 *   unit the coordinate system names
 */
export async function read(blob, { budget, onProgress = () => {}, signal }) {
	const first = lasHeader(await readRange(blob, 0, 375))
	if (first.offsetToPoints > PREAMBLE_MAX_BYTES || first.offsetToPoints > blob.size) {
		throw new ScanError('its header and records are cut short')
	}
	const header = lasHeader(await readRange(blob, 0, first.offsetToPoints))
	const unit = crsUnit([...header.vlrs, ...(header.evlrCount ? await readEvlrs(blob, header) : [])])
	if (header.compressed) {
		return { sink: await readLaz(blob, header, { budget, onProgress, signal }), unit, format: 'laz' }
	}
	const layout = recordLayout(header)
	const { recordLength, pointCount, offsetToPoints } = header
	const end = Math.min(blob.size, offsetToPoints + pointCount * recordLength)

	const sample = await readRange(blob, offsetToPoints, Math.min(SAMPLE, pointCount) * recordLength)
	const attributes = attributesOf(sample, Math.floor(sample.byteLength / recordLength), header, layout)
	const sink = new PointSink({ total: pointCount, budget, origin: header.min, attributes })
	const add = recordReader(header, layout, attributes, sink)

	const windowBytes = Math.max(1, Math.floor((16 * 1024 ** 2) / recordLength)) * recordLength
	for await (const { offset, bytes } of readWindows(blob.slice(0, end), { start: offsetToPoints, windowBytes, signal })) {
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
		const records = Math.floor(bytes.length / recordLength)
		for (let r = 0; r < records; r++) {
			add(view, r * recordLength)
		}
		onProgress(Math.min(1, (offset + bytes.length - offsetToPoints) / Math.max(1, end - offsetToPoints)))
	}
	return { sink: sink.finish(), unit, format: 'las' }
}

/** The point formats laz-perf decodes. */
const LAZ_FORMATS = new Set([0, 1, 2, 3, 6, 7, 8])

/**
 * A compressed file's points, chunk by chunk, so only one chunk is in memory at a time.
 *
 * @param {Blob} blob - The file
 * @param {object} header - From lasHeader
 * @param {object} options - As for read
 * @param {number} options.budget - Points kept at most
 * @param {function(number): void} options.onProgress - Told the fraction read
 * @param {AbortSignal} [options.signal] - Stops the read between chunks
 * @return {Promise<object>} The finished sink
 */
async function readLaz(blob, header, { budget, onProgress, signal }) {
	if (!LAZ_FORMATS.has(header.pointFormat)) {
		throw new ScanError(`LAZ point format ${header.pointFormat} isn't supported`)
	}
	laszipRecord(header)
	const layout = recordLayout(header)
	if (signal?.aborted) {
		throw abortError()
	}
	const chunks = await readChunkTable(blob, header)
	// Only a compressed file needs the decoder
	const { getLazPerf } = await import('../lazPerf.js')
	const lazPerf = await getLazPerf()
	const { recordLength } = header
	const point = lazPerf._malloc(recordLength)
	// The first records, kept to decide the attributes; every point after goes straight
	// from the decoder to the sink, so no chunk is ever held uncompressed
	const sample = new Uint8Array(Math.min(SAMPLE, header.pointCount) * recordLength)
	let sampled = 0
	let sink = null
	let add = null
	const begin = () => {
		const attributes = attributesOf(new DataView(sample.buffer, 0, sampled * recordLength), sampled, header, layout)
		sink = new PointSink({ total: header.pointCount, budget, origin: header.min, attributes })
		add = recordReader(header, layout, attributes, sink)
		const view = new DataView(sample.buffer)
		for (let r = 0; r < sampled; r++) {
			add(view, r * recordLength)
		}
	}
	try {
		for (let c = 0; c < chunks.length; c++) {
			if (signal?.aborted) {
				throw abortError()
			}
			const { start, byteCount, pointCount } = chunks[c]
			const bytes = new Uint8Array(await blob.slice(start, start + byteCount).arrayBuffer())
			decodeChunk(lazPerf, header, bytes, pointCount, point, (record) => {
				if (sink) {
					add(record, 0)
				} else {
					sample.set(new Uint8Array(record.buffer, record.byteOffset, recordLength), sampled * recordLength)
					if (++sampled === sample.length / recordLength) {
						begin()
					}
				}
			})
			onProgress((c + 1) / chunks.length)
		}
		if (!sink) {
			begin()
		}
	} finally {
		lazPerf._free(point)
	}
	return sink.finish()
}

/**
 * @param {object} lazPerf - The module
 * @param {object} header - From lasHeader
 * @param {Uint8Array} bytes - One compressed chunk
 * @param {number} pointCount - Its points
 * @param {number} point - A record's worth of the module's memory, for each point
 * @param {function(DataView): void} each - Given each record, uncompressed, in turn
 */
function decodeChunk(lazPerf, header, bytes, pointCount, point, each) {
	const { recordLength, pointFormat } = header
	const chunk = lazPerf._malloc(bytes.length)
	const decoder = new lazPerf.ChunkDecoder()
	try {
		lazPerf.HEAPU8.set(bytes, chunk)
		decoder.open(pointFormat, recordLength, chunk)
		for (let r = 0; r < pointCount; r++) {
			decoder.getPoint(point)
			// HEAPU8 may be replaced as the module's memory grows: read it each time
			const heap = lazPerf.HEAPU8
			each(new DataView(heap.buffer, heap.byteOffset + point, recordLength))
		}
	} finally {
		decoder.delete()
		lazPerf._free(chunk)
	}
}
