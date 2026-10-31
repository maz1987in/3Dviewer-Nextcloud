/**
 * E57 (ASTM E2807), the open format terrestrial laser scanners write: pages with
 * checksums (e57/pages.js), an XML description of the scans (e57/xml.js), and for each
 * scan a binary section of packets whose fields are bit-packed (e57/bitpack.js). Each
 * scan is placed by its pose and all of them go into one cloud. E57 coordinates are in
 * metres by the standard.
 *
 * Cartesian scans only: one that stores only spherical coordinates is refused, saying so.
 * Points without a valid position (cartesianInvalidState other than 0) are left out.
 * The e57 Rust crate (MIT) was the reference for reading the sections and packets.
 */
import { FieldReader } from '../e57/bitpack.js'
import { LogicalStream, e57Header } from '../e57/pages.js'
import { e57Scans } from '../e57/xml.js'
import { PointSink } from '../pointSink.js'
import { ScanError, abortError } from '../scanFormats.js'

const XML_MAX_BYTES = 64 * 1024 ** 2
/** The most one field may hold while waiting for the others to complete a record. */
const FIELD_BUFFER_MAX_BYTES = 1024 ** 2
const DATA_PACKET = 1
const INDEX_PACKET = 0
const EMPTY_PACKET = 2

/**
 * @param {number[]} q - A unit quaternion, w x y z
 * @param {number[]} v - A point
 * @param {number[]} t - A translation
 * @return {number[]} q v q* + t
 */
function place([w, x, y, z], [px, py, pz], [tx, ty, tz]) {
	// t = 2 (q × v); v' = v + w t + q × t
	const cx = 2 * (y * pz - z * py)
	const cy = 2 * (z * px - x * pz)
	const cz = 2 * (x * py - y * px)
	return [
		px + w * cx + (y * cz - z * cy) + tx,
		py + w * cy + (z * cx - x * cz) + ty,
		pz + w * cz + (x * cy - y * cx) + tz,
	]
}

const unit = (v, { min, max }) => (max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0)

/**
 * @param {Blob} blob - The file
 * @param {object} options - How to read it
 * @param {number} options.budget - Points kept at most
 * @param {function(number): void} [options.onProgress] - Told the fraction read
 * @param {AbortSignal} [options.signal] - Stops the read
 * @return {Promise<{sink: object, unit: string, format: string}>} The points
 */
export async function read(blob, { budget, onProgress = () => {}, signal }) {
	const header = await e57Header(blob)
	if (header.xmlLength > XML_MAX_BYTES) {
		throw new ScanError('its XML is too large')
	}
	const xml = await new LogicalStream(blob, header.xmlOffset, header.pageSize).read(header.xmlLength)
	const scans = e57Scans(new TextDecoder().decode(xml))
	if (!scans.length) {
		throw new ScanError('it holds no scans')
	}
	for (const scan of scans) {
		const names = new Set(scan.fields.map((f) => f.name))
		if (!['cartesianX', 'cartesianY', 'cartesianZ'].every((n) => names.has(n))) {
			throw names.has('sphericalRange') ? new ScanError('spherical E57 scans aren\'t supported yet') : new ScanError('a scan has no x, y and z')
		}
	}
	const has = (name) => scans.every((scan) => scan.fields.some((f) => f.name === name))
	const attributes = { color: has('colorRed') && has('colorGreen') && has('colorBlue'), intensity: has('intensity') }
	const total = scans.reduce((n, scan) => n + scan.recordCount, 0)
	const sink = new PointSink({ total, budget, attributes })

	let done = 0
	for (const scan of scans) {
		await readScan(blob, header, scan, sink, attributes, signal)
		done += scan.recordCount
		onProgress(total ? done / total : 1)
	}
	return { sink: sink.finish(), unit: 'm', format: 'e57' }
}

/**
 * One scan's binary section, packet by packet, into the sink.
 *
 * @param {Blob} blob - The file
 * @param {object} header - From e57Header
 * @param {object} scan - From e57Scans
 * @param {PointSink} sink - Where the points go
 * @param {{color: boolean, intensity: boolean}} attributes - What every scan records
 * @param {AbortSignal} [signal] - Stops the read between packets
 */
async function readScan(blob, header, scan, sink, attributes, signal) {
	const stream = new LogicalStream(blob, scan.fileOffset, header.pageSize)
	const section = new DataView((await stream.read(32)).slice().buffer)
	if (section.getUint8(0) !== 1) {
		throw new ScanError('a scan\'s binary section is missing')
	}
	const sectionLength = Number(section.getBigUint64(8, true))
	const dataAt = Number(section.getBigUint64(16, true))
	const data = new LogicalStream(blob, dataAt, header.pageSize)
	// How far the section's packets run, counted from where they start
	const packetsLength = sectionLength - 32 - (logicalOf(dataAt, header.pageSize) - logicalOf(scan.fileOffset, header.pageSize) - 32)

	const readers = scan.fields.map((f) => new FieldReader(f))
	// Checked before reading: the XML can claim any number of records
	const bitsPerRecord = readers.reduce((n, r) => n + r.bits, 0)
	if (bitsPerRecord === 0) {
		throw new ScanError('its records take no space, so there is nothing to read')
	}
	if (scan.recordCount > Math.ceil((sectionLength * 8) / bitsPerRecord)) {
		throw new ScanError('a scan claims more points than it holds')
	}
	const at = (name) => scan.fields.findIndex((f) => f.name === name)
	const xyz = ['cartesianX', 'cartesianY', 'cartesianZ'].map(at)
	const rgb = ['colorRed', 'colorGreen', 'colorBlue'].map(at)
	const intensity = at('intensity')
	const invalid = at('cartesianInvalidState')

	let emitted = 0
	while (emitted < scan.recordCount && data.consumed < packetsLength) {
		if (signal?.aborted) {
			throw abortError()
		}
		const head = new DataView((await data.read(4)).slice().buffer)
		const length = head.getUint16(2, true) + 1
		if (length < 4) {
			throw new ScanError('a packet is damaged')
		}
		const body = (await data.read(length - 4)).slice()
		const type = head.getUint8(0)
		if (type === INDEX_PACKET || type === EMPTY_PACKET) {
			continue
		}
		if (type !== DATA_PACKET) {
			throw new ScanError('a packet is of a kind E57 doesn\'t have')
		}
		const view = new DataView(body.buffer)
		const streams = view.getUint16(0, true)
		if (streams !== readers.length) {
			throw new ScanError('a packet holds a different number of fields from its scan')
		}
		let offset = 2 + streams * 2
		for (let s = 0; s < streams; s++) {
			const size = view.getUint16(2 + s * 2, true)
			readers[s].push(body.subarray(offset, offset + size))
			offset += size
		}
		// Every whole record the packets so far hold
		let ready = Math.min(scan.recordCount - emitted, ...readers.map((r) => r.available()))
		// A field that never catches up would have every other held, whole
		if (ready === 0 && readers.some((r) => r.buffered() > FIELD_BUFFER_MAX_BYTES)) {
			throw new ScanError('a scan\'s fields don\'t line up into points')
		}
		for (; ready > 0; ready--, emitted++) {
			if ((emitted & 0xffff) === 0 && signal?.aborted) {
				throw abortError()
			}
			const values = readers.map((r) => r.next())
			if (invalid >= 0 && values[invalid] !== 0) {
				continue
			}
			const [x, y, z] = place(scan.rotation, xyz.map((i) => values[i]), scan.translation)
			const [r, g, b] = attributes.color ? rgb.map((i, c) => Math.round(unit(values[i], scan.color[c]) * 255)) : [0, 0, 0]
			sink.add(x, y, z, r, g, b, attributes.intensity ? Math.round(unit(values[intensity], scan.intensity) * 65535) : 0)
		}
	}
}

/**
 * @param {number} physical - An offset into the pages
 * @param {number} pageSize - From e57Header
 * @return {number} The same place in the logical stream
 */
function logicalOf(physical, pageSize) {
	return Math.floor(physical / pageSize) * (pageSize - 4) + (physical % pageSize)
}
