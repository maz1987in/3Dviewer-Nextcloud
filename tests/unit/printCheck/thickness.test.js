/**
 * Wall thickness: from each triangle's centre, along its inward normal, the distance to
 * the first surface on the other side. Each vertex takes the thinnest of the triangles
 * around it, so a thin wall shows thin right to its edges.
 */
import * as THREE from 'three'
import { measurePartThickness } from '../../../src/printCheck/thickness.js'

function partOf(geometry) {
	return {
		positions: geometry.attributes.position.array,
		index: geometry.index ? geometry.index.array : null,
		normals: geometry.attributes.normal ? geometry.attributes.normal.array : null,
	}
}

test('a 0.5 mm slab measures 0.5 on its big faces', () => {
	const geometry = new THREE.BoxGeometry(10, 0.5, 10)
	const { thickness, sampled } = measurePartThickness(partOf(geometry))
	const normals = geometry.attributes.normal
	let checked = 0
	for (let v = 0; v < normals.count; v++) {
		if (Math.abs(normals.getY(v)) === 1) {
			expect(thickness[v]).toBeCloseTo(0.5, 6)
			checked++
		}
	}
	expect(checked).toBe(8)
	expect(sampled).toBe(false)
})

test('a 10 mm cube measures 10', () => {
	const { thickness } = measurePartThickness(partOf(new THREE.BoxGeometry(10, 10, 10)))
	for (const value of thickness) {
		expect(value).toBeCloseTo(10, 6)
	}
})

test('a cube as an STL stores it, without an index or normals, measures the same', () => {
	const geometry = new THREE.BoxGeometry(10, 10, 10).toNonIndexed()
	geometry.deleteAttribute('normal')
	const { thickness } = measurePartThickness(partOf(geometry))
	expect(thickness).toHaveLength(36)
	for (const value of thickness) {
		expect(value).toBeCloseTo(10, 6)
	}
})

test('an open mesh returns numbers, not a throw', () => {
	const geometry = new THREE.PlaneGeometry(10, 10)
	const { thickness } = measurePartThickness(partOf(geometry))
	expect(thickness.length).toBe(geometry.attributes.position.count)
	expect([...thickness].every((value) => value === Infinity)).toBe(true)
})

test('over the budget, sampled is true and every vertex has a value', () => {
	const geometry = new THREE.SphereGeometry(5, 48, 32).toNonIndexed()
	const { thickness, triangleThickness, sampled } = measurePartThickness(partOf(geometry), { budget: 200 })
	expect(sampled).toBe(true)
	expect([...thickness].every((value) => Number.isFinite(value) && value > 0)).toBe(true)
	expect(triangleThickness.length).toBe(geometry.attributes.position.count / 3)
})

test('progress reaches total', () => {
	const progress = []
	measurePartThickness(partOf(new THREE.SphereGeometry(5, 24, 16)), { onProgress: (done, total) => progress.push([done, total]) })
	expect(progress.length).toBeGreaterThan(1)
	const [done, total] = progress[progress.length - 1]
	expect(done).toBe(total)
	expect(progress.length).toBeLessThanOrEqual(52)
})

test('progress counts every triangle of the part, also when a sample is measured', () => {
	const geometry = new THREE.SphereGeometry(5, 48, 32).toNonIndexed()
	const triangles = geometry.attributes.position.count / 3
	const progress = []
	measurePartThickness(partOf(geometry), { budget: 200, onProgress: (done, total) => progress.push([done, total]) })
	expect(progress.every(([, total]) => total === triangles)).toBe(true)
	expect(progress[progress.length - 1]).toEqual([triangles, triangles])
	expect(progress[0][0]).toBeGreaterThan(1)
})
