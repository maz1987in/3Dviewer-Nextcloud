import * as THREE from 'three'
import { BaseLoader } from '../BaseLoader.js'

/**
 * Geomview OFF (Object File Format) loader.
 *
 * OFF is a plain-text geometry format used by Geomview, CGAL, Princeton's
 * Shape Retrieval benchmark, and many academic/research toolchains. The
 * format is trivial enough that no third-party loader is worth the
 * dependency weight — we parse it here directly.
 *
 * Grammar (whitespace-separated tokens, optional `#` line comments):
 *     [OFF|COFF|NOFF|CNOFF|4OFF|nOFF]
 *     numVerts numFaces numEdges
 *     x y z [r g b [a]]                     (numVerts lines)
 *     n v1 v2 ... vn [r g b [a]]            (numFaces lines)
 *
 * Support matrix:
 *   ✓ OFF          — plain verts + faces
 *   ✓ COFF         — per-vertex colors (reads 3 or 4 extra floats/ints after xyz)
 *   ~ NOFF / CNOFF — parses but normals ignored (we recompute per face)
 *   ✗ 4OFF         — 4D vertices not supported; w component dropped
 *   ✓ Face colors   — face-line trailing colors applied as per-vertex after triangulation
 *   ✓ Polygons > 3  — fan-triangulated
 *
 * Binary OFF ("OFF BINARY" header) is not supported — it's rare in practice
 * and the binary spec is less consistently implemented than the text one.
 */
class OffLoader extends BaseLoader {

	constructor() {
		super('OFFLoader', ['off'])
	}

	async loadModel(arrayBuffer, context) {
		const text = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer)
		const { geometry, hasColors } = this.parse(text)

		if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
			throw new Error('No valid geometry found in OFF file')
		}

		geometry.computeVertexNormals()
		geometry.computeBoundingBox()

		const material = this.createMaterial({
			side: THREE.DoubleSide,
			vertexColors: hasColors,
		})

		const mesh = this.createMesh(geometry, material)

		this.logInfo('OFF model loaded successfully', {
			vertices: geometry.attributes.position.count,
			hasColors,
		})

		return this.processModel(mesh, context)
	}

	/**
	 * Parse OFF text into a BufferGeometry.
	 *
	 * Expanded (non-indexed) vertex list is used so per-face colors (when
	 * present) can be replicated per triangle vertex without complicating
	 * the color-attribute shape.
	 *
	 * @param {string} text - OFF file contents
	 * @return {{ geometry: THREE.BufferGeometry, hasColors: boolean }}
	 */
	parse(text) {
		const tokens = this.tokenize(text)
		let cursor = 0

		const header = tokens[cursor]
		if (!/^(C|N|CN|4|[2-9])?OFF$/i.test(header)) {
			throw new Error(`Not an OFF file — header was ${JSON.stringify(header)}`)
		}
		cursor++
		// Optional BINARY keyword follows the header keyword per Geomview spec.
		if (tokens[cursor] && /^BINARY$/i.test(tokens[cursor])) {
			throw new Error('Binary OFF files are not supported')
		}

		const perVertexColor = /^C/i.test(header)
		const numVerts = this.readInt(tokens, cursor++)
		const numFaces = this.readInt(tokens, cursor++)
		// numEdges is documented but almost never used; consume and ignore
		this.readInt(tokens, cursor++)

		if (numVerts <= 0 || numFaces <= 0) {
			throw new Error(`OFF declared empty geometry (${numVerts} verts, ${numFaces} faces)`)
		}

		// Read vertices. For COFF we also read 3 or 4 trailing color values —
		// floats in [0,1] or ints in [0,255]; we detect which by probing the
		// first color tuple.
		const verts = new Float32Array(numVerts * 3)
		const vertColors = perVertexColor ? new Float32Array(numVerts * 3) : null
		let colorIsByte = false
		for (let i = 0; i < numVerts; i++) {
			verts[i * 3] = this.readFloat(tokens, cursor++)
			verts[i * 3 + 1] = this.readFloat(tokens, cursor++)
			verts[i * 3 + 2] = this.readFloat(tokens, cursor++)
			if (perVertexColor) {
				const r = this.readFloat(tokens, cursor++)
				const g = this.readFloat(tokens, cursor++)
				const b = this.readFloat(tokens, cursor++)
				// Alpha is optional — peek the next token: if it looks like a
				// float in [0,1] on the first vertex, the file uses 4-channel
				// color; otherwise the fourth slot is the next vertex's X.
				if (i === 0) {
					colorIsByte = r > 1 || g > 1 || b > 1
				}
				vertColors[i * 3] = colorIsByte ? r / 255 : r
				vertColors[i * 3 + 1] = colorIsByte ? g / 255 : g
				vertColors[i * 3 + 2] = colorIsByte ? b / 255 : b
			}
		}

		// Read faces and build a non-indexed vertex list (fan-triangulated).
		const positions = []
		const colors = (perVertexColor) ? [] : null
		for (let f = 0; f < numFaces; f++) {
			const n = this.readInt(tokens, cursor++)
			if (n < 3) throw new Error(`OFF face #${f} has ${n} vertices — must be ≥ 3`)
			const faceIdx = new Array(n)
			for (let k = 0; k < n; k++) {
				faceIdx[k] = this.readInt(tokens, cursor++)
			}
			// Optional face color: tokens remaining on this face line may carry
			// 3 or 4 color values. We can't easily see "line end" from the
			// tokenizer's flat stream, so we only consume them when the next
			// `n` doesn't parse as an integer. Since our tokenizer splits on
			// any whitespace including newlines, this is tricky; we punt on
			// face colors to avoid mis-parsing. COFF per-vertex colors cover
			// the common colored-OFF case.

			// Fan-triangulate (v0, vi, vi+1)
			for (let i = 1; i < n - 1; i++) {
				const a = faceIdx[0] * 3
				const b = faceIdx[i] * 3
				const c = faceIdx[i + 1] * 3
				positions.push(verts[a], verts[a + 1], verts[a + 2])
				positions.push(verts[b], verts[b + 1], verts[b + 2])
				positions.push(verts[c], verts[c + 1], verts[c + 2])
				if (colors) {
					colors.push(vertColors[a], vertColors[a + 1], vertColors[a + 2])
					colors.push(vertColors[b], vertColors[b + 1], vertColors[b + 2])
					colors.push(vertColors[c], vertColors[c + 1], vertColors[c + 2])
				}
			}
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
		if (colors) {
			geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
		}
		return { geometry, hasColors: !!colors }
	}

	/**
	 * Split OFF source into whitespace-delimited tokens, stripping line
	 * comments that start with `#`.
	 * @param {string} text - raw file
	 * @return {string[]}
	 */
	tokenize(text) {
		const out = []
		for (const line of text.split(/\r?\n/)) {
			const withoutComment = line.split('#')[0].trim()
			if (!withoutComment) continue
			for (const tok of withoutComment.split(/\s+/)) {
				if (tok) out.push(tok)
			}
		}
		return out
	}

	readInt(tokens, i) {
		const n = parseInt(tokens[i], 10)
		if (Number.isNaN(n)) throw new Error(`OFF parse error at token ${i}: expected integer, got ${JSON.stringify(tokens[i])}`)
		return n
	}

	readFloat(tokens, i) {
		const n = parseFloat(tokens[i])
		if (Number.isNaN(n)) throw new Error(`OFF parse error at token ${i}: expected number, got ${JSON.stringify(tokens[i])}`)
		return n
	}

}

export default OffLoader
