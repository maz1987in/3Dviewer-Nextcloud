/**
 * How many millimetres one scene unit is, by the format the model came from: what 3MF
 * (millimetres) and USDZ (metres) export need to write a model at its real size.
 */
import * as THREE from 'three'
import { millimetresPerUnit, millimetresPerFileUnit, defaultDisplayUnit, isUnitChangeable, fileUnitKey, unitSuffix, rhinoUnit, threeMFUnit, SOURCE_UNITS } from '../../../src/utils/sourceUnits.js'
import { MODEL_EXTENSIONS } from '../../../src/config/viewer-config.js'

describe('millimetresPerUnit', () => {
	it.each([
		['model.glb', 1000],
		['scene.GLTF', 1000],
		['avatar.vrm', 1000],
		['building.ifc', 1000],
		['part.dae', 1000],
		['world.wrl', 1000],
		['part.stl', 1],
		['part.3mf', 1],
		['bracket.step', 1],
		['print.gcode', 1],
		['mesh.obj', 1],
		['no-extension', 1],
		[null, 1],
	])('%s → %d', (filename, expected) => {
		expect(millimetresPerUnit(filename)).toBe(expected)
	})

	it('reads the extension of a path, not of a folder', () => {
		expect(millimetresPerUnit('/Models/v1.2/robot.glb')).toBe(1000)
	})

	it('takes a Rhino model\'s own unit, which its loader records', () => {
		const root = new THREE.Group()
		const loaded = new THREE.Object3D()
		loaded.userData.settings = { modelUnitSystem: { name: 'UnitSystem_Meters', value: 4 } }
		root.add(loaded)
		expect(millimetresPerUnit('tower.3dm', root)).toBe(1000)
		loaded.userData.settings.modelUnitSystem = { name: 'UnitSystem_Inches', value: 8 }
		expect(millimetresPerUnit('tower.3dm', root)).toBeCloseTo(25.4, 9)
	})

	it('takes a Rhino model with no recorded or no length unit as millimetres', () => {
		expect(millimetresPerUnit('a.3dm', new THREE.Group())).toBe(1)
		const root = new THREE.Group()
		root.userData.settings = { modelUnitSystem: { value: 0 } } // "None"
		expect(rhinoUnit(root)).toBeNull()
		expect(millimetresPerUnit('a.3dm', root)).toBe(1)
	})
})

describe('3MF', () => {
	it('takes the unit the 3MF loader recorded, also on a model the viewer wrapped', () => {
		const wrapper = new THREE.Group()
		const loaded = new THREE.Group()
		loaded.userData.threeMFUnit = 'meter'
		wrapper.add(loaded)
		expect(millimetresPerUnit('part.3mf', wrapper)).toBe(1000)
		loaded.userData.threeMFUnit = 'inch'
		expect(millimetresPerUnit('part.3mf', wrapper)).toBeCloseTo(25.4, 9)
	})

	it('takes a 3MF with no recorded or an unknown unit as millimetres', () => {
		expect(millimetresPerUnit('part.3mf', new THREE.Group())).toBe(1)
		const root = new THREE.Group()
		root.userData.threeMFUnit = 'furlong'
		expect(threeMFUnit(root)).toBeNull()
		expect(millimetresPerUnit('part.3mf', root)).toBe(1)
	})

	it('reads the unit only for a 3MF', () => {
		const root = new THREE.Group()
		root.userData.threeMFUnit = 'meter'
		expect(millimetresPerUnit('part.stl', root)).toBe(1)
	})
})

describe('SOURCE_UNITS', () => {
	it('decides every format the viewer opens, or leaves it to the millimetre default on purpose', () => {
		const listed = new Set([...Object.keys(SOURCE_UNITS), '3dm'])
		// Toolpath extensions other than .gcode are printer coordinates, millimetres
		const toolpaths = ['gco', 'nc', 'acode', 'gx', 'g', 'g3drem', 'makerbot', 'thing']
		const undecided = MODEL_EXTENSIONS.filter((ext) => !listed.has(ext) && !toolpaths.includes(ext))
		expect(undecided).toEqual([])
	})
})

test('assumesMillimetres: true only for formats that record no unit', () => {
	const { assumesMillimetres } = require('../../../src/utils/sourceUnits.js')
	expect(['a.stl', 'b.OBJ', 'c.ply', 'd.off', 'e.3ds', 'f.gcode'].map(assumesMillimetres)).toEqual([true, true, true, true, true, true])
	expect(['a.glb', 'b.3mf', 'c.3dm', 'd.step', 'e.fbx', null].map(assumesMillimetres)).toEqual([false, false, false, false, false, false])
})

describe('a unit chosen for the file', () => {
	it('applies to the formats that record no unit', () => {
		for (const name of ['a.stl', 'a.obj', 'a.ply', 'a.off', 'a.3ds']) {
			expect(millimetresPerFileUnit(name, null, 'in')).toBe(25.4)
			expect(isUnitChangeable(name)).toBe(true)
		}
		expect(millimetresPerFileUnit('a.stl', null, 'us-ft')).toBeCloseTo(304.8006096, 7)
	})

	it('applies to an FBX without a unit scale, and not to one with', () => {
		const bare = new THREE.Group()
		const scaled = new THREE.Group()
		scaled.userData.unitScaleFactor = 1
		expect(millimetresPerFileUnit('a.fbx', bare, 'm')).toBe(1000)
		expect(isUnitChangeable('a.fbx', scaled)).toBe(false)
		expect(millimetresPerFileUnit('a.fbx', scaled, 'm')).toBe(10)
	})

	it('ignores a chosen unit for a format that records its own', () => {
		expect(millimetresPerFileUnit('a.glb', null, 'in')).toBe(1000)
		expect(millimetresPerFileUnit('a.3mf', null, 'in')).toBe(1)
		expect(isUnitChangeable('a.glb')).toBe(false)
		expect(isUnitChangeable('a.gcode')).toBe(false)
		expect(isUnitChangeable(null)).toBe(false)
	})

	it('ignores an unknown unit', () => {
		expect(millimetresPerFileUnit('a.stl', null, 'furlong')).toBe(1)
		expect(millimetresPerFileUnit('a.stl', null, 'constructor')).toBe(1)
	})

	it('still divides out the viewer\'s rescale', () => {
		const root = new THREE.Group()
		root.userData.viewerScale = 0.1
		expect(millimetresPerUnit('a.obj', root, 'cm')).toBe(100)
	})

	it('starts the panels in the chosen unit', () => {
		expect(defaultDisplayUnit('a.stl', null, 'in')).toBe('inches')
		expect(defaultDisplayUnit('a.stl', null, 'us-ft')).toBe('feet')
		expect(defaultDisplayUnit('a.stl', null, null)).toBe('millimeters')
	})

	it('names units', () => {
		expect(fileUnitKey(25.4)).toBe('in')
		expect(fileUnitKey(914.4)).toBeNull()
		expect(unitSuffix(1200000 / 3937)).toBe('ft (US)')
		expect(unitSuffix(0.001)).toBe('µm')
		expect(unitSuffix(914.4)).toBe('yd')
		expect(unitSuffix(2)).toBe('2.000 mm')
	})
})
