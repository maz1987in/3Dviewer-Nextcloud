/**
 * LAZ's chunks: where each starts and how many points it holds, from the chunk table at
 * the end of the point data. The table is written with LASzip's arithmetic coder, so
 * reading it needs a decoder of its own; laz-perf decodes the chunks themselves but says
 * nothing about where one ends.
 *
 * The arithmetic decoder, its adaptive models and the integer decompressor are ported
 * from LASzip (arithmeticdecoder.cpp, arithmeticmodel.cpp, integercompressor.cpp;
 * Apache-2.0 since 2022, as are laz-rs and laz-perf). Every quantity in them is an
 * unsigned 32-bit integer, kept so here with `>>> 0`.
 */
import { readRange } from '../blobReader.js'
import { ScanError } from '../scanFormats.js'

const AC_MIN_LENGTH = 0x01000000
const AC_MAX_LENGTH = 0xffffffff
const BM_LENGTH_SHIFT = 13
const BM_MAX_COUNT = 1 << BM_LENGTH_SHIFT
const DM_LENGTH_SHIFT = 15
const DM_MAX_COUNT = 1 << DM_LENGTH_SHIFT

/** An adaptive model of one bit. */
class BitModel {
	constructor() {
		this.bit0Count = 1
		this.bitCount = 2
		this.bit0Prob = 1 << (BM_LENGTH_SHIFT - 1)
		this.updateCycle = 4
		this.bitsUntilUpdate = 4
	}

	update() {
		if ((this.bitCount += this.updateCycle) > BM_MAX_COUNT) {
			this.bitCount = (this.bitCount + 1) >>> 1
			this.bit0Count = (this.bit0Count + 1) >>> 1
			if (this.bit0Count === this.bitCount) {
				++this.bitCount
			}
		}
		const scale = Math.floor(0x80000000 / this.bitCount)
		this.bit0Prob = (this.bit0Count * scale) >>> (31 - BM_LENGTH_SHIFT)
		this.updateCycle = Math.min(64, (5 * this.updateCycle) >>> 2)
		this.bitsUntilUpdate = this.updateCycle
	}
}

/** An adaptive model of `symbols` symbols, as decoding uses it. */
class SymbolModel {
	constructor(symbols) {
		if (symbols < 2 || symbols > 2048) {
			throw new ScanError('its compressed data asks for a model LASzip doesn\'t have')
		}
		this.symbols = symbols
		this.lastSymbol = symbols - 1
		if (symbols > 16) {
			let tableBits = 3
			while (symbols > (1 << (tableBits + 2))) {
				++tableBits
			}
			this.tableSize = 1 << tableBits
			this.tableShift = DM_LENGTH_SHIFT - tableBits
			this.decoderTable = new Uint32Array(this.tableSize + 2)
		} else {
			this.decoderTable = null
			this.tableSize = 0
			this.tableShift = 0
		}
		this.distribution = new Uint32Array(symbols)
		this.symbolCount = new Uint32Array(symbols).fill(1)
		this.totalCount = 0
		this.updateCycle = symbols
		this.update()
		this.symbolsUntilUpdate = this.updateCycle = (symbols + 6) >>> 1
	}

	update() {
		if ((this.totalCount += this.updateCycle) > DM_MAX_COUNT) {
			this.totalCount = 0
			for (let n = 0; n < this.symbols; n++) {
				this.totalCount += (this.symbolCount[n] = (this.symbolCount[n] + 1) >>> 1)
			}
		}
		const scale = Math.floor(0x80000000 / this.totalCount)
		let sum = 0
		let s = 0
		for (let k = 0; k < this.symbols; k++) {
			this.distribution[k] = (scale * sum) >>> (31 - DM_LENGTH_SHIFT)
			sum += this.symbolCount[k]
			if (this.decoderTable) {
				const w = this.distribution[k] >>> this.tableShift
				while (s < w) {
					this.decoderTable[++s] = k - 1
				}
			}
		}
		if (this.decoderTable) {
			this.decoderTable[0] = 0
			while (s <= this.tableSize) {
				this.decoderTable[++s] = this.symbols - 1
			}
		}
		this.updateCycle = Math.min((this.symbols + 6) << 3, (5 * this.updateCycle) >>> 2)
		this.symbolsUntilUpdate = this.updateCycle
	}
}

/** LASzip's arithmetic decoder, over bytes in memory. */
export class ArithmeticDecoder {
	/**
	 * @param {Uint8Array} bytes - The coded data
	 */
	constructor(bytes) {
		this.bytes = bytes
		this.at = 0
		this.value = ((this.byte() << 24) | (this.byte() << 16) | (this.byte() << 8) | this.byte()) >>> 0
		this.length = AC_MAX_LENGTH
	}

	byte() {
		if (this.at >= this.bytes.length) {
			throw new ScanError('its chunk table is cut short')
		}
		return this.bytes[this.at++]
	}

	renormalise() {
		do {
			this.value = ((this.value << 8) | this.byte()) >>> 0
			this.length = (this.length * 256) >>> 0
		} while (this.length < AC_MIN_LENGTH)
	}

	/** @param {BitModel} m - Its model */
	decodeBit(m) {
		const x = m.bit0Prob * (this.length >>> BM_LENGTH_SHIFT)
		let symbol
		if (this.value < x) {
			this.length = x >>> 0
			++m.bit0Count
			symbol = 0
		} else {
			this.value = (this.value - x) >>> 0
			this.length = (this.length - x) >>> 0
			symbol = 1
		}
		if (this.length < AC_MIN_LENGTH) {
			this.renormalise()
		}
		if (--m.bitsUntilUpdate === 0) {
			m.update()
		}
		return symbol
	}

	/** @param {SymbolModel} m - Its model */
	decodeSymbol(m) {
		let symbol
		let x
		let y = this.length
		if (m.decoderTable) {
			this.length = this.length >>> DM_LENGTH_SHIFT
			const dv = Math.floor(this.value / this.length)
			const t = dv >>> m.tableShift
			symbol = m.decoderTable[t]
			let n = m.decoderTable[t + 1] + 1
			while (n > symbol + 1) {
				const k = (symbol + n) >>> 1
				if (m.distribution[k] > dv) {
					n = k
				} else {
					symbol = k
				}
			}
			x = m.distribution[symbol] * this.length
			if (symbol !== m.lastSymbol) {
				y = m.distribution[symbol + 1] * this.length
			}
		} else {
			x = symbol = 0
			this.length = this.length >>> DM_LENGTH_SHIFT
			let n = m.symbols
			let k = n >>> 1
			do {
				const z = this.length * m.distribution[k]
				if (z > this.value) {
					n = k
					y = z
				} else {
					symbol = k
					x = z
				}
			} while ((k = (symbol + n) >>> 1) !== symbol)
		}
		this.value = (this.value - x) >>> 0
		this.length = (y - x) >>> 0
		if (this.length < AC_MIN_LENGTH) {
			this.renormalise()
		}
		++m.symbolCount[symbol]
		if (--m.symbolsUntilUpdate === 0) {
			m.update()
		}
		return symbol
	}

	/** @param {number} bits - 1 to 32 raw bits */
	readBits(bits) {
		if (bits > 19) {
			const low = this.readShort()
			return ((this.readBits(bits - 16) * 65536) + low) >>> 0
		}
		this.length = this.length >>> bits
		const symbol = Math.floor(this.value / this.length)
		this.value = (this.value - this.length * symbol) >>> 0
		if (this.length < AC_MIN_LENGTH) {
			this.renormalise()
		}
		return symbol
	}

	readShort() {
		return this.readBits(16)
	}
}

/**
 * LASzip's IntegerCompressor, decompressing: a value as its difference from a prediction.
 */
export class IntegerDecompressor {
	/**
	 * @param {ArithmeticDecoder} decoder - Where the bits come from
	 * @param {number} bits - Width of the values
	 * @param {number} contexts - Separately modelled kinds of value
	 * @param {number} [bitsHigh] - Corrector bits modelled; the rest are raw
	 */
	constructor(decoder, bits, contexts, bitsHigh = 8) {
		this.decoder = decoder
		this.bitsHigh = bitsHigh
		if (bits && bits < 32) {
			this.corrBits = bits
			this.corrRange = 2 ** bits
			this.corrMin = -(this.corrRange / 2)
		} else {
			this.corrBits = 32
			this.corrRange = 0
			this.corrMin = -0x80000000
		}
		this.bitsModels = Array.from({ length: contexts }, () => new SymbolModel(this.corrBits + 1))
		this.corrector = [new BitModel()]
		for (let i = 1; i <= this.corrBits; i++) {
			this.corrector[i] = new SymbolModel(2 ** Math.min(i, bitsHigh))
		}
	}

	/**
	 * @param {number} prediction - What the value is expected to be
	 * @param {number} context - Which model
	 * @return {number} The value
	 */
	decompress(prediction, context) {
		let real = prediction + this.readCorrector(this.bitsModels[context])
		if (this.corrRange) {
			if (real < 0) {
				real += this.corrRange
			} else if (real >= this.corrRange) {
				real -= this.corrRange
			}
		} else {
			real |= 0
		}
		return real
	}

	readCorrector(model) {
		const k = this.decoder.decodeSymbol(model)
		if (k === 0) {
			return this.decoder.decodeBit(this.corrector[0])
		}
		if (k >= 32) {
			return this.corrMin
		}
		let c
		if (k <= this.bitsHigh) {
			c = this.decoder.decodeSymbol(this.corrector[k])
		} else {
			const raw = k - this.bitsHigh
			c = this.decoder.decodeSymbol(this.corrector[k]) * (2 ** raw) + this.decoder.readBits(raw)
		}
		// Back to its interval: [-(2^k - 1), -2^(k-1)] or [2^(k-1), 2^k]
		return c >= 2 ** (k - 1) ? c + 1 : c - (2 ** k - 1)
	}
}

/**
 * LASzip's record, the `laszip encoded` VLR 22204: the compressor, the chunk size and the
 * items it compresses.
 *
 * @param {object} header - From lasHeader
 * @return {{compressor: number, chunkSize: number}} What the chunk table needs
 */
export function laszipRecord(header) {
	const vlr = header.vlrs.find((v) => v.userId === 'laszip encoded' && v.recordId === 22204)
	if (!vlr || vlr.data.length < 16) {
		throw new ScanError('it is compressed but has no LASzip record')
	}
	const view = new DataView(vlr.data.buffer, vlr.data.byteOffset, vlr.data.byteLength)
	return { compressor: view.getUint16(0, true), chunkSize: view.getUint32(12, true) }
}

/** The most points a compressed byte can hold: far more than LASzip ever packs. */
const MAX_POINTS_PER_BYTE = 64
/** The most coded bytes one chunk's table entry takes: two 32-bit corrections and their models. */
const MAX_TABLE_BYTES_PER_CHUNK = 16

/**
 * The chunks a file claims, checked before any is decoded: together they hold no more
 * points than the header says, and none claims more than its bytes could hold.
 *
 * @param {Array<{byteCount: number, pointCount: number}>} chunks - From the chunk table
 * @param {{pointCount: number}} header - From lasHeader
 * @throws {ScanError} When they don't add up
 */
export function checkChunks(chunks, header) {
	let total = 0
	for (const { byteCount, pointCount } of chunks) {
		if (pointCount > byteCount * MAX_POINTS_PER_BYTE) {
			throw new ScanError('its chunk table is damaged')
		}
		total += pointCount
	}
	if (total > header.pointCount) {
		throw new ScanError('its chunk table is damaged')
	}
}

/**
 * @param {Blob} blob - The file
 * @param {object} header - From lasHeader
 * @return {Promise<Array<{start: number, byteCount: number, pointCount: number}>>} The chunks, in order
 */
export async function readChunkTable(blob, header) {
	const { compressor, chunkSize } = laszipRecord(header)
	// 1 is LASzip's unchunked compressor: the whole file is one chunk with no table
	const dataStart = header.offsetToPoints + 8
	if (compressor === 1) {
		return [{ start: header.offsetToPoints, byteCount: blob.size - header.offsetToPoints, pointCount: header.pointCount }]
	}
	let tableAt = Number((await readRange(blob, header.offsetToPoints, 8)).getBigInt64(0, true))
	// A writer that couldn't seek back puts the table's offset in the file's last 8 bytes
	if (tableAt === -1) {
		tableAt = Number((await readRange(blob, blob.size - 8, 8)).getBigInt64(0, true))
	}
	if (!(tableAt >= dataStart && tableAt + 8 <= blob.size)) {
		throw new ScanError('its chunk table is missing')
	}
	const head = await readRange(blob, tableAt, 8)
	const count = head.getUint32(4, true)
	const variable = chunkSize === 0xffffffff
	// Every chunk takes at least a byte between the data's start and the table, and its
	// table entry a few bytes: anything more is a file claiming what it can't hold
	if (count === 0 || count > header.pointCount + 1 || count > tableAt - dataStart) {
		throw new ScanError('its chunk table is damaged')
	}
	const coded = new Uint8Array(await blob.slice(tableAt + 8, Math.min(blob.size, tableAt + 8 + count * MAX_TABLE_BYTES_PER_CHUNK + 64)).arrayBuffer())
	const decoder = new ArithmeticDecoder(coded)
	const ic = new IntegerDecompressor(decoder, 32, 2)
	const chunks = []
	let start = dataStart
	let previousCount = 0
	let previousBytes = 0
	let remaining = header.pointCount
	for (let i = 0; i < count; i++) {
		const pointCount = variable ? (previousCount = ic.decompress(previousCount, 0)) : Math.min(chunkSize, remaining)
		const byteCount = previousBytes = ic.decompress(previousBytes, 1)
		if (byteCount <= 0 || start + byteCount > tableAt || pointCount < 0 || pointCount > byteCount * MAX_POINTS_PER_BYTE) {
			throw new ScanError('its chunk table is damaged')
		}
		chunks.push({ start, byteCount, pointCount })
		start += byteCount
		remaining -= pointCount
	}
	checkChunks(chunks, header)
	return chunks
}
