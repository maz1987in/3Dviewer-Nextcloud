/**
 * Writers for the three splat layouts the viewer opens, for the fixtures in
 * tests/fixtures/splats/. Each takes splats as plain values:
 * { position: [x, y, z], colour: [r, g, b] (0–1), opacity (0–1), scale (one size, in
 * metres), rotation: [w, x, y, z] }.
 *
 * - `.splat`: antimatter15/splat (MIT), 32 bytes a splat.
 * - `.ply`: the 3D Gaussian Splatting layout (graphdeco-inria), as its training writes it.
 * - `.spz`: Niantic's spz (MIT), version 2, gzipped.
 */
import zlib from 'node:zlib'

/** The zeroth spherical-harmonic basis: colour = 0.5 + SH_C0 × f_dc. */
const SH_C0 = 0.28209479177387814

const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)))
const logit = (p) => Math.log(p / (1 - p))

/**
 * @param {object[]} splats - The splats
 * @return {Uint8Array} A .splat file
 */
export function splatFile(splats) {
	const out = new Uint8Array(splats.length * 32)
	const view = new DataView(out.buffer)
	splats.forEach((s, i) => {
		const at = i * 32
		s.position.forEach((v, k) => view.setFloat32(at + k * 4, v, true))
		for (let k = 0; k < 3; k++) {
			view.setFloat32(at + 12 + k * 4, s.scale, true)
		}
		s.colour.forEach((v, k) => { out[at + 24 + k] = clampByte(v * 255) })
		out[at + 27] = clampByte(s.opacity * 255)
		s.rotation.forEach((v, k) => { out[at + 28 + k] = clampByte(v * 128 + 128) })
	})
	return out
}

/**
 * @param {object[]} splats - The splats
 * @param {object} [options] - How to write them
 * @param {0|3} [options.sh] - Spherical-harmonic degree; 3 writes 45 zero coefficients
 * @return {Uint8Array} A binary little-endian 3DGS .ply file
 */
export function splatPly(splats, { sh = 0 } = {}) {
	const names = ['x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2']
	if (sh === 3) {
		for (let k = 0; k < 45; k++) {
			names.push(`f_rest_${k}`)
		}
	}
	names.push('opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3')
	const header = new TextEncoder().encode(['ply', 'format binary_little_endian 1.0', `element vertex ${splats.length}`, ...names.map((n) => `property float ${n}`), 'end_header', ''].join('\n'))
	const body = new DataView(new ArrayBuffer(splats.length * names.length * 4))
	splats.forEach((s, i) => {
		const values = [...s.position, 0, 0, 0, ...s.colour.map((c) => (c - 0.5) / SH_C0)]
		if (sh === 3) {
			values.push(...new Array(45).fill(0))
		}
		values.push(logit(s.opacity), Math.log(s.scale), Math.log(s.scale), Math.log(s.scale), ...s.rotation)
		values.forEach((v, k) => body.setFloat32((i * names.length + k) * 4, v, true))
	})
	const out = new Uint8Array(header.length + body.byteLength)
	out.set(header)
	out.set(new Uint8Array(body.buffer), header.length)
	return out
}

/**
 * @param {object[]} splats - The splats
 * @return {Uint8Array} An .spz file: version 2, degree 0, 12 fractional bits, gzipped
 */
export function spzFile(splats) {
	const n = splats.length
	const FRACTIONAL_BITS = 12
	const raw = new Uint8Array(16 + n * 19)
	const view = new DataView(raw.buffer)
	view.setUint32(0, 0x5053474e, true)
	view.setUint32(4, 2, true)
	view.setUint32(8, n, true)
	raw[12] = 0
	raw[13] = FRACTIONAL_BITS
	raw[14] = 0
	raw[15] = 0
	const positions = 16
	const alphas = positions + n * 9
	const colours = alphas + n
	const scales = colours + n * 3
	const rotations = scales + n * 3
	splats.forEach((s, i) => {
		s.position.forEach((v, k) => {
			const fixed = Math.round(v * (1 << FRACTIONAL_BITS)) & 0xffffff
			const at = positions + (i * 3 + k) * 3
			raw[at] = fixed & 0xff
			raw[at + 1] = (fixed >> 8) & 0xff
			raw[at + 2] = (fixed >> 16) & 0xff
		})
		raw[alphas + i] = clampByte(s.opacity * 255)
		s.colour.forEach((c, k) => { raw[colours + i * 3 + k] = clampByte(((c - 0.5) / SH_C0) * 0.15 * 255 + 127.5) })
		for (let k = 0; k < 3; k++) {
			raw[scales + i * 3 + k] = clampByte((Math.log(s.scale) + 10) * 16)
		}
		// x y z of the unit quaternion whose w is not negative
		const [w, x, y, z] = s.rotation
		const sign = w < 0 ? -1 : 1
		;[x, y, z].forEach((v, k) => { raw[rotations + i * 3 + k] = clampByte(sign * v * 127.5 + 127.5) })
	})
	return new Uint8Array(zlib.gzipSync(raw))
}
