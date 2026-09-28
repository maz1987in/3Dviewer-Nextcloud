/**
 * The 3MF writer: that what it packages is a well-formed 3MF a slicer will open, with
 * the model standing the right way up.
 */
import * as THREE from 'three'
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js'
import { build3MF, build3MFModelXml } from '../../../src/utils/threeMFWriter.js'

const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml')

function vertices(doc) {
	return [...doc.getElementsByTagName('vertex')].map((v) => ['x', 'y', 'z'].map((k) => Number(v.getAttribute(k))))
}

describe('build3MF', () => {
	it('packages the three parts a 3MF reader requires', () => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
		const files = unzipSync(build3MF(mesh))
		expect(Object.keys(files).sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels'])

		const doc = parse(strFromU8(files['3D/3dmodel.model']))
		expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
		expect(doc.documentElement.getAttribute('unit')).toBe('millimeter')
		// A box: 24 vertices (split normals), 12 triangles
		expect(doc.getElementsByTagName('vertex')).toHaveLength(24)
		expect(doc.getElementsByTagName('triangle')).toHaveLength(12)
		expect(doc.getElementsByTagName('item')).toHaveLength(1)
	})

	it('refuses a model with nothing to print', () => {
		expect(() => build3MF(new THREE.Group())).toThrow(/no triangle meshes/)
	})
})

describe('build3MFModelXml', () => {
	it('turns Y-up into Z-up, so a tall part stays standing', () => {
		// 10 tall in three.js (Y), sitting on the ground
		const geometry = new THREE.BoxGeometry(1, 10, 1).translate(0, 5, 0)
		const { xml } = build3MFModelXml(new THREE.Mesh(geometry))
		const zs = vertices(parse(xml)).map((v) => v[2])
		expect(Math.min(...zs)).toBeCloseTo(0, 6)
		expect(Math.max(...zs)).toBeCloseTo(10, 6)
	})

	it('writes each mesh where the scene puts it', () => {
		const group = new THREE.Group()
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
		mesh.position.set(100, 0, 0)
		group.add(mesh)
		group.scale.setScalar(2)
		const xs = vertices(parse(build3MFModelXml(group).xml)).map((v) => v[0])
		expect(Math.min(...xs)).toBeCloseTo(199, 6)
		expect(Math.max(...xs)).toBeCloseTo(201, 6)
	})

	it('keeps faces pointing outward on a mirrored mesh', () => {
		const tri = new THREE.BufferGeometry()
		tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
		const plain = parse(build3MFModelXml(new THREE.Mesh(tri)).xml).getElementsByTagName('triangle')[0]
		const mirrored = new THREE.Mesh(tri)
		mirrored.scale.x = -1
		const flipped = parse(build3MFModelXml(mirrored).xml).getElementsByTagName('triangle')[0]
		expect([plain.getAttribute('v2'), plain.getAttribute('v3')]).toEqual(['1', '2'])
		expect([flipped.getAttribute('v2'), flipped.getAttribute('v3')]).toEqual(['2', '1'])
	})

	it('skips hidden meshes, lines and degenerate triangles, and escapes names', () => {
		const group = new THREE.Group()
		const hidden = new THREE.Mesh(new THREE.BoxGeometry())
		hidden.visible = false
		group.add(hidden)
		group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)])))

		const degenerate = new THREE.BufferGeometry()
		degenerate.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
		degenerate.setIndex([0, 1, 2, 0, 0, 1])
		const named = new THREE.Mesh(degenerate)
		named.name = 'Bolt <M3> & "nut"'
		group.add(named)

		const { xml, objectCount } = build3MFModelXml(group)
		const doc = parse(xml)
		expect(objectCount).toBe(1)
		expect(doc.getElementsByTagName('triangle')).toHaveLength(1)
		expect(doc.getElementsByTagName('object')[0].getAttribute('name')).toBe('Bolt <M3> & "nut"')
	})
})
