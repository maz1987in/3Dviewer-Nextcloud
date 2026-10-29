/**
 * withOwnDisplayState shows the model as it is, whatever viewer tools are showing of it,
 * for one synchronous call, then gives the viewer its state back, even when the call
 * throws. Each tool's piece has a section here.
 */
import * as THREE from 'three'
import { withOwnDisplayState } from '../../../src/utils/ownDisplayState.js'
import { restoreOwnMaterial, showStandIn } from '../../../src/utils/materialStandIns.js'
import { setHiddenByViewer } from '../../../src/utils/viewerHidden.js'

const boom = () => { throw new Error('boom') }

describe('materials and hidden parts', () => {
	function model() {
		const own = new THREE.MeshStandardMaterial()
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), own)
		const layer = new THREE.Group()
		const root = new THREE.Group()
		root.add(mesh, layer)
		return { root, mesh, own, layer }
	}

	it('shows own materials and hidden parts for the call, and the viewer\'s state after', () => {
		const { root, mesh, own, layer } = model()
		const standIn = new THREE.MeshNormalMaterial()
		showStandIn(mesh, standIn)
		setHiddenByViewer(layer, true)

		const seen = withOwnDisplayState(root, () => ({ material: mesh.material, visible: layer.visible }))

		expect(seen).toEqual({ material: own, visible: true })
		expect(mesh.material).toBe(standIn)
		expect(layer.visible).toBe(false)
		restoreOwnMaterial(mesh)
	})

	it('gives the viewer its state back when the call throws', () => {
		const { root, mesh, layer } = model()
		const standIn = new THREE.MeshNormalMaterial()
		showStandIn(mesh, standIn)
		setHiddenByViewer(layer, true)

		expect(() => withOwnDisplayState(root, boom)).toThrow('boom')

		expect(mesh.material).toBe(standIn)
		expect(layer.visible).toBe(false)
		restoreOwnMaterial(mesh)
	})

	it('returns what the call returns, and does nothing to a model no tool touched', () => {
		const { root, mesh, own } = model()
		expect(withOwnDisplayState(root, () => 42)).toBe(42)
		expect(mesh.material).toBe(own)
	})
})

describe('withMillimetres', () => {
	const { withMillimetres } = require('../../../src/utils/ownDisplayState.js')
	const { STLExporter } = require('three/examples/jsm/exporters/STLExporter.js')

	function model() {
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
		const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
		const root = new THREE.Group()
		root.add(mesh)
		root.position.set(2, 0, 0)
		root.updateMatrixWorld(true)
		return { root, mesh }
	}

	it('writes every part scaled to millimetres', () => {
		const { root } = model()
		const stl = withMillimetres(root, 25.4, () => new STLExporter().parse(root))
		const vertices = [...stl.matchAll(/vertex (\S+) (\S+) (\S+)/g)].map((m) => m.slice(1).map(Number))

		const expected = [[50.8, 0, 0], [76.2, 0, 0], [50.8, 25.4, 0]]
		expected.forEach((point, i) => point.forEach((n, j) => expect(vertices[i][j]).toBeCloseTo(n, 6)))
	})

	it('gives the world matrices back, even when the call throws', () => {
		const { root, mesh } = model()
		const before = mesh.matrixWorld.clone()

		withMillimetres(root, 10, () => null)
		expect(mesh.matrixWorld.equals(before)).toBe(true)

		expect(() => withMillimetres(root, 10, boom)).toThrow('boom')
		expect(mesh.matrixWorld.equals(before)).toBe(true)
	})

	it('leaves a model in millimetres alone', () => {
		const { root } = model()
		expect(withMillimetres(root, 1, () => new STLExporter().parse(root))).toContain('vertex 3 0 0')
	})
})
