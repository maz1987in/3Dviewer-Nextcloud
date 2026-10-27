/**
 * The 3MF writer: that what it packages is a well-formed 3MF a slicer will open, with
 * the model standing the right way up.
 */
import * as THREE from 'three'
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
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
		// A box: three.js keeps 24 vertices (one per face corner); welded, its 8 corners
		expect(doc.getElementsByTagName('vertex')).toHaveLength(8)
		expect(doc.getElementsByTagName('triangle')).toHaveLength(12)
		expect(doc.getElementsByTagName('item')).toHaveLength(1)
	})

	it('refuses a model with nothing to print', () => {
		expect(build3MF(new THREE.Group())).toBeNull()
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

/*
 * Every edge of a closed solid is shared by exactly two triangles, once in each direction.
 * That only holds in the file if the triangles share vertices: three.js splits them per
 * face, and an STL arrives with three of its own per triangle.
 */
function edgeUse(doc) {
	const uses = new Map()
	for (const t of doc.getElementsByTagName('triangle')) {
		const [a, b, c] = ['v1', 'v2', 'v3'].map((k) => t.getAttribute(k))
		for (const [p, q] of [[a, b], [b, c], [c, a]]) {
			uses.set(`${p}>${q}`, (uses.get(`${p}>${q}`) ?? 0) + 1)
		}
	}
	return uses
}

function expectClosed(doc) {
	const uses = edgeUse(doc)
	for (const [edge, n] of uses) {
		const [p, q] = edge.split('>')
		expect(n).toBe(1)
		expect(uses.get(`${q}>${p}`)).toBe(1)
	}
}

describe('a closed model stays closed', () => {
	it('welds a box into a closed solid', () => {
		const doc = parse(build3MFModelXml(new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4))).xml)
		expectClosed(doc)
	})

	it('welds an STL-style triangle soup the same way', () => {
		const soup = new THREE.BoxGeometry(2, 3, 4).toNonIndexed()
		expect(soup.index).toBeNull()
		const doc = parse(build3MFModelXml(new THREE.Mesh(soup)).xml)
		expect(doc.getElementsByTagName('vertex')).toHaveLength(8)
		expect(doc.getElementsByTagName('triangle')).toHaveLength(12)
		expectClosed(doc)
	})

	it('drops a triangle that welding collapses', () => {
		const g = new THREE.BufferGeometry()
		// The third corner is the first one again, a hair away
		g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1e-9, 0, 0], 3))
		expect(build3MF(new THREE.Mesh(g))).toBeNull()
	})
})

describe('what is written', () => {
	it('leaves out a mesh inside a hidden group', () => {
		const group = new THREE.Group()
		const hiddenGroup = new THREE.Group()
		hiddenGroup.visible = false
		hiddenGroup.add(new THREE.Mesh(new THREE.BoxGeometry()))
		group.add(hiddenGroup, new THREE.Mesh(new THREE.BoxGeometry()))
		expect(build3MFModelXml(group).objectCount).toBe(1)
	})

	it('writes every copy an InstancedMesh draws, where it draws it', () => {
		const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 3)
		for (let i = 0; i < 3; i++) {
			mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 10, 0, 0))
		}
		const { xml, objectCount } = build3MFModelXml(mesh)
		expect(objectCount).toBe(3)
		const xs = vertices(parse(xml)).map((v) => v[0])
		expect(Math.max(...xs)).toBeCloseTo(20.5, 6)
	})

	it('strips characters XML cannot hold from a name', () => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry())
		mesh.name = 'Part\u0001 A'
		const doc = parse(build3MFModelXml(mesh).xml)
		expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
		expect(doc.getElementsByTagName('object')[0].getAttribute('name')).toBe('Part A')
	})
})

describe('read back by a 3MF reader', () => {
	it('opens in three.js\'s 3MF loader with the shape it was written with', () => {
		// 10 × 20 × 30, standing 20 tall in three.js (Y)
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 30))
		const bytes = build3MF(mesh)
		const group = new ThreeMFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))

		const meshes = []
		group.traverse((c) => { if (c.isMesh) meshes.push(c) })
		expect(meshes).toHaveLength(1)
		meshes[0].geometry.computeBoundingBox()
		const size = meshes[0].geometry.boundingBox.getSize(new THREE.Vector3())
		// In the file the part is Z-up: 10 wide, 30 deep, 20 tall
		expect(size.x).toBeCloseTo(10, 4)
		expect(size.y).toBeCloseTo(30, 4)
		expect(size.z).toBeCloseTo(20, 4)
	})
})

describe('units', () => {
	it('writes a model loaded in metres (a glTF) in millimetres', () => {
		// A 2 m tall box, as a glTF holds it
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0))
		const zs = vertices(parse(build3MFModelXml(mesh, { millimetresPerUnit: 1000 }).xml)).map((v) => v[2])
		expect(Math.min(...zs)).toBeCloseTo(0, 6)
		expect(Math.max(...zs)).toBeCloseTo(2000, 6)
		expect(build3MFModelXml(mesh, { millimetresPerUnit: 1000 }).xml).toContain('unit="millimeter"')
	})

	it('writes a model in millimetres as it is', () => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0))
		const zs = vertices(parse(build3MFModelXml(mesh).xml)).map((v) => v[2])
		expect(Math.max(...zs)).toBeCloseTo(2, 6)
	})
})
