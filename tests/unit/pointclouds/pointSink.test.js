/**
 * Where a scan's points land: allocated once at the budget, thinned evenly when the file
 * holds more, and re-centred in double precision before they become 32-bit.
 */
import { PointSink } from '../../../src/pointclouds/pointSink.js'

const xs = (result) => Array.from({ length: result.count }, (_, i) => result.positions[i * 3])

test('re-centres in double precision', () => {
	const sink = new PointSink({ total: 2, budget: 10 })
	sink.add(500000.001, 4500000.000, 100)
	sink.add(500000.002, 4500000.000, 100)

	const result = sink.finish()

	expect(result.positions[3] - result.positions[0]).toBeCloseTo(0.001, 6)
	expect(result.origin).toEqual([500000.001, 4500000.000, 100])
})

test('a given origin is used instead of the first point', () => {
	const sink = new PointSink({ total: 1, budget: 10, origin: [100, 200, 300] })
	sink.add(101, 202, 303)

	expect(Array.from(sink.finish().positions)).toEqual([1, 2, 3])
})

test('keeps every point under the budget', () => {
	const sink = new PointSink({ total: 10, budget: 20 })
	for (let i = 0; i < 10; i++) sink.add(i, 0, 0)

	const result = sink.finish()

	expect(result.count).toBe(10)
	expect(result.total).toBe(10)
})

test('thins a known total evenly', () => {
	const sink = new PointSink({ total: 1000, budget: 250, origin: [0, 0, 0] })
	for (let i = 0; i < 1000; i++) sink.add(i, 0, 0)

	const result = sink.finish()

	expect(result.count).toBe(250)
	const kept = xs(result)
	expect(kept.slice(1).every((x, i) => x - kept[i] === 4)).toBe(true)
	expect(result.total).toBe(1000)
})

test('a file holding more points than its header said keeps no more than it allocated', () => {
	const sink = new PointSink({ total: 4, budget: 10 })
	for (let i = 0; i < 6; i++) sink.add(i, 0, 0)

	const result = sink.finish()

	expect(result.count).toBe(4)
	expect(result.total).toBe(6)
})

test('a file holding fewer points than its header said returns only those', () => {
	const sink = new PointSink({ total: 100, budget: 100 })
	for (let i = 0; i < 3; i++) sink.add(i, 0, 0)

	const result = sink.finish()

	expect(result.count).toBe(3)
	expect(result.positions).toHaveLength(9)
})

test('reservoir keeps exactly the budget for an unknown total, the same way each time', () => {
	const run = () => {
		const sink = new PointSink({ budget: 100 })
		for (let i = 0; i < 10000; i++) sink.add(i, i, i)
		return sink.finish()
	}

	const first = run()

	expect(first.count).toBe(100)
	expect(first.total).toBe(10000)
	expect(Array.from(run().positions)).toEqual(Array.from(first.positions))
	// Spread over the whole file, not only its start
	expect(Math.max(...xs(first))).toBeGreaterThan(5000)
})

test('attributes are kept beside their points', () => {
	const sink = new PointSink({ total: 2, budget: 2, attributes: { color: true, intensity: true, classification: true } })
	sink.add(0, 0, 0, 255, 128, 0, 1000, 2)
	sink.add(1, 0, 0, 0, 0, 255, 2000, 6)

	const result = sink.finish()

	expect(Array.from(result.colors)).toEqual([255, 128, 0, 0, 0, 255])
	expect(Array.from(result.intensity)).toEqual([1000, 2000])
	expect(Array.from(result.classification)).toEqual([2, 6])
})

test('attributes not asked for are not allocated', () => {
	const result = new PointSink({ total: 1, budget: 1 }).finish()

	expect(result.colors).toBeUndefined()
	expect(result.intensity).toBeUndefined()
	expect(result.classification).toBeUndefined()
})

test('bounds are the extremes, in re-centred space', () => {
	const sink = new PointSink({ total: 3, budget: 3, origin: [10, 10, 10] })
	sink.add(10, 12, 9)
	sink.add(14, 10, 10)
	sink.add(11, 11, 13)

	expect(sink.finish().bounds).toEqual({ min: [0, 0, -1], max: [4, 2, 3] })
})
