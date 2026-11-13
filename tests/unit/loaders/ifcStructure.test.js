/**
 * An IFC model is drawn flat, from geometry alone; the Parts panel names its elements and
 * puts them under their storeys afterwards, without moving anything.
 */
import * as THREE from 'three'
import { applyIfcStructure } from '../../../src/loaders/ifcStructure.js'

const mesh = (expressID, geometryExpressID, x = 0) => {
	const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
	m.name = `IFC_${expressID}_${geometryExpressID}`
	m.userData.ifc = { expressID, geometryExpressID }
	m.position.x = x
	return m
}

const description = () => ({
	elements: new Map([
		[26, { expressID: 26, typeLabel: 'Wall', name: 'North wall', globalId: 'g26' }],
		[30, { expressID: 30, typeLabel: 'Wall', name: '', globalId: 'g30' }],
		[41, { expressID: 41, typeLabel: 'Door', name: 'Front door', globalId: 'g41' }],
		[50, { expressID: 50, typeLabel: 'Slab', name: 'Slab', globalId: 'g50' }],
	]),
	containerOf: new Map([[26, 17], [30, 17], [41, 39]]),
	containers: new Map([[17, { expressID: 17, typeLabel: 'Building Storey', name: 'Level 1' }], [39, { expressID: 39, typeLabel: 'Building Storey', name: 'Level 2' }]]),
})

describe('applyIfcStructure', () => {
	it('names each element, and groups the elements under the storey that holds them', () => {
		const root = new THREE.Group()
		root.add(mesh(26, 35, 1), mesh(30, 36, 2), mesh(41, 44, 3), mesh(50, 55, 4))

		expect(applyIfcStructure(root, description())).toBe(4)

		// The element no storey holds stays where it was; the two storeys are added beside it
		expect(root.children.map((child) => child.name)).toEqual(['Slab', 'Level 1', 'Level 2'])
		const [, level1, level2] = root.children
		expect(level1.children.map((child) => child.name)).toEqual(['North wall', 'Wall'])
		expect(level2.children.map((child) => child.name)).toEqual(['Front door'])
		expect(level1.userData.ifc).toMatchObject({ expressID: 17, typeLabel: 'Building Storey' })
	})

	it('records what the file says on the element, keeping the geometry it was drawn from', () => {
		const root = new THREE.Group()
		const wall = mesh(26, 35)
		root.add(wall)
		applyIfcStructure(root, description())
		expect(wall.userData.ifc).toEqual({
			expressID: 26,
			geometryExpressID: 35,
			typeLabel: 'Wall',
			name: 'North wall',
			globalId: 'g26',
			storey: 'Level 1',
		})
	})

	it('moves nothing: a group carries no transform', () => {
		const root = new THREE.Group()
		const wall = mesh(26, 35, 7)
		root.add(wall)
		root.updateMatrixWorld(true)
		const before = new THREE.Vector3().setFromMatrixPosition(wall.matrixWorld)
		applyIfcStructure(root, description())
		root.updateMatrixWorld(true)
		expect(new THREE.Vector3().setFromMatrixPosition(wall.matrixWorld).equals(before)).toBe(true)
	})

	it('makes one group of an element drawn from several geometries', () => {
		const root = new THREE.Group()
		root.add(mesh(26, 35), mesh(26, 36), mesh(50, 55))
		applyIfcStructure(root, description())

		const [slab, level1] = root.children
		expect(level1.name).toBe('Level 1')
		const [wall] = level1.children
		expect(wall.isGroup).toBe(true)
		expect(wall.name).toBe('North wall')
		expect(wall.children.map((child) => child.name)).toEqual(['North wall (1/2)', 'North wall (2/2)'])
		expect(slab.isMesh).toBe(true)
	})

	it('lists an element the file has no line for by its express ID, and does nothing twice', () => {
		const root = new THREE.Group()
		root.add(mesh(99, 1))
		const empty = { elements: new Map(), containerOf: new Map(), containers: new Map() }
		expect(applyIfcStructure(root, empty)).toBe(1)
		expect(root.children[0].name).toBe('IFC_99_1')
		// Named once: a second pass finds nothing left to do
		expect(applyIfcStructure(root, description())).toBe(0)
	})
})
