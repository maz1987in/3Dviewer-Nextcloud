/**
 * @jest-environment node
 */
/**
 * XYZ scans: text, a point per line, in whatever separators the exporter chose. A
 * chemistry .xyz (atom count, comment, then element symbols) is not a scan.
 */
import { NotAScanError } from '../../../src/pointclouds/scanFormats.js'
import { read } from '../../../src/pointclouds/readers/xyz.js'

const blob = (text) => new Blob([text])
const first = (sink) => Array.from(sink.positions.slice(0, 3))

test('reads x y z with spaces, tabs, commas or semicolons', async () => {
	for (const sep of [' ', '\t', ',', ';', ' , ']) {
		const { sink, format, unit } = await read(blob(`1${sep}2${sep}3\n4${sep}6${sep}8\n`), { budget: 10 })
		expect(sink.count).toBe(2)
		expect(sink.origin).toEqual([1, 2, 3])
		expect(Array.from(sink.positions)).toEqual([0, 0, 0, 3, 4, 5])
		expect(format).toBe('xyz')
		expect(unit).toBeNull()
	}
})

test('reads rgb as 0–255', async () => {
	const { sink } = await read(blob('0 0 0 255 128 0\n1 1 1 0 64 255\n'), { budget: 10 })

	expect(Array.from(sink.colors)).toEqual([255, 128, 0, 0, 64, 255])
	expect(sink.intensity).toBeUndefined()
})

test('reads rgb as 0–1 when every value in the first window is', async () => {
	const { sink } = await read(blob('0 0 0 1 0.5 0\n1 1 1 0 0.25 1\n'), { budget: 10 })

	expect(Array.from(sink.colors)).toEqual([255, 128, 0, 0, 64, 255])
})

test('reads intensity in a fourth column', async () => {
	const { sink } = await read(blob('0 0 0 100\n1 1 1 2000\n'), { budget: 10 })

	expect(Array.from(sink.intensity)).toEqual([100, 2000])
	expect(sink.colors).toBeUndefined()
})

test('skips a count header, # comments, a column header and blank lines', async () => {
	const { sink } = await read(blob('3\n# exported\nX Y Z\n\n1 2 3\r\n4 5 6\r\n7 8 9'), { budget: 10 })

	expect(sink.count).toBe(3)
	expect(first(sink)).toEqual([0, 0, 0])
	expect(sink.total).toBe(3)
})

test('refuses a chemistry file', async () => {
	await expect(read(blob('3\nwater\nO 0 0 0\nH 0.76 0.59 0\nH -0.76 0.59 0\n'), { budget: 10 })).rejects.toBeInstanceOf(NotAScanError)
})

test('a file of text with no points is refused', async () => {
	await expect(read(blob('hello\nworld\n'), { budget: 10 })).rejects.toThrow('no points')
})

test('thins an unknown total with the reservoir', async () => {
	const lines = Array.from({ length: 5000 }, (_, i) => `${i} ${i} ${i}`).join('\n')

	const { sink } = await read(blob(lines), { budget: 1000 })

	expect(sink.count).toBe(1000)
	expect(sink.total).toBe(5000)
})

test('a point split across two reading windows is read whole', async () => {
	const lines = Array.from({ length: 300 }, (_, i) => `${i}.25 ${i}.5 ${i}.75`).join('\n')

	const { sink } = await read(blob(lines), { budget: 1000, windowBytes: 64 })

	expect(sink.count).toBe(300)
	expect(sink.positions[299 * 3]).toBeCloseTo(299, 5)
})

test('reports progress and stops when aborted', async () => {
	const lines = Array.from({ length: 300 }, (_, i) => `${i} ${i} ${i}`).join('\n')
	const seen = []
	await read(blob(lines), { budget: 1000, windowBytes: 256, onProgress: (f) => seen.push(f) })
	expect(seen.length).toBeGreaterThan(1)
	expect(seen.at(-1)).toBe(1)

	const controller = new AbortController()
	controller.abort()
	await expect(read(blob(lines), { budget: 10, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
})

test('a file with no line breaks is refused, not held whole', async () => {
	const oneLine = '1 2 3\r'.repeat(40000)

	await expect(read(blob(oneLine), { budget: 10, windowBytes: 4096 })).rejects.toThrow('line')
})
