/**
 * The registry of material properties viewer tools changed. It must remember each
 * material's own value, from before the first change, so taking a tool off gives a
 * material back what the file gave it, not a default.
 */
import * as THREE from 'three'
import {
	ownValueOf,
	restoreOwn,
	setForViewer,
	setViewerWireframe,
	withOwnMaterialProps,
} from '../../../src/utils/viewerMaterialProps.js'
import { restoreOwnMaterial, showStandIn } from '../../../src/utils/materialStandIns.js'

describe('setForViewer and restoreOwn', () => {
	it('remember the value from before the first change, not a later one', () => {
		const material = new THREE.MeshBasicMaterial({ wireframe: true })
		setForViewer(material, 'wireframe', false)
		setForViewer(material, 'wireframe', true)
		setForViewer(material, 'wireframe', false)
		expect(ownValueOf(material, 'wireframe')).toBe(true)
		restoreOwn(material, 'wireframe')
		expect(material.wireframe).toBe(true)
	})

	it('change a Color in place and give the same Color its own value back', () => {
		const material = new THREE.LineBasicMaterial({ color: 0xffffff })
		const color = material.color
		setForViewer(material, 'color', new THREE.Color(0xff5722))
		expect(material.color).toBe(color)
		expect(material.color.getHex()).toBe(0xff5722)
		restoreOwn(material, 'color')
		expect(material.color).toBe(color)
		expect(material.color.getHex()).toBe(0xffffff)
	})

	it('leave a material no tool changed alone', () => {
		const material = new THREE.MeshBasicMaterial({ wireframe: true })
		restoreOwn(material, 'wireframe')
		expect(material.wireframe).toBe(true)
		expect(ownValueOf(material, 'wireframe')).toBe(true)
	})
})

describe('withOwnMaterialProps', () => {
	it('shows own values for the call, the viewer\'s after, and returns what the call does', () => {
		const material = new THREE.MeshBasicMaterial()
		const root = new THREE.Mesh(new THREE.BoxGeometry(), material)
		setForViewer(material, 'wireframe', true)
		expect(withOwnMaterialProps(root, () => material.wireframe)).toBe(false)
		expect(material.wireframe).toBe(true)
	})

	it('gives the viewer\'s values back when the call throws', () => {
		const material = new THREE.MeshBasicMaterial()
		const root = new THREE.Mesh(new THREE.BoxGeometry(), material)
		setForViewer(material, 'wireframe', true)
		expect(() => withOwnMaterialProps(root, () => { throw new Error('boom') })).toThrow('boom')
		expect(material.wireframe).toBe(true)
	})

	it('changes a shared material once, and a multi-material mesh\'s every material', () => {
		const shared = new THREE.MeshBasicMaterial()
		const other = new THREE.MeshPhongMaterial()
		const root = new THREE.Group()
		root.add(new THREE.Mesh(new THREE.BoxGeometry(), shared))
		root.add(new THREE.Mesh(new THREE.BoxGeometry(), shared))
		root.add(new THREE.Mesh(new THREE.BoxGeometry(), [shared, other]))
		setViewerWireframe(root, true)
		const seen = withOwnMaterialProps(root, () => [shared.wireframe, other.wireframe])
		expect(seen).toEqual([false, false])
		expect(shared.wireframe).toBe(true)
		expect(other.wireframe).toBe(true)
	})
})

describe('setViewerWireframe', () => {
	it('turns a whole model, multi-material meshes included, to wireframe and back', () => {
		const a = new THREE.MeshBasicMaterial()
		const b = new THREE.MeshPhongMaterial()
		const root = new THREE.Group()
		root.add(new THREE.Mesh(new THREE.BoxGeometry(), a))
		root.add(new THREE.Mesh(new THREE.BoxGeometry(), [a, b]))
		setViewerWireframe(root, true)
		expect([a.wireframe, b.wireframe]).toEqual([true, true])
		setViewerWireframe(root, false)
		expect([a.wireframe, b.wireframe]).toEqual([false, false])
	})

	it('gives a material the file made wireframe its wireframe back when switched off', () => {
		const fromFile = new THREE.MeshBasicMaterial({ wireframe: true })
		const root = new THREE.Mesh(new THREE.BoxGeometry(), fromFile)
		setViewerWireframe(root, true)
		setViewerWireframe(root, false)
		expect(fromFile.wireframe).toBe(true)
	})

	it('changes the own materials under a stand-in, and the stand-in follows them', () => {
		const own = new THREE.MeshBasicMaterial({ wireframe: true })
		const standIn = new THREE.MeshNormalMaterial()
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), own)
		showStandIn(mesh, standIn)
		setViewerWireframe(mesh, true)
		expect(standIn.wireframe).toBe(true)
		setViewerWireframe(mesh, false)
		// The stand-in shows what its own material does: the file's wireframe
		expect(standIn.wireframe).toBe(true)
		expect(own.wireframe).toBe(true)
		restoreOwnMaterial(mesh)
	})
})
