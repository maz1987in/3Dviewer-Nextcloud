/**
 * How many millimetres one scene unit is, by the format the model came from: what 3MF
 * (millimetres) and USDZ (metres) export need to write a model at its real size.
 */
import * as THREE from 'three'
import { millimetresPerUnit, rhinoUnit, threeMFUnit, SOURCE_UNITS } from '../../../src/utils/sourceUnits.js'
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
