/**
 * What Send to Slicer sends: a slicer reads an STL, OBJ or PLY as millimetres, so a copy
 * is written in millimetres, and a file is sent as it is only when that is what it holds.
 */
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { parseInMillimetres, sendsFileAsIs } from '../../../src/utils/slicerExport.js'

const passthrough = { extension: 'stl', passthroughFormats: ['stl', '3mf'], fileId: 7, unitChosen: false, millimetresPerUnit: 1 }

test('writes the STL in millimetres', () => {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
	const root = new THREE.Group()
	root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()))
	root.updateMatrixWorld(true)

	const stl = parseInMillimetres(root, 25.4, () => new STLExporter().parse(root))

	expect(stl).toContain('vertex 25.4 0 0')
})

test('sends a passthrough file as-is otherwise', () => {
	expect(sendsFileAsIs(passthrough)).toBe(true)
	// A 3MF records its unit: whatever the viewer's scale, the file says what it is in
	expect(sendsFileAsIs({ ...passthrough, extension: '3mf', millimetresPerUnit: 1000 })).toBe(true)
})

test('converts a passthrough format whose unit was set to something other than millimetres', () => {
	expect(sendsFileAsIs({ ...passthrough, unitChosen: true, millimetresPerUnit: 25.4 })).toBe(false)
	expect(sendsFileAsIs({ ...passthrough, unitChosen: true, millimetresPerUnit: 1 })).toBe(true)
})

test('converts anything not on the passthrough list, or with no file to send', () => {
	expect(sendsFileAsIs({ ...passthrough, extension: 'obj' })).toBe(false)
	expect(sendsFileAsIs({ ...passthrough, fileId: null })).toBe(false)
	expect(sendsFileAsIs({ ...passthrough, extension: '' })).toBe(false)
	expect(sendsFileAsIs({ ...passthrough, passthroughFormats: ['STL'] })).toBe(true)
})
