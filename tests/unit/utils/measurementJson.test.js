/**
 * Measurements in the annotations JSON. Angles have a key of their own, so the 3.6 and
 * 3.7 import, which reads only `measurements` as point1 / point2, never sees them.
 */
import * as THREE from 'three'
import { measurementsFromJson, measurementsToJson } from '../../../src/utils/measurementJson.js'

const v = (x, y, z) => new THREE.Vector3(x, y, z)

// What useMeasurement lists
const listed = [
	{ type: 'distance', point1: v(0, 0, 0), point2: v(3, 4, 0), distance: 5 },
	{ type: 'angle', point1: v(1, 0, 0), vertex: v(0, 0, 0), point2: v(0, 1, 0), angle: 90 },
	{ type: 'distance', point1: v(1, 1, 1), point2: v(2, 2, 2) },
]

/** The 3.6.0 / 3.7.1 import, as shipped: every `measurements` entry is a distance. */
function oldImport(doc) {
	return (Array.isArray(doc.measurements) ? doc.measurements : [])
		.filter((m) => [m?.point1, m?.point2].every((p) => p && [p.x, p.y, p.z].every(Number.isFinite)))
		.map((m) => ({ type: 'distance', points: [m.point1, m.point2] }))
}

describe('measurementsToJson', () => {
	it('writes distances as before, and angles under their own key', () => {
		const out = measurementsToJson(listed)
		expect(out.measurements).toEqual([
			{ point1: { x: 0, y: 0, z: 0 }, point2: { x: 3, y: 4, z: 0 } },
			{ point1: { x: 1, y: 1, z: 1 }, point2: { x: 2, y: 2, z: 2 } },
		])
		expect(out.angles).toEqual([
			{ point1: { x: 1, y: 0, z: 0 }, vertex: { x: 0, y: 0, z: 0 }, point2: { x: 0, y: 1, z: 0 } },
		])
	})

	it('gives an older viewer only the distances, so no angle comes back as one', () => {
		const doc = JSON.parse(JSON.stringify({ version: 2, annotations: [], ...measurementsToJson(listed) }))
		expect(oldImport(doc)).toHaveLength(2)
	})
})

describe('measurementsFromJson', () => {
	it('reads back what it wrote', () => {
		const doc = JSON.parse(JSON.stringify(measurementsToJson(listed)))
		const { items, skipped } = measurementsFromJson(doc)
		expect(skipped).toBe(0)
		expect(items).toEqual([
			{ type: 'distance', points: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }] },
			{ type: 'distance', points: [{ x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 }] },
			{ type: 'angle', points: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] },
		])
	})

	it('reads a 3.6 / 3.7 file, which has distances only', () => {
		const doc = {
			version: 2,
			annotations: [],
			measurements: [{ point1: { x: 0, y: 0, z: 0 }, point2: { x: 0, y: 2, z: 0 } }],
		}
		expect(measurementsFromJson(doc)).toEqual({
			items: [{ type: 'distance', points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }] }],
			skipped: 0,
		})
	})

	it('skips an entry with a missing or non-numeric point, and anything that is not a list', () => {
		const doc = {
			measurements: [{ point1: { x: 0, y: 0, z: 0 } }, { point1: { x: 'a', y: 0, z: 0 }, point2: { x: 0, y: 0, z: 0 } }],
			angles: [{ point1: { x: 0, y: 0, z: 0 }, point2: { x: 1, y: 0, z: 0 } }, null],
		}
		expect(measurementsFromJson(doc)).toEqual({ items: [], skipped: 4 })
		expect(measurementsFromJson({ angles: 'nope' })).toEqual({ items: [], skipped: 0 })
		expect(measurementsFromJson(null)).toEqual({ items: [], skipped: 0 })
	})
})
