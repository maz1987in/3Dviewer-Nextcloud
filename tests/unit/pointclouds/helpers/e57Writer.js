/**
 * A small E57 writer (ASTM E2807), for the cases the real fixtures don't cover: scaled
 * integers, a value that straddles two packets, several scans with poses. It writes what
 * the standard specifies, with zero page checksums (the reader doesn't verify them).
 */

const PAGE = 1024
const PAYLOAD = 1020

/** @param {number} logical - An offset in the checksum-free stream */
export const physical = (logical) => logical + Math.floor(logical / PAYLOAD) * (PAGE - PAYLOAD)

/** Bits for an integer field of [min, max]. */
const widthOf = (min, max) => Math.ceil(Math.log2(max - min + 1))

/**
 * One field's values as its bytestream: LSB-first bits for integers, little-endian floats.
 */
function bytestream(field, values) {
	if (field.type === 'Float') {
		const size = field.precision === 'single' ? 4 : 8
		const out = new DataView(new ArrayBuffer(values.length * size))
		values.forEach((v, i) => (size === 4 ? out.setFloat32(i * size, v, true) : out.setFloat64(i * size, v, true)))
		return new Uint8Array(out.buffer)
	}
	const width = widthOf(field.min, field.max)
	const bytes = new Uint8Array(Math.ceil((values.length * width) / 8))
	values.forEach((v, i) => {
		const raw = field.type === 'ScaledInteger' ? Math.round((v - (field.offset ?? 0)) / field.scale) - field.min : v - field.min
		for (let b = 0; b < width; b++) {
			if (Math.floor(raw / 2 ** b) % 2) {
				const bit = i * width + b
				bytes[bit >> 3] |= 1 << (bit & 7)
			}
		}
	})
	return bytes
}

const xmlField = (f) => {
	if (f.type === 'Float') {
		return `<${f.name} type="Float"${f.precision === 'single' ? ' precision="single"' : ''}/>`
	}
	const scale = f.type === 'ScaledInteger' ? ` scale="${f.scale}" offset="${f.offset ?? 0}"` : ''
	return `<${f.name} type="${f.type}" minimum="${f.min}" maximum="${f.max}"${scale}/>`
}

/**
 * @param {object} options - What to write
 * @param {Array<{fields: object[], records: number[][], pose?: {rotation: number[], translation: number[]}, packets?: number, limits?: string}>} options.scans - Each scan's
 *   prototype, records (one value per field), optional pose, how many packets to split
 *   its streams into, extra XML (limits) for its vectorChild, and a recordCount to claim
 *   in place of the records' own
 * @return {Uint8Array} The file
 */
export function e57File({ scans }) {
	const logical = []
	const push = (bytes) => logical.push(...bytes)
	push(new Uint8Array(48))
	const children = []
	for (const scan of scans) {
		const streams = scan.fields.map((f, i) => bytestream(f, scan.records.map((r) => r[i])))
		const packets = scan.packets ?? 1
		const sectionAt = logical.length
		push(new Uint8Array(32))
		const dataAt = logical.length
		for (let p = 0; p < packets; p++) {
			// Each stream cut at the same fraction, so values straddle packets
			const parts = streams.map((s) => s.slice(Math.floor((s.length * p) / packets), Math.floor((s.length * (p + 1)) / packets)))
			const headerLength = 6 + parts.length * 2
			let length = headerLength + parts.reduce((n, b) => n + b.length, 0)
			length = Math.ceil(length / 4) * 4
			const packet = new Uint8Array(length)
			const view = new DataView(packet.buffer)
			view.setUint8(0, 1)
			view.setUint16(2, length - 1, true)
			view.setUint16(4, parts.length, true)
			parts.forEach((b, i) => view.setUint16(6 + i * 2, b.length, true))
			let at = headerLength
			for (const b of parts) {
				packet.set(b, at)
				at += b.length
			}
			push(packet)
		}
		const section = new DataView(new ArrayBuffer(32))
		section.setUint8(0, 1)
		section.setBigUint64(8, BigInt(logical.length - sectionAt), true)
		section.setBigUint64(16, BigInt(physical(dataAt)), true)
		new Uint8Array(section.buffer).forEach((b, i) => { logical[sectionAt + i] = b })
		const pose = scan.pose
			? `<pose type="Structure"><rotation type="Structure"><w type="Float">${scan.pose.rotation[0]}</w><x type="Float">${scan.pose.rotation[1]}</x><y type="Float">${scan.pose.rotation[2]}</y><z type="Float">${scan.pose.rotation[3]}</z></rotation>`
			+ `<translation type="Structure"><x type="Float">${scan.pose.translation[0]}</x><y type="Float">${scan.pose.translation[1]}</y><z type="Float">${scan.pose.translation[2]}</z></translation></pose>`
			: ''
		children.push(`<vectorChild type="Structure">${pose}${scan.limits ?? ''}<points type="CompressedVector" fileOffset="${physical(sectionAt)}" recordCount="${scan.recordCount ?? scan.records.length}">`
			+ `<prototype type="Structure">${scan.fields.map(xmlField).join('')}</prototype><codecs type="Vector" allowHeterogeneousChildren="1"/></points></vectorChild>`)
	}
	const xml = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><e57Root type="Structure" xmlns="http://www.astm.org/COMMIT/E57/2010-e57-v1.0">'
		+ `<formatName type="String"><![CDATA[ASTM E57 3D Imaging Data File]]></formatName><data3D type="Vector" allowHeterogeneousChildren="1">${children.join('')}</data3D></e57Root>`)
	const xmlAt = logical.length
	push(xml)

	const out = new Uint8Array(physical(logical.length - 1) + 1 + (PAGE - PAYLOAD))
	const pages = Math.ceil(logical.length / PAYLOAD)
	const file = new Uint8Array(pages * PAGE)
	for (let i = 0; i < logical.length; i++) {
		file[physical(i)] = logical[i]
	}
	const head = new DataView(file.buffer)
	new TextEncoder().encode('ASTM-E57').forEach((b, i) => { file[i] = b })
	head.setUint32(8, 1, true)
	head.setBigUint64(16, BigInt(file.length), true)
	head.setBigUint64(24, BigInt(physical(xmlAt)), true)
	head.setBigUint64(32, BigInt(xml.length), true)
	head.setBigUint64(40, BigInt(PAGE), true)
	void out
	return file
}

export const CARTESIAN = [
	{ name: 'cartesianX', type: 'Float' },
	{ name: 'cartesianY', type: 'Float' },
	{ name: 'cartesianZ', type: 'Float' },
]
