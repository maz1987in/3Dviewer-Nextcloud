/**
 * Whether a model fits a printer: its size along the bed's three axes, measured the way an
 * export writes it (parts together, placed as the user placed it), against the printer's
 * build volume.
 */
import * as THREE from 'three'
import { bedAxes, modelExtentMm, fitReport } from '../../../src/printCheck/buildVolume.js'
import { PRINTERS, MATERIALS, PRINT_CHECK_DEFAULTS, OVERHANG_ANGLE_RANGE } from '../../../src/printCheck/printers.js'
import { rememberOwnTransform, MOVED_BY } from '../../../src/utils/viewerTransforms.js'

function box(width, height, depth) {
	return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshBasicMaterial())
}

describe('fitReport', () => {
	test('fits when equal to the volume', () => {
		const report = fitReport({ width: 250, depth: 210, height: 220 }, { width: 250, depth: 210, height: 220 })
		expect(report).toEqual({ fits: true, over: { width: 0, depth: 0, height: 0 }, fitsTurned: false })
	})

	test('reports 12.4 mm too wide', () => {
		const report = fitReport({ width: 262.4, depth: 100, height: 100 }, { width: 250, depth: 210, height: 220 })
		expect(report.fits).toBe(false)
		expect(report.over.width).toBeCloseTo(12.4, 9)
		expect(report.over.depth).toBe(0)
		expect(report.over.height).toBe(0)
	})

	test('fitsTurned when width and depth swap', () => {
		const report = fitReport({ width: 205, depth: 245, height: 100 }, { width: 250, depth: 210, height: 220 })
		expect(report.fits).toBe(false)
		expect(report.fitsTurned).toBe(true)
	})

	test('too tall does not fit turned either', () => {
		const report = fitReport({ width: 10, depth: 10, height: 300 }, { width: 250, depth: 210, height: 220 })
		expect(report.fitsTurned).toBe(false)
		expect(report.over.height).toBe(80)
	})
})

describe('modelExtentMm', () => {
	test('extent honours millimetres per unit', () => {
		const root = new THREE.Group()
		root.add(box(0.01, 0.01, 0.01))
		const size = modelExtentMm(root, bedAxes('y'), 1000)
		// Float32 positions: 0.01 is stored as 0.0099999998
		expect(size.width).toBeCloseTo(10, 5)
		expect(size.depth).toBeCloseTo(10, 5)
		expect(size.height).toBeCloseTo(10, 5)
	})

	test('measures width along X, depth along Z and height along Y for y-up', () => {
		const root = new THREE.Group()
		root.add(box(30, 20, 10))
		const size = modelExtentMm(root, bedAxes('y'), 1)
		expect([size.width, size.depth, size.height].map(v => Math.round(v * 1e6) / 1e6)).toEqual([30, 10, 20])
	})

	test('z-up axes put the file\'s Z as height', () => {
		const root = new THREE.Group()
		root.add(box(30, 20, 10))
		const size = modelExtentMm(root, bedAxes('z'), 1)
		expect([size.width, size.depth, size.height].map(v => Math.round(v * 1e6) / 1e6)).toEqual([30, 20, 10])
	})

	test('extent ignores exploded view', () => {
		const root = new THREE.Group()
		const a = box(10, 10, 10)
		const b = box(10, 10, 10)
		b.position.x = 10
		root.add(a, b)
		rememberOwnTransform(b, MOVED_BY.exploded)
		b.position.x = 100
		const size = modelExtentMm(root, bedAxes('y'), 1)
		expect(size.width).toBeCloseTo(20, 9)
		expect(b.position.x).toBe(100)
	})

	test('extent follows the move/rotate tool', () => {
		const root = new THREE.Group()
		root.add(box(10, 10, 10))
		rememberOwnTransform(root, MOVED_BY.gizmo)
		root.scale.setScalar(2)
		const size = modelExtentMm(root, bedAxes('y'), 1)
		expect(size.width).toBeCloseTo(20, 9)
	})

	test('reports the lowest and highest points along the axes, in scene units', () => {
		const root = new THREE.Group()
		const mesh = box(10, 10, 10)
		mesh.position.set(5, 7, -3)
		root.add(mesh)
		const size = modelExtentMm(root, bedAxes('y'), 2)
		expect(size.min.y).toBeCloseTo(2, 9)
		expect(size.max.y).toBeCloseTo(12, 9)
	})
})

describe('the printer list', () => {
	test('every printer has an id, a name and a positive size', () => {
		expect(PRINTERS.length).toBeGreaterThanOrEqual(8)
		for (const printer of PRINTERS) {
			expect(printer.id).toMatch(/^[a-z0-9-]+$/)
			expect(printer.name).toBeTruthy()
			expect([printer.width, printer.depth, printer.height].every(v => v > 0)).toBe(true)
		}
		expect(new Set(PRINTERS.map(p => p.id)).size).toBe(PRINTERS.length)
	})

	test('defaults name a known printer and material, within the ranges', () => {
		expect(PRINTERS.some(p => p.id === PRINT_CHECK_DEFAULTS.printerId)).toBe(true)
		expect(MATERIALS.some(m => m.id === PRINT_CHECK_DEFAULTS.material)).toBe(true)
		expect(PRINT_CHECK_DEFAULTS.overhangAngle).toBe(45)
		expect(OVERHANG_ANGLE_RANGE).toEqual({ min: 20, max: 80 })
		expect(MATERIALS.find(m => m.id === 'pla').density).toBe(1.24)
	})
})
