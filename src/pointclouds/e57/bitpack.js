/**
 * E57's bitpack codec: each point field is its own bytestream, split across the binary
 * section's packets. Integers are packed in the fewest bits their range needs, least
 * significant bit first, and run on from one packet into the next; floats are 4 or 8
 * little-endian bytes. A field whose range is one value takes no bits at all.
 */

export class FieldReader {
	/**
	 * @param {object} field - From e57Scans' prototype
	 */
	constructor(field) {
		this.field = field
		this.bits = field.type === 'Float' ? (field.single ? 32 : 64) : Math.ceil(Math.log2(field.max - field.min + 1))
		this.buffer = new Uint8Array(0)
		this.bit = 0
	}

	/** @param {Uint8Array} bytes - The field's part of one packet */
	push(bytes) {
		const start = this.bit >> 3
		const rest = this.buffer.subarray(start)
		const joined = new Uint8Array(rest.length + bytes.length)
		joined.set(rest)
		joined.set(bytes, rest.length)
		this.buffer = joined
		this.bit -= start * 8
	}

	/** @return {number} Whole values buffered */
	available() {
		return this.bits === 0 ? Infinity : Math.floor((this.buffer.length * 8 - this.bit) / this.bits)
	}

	/** @return {number} The next value, as the field means it */
	next() {
		const { field } = this
		if (field.type === 'Float') {
			const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + (this.bit >> 3))
			this.bit += this.bits
			return field.single ? view.getFloat32(0, true) : view.getFloat64(0, true)
		}
		let raw = 0
		for (let got = 0; got < this.bits;) {
			const byte = this.buffer[this.bit >> 3]
			const offset = this.bit & 7
			const take = Math.min(8 - offset, this.bits - got)
			raw += ((byte >> offset) & ((1 << take) - 1)) * 2 ** got
			got += take
			this.bit += take
		}
		const value = raw + field.min
		return field.type === 'ScaledInteger' ? value * field.scale + field.offset : value
	}
}
