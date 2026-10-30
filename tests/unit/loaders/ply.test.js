/**
 * @jest-environment node
 */
/**
 * A PLY is a mesh or a scan: one with faces stays a mesh, one with none opens as points,
 * and a mesh too large to load whole is refused before it is read.
 */
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { loadModelByExtension } from '../../../src/loaders/registry.js'
import { parsePointCloud } from '../../../src/pointclouds/parsePointCloud.js'

jest.mock('../../../src/pointclouds/parsePointCloud.js', () => ({ parsePointCloud: jest.fn() }))

const sink = { positions: new Float32Array([0, 0, 0, 1, 1, 1]), count: 2, total: 2, origin: [0, 0, 0], bounds: { min: [0, 0, 0], max: [1, 1, 1] } }
const context = () => ({ THREE, fileExtension: 'ply', ensurePlaceholderRemoved: () => {} })
const bytes = (name) => fs.readFileSync(path.join(__dirname, '../../fixtures', name))

beforeEach(() => parsePointCloud.mockReset())

test('a PLY with no faces opens as points', async () => {
	parsePointCloud.mockResolvedValue({ sink, unit: null, format: 'ply' })

	const result = await loadModelByExtension('ply', new Blob([bytes('pointclouds/points-binary-le.ply')]), context())

	expect(result.object3D).toBeInstanceOf(THREE.Points)
	expect(parsePointCloud.mock.calls[0][1]).toBe('ply')
	expect(result.object3D.userData.tdvPointCloud.defaultUp).toBe('+y')
})

test('a PLY with faces stays a mesh, from a Blob or an ArrayBuffer', async () => {
	const mesh = bytes('triangle.ply')

	for (const input of [new Blob([mesh]), mesh.buffer.slice(mesh.byteOffset, mesh.byteOffset + mesh.byteLength)]) {
		const result = await loadModelByExtension('ply', input, context())
		expect(result.object3D).toBeInstanceOf(THREE.Mesh)
	}
	expect(parsePointCloud).not.toHaveBeenCalled()
})

test('a mesh PLY over 500 MB is refused before it is read', async () => {
	const big = new Blob([bytes('triangle.ply')])
	Object.defineProperty(big, 'size', { value: 600 * 1024 ** 2 })

	await expect(loadModelByExtension('ply', big, context())).rejects.toThrow('This model is 600 MB. The viewer opens models up to 500 MB.')
})

test('a splat PLY is left to the mesh path', async () => {
	const splat = 'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty float f_dc_0\nend_header\n0 0 0 1\n1 0 0 1\n0 1 0 1\n'

	await loadModelByExtension('ply', new Blob([splat]), context())

	expect(parsePointCloud).not.toHaveBeenCalled()
})
