/**
 * Which way is up: the turn that brings the file's up to the viewer's.
 */
import * as THREE from 'three'
import { UPS, applyUp, defaultUp, upRotation } from '../../../src/pointclouds/upAxis.js'

const fileUp = { '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] }

test.each(UPS)('%s brings the file\'s up to the viewer\'s', (up) => {
	const root = new THREE.Object3D()
	applyUp(root, up)
	root.updateMatrixWorld()

	const turned = new THREE.Vector3(...fileUp[up]).applyMatrix4(root.matrixWorld)

	expect(turned.x).toBeCloseTo(0)
	expect(turned.y).toBeCloseTo(1)
	expect(turned.z).toBeCloseTo(0)
})

test('the rotations', () => {
	expect(upRotation('+y').x).toBe(0)
	expect(upRotation('-y').x).toBeCloseTo(Math.PI)
	expect(upRotation('+z').x).toBeCloseTo(-Math.PI / 2)
	expect(upRotation('-z').x).toBeCloseTo(Math.PI / 2)
})

test('survey formats default to Z up, the rest to Y up', () => {
	for (const format of ['las', 'laz', 'e57']) expect(defaultUp(format)).toBe('+z')
	for (const format of ['pcd', 'xyz', 'ply']) expect(defaultUp(format)).toBe('+y')
})
