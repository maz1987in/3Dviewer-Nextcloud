/**
 * Angle measurement, and the objects each measurement leaves in the scene.
 *
 * An angle takes three clicks, the middle one being the vertex. It draws three markers,
 * two legs and one label, so the scene objects can no longer be found by a measurement's
 * position in a list of pairs — each measurement owns its own, and deleting one removes
 * exactly those.
 */

const THREE = require('three')
const {
	useMeasurement,
	computeAngle,
	formatAngle,
	MEASUREMENT_MODES,
} = require('../../../src/composables/useMeasurement.js')

// jsdom has no 2D canvas; this is the smallest thing the label path calls.
beforeAll(() => {
	window.HTMLCanvasElement.prototype.getContext = function getContext() {
		return {
			canvas: this,
			measureText: (text) => ({ width: String(text).length * 20 }),
			fillRect: () => {},
			clearRect: () => {},
			fillText: () => {},
			beginPath: () => {},
			rect: () => {},
			fill: () => {},
			set fillStyle(v) {},
			set font(v) {},
			set textAlign(v) {},
			set textBaseline(v) {},
		}
	}
})

const v = (x, y, z) => new THREE.Vector3(x, y, z)

function setup() {
	const scene = new THREE.Scene()
	scene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial()))
	const measurement = useMeasurement()
	measurement.init(scene)
	measurement.updateVisualScale()
	const group = scene.getObjectByName('measurementGroup')
	const count = (prefix) => group.children.filter((o) => o.name.startsWith(prefix)).length
	return { measurement, group, count }
}

describe('computeAngle', () => {
	it.each([
		['a right angle', v(1, 0, 0), v(0, 0, 0), v(0, 1, 0), 90],
		['a straight line', v(-1, 0, 0), v(0, 0, 0), v(1, 0, 0), 180],
		['a closed angle', v(1, 0, 0), v(0, 0, 0), v(2, 0, 0), 0],
		['45 degrees, off the origin', v(3, 1, 1), v(2, 1, 1), v(3, 2, 1), 45],
	])('measures %s', (_name, a, vertex, b, expected) => {
		expect(computeAngle(a, vertex, b)).toBeCloseTo(expected, 6)
	})

	it('is 0 rather than NaN when a leg has no length', () => {
		expect(computeAngle(v(0, 0, 0), v(0, 0, 0), v(1, 0, 0))).toBe(0)
	})

	it('formats in degrees', () => {
		expect(formatAngle(90).formatted).toBe('90.00°')
	})
})

describe('angle mode', () => {
	it('offers distance and angle', () => {
		expect(MEASUREMENT_MODES).toEqual(['distance', 'angle'])
	})

	it('rejects a mode it does not know', () => {
		const { measurement } = setup()
		expect(() => measurement.setMode('area')).toThrow()
	})

	it('waits for the third click, then records the angle at the middle one', () => {
		const { measurement, count } = setup()
		measurement.setMode('angle')
		expect(measurement.requiredPoints.value).toBe(3)

		measurement.addMeasurementPoint(v(1, 0, 0))
		measurement.addMeasurementPoint(v(0, 0, 0))
		expect(measurement.measurements.value).toHaveLength(0)

		measurement.addMeasurementPoint(v(0, 0, 1))
		expect(measurement.measurements.value).toHaveLength(1)

		const [m] = measurement.measurements.value
		expect(m.type).toBe('angle')
		expect(m.angle).toBeCloseTo(90, 6)
		expect(m.formatted).toBe('90.00°')
		expect(m.vertex.equals(v(0, 0, 0))).toBe(true)

		expect(count('measurementPoint')).toBe(3)
		expect(count('measurementLine')).toBe(2)
		expect(count('measurementText')).toBe(1)
	})

	it('keeps an angle unchanged when the length unit changes', () => {
		const { measurement } = setup()
		measurement.addMeasurementPoint(v(0, 0, 0))
		measurement.addMeasurementPoint(v(10, 0, 0))
		measurement.setMode('angle')
		;[v(1, 0, 0), v(0, 0, 0), v(0, 1, 0)].forEach((p) => measurement.addMeasurementPoint(p))
		measurement.setUnit('centimeters')
		const [distance, angle] = measurement.measurements.value
		expect(distance.formatted).toBe('1.000 cm')
		expect(angle.formatted).toBe('90.00°')
	})

	it('drops half-picked points, and their markers, when the mode changes', () => {
		const { measurement, count } = setup()
		measurement.setMode('angle')
		measurement.addMeasurementPoint(v(1, 0, 0))
		measurement.addMeasurementPoint(v(0, 0, 0))
		expect(count('measurementPoint')).toBe(2)

		measurement.setMode('distance')
		expect(measurement.points.value).toHaveLength(0)
		expect(count('measurementPoint')).toBe(0)
	})
})

describe('deleting a measurement', () => {
	it('removes exactly the objects that measurement drew, whatever came before it', () => {
		const { measurement, group, count } = setup()

		// A distance, then an angle, then another distance
		measurement.addMeasurementPoint(v(0, 0, 0))
		measurement.addMeasurementPoint(v(1, 0, 0))
		measurement.setMode('angle')
		;[v(1, 0, 0), v(0, 0, 0), v(0, 1, 0)].forEach((p) => measurement.addMeasurementPoint(p))
		measurement.setMode('distance')
		measurement.addMeasurementPoint(v(0, 0, 0))
		measurement.addMeasurementPoint(v(0, 0, 2))

		expect(group.children).toHaveLength((2 + 1 + 1) + (3 + 2 + 1) + (2 + 1 + 1))

		const [first, angle, last] = measurement.measurements.value
		measurement.deleteMeasurement(angle.id)
		expect(count('measurementPoint')).toBe(4)
		expect(count('measurementLine')).toBe(2)
		expect(count('measurementText')).toBe(2)
		expect(group.getObjectByName(`measurementLine_${first.id}`)).toBeDefined()
		expect(group.getObjectByName(`measurementLine_${last.id}`)).toBeDefined()

		measurement.deleteMeasurement(first.id)
		expect(group.children).toHaveLength(4)
		expect(group.getObjectByName(`measurementLine_${last.id}`)).toBeDefined()
	})

	it('clears everything, including a point picked but not yet used', () => {
		const { measurement, group } = setup()
		measurement.addMeasurementPoint(v(0, 0, 0))
		measurement.addMeasurementPoint(v(1, 0, 0))
		measurement.addMeasurementPoint(v(2, 0, 0))
		measurement.clearAllMeasurements()
		expect(group.children).toHaveLength(0)
		expect(measurement.points.value).toHaveLength(0)
	})
})
