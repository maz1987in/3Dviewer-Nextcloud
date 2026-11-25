/**
 * What the Files sidebar's "3D" tab shows of a stored measurement: the unit and where it
 * comes from, the size along each axis, and which counts apply to what kind of model.
 */
import { defaultUp } from '../../../src/pointclouds/upAxis.js'
import { defaultUpOf, describeStats, dimensionsOf, unitOf } from '../../../src/stats/describeStats.js'

function mesh(overrides = {}) {
	return {
		v: 1,
		kind: 'mesh',
		size: [120, 45, 80],
		unit: { mm: 1, changeable: true },
		up: null,
		triangles: 12,
		vertices: 8,
		points: 0,
		splats: 0,
		parts: 2,
		materials: 3,
		textures: 1,
		area: 100,
		volume: 50,
		watertight: true,
		layers: null,
		printSeconds: null,
		...overrides,
	}
}

describe('unitOf', () => {
	it('is a guess for a format that records no unit, until one is chosen for the file', () => {
		expect(unitOf(mesh(), null)).toEqual({ millimetres: 1, suffix: 'mm', source: 'default' })
	})

	it('is the unit chosen for the file, once there is one', () => {
		expect(unitOf(mesh(), 'in')).toEqual({ millimetres: 25.4, suffix: 'in', source: 'chosen' })
		expect(unitOf(mesh(), 'cm')).toMatchObject({ millimetres: 10, suffix: 'cm', source: 'chosen' })
	})

	it('is the file\'s own when the format records it, whatever was chosen', () => {
		const glb = mesh({ unit: { mm: 1000, changeable: false } })

		expect(unitOf(glb, null)).toEqual({ millimetres: 1000, suffix: 'm', source: 'file' })
		expect(unitOf(glb, 'in')).toMatchObject({ suffix: 'm', source: 'file' })
	})

	it('ignores a unit that is not one of the six', () => {
		expect(unitOf(mesh(), 'furlong')).toMatchObject({ suffix: 'mm', source: 'default' })
		expect(unitOf(mesh(), '__proto__')).toMatchObject({ source: 'default' })
	})

	it('names a recorded unit the list has no name for by its size', () => {
		expect(unitOf(mesh({ unit: { mm: 2, changeable: false } }), null).suffix).toBe('2.000 mm')
	})
})

describe('dimensionsOf', () => {
	it('is width along X, depth along Z and height along Y', () => {
		expect(dimensionsOf(mesh(), null, 'stl')).toEqual({ width: 120, depth: 80, height: 45 })
	})

	it('keeps a scan as it was measured when the direction is the same', () => {
		const scan = mesh({ kind: 'points', up: '+z', size: [10, 3, 20] })

		expect(dimensionsOf(scan, null, 'las')).toEqual({ width: 10, depth: 20, height: 3 })
		expect(dimensionsOf(scan, '+z', 'las')).toEqual({ width: 10, depth: 20, height: 3 })
		expect(dimensionsOf(scan, '-z', 'las')).toEqual({ width: 10, depth: 20, height: 3 })
	})

	it('swaps depth and height of a scan turned from Z up to Y up, and back', () => {
		const zUp = mesh({ kind: 'points', up: '+z', size: [10, 3, 20] })
		const yUp = mesh({ kind: 'points', up: '+y', size: [10, 20, 3] })

		expect(dimensionsOf(zUp, '+y', 'las')).toEqual({ width: 10, depth: 3, height: 20 })
		expect(dimensionsOf(yUp, '+z', 'ply')).toEqual({ width: 10, depth: 20, height: 3 })
		// Upside down is still Y up: the height is the same axis
		expect(dimensionsOf(yUp, '-y', 'ply')).toEqual({ width: 10, depth: 3, height: 20 })
	})

	it('reads the direction a scan was measured with as its format\'s own when none was recorded', () => {
		const las = mesh({ kind: 'points', up: null, size: [10, 3, 20] })

		expect(dimensionsOf(las, null, 'las')).toEqual({ width: 10, depth: 20, height: 3 })
		expect(dimensionsOf(las, '+y', 'las')).toEqual({ width: 10, depth: 3, height: 20 })
	})

	it('treats splats as scans', () => {
		const splat = mesh({ kind: 'splats', up: '+y', size: [1, 2, 3] })

		expect(dimensionsOf(splat, '+z', 'splat')).toEqual({ width: 1, depth: 2, height: 3 })
	})

	it('never turns a mesh: only scans and splats have a direction', () => {
		expect(dimensionsOf(mesh(), '+z', 'stl')).toEqual({ width: 120, depth: 80, height: 45 })
	})
})

describe('defaultUpOf', () => {
	it.each(['las', 'laz', 'e57', 'pcd', 'xyz', 'ply', 'splat', 'spz', 'LAS', 'stl', ''])('is the viewer\'s own for .%s', (extension) => {
		expect(defaultUpOf(extension)).toBe(defaultUp(extension))
	})
})

describe('describeStats', () => {
	it('gives a mesh its triangles, vertices, parts, materials and textures', () => {
		const rows = describeStats(mesh(), { unit: null, up: null }, 'stl')

		expect(rows).toMatchObject({
			kind: 'mesh',
			triangles: 12,
			vertices: 8,
			parts: 2,
			materials: 3,
			textures: 1,
			points: null,
			splats: null,
			layers: null,
			printSeconds: null,
			area: 100,
			volume: 50,
			watertight: true,
			dimensions: { width: 120, depth: 80, height: 45 },
			unit: { suffix: 'mm', source: 'default' },
		})
	})

	it('gives a scan its points and no triangles', () => {
		const rows = describeStats(mesh({ kind: 'points', points: 2_500_000, triangles: 0, area: null, volume: null }), null, 'las')

		expect(rows).toMatchObject({ points: 2_500_000, triangles: null, vertices: null, parts: null, materials: null, textures: null })
	})

	it('gives a splat its splats', () => {
		expect(describeStats(mesh({ kind: 'splats', splats: 90_000 }), null, 'splat')).toMatchObject({ splats: 90_000, triangles: null, points: null })
	})

	it('gives a toolpath its layers and print time', () => {
		const rows = describeStats(mesh({ kind: 'toolpath', layers: 240, printSeconds: 7200, triangles: 0 }), null, 'gcode')

		expect(rows).toMatchObject({ layers: 240, printSeconds: 7200, triangles: null, vertices: null, materials: null })
	})

	it('has no print time for a toolpath whose slicer wrote none', () => {
		expect(describeStats(mesh({ kind: 'toolpath', layers: 2, printSeconds: null }), null, 'gcode').printSeconds).toBeNull()
	})

	it('follows a unit chosen after the measurement', () => {
		const rows = describeStats(mesh(), { unit: 'in', up: null }, 'stl')

		expect(rows.unit).toMatchObject({ suffix: 'in', source: 'chosen' })
		expect(rows.dimensions).toEqual({ width: 120, depth: 80, height: 45 })
	})

	it('reads a measurement that predates `watertight` as not checked', () => {
		const old = mesh()
		delete old.watertight

		expect(describeStats(old, null, 'stl').watertight).toBeNull()
	})

	it('copes with no settings at all', () => {
		expect(describeStats(mesh(), undefined, 'stl').unit.source).toBe('default')
	})
})
