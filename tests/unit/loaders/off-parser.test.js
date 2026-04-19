/**
 * Unit tests for the OFF (Object File Format) parser.
 *
 * The loader itself exercises three.js via processModel(); here we test the
 * pure parsing path — input text → BufferGeometry attributes — so we can run
 * in jsdom without touching GPU-only code paths.
 */
import OffLoader from '../../../src/loaders/types/off.js'

function makeLoader() {
	return new OffLoader()
}

describe('OFF parser', () => {
	test('parses the canonical tetrahedron example', () => {
		const text = `OFF
4 4 0
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
0.0 0.0 1.0
3 0 1 2
3 0 2 3
3 0 3 1
3 1 3 2
`
		const { geometry, hasColors } = makeLoader().parse(text)

		expect(hasColors).toBe(false)
		// 4 triangles × 3 verts each = 12 position vertices (non-indexed)
		expect(geometry.attributes.position.count).toBe(12)
		expect(geometry.attributes.color).toBeUndefined()
	})

	test('triangulates an N-gon face via fan decomposition', () => {
		// Single 5-vertex face → 3 triangles → 9 position vertices
		const text = `OFF
5 1 0
0 0 0
1 0 0
2 0 0
2 1 0
0 1 0
5 0 1 2 3 4
`
		const { geometry } = makeLoader().parse(text)
		expect(geometry.attributes.position.count).toBe(9)
	})

	test('ignores inline comments and blank lines', () => {
		const text = `OFF
# tetrahedron with comments
3 1 0
  # verts follow
0 0 0
1 0 0
0 1 0

3 0 1 2
`
		const { geometry } = makeLoader().parse(text)
		expect(geometry.attributes.position.count).toBe(3)
	})

	test('reads COFF per-vertex float colors', () => {
		const text = `COFF
3 1 0
0 0 0  1.0 0.0 0.0
1 0 0  0.0 1.0 0.0
0 1 0  0.0 0.0 1.0
3 0 1 2
`
		const { geometry, hasColors } = makeLoader().parse(text)
		expect(hasColors).toBe(true)
		expect(geometry.attributes.color.count).toBe(3)
		const c = geometry.attributes.color.array
		// Fan-triangulated single triangle → 3 output verts in 0,1,2 order
		expect(c[0]).toBeCloseTo(1.0)
		expect(c[1]).toBeCloseTo(0.0)
		expect(c[2]).toBeCloseTo(0.0)
		expect(c[3 + 1]).toBeCloseTo(1.0) // second vert green
		expect(c[6 + 2]).toBeCloseTo(1.0) // third vert blue
	})

	test('normalizes COFF integer (0-255) colors to 0-1', () => {
		const text = `COFF
3 1 0
0 0 0  255 0 0
1 0 0  0 255 0
0 1 0  0 0 255
3 0 1 2
`
		const { geometry, hasColors } = makeLoader().parse(text)
		expect(hasColors).toBe(true)
		const c = geometry.attributes.color.array
		expect(c[0]).toBeCloseTo(1.0)
		expect(c[3 + 1]).toBeCloseTo(1.0)
		expect(c[6 + 2]).toBeCloseTo(1.0)
	})

	test('rejects non-OFF input', () => {
		expect(() => makeLoader().parse('not an OFF file\n'))
			.toThrow(/Not an OFF file/)
	})

	test('rejects binary OFF', () => {
		expect(() => makeLoader().parse('OFF BINARY\n'))
			.toThrow(/Binary OFF/)
	})

	test('rejects zero-geometry header', () => {
		expect(() => makeLoader().parse('OFF\n0 0 0\n'))
			.toThrow(/empty geometry/)
	})

	test('rejects degenerate (<3-vertex) faces', () => {
		const text = `OFF
3 1 0
0 0 0
1 0 0
2 0 0
2 0 1
`
		expect(() => makeLoader().parse(text)).toThrow(/≥ 3/)
	})
})
