/**
 * Readings in the model's own unit. A scene unit is a metre in a glTF and a millimetre in
 * an STL (utils/sourceUnits.js); the viewer works that out once per model and gives it to
 * the measurement tool, the model statistics and the comparison table. Before, every
 * format was read as millimetres, so a 1.8 m glTF figure measured "1.800 mm".
 */
import * as THREE from 'three'
import { useMeasurement } from '../../../src/composables/useMeasurement.js'
import { useModelStats } from '../../../src/composables/useModelStats.js'
import { useComparison } from '../../../src/composables/useComparison.js'
import { defaultDisplayUnit, displayLengthFactor, millimetresPerUnit } from '../../../src/utils/sourceUnits.js'
import { VIEWER_CONFIG } from '../../../src/config/viewer-config.js'

jest.mock('@nextcloud/dialogs', () => ({ getFilePickerBuilder: jest.fn() }), { virtual: true })
jest.mock('../../../src/loaders/registry.js', () => ({ loadModelByExtension: jest.fn() }))

const { loadModelByExtension } = jest.requireMock('../../../src/loaders/registry.js')

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
const cube = (size) => new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial())

function measuring(modelSize = 2) {
	const scene = new THREE.Scene()
	scene.add(cube(modelSize))
	const measurement = useMeasurement()
	measurement.init(scene)
	measurement.updateVisualScale()
	return measurement
}

describe('distance measurements', () => {
	it('read a glTF figure 1.8 units tall as 1.8 m, not 1.8 mm', () => {
		const measurement = measuring()
		measurement.setModelScale(millimetresPerUnit('figure.glb'))
		measurement.suggestUnit(defaultDisplayUnit('figure.glb'))
		const m = measurement.addMeasurement('distance', [v(0, 0, 0), v(0, 1.8, 0)])
		expect(m.formatted).toBe('1.800 m')
		measurement.setUnit('millimeters')
		expect(measurement.measurements.value[0].formatted).toBe('1800.000 mm')
		measurement.setUnit('centimeters')
		expect(measurement.measurements.value[0].formatted).toBe('180.000 cm')
	})

	it('read an STL exactly as before: a scene unit is a millimetre', () => {
		const before = measuring()
		const after = measuring()
		after.setModelScale(millimetresPerUnit('part.stl'))
		after.suggestUnit(defaultDisplayUnit('part.stl'))
		const points = [v(0, 0, 0), v(3, 4, 0)]
		expect(after.addMeasurement('distance', points).formatted).toBe(before.addMeasurement('distance', points).formatted)
		expect(after.measurements.value[0].formatted).toBe('5.000 mm')
		for (const unit of ['centimeters', 'meters', 'inches', 'feet', 'units']) {
			before.setUnit(unit)
			after.setUnit(unit)
			expect(after.measurements.value[0].formatted).toBe(before.measurements.value[0].formatted)
		}
		expect(after.measurements.value[0].formatted).toBe('5.000 units')
	})

	it('show the scene\'s own numbers in "units", whatever the source', () => {
		const measurement = measuring()
		measurement.setModelScale(1000)
		measurement.setUnit('units')
		expect(measurement.addMeasurement('distance', [v(0, 0, 0), v(0, 1.8, 0)]).formatted).toBe('1.800 units')
	})

	it('re-read a measurement drawn before the model\'s unit was known, as a shared note can be', () => {
		const measurement = measuring()
		measurement.addMeasurementFromNote(v(0, 0, 0), v(2, 0, 0), { noteId: 7, author: null, saveState: 'saved' })
		expect(measurement.measurements.value[0].formatted).toBe('2.000 mm')
		measurement.setModelScale(1000)
		measurement.suggestUnit('meters')
		expect(measurement.measurements.value[0].formatted).toBe('2.000 m')
		// The stored points are the same model-space points
		expect(measurement.measurements.value[0].point2.x).toBe(2)
	})

	it('leave angles alone: they have no unit', () => {
		const measurement = measuring()
		const points = [v(1, 0, 0), v(0, 0, 0), v(0, 1, 0)]
		const before = { ...measurement.addMeasurement('angle', points) }
		measurement.setModelScale(1000)
		measurement.setUnit('meters')
		const after = measurement.measurements.value[0]
		expect(after.formatted).toBe('90.00°')
		expect(after.formatted).toBe(before.formatted)
		expect(after.value).toBe(before.value)
	})
})

describe('the display unit a model starts in', () => {
	it('is the model\'s own while the user has not picked one', () => {
		const measurement = measuring()
		expect(measurement.currentUnit.value).toBe(VIEWER_CONFIG.measurement.defaultUnit)
		expect(measurement.suggestUnit('meters')).toBe(true)
		expect(measurement.currentUnit.value).toBe('meters')
		// The next model, an STL
		expect(measurement.suggestUnit('millimeters')).toBe(true)
		expect(measurement.currentUnit.value).toBe('millimeters')
		expect(measurement.unitChosen.value).toBe(false)
	})

	it('is the user\'s choice once they have made one, for every model after', () => {
		const measurement = measuring()
		measurement.setUnit('inches')
		expect(measurement.unitChosen.value).toBe(true)
		expect(measurement.suggestUnit('meters')).toBe(false)
		expect(measurement.currentUnit.value).toBe('inches')
		// Choosing the unit that a model would have started in is still a choice
		measurement.setUnit('millimeters')
		expect(measurement.suggestUnit('meters')).toBe(false)
		expect(measurement.currentUnit.value).toBe('millimeters')
	})

	it('is kept in the statistics panel the same way, separately', () => {
		const stats = useModelStats()
		expect(stats.suggestUnit('meters')).toBe(true)
		expect(stats.currentUnit.value).toBe('meters')
		stats.setUnit('feet')
		expect(stats.suggestUnit('millimeters')).toBe(false)
		expect(stats.currentUnit.value).toBe('feet')
		expect(stats.suggestUnit('furlongs')).toBe(false)
	})

	it.each([
		['figure.glb', null, 'meters'],
		['building.ifc', null, 'meters'],
		['part.stl', null, 'millimeters'],
		['bracket.step', null, 'millimeters'],
		['print.gcode', null, 'millimeters'],
		['model.fbx', null, 'centimeters'],
		['model.fbx', { unitScaleFactor: 100 }, 'meters'],
		// A rescaled FBX still starts in its file's unit, not the viewer's
		['model.fbx', { unitScaleFactor: 1, viewerScale: 0.01 }, 'centimeters'],
		['model.fbx', { unitScaleFactor: 2.54 }, 'inches'],
		['part.3mf', { threeMFUnit: 'meter' }, 'meters'],
		['part.3mf', { threeMFUnit: 'foot' }, 'feet'],
		['part.3mf', { threeMFUnit: 'micron' }, 'millimeters'],
		['tower.3dm', { settings: { modelUnitSystem: { value: 8 } } }, 'inches'],
		['map.3dm', { settings: { modelUnitSystem: { value: 5 } } }, 'meters'],
		[null, null, 'millimeters'],
	])('%s %j starts in %s', (filename, userData, expected) => {
		const root = new THREE.Group()
		Object.assign(root.userData, userData)
		expect(defaultDisplayUnit(filename, root)).toBe(expected)
	})
})

describe('model statistics', () => {
	it('scale lengths by the factor, areas by its square and volumes by its cube', () => {
		const stats = useModelStats()
		stats.setModelScale(1000) // a glTF
		stats.setUnit('millimeters')
		expect(stats.lengthScale.value).toBe(1000)
		expect(stats.areaScale.value).toBe(1e6)
		expect(stats.volumeScale.value).toBe(1e9)
		stats.setUnit('meters')
		expect(stats.lengthScale.value).toBe(1)
		expect(stats.areaScale.value).toBe(1)
		expect(stats.volumeScale.value).toBe(1)
		stats.setUnit('centimeters')
		expect(stats.lengthScale.value).toBeCloseTo(100, 9)
		expect(stats.areaScale.value).toBeCloseTo(1e4, 6)
		expect(stats.volumeScale.value).toBeCloseTo(1e6, 3)
		stats.setUnit('units')
		expect(stats.lengthScale.value).toBe(1)
	})

	it('report a 1 m glTF cube as 1 m across, 6 m² and 1 m³', () => {
		const stats = useModelStats()
		stats.setModelScale(millimetresPerUnit('cube.glb'))
		stats.suggestUnit(defaultDisplayUnit('cube.glb'))
		stats.analyzeModel(cube(1), 'cube.glb', 0)
		const report = stats.buildMeasurementReport()
		expect(report).toContain('# Model measurements (Meters)')
		expect(report).toContain('Bounding box:  1.000 × 1.000 × 1.000 m')
		expect(report).toContain('Surface area:  6.000 m²')
		expect(report).toContain('Mesh volume:   1.000 m³')
		stats.setUnit('centimeters')
		expect(stats.buildMeasurementReport()).toContain('Mesh volume:   1.000e+6 cm³')
	})

	it('report an STL exactly as before', () => {
		const before = useModelStats()
		const after = useModelStats()
		after.setModelScale(millimetresPerUnit('part.stl'))
		after.suggestUnit(defaultDisplayUnit('part.stl'))
		for (const stats of [before, after]) stats.analyzeModel(cube(10), 'part.stl', 0)
		expect(after.buildMeasurementReport()).toBe(before.buildMeasurementReport())
		expect(after.buildMeasurementReport()).toContain('Bounding box:  10.000 × 10.000 × 10.000 mm')
		expect(after.buildMeasurementReport()).toContain('Mesh volume:   1.000e+3 mm³')
	})

	it('ignore a scale that is not a positive number', () => {
		const stats = useModelStats()
		stats.setModelScale(0)
		stats.setModelScale(Number.NaN)
		expect(stats.modelScale.value).toBe(1)
	})
})

describe('the comparison table', () => {
	it('compares real sizes: a 1 m glTF beside a 1000 mm STL is the same size', async () => {
		loadModelByExtension.mockResolvedValue({ object3D: cube(1) })
		const comparison = useComparison()
		await comparison.loadComparisonModel(new File(['x'], 'other.glb'), { THREE, hasDraco: false, hasKtx2: false, hasMeshopt: false })
		const original = cube(1000)
		const diff = comparison.computeDiffStats(original, 'part.stl', millimetresPerUnit('part.stl'))
		expect(diff.original.bbox.x).toBeCloseTo(1000, 6)
		expect(diff.comparison.bbox.x).toBeCloseTo(1000, 6)
		expect(diff.delta.bbox.x).toBeCloseTo(0, 6)
		expect(diff.delta.bboxDiagonal).toBeCloseTo(0, 6)
		expect(diff.originalMillimetresPerUnit).toBe(1)
	})
})

describe('displayLengthFactor', () => {
	const { unitScales } = VIEWER_CONFIG.measurement
	it('converts scene units to a display unit through millimetres', () => {
		expect(displayLengthFactor(unitScales.millimeters, 1000)).toBe(1000)
		expect(displayLengthFactor(unitScales.meters, 1000)).toBe(1)
		expect(displayLengthFactor(unitScales.inches, 25.4)).toBe(1)
		expect(displayLengthFactor(unitScales.meters, 1)).toBe(0.001)
	})

	it('leaves "units" as the scene\'s own numbers', () => {
		expect(displayLengthFactor(unitScales.units, 1000)).toBe(1)
		expect(displayLengthFactor(unitScales.units, 1)).toBe(1)
	})
})
