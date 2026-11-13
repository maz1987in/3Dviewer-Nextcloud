/**
 * The tree of a model's parts, and what hiding and isolating do to the scene: how a node
 * with no name is called, how a chain of single-child nodes becomes one row, that the tree
 * is made as it is opened, and that hiding is the model's own `visible` flag, which render
 * modes and Exploded view leave alone and Show all puts back as the file had it.
 */
import * as THREE from 'three'
import {
	chainLabel,
	createPartsModel,
	createPartsVisibility,
	ifcElementOf,
	isGenericName,
	partLabel,
	SEARCH_LIMIT,
} from '../../../src/utils/partsTree.js'
import { withViewerHiddenShown } from '../../../src/utils/viewerHidden.js'
import { useRenderMode } from '../../../src/composables/useRenderMode.js'
import { useExplodedView } from '../../../src/composables/useExplodedView.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// jsdom has no 2D canvas, which Clay mode draws its matcap on
beforeAll(() => {
	jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

const mesh = (name = '', material = new THREE.MeshBasicMaterial()) => {
	const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
	m.name = name
	return m
}
const group = (name = '', ...children) => {
	const g = new THREE.Group()
	g.name = name
	children.forEach((child) => g.add(child))
	return g
}

/**
 * Scene > Assembly > [ Housing > [Lid, Base], Bolt, Shaft > Gear ]
 * `Shaft` holds one thing, so it and `Gear` are one row.
 */
function assembly() {
	const lid = mesh('Lid')
	const base = mesh('Base')
	const housing = group('Housing', lid, base)
	const bolt = mesh('Bolt')
	const gear = mesh('Gear')
	const shaft = group('Shaft', gear)
	const root = group('Scene', group('Assembly', housing, bolt, shaft))
	root.updateMatrixWorld(true)
	return { root, housing, lid, base, bolt, shaft, gear }
}

describe('names', () => {
	it('treats what a loader makes up as no name', () => {
		for (const generic of ['', '  ', 'Mesh', 'Mesh_3', 'Mesh.001', 'mesh_3_instance_0', 'Group', 'Object3D', 'Node', 'Scene', 'RootNode', 'defaultobject']) {
			expect(isGenericName(generic)).toBe(true)
		}
		for (const real of ['Housing', 'Bolt M8', 'Cube.001', 'Meshing plate', 'IFC_12_34']) {
			expect(isGenericName(real)).toBe(false)
		}
		expect(isGenericName(undefined)).toBe(true)
	})

	it('uses the node\'s own name when it has one', () => {
		expect(partLabel(mesh('Housing'), 4)).toEqual({ label: 'Housing', secondary: '', named: true })
	})

	it('calls an unnamed mesh "Mesh" and its place, and an unnamed group "Group" and its place', () => {
		expect(partLabel(mesh(''), 3)).toMatchObject({ label: 'Mesh 3', named: false })
		expect(partLabel(mesh('Mesh_7'), 2)).toMatchObject({ label: 'Mesh 2', named: false })
		expect(partLabel(group(''), 5)).toMatchObject({ label: 'Group 5', named: false })
	})

	it('puts the material\'s name beside an unnamed mesh, when it has a real one', () => {
		const steel = new THREE.MeshBasicMaterial()
		steel.name = 'Brushed steel'
		expect(partLabel(mesh('', steel), 1)).toMatchObject({ label: 'Mesh 1', secondary: 'Brushed steel' })
		const generic = new THREE.MeshBasicMaterial()
		generic.name = 'Material.003'
		expect(partLabel(mesh('', generic), 1).secondary).toBe('Material.003')
		const unnamed = new THREE.MeshBasicMaterial()
		expect(partLabel(mesh('', unnamed), 1).secondary).toBe('')
	})

	it('names an IFC element by its name, with its type beside it, or by its type alone', () => {
		const wall = mesh('IFC_26_35')
		wall.userData.ifc = { expressID: 26, name: 'North wall', typeLabel: 'Wall' }
		expect(partLabel(wall, 1)).toEqual({ label: 'North wall', secondary: 'Wall', named: true })

		const anonymous = mesh('IFC_27_36')
		anonymous.userData.ifc = { expressID: 27, name: '', typeLabel: 'Slab' }
		expect(partLabel(anonymous, 1)).toEqual({ label: 'Slab', secondary: '', named: true })
	})

	it('writes a chain as its real names, outermost first, and passes over made-up ones', () => {
		const labels = [
			{ label: 'Assembly', secondary: '', named: true },
			{ label: 'Group 1', secondary: '', named: false },
			{ label: 'Bolt', secondary: 'Steel', named: true },
		]
		expect(chainLabel(labels)).toEqual({ label: 'Assembly › Bolt', secondary: 'Steel' })
	})

	it('does not repeat a name a node and its mesh share, and shortens a long chain', () => {
		const same = [{ label: 'Bolt', named: true, secondary: '' }, { label: 'Bolt', named: true, secondary: '' }]
		expect(chainLabel(same).label).toBe('Bolt')
		const long = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, named: true, secondary: '' }))
		expect(chainLabel(long).label).toBe('A › … › E')
	})

	it('falls back to the first node\'s made-up label when nothing in the chain has a name', () => {
		const labels = [{ label: 'Group 2', secondary: '', named: false }, { label: 'Mesh 1', secondary: 'Steel', named: false }]
		expect(chainLabel(labels)).toEqual({ label: 'Group 2', secondary: 'Steel' })
	})
})

describe('the tree', () => {
	it('starts below the nodes that have only one thing in them', () => {
		const { root } = assembly()
		const model = createPartsModel(root)
		// Scene > Assembly has one child at each step: the first rows are Assembly's three
		expect(model.topLevel().map((row) => row.label)).toEqual(['Housing', 'Bolt', 'Shaft › Gear'])
	})

	it('makes a chain of single-child nodes one row, and a branch two', () => {
		const { root, housing, shaft, gear } = assembly()
		const model = createPartsModel(root)
		const [housingRow, boltRow, shaftRow] = model.topLevel()

		expect(housingRow.expandable).toBe(true)
		expect(boltRow.expandable).toBe(false)
		expect(shaftRow.chain).toEqual([shaft, gear])
		expect(shaftRow.expandable).toBe(false)
		expect(shaftRow.head).toBe(shaft)
		expect(housingRow.head).toBe(housing)
		expect(model.childrenOf(housingRow).map((row) => row.label)).toEqual(['Lid', 'Base'])
	})

	it('counts the parts in each row, and a model\'s lights and empty groups are not parts', () => {
		const { root, housing } = assembly()
		housing.add(new THREE.PointLight())
		housing.add(group('Empty'))
		const model = createPartsModel(root)
		expect(model.parts).toBe(4)
		expect(model.topLevel().map((row) => row.parts)).toEqual([2, 1, 1])
		expect(model.childrenOf(model.topLevel()[0])).toHaveLength(2)
	})

	it('opens on the parts themselves for a model that is one mesh', () => {
		const solo = mesh('Cube')
		const model = createPartsModel(group('Scene', solo))
		expect(model.topLevel().map((row) => row.label)).toEqual(['Cube'])
		expect(model.parts).toBe(1)
	})

	it('makes a row\'s children only when they are asked for', () => {
		const { root, lid } = assembly()
		const model = createPartsModel(root)
		const [housingRow] = model.topLevel()
		// The first rows exist; what is under Housing does not yet
		expect(model.get(housingRow.id)).toBe(housingRow)
		expect(model.get(lid.uuid)).toBeNull()
		model.childrenOf(housingRow)
		expect(model.get(lid.uuid)).not.toBeNull()
	})

	it('is made for a deep, wide model without overflowing the stack or making every row', () => {
		const root = new THREE.Group()
		let node = root
		for (let i = 0; i < 3000; i++) {
			const next = group(`Level ${i}`)
			node.add(next)
			node = next
		}
		for (let i = 0; i < 2000; i++) node.add(mesh(`Part ${i}`))
		const model = createPartsModel(root)
		expect(model.parts).toBe(2000)
		expect(model.topLevel()).toHaveLength(2000)
	})

	it('finds the row a picked mesh belongs to, with the rows above it', () => {
		const { root, lid, gear, bolt } = assembly()
		const model = createPartsModel(root)

		expect(model.pathTo(lid).map((row) => row.label)).toEqual(['Housing', 'Lid'])
		expect(model.pathTo(bolt).map((row) => row.label)).toEqual(['Bolt'])
		// Gear is inside the Shaft › Gear row
		expect(model.pathTo(gear).map((row) => row.label)).toEqual(['Shaft › Gear'])
		expect(model.pathTo(mesh('Elsewhere'))).toBeNull()
	})

	it('searches names and types across the whole tree as a flat list, up to a limit', () => {
		const { root } = assembly()
		const model = createPartsModel(root)
		expect(model.search('ba').matches.map((row) => row.label)).toEqual(['Base'])
		expect(model.search('  GEAR ').matches.map((row) => row.label)).toEqual(['Shaft › Gear'])
		expect(model.search('').matches).toEqual([])

		const wide = new THREE.Group()
		for (let i = 0; i < SEARCH_LIMIT + 50; i++) wide.add(mesh(`Bolt ${i}`))
		const result = createPartsModel(wide).search('bolt')
		expect(result.matches).toHaveLength(SEARCH_LIMIT)
		expect(result.truncated).toBe(true)
	})

	it('lists every mesh a row holds, to tint or to frame', () => {
		const { root, lid, base } = assembly()
		const model = createPartsModel(root)
		expect(model.renderablesOf(model.topLevel()[0])).toEqual([lid, base])
	})

	it('finds an IFC element in a row, innermost first', () => {
		const storey = group('Level 1')
		storey.userData.ifc = { expressID: 17, name: 'Level 1' }
		const wall = mesh('North wall')
		wall.userData.ifc = { expressID: 26 }
		storey.add(wall)
		const model = createPartsModel(group('Scene', storey, mesh('Other')))
		const [row] = model.topLevel()
		// Level 1 holds one element, so the two are one row, and the element is the part
		expect(row.chain).toEqual([storey, wall])
		expect(ifcElementOf(row)).toEqual({ expressID: 26 })
		expect(ifcElementOf(model.topLevel()[1])).toBeNull()
	})
})

describe('hiding and isolating', () => {
	it('hides a row by hiding its node, and shows it again', () => {
		const { root, bolt } = assembly()
		const model = createPartsModel(root)
		const visibility = createPartsVisibility(model)
		const boltRow = model.topLevel()[1]

		expect(visibility.setHidden(boltRow, true)).toBe(true)
		expect(bolt.visible).toBe(false)
		expect(visibility.isHidden(boltRow)).toBe(true)
		expect(visibility.hiddenCount).toBe(1)

		expect(visibility.setHidden(boltRow, false)).toBe(true)
		expect(bolt.visible).toBe(true)
		expect(visibility.hiddenCount).toBe(0)
		// Nothing changed the second time
		expect(visibility.setHidden(boltRow, false)).toBe(false)
	})

	it('hides every node of a row that is a chain, and the whole row when its tail alone is hidden', () => {
		const { root, shaft, gear } = assembly()
		const model = createPartsModel(root)
		const visibility = createPartsVisibility(model)
		const shaftRow = model.topLevel()[2]

		visibility.setHidden(shaftRow, true)
		expect(shaft.visible).toBe(false)
		visibility.setHidden(shaftRow, false)
		expect(shaft.visible).toBe(true)
		expect(gear.visible).toBe(true)

		gear.visible = false
		expect(visibility.isHidden(shaftRow)).toBe(true)
	})

	it('hides what is inside a hidden row, and will not show a part inside one by itself', () => {
		const { root, housing, lid } = assembly()
		const model = createPartsModel(root)
		const visibility = createPartsVisibility(model)
		const [housingRow] = model.topLevel()
		const [lidRow] = model.childrenOf(housingRow)

		visibility.setHidden(housingRow, true)
		expect(housing.visible).toBe(false)
		expect(visibility.isCoveredByAncestor(lidRow)).toBe(true)
		// Showing the lid would mean showing the housing, and the base with it
		expect(visibility.setHidden(lidRow, false)).toBe(false)
		expect(lid.visible).toBe(true)
		expect(housing.visible).toBe(false)
	})

	it('isolates a part: everything beside it, and beside what it is in, is hidden', () => {
		const { root, housing, lid, base, bolt, shaft } = assembly()
		const model = createPartsModel(root)
		const visibility = createPartsVisibility(model)
		const [housingRow] = model.topLevel()
		const [lidRow] = model.childrenOf(housingRow)

		visibility.isolate(lidRow)

		expect(visibility.isolatedId).toBe(lidRow.id)
		expect(lid.visible).toBe(true)
		expect(housing.visible).toBe(true)
		expect(base.visible).toBe(false)
		expect(bolt.visible).toBe(false)
		expect(shaft.visible).toBe(false)
	})

	it('puts back what was showing before when the isolation ends', () => {
		const { root, lid, base, bolt, shaft } = assembly()
		const model = createPartsModel(root)
		const visibility = createPartsVisibility(model)
		const [housingRow, boltRow] = model.topLevel()
		const [lidRow] = model.childrenOf(housingRow)

		// The user had hidden the bolt before isolating the lid
		visibility.setHidden(boltRow, true)
		visibility.isolate(lidRow)
		visibility.unisolate()

		expect(visibility.isolatedId).toBeNull()
		expect(lid.visible).toBe(true)
		expect(base.visible).toBe(true)
		expect(shaft.visible).toBe(true)
		expect(bolt.visible).toBe(false)
	})

	it('moves the isolation to another part without losing the state before the first', () => {
		const { root, bolt, shaft, housing } = assembly()
		const model = createPartsModel(root)
		const visibility = createPartsVisibility(model)
		const [, boltRow, shaftRow] = model.topLevel()

		visibility.isolate(boltRow)
		visibility.isolate(shaftRow)
		expect(bolt.visible).toBe(false)
		expect(shaft.visible).toBe(true)
		expect(housing.visible).toBe(false)

		visibility.unisolate()
		expect(bolt.visible).toBe(true)
		expect(housing.visible).toBe(true)
		expect(shaft.visible).toBe(true)
	})

	it('brings back what the user had hidden inside the part that is isolated', () => {
		const { root, base } = assembly()
		const model = createPartsModel(root)
		const visibility = createPartsVisibility(model)
		const [housingRow] = model.topLevel()
		const [, baseRow] = model.childrenOf(housingRow)

		visibility.setHidden(baseRow, true)
		visibility.isolate(housingRow)
		expect(base.visible).toBe(true)
	})

	it('Show all puts everything back as the model had it, including a part the file hid', () => {
		const { root, bolt, lid } = assembly()
		// The file itself hides the bolt, as FreeCAD does for a body it stored as hidden
		bolt.visible = false
		const model = createPartsModel(root)
		const visibility = createPartsVisibility(model)
		const [housingRow, boltRow] = model.topLevel()
		const [lidRow] = model.childrenOf(housingRow)

		visibility.setHidden(boltRow, false)
		expect(bolt.visible).toBe(true)
		visibility.setHidden(lidRow, true)
		visibility.isolate(housingRow)

		visibility.showAll()

		expect(lid.visible).toBe(true)
		expect(bolt.visible).toBe(false)
		expect(visibility.hiddenCount).toBe(0)
		expect(visibility.isolatedId).toBeNull()
	})

	it('shows everything while an export runs, and hides it again after the last export', () => {
		const { root, bolt } = assembly()
		const model = createPartsModel(root)
		const visibility = createPartsVisibility(model)
		visibility.setHidden(model.topLevel()[1], true)

		const first = visibility.suspend()
		const second = visibility.suspend()
		expect(bolt.visible).toBe(true)
		visibility.resume(first)
		expect(bolt.visible).toBe(true)
		visibility.resume(second)
		expect(bolt.visible).toBe(false)
	})

	it('ignores an export\'s resume once its model has been replaced', () => {
		const { root, bolt } = assembly()
		const model = createPartsModel(root)
		const visibility = createPartsVisibility(model)
		visibility.setHidden(model.topLevel()[1], true)
		const token = visibility.suspend()
		visibility.dispose()
		expect(bolt.visible).toBe(true)
		visibility.resume(token)
		expect(bolt.visible).toBe(true)
	})

	it('is recorded with the parts a viewer tool hides, so a thumbnail draws the whole model', () => {
		const { root, bolt } = assembly()
		const model = createPartsModel(root)
		createPartsVisibility(model).setHidden(model.topLevel()[1], true)

		let seen = null
		withViewerHiddenShown(root, () => { seen = bolt.visible })
		expect(seen).toBe(true)
		expect(bolt.visible).toBe(false)
	})

	it('stays hidden through every render mode', () => {
		const { root, bolt } = assembly()
		const model = createPartsModel(root)
		createPartsVisibility(model).setHidden(model.topLevel()[1], true)

		const renderMode = useRenderMode()
		renderMode.init(root)
		for (const mode of ['clay', 'normals', 'xray', 'standard']) {
			renderMode.setMode(mode)
			expect(bolt.visible).toBe(false)
		}
		renderMode.dispose()
	})

	it('stays hidden while Exploded view moves the parts', () => {
		const { root, lid, base, bolt } = assembly()
		lid.position.set(-2, 0, 0)
		base.position.set(2, 0, 0)
		bolt.position.set(0, 3, 0)
		root.updateMatrixWorld(true)
		const model = createPartsModel(root)
		createPartsVisibility(model).setHidden(model.topLevel()[1], true)

		const exploded = useExplodedView()
		exploded.init(root)
		exploded.toggle()
		exploded.setFactor(1)
		expect(bolt.visible).toBe(false)
		exploded.setFactor(0)
		exploded.toggle()
		expect(bolt.visible).toBe(false)
		exploded.dispose()
	})
})
