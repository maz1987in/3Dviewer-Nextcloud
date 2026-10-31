/**
 * The scan as the viewer holds it: a THREE.Points with its colours, size and what it is.
 */
import * as THREE from 'three'
import { buildPointCloud, setColourBy, setPointSize } from '../../../src/pointclouds/buildPointCloud.js'

function data(extra = {}) {
	return {
		positions: new Float32Array([0, 0, 0, 1, 2, 3]),
		count: 2,
		total: 8,
		origin: [500000, 4500000, 0],
		bounds: { min: [0, 0, 0], max: [1, 2, 3] },
		...extra,
	}
}

test('a Points with what the viewer needs to know about it', () => {
	const points = buildPointCloud(data(), { fileName: 'site.las', format: 'las', unit: 'ft', defaultUp: '+z' })

	expect(points).toBeInstanceOf(THREE.Points)
	expect(points.name).toBe('site.las')
	expect(points.geometry.getAttribute('position').count).toBe(2)
	expect(points.geometry.getAttribute('color').normalized).toBe(true)
	expect(points.material.size).toBe(2)
	expect(points.material.sizeAttenuation).toBe(false)
	expect(points.material.vertexColors).toBe(true)
	expect(points.geometry.boundingBox).not.toBeNull()
	const meta = points.userData.tdvPointCloud
	expect(meta).toMatchObject({
		format: 'las',
		count: 2,
		total: 8,
		attributes: { color: false, intensity: false, classification: false },
		origin: [500000, 4500000, 0],
		unit: 'ft',
		defaultUp: '+z',
		up: '+z',
		colourBy: 'height',
	})
})

test('with its own colours it starts coloured by them', () => {
	const points = buildPointCloud(data({ colors: new Uint8Array([255, 0, 0, 0, 255, 0]) }), { fileName: 'a.xyz', format: 'xyz', unit: null, defaultUp: '+y' })

	expect(points.userData.tdvPointCloud.colourBy).toBe('file')
	expect(Array.from(points.geometry.getAttribute('color').array)).toEqual([255, 0, 0, 0, 255, 0])
})

test('point size is clamped to 1–10 px', () => {
	const points = buildPointCloud(data(), { fileName: 'a.xyz', format: 'xyz', unit: null, defaultUp: '+y' })

	expect(setPointSize(points, 20)).toBe(10)
	expect(points.material.size).toBe(10)
	expect(setPointSize(points, 0.2)).toBe(1)
	expect(setPointSize(points, 3.5)).toBe(3.5)
})

test('colour by changes the colours, and refuses what the cloud lacks', () => {
	const points = buildPointCloud(data(), { fileName: 'a.xyz', format: 'xyz', unit: null, defaultUp: '+y' })
	const color = points.geometry.getAttribute('color')
	const before = color.version

	expect(setColourBy(points, 'intensity')).toBe(false)
	expect(points.userData.tdvPointCloud.colourBy).toBe('height')

	expect(setColourBy(points, 'single')).toBe(true)
	expect(points.userData.tdvPointCloud.colourBy).toBe('single')
	expect(color.version).toBeGreaterThan(before)
	expect(Array.from(color.array.slice(0, 3))).toEqual([0x8f, 0xa3, 0xb3])
})
