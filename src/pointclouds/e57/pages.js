/**
 * E57's pages (ASTM E2807 §7): the file is pages of `pageSize` bytes, each ending in a
 * 4-byte CRC-32C, and every offset the file gives is physical, into the pages. What they
 * hold, the logical stream, is the pages with their checksums taken out. The checksums
 * aren't verified: a damaged file fails on what it says instead.
 */
import { ScanError } from '../scanFormats.js'

const CRC_BYTES = 4

/**
 * @param {Blob} blob - The file
 * @return {Promise<{pageSize: number, xmlOffset: number, xmlLength: number}>} Its header
 */
export async function e57Header(blob) {
	const view = new DataView(await blob.slice(0, 48).arrayBuffer())
	const signature = view.byteLength === 48 && String.fromCharCode(...new Uint8Array(view.buffer, 0, 8))
	if (signature !== 'ASTM-E57') {
		throw new ScanError('it isn\'t an E57 file')
	}
	const pageSize = Number(view.getBigUint64(40, true))
	if (pageSize < 64 || pageSize > 1024 * 1024) {
		throw new ScanError('its page size is one E57 doesn\'t have')
	}
	return { pageSize, xmlOffset: Number(view.getBigUint64(24, true)), xmlLength: Number(view.getBigUint64(32, true)) }
}

/**
 * Reads the logical stream from a physical offset onwards, a window of pages at a time.
 */
export class LogicalStream {
	/**
	 * @param {Blob} blob - The file
	 * @param {number} physical - Where to start
	 * @param {number} pageSize - From e57Header
	 */
	constructor(blob, physical, pageSize) {
		this.blob = blob
		this.pageSize = pageSize
		this.next = physical
		this.buffer = new Uint8Array(0)
		this.at = 0
		this.consumed = 0
	}

	async fill(bytes) {
		const payload = this.pageSize - CRC_BYTES
		while (this.buffer.length - this.at < bytes) {
			if (this.next >= this.blob.size) {
				throw new ScanError('its data is cut short')
			}
			// Whole pages from here, up to a megabyte
			const end = Math.min(this.blob.size, (Math.floor(this.next / this.pageSize) + Math.max(1, Math.floor(1024 ** 2 / this.pageSize))) * this.pageSize)
			const raw = new Uint8Array(await this.blob.slice(this.next, end).arrayBuffer())
			const parts = [this.buffer.subarray(this.at)]
			let page = Math.floor(this.next / this.pageSize) * this.pageSize
			for (let p = this.next; p < end;) {
				const stop = Math.min(end, page + payload)
				if (p < stop) {
					parts.push(raw.subarray(p - this.next, stop - this.next))
				}
				page += this.pageSize
				p = page
			}
			const total = parts.reduce((n, part) => n + part.length, 0)
			this.buffer = new Uint8Array(total)
			let o = 0
			for (const part of parts) {
				this.buffer.set(part, o)
				o += part.length
			}
			this.at = 0
			this.next = end
		}
	}

	/**
	 * @param {number} bytes - How many
	 * @return {Promise<Uint8Array>} The next logical bytes
	 */
	async read(bytes) {
		await this.fill(bytes)
		const out = this.buffer.subarray(this.at, this.at + bytes)
		this.at += bytes
		this.consumed += bytes
		return out
	}
}
