/**
 * The Parts panel's state: the rows it lists as they are opened, what choosing, hiding,
 * isolating and Show all do, that a click on the viewport chooses the part under it (and
 * not after a drag, a click on nothing, or on a part that is hidden), and that an IFC
 * element's properties are asked for when it is chosen and not before.
 */
import * as THREE from 'three'
import { nextTick } from 'vue'
import { usePartsTree } from '../../../src/composables/usePartsTree.js'
import { openIfcProperties } from '../../../src/loaders/ifcProperties.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

jest.mock('../../../src/loaders/ifcProperties.js', () => ({ openIfcProperties: jest.fn() }))

const box = (name, x) => {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
	mesh.name = name
	mesh.position.x = x
	return mesh
}

/** Scene > [ Assembly > [Left, Right], Pin ], with the parts in a row along X */
function scene() {
	const left = box('Left', -2)
	const right = box('Right', 2)
	const pin = box('Pin', 0)
	pin.position.y = 4
	const assembly = new THREE.Group()
	assembly.name = 'Assembly'
	assembly.add(left, right)
	const root = new THREE.Group()
	root.add(assembly, pin)
	const world = new THREE.Scene()
	world.add(root)
	world.updateMatrixWorld(true)
	return { world, root, assembly, left, right, pin }
}

const camera = () => {
	const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
	cam.position.set(0, 0, 12)
	cam.lookAt(0, 0, 0)
	cam.updateMatrixWorld(true)
	return cam
}

// A click at a point of the canvas, which is 100 px square
const clickAt = (x, y) => ({
	target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
	clientX: x,
	clientY: y,
})

/** The canvas point a world point lands on */
const screenOf = (cam, point) => {
	const ndc = point.clone().project(cam)
	return [((ndc.x + 1) / 2) * 100, ((1 - ndc.y) / 2) * 100]
}

const labels = (parts) => parts.rows.map((row) => row.label)

describe('the rows', () => {
	it('lists the first level, collapsed, and opens a row on request', () => {
		const { world, root } = scene()
		const parts = usePartsTree()
		parts.init(root, world)

		expect(labels(parts)).toEqual(['Assembly', 'Pin'])
		expect(parts.rows[0]).toMatchObject({ expandable: true, expanded: false, level: 1, posInSet: 1, setSize: 2, parts: 2 })

		parts.toggleExpanded(parts.rows[0].id)
		expect(labels(parts)).toEqual(['Assembly', 'Left', 'Right', 'Pin'])
		expect(parts.rows[1]).toMatchObject({ level: 2, posInSet: 1, setSize: 2, expandable: false })

		parts.toggleExpanded(parts.rows[0].id, false)
		expect(labels(parts)).toEqual(['Assembly', 'Pin'])
	})

	it('starts below a wrapper with one thing in it, so the list is not one line to open', () => {
		const { world } = scene()
		const solo = new THREE.Group()
		const inner = new THREE.Group()
		inner.name = 'Only'
		inner.add(box('A', 0), box('B', 2))
		solo.add(inner)
		const parts = usePartsTree()
		parts.init(solo, world)
		expect(labels(parts)).toEqual(['A', 'B'])
	})

	it('lists matches as a flat list while a filter is typed, with where each is', () => {
		const { world, root } = scene()
		const parts = usePartsTree()
		parts.init(root, world)

		parts.setFilter('ri')
		expect(labels(parts)).toEqual(['Right'])
		expect(parts.rows[0]).toMatchObject({ level: 1, path: 'Assembly', posInSet: 1, setSize: 1 })
		expect(parts.summary).toMatchObject({ searching: true, matches: 1, truncated: false })

		parts.setFilter('')
		expect(labels(parts)).toEqual(['Assembly', 'Pin'])
		expect(parts.summary.searching).toBe(false)
	})

	it('is empty before a model, and after it is cleared', () => {
		const { world, root } = scene()
		const parts = usePartsTree()
		expect(parts.rows).toEqual([])
		parts.init(root, world)
		parts.clear()
		expect(parts.rows).toEqual([])
		expect(parts.summary.loaded).toBe(false)
	})

	it('puts back what was hidden when the model goes', () => {
		const { world, root, pin } = scene()
		const parts = usePartsTree()
		parts.init(root, world)
		parts.toggleHidden(parts.rows[1].id)
		expect(pin.visible).toBe(false)
		parts.clear()
		expect(pin.visible).toBe(true)
	})
})

describe('hiding, isolating and Show all', () => {
	it('marks a hidden row, and says how many are hidden', () => {
		const { world, root, pin } = scene()
		const parts = usePartsTree()
		parts.init(root, world)
		const pinRow = parts.rows[1]

		parts.toggleHidden(pinRow.id)
		expect(pin.visible).toBe(false)
		expect(parts.rows[1]).toMatchObject({ hidden: true, covered: false })
		expect(parts.summary.hidden).toBe(1)

		parts.toggleHidden(pinRow.id)
		expect(pin.visible).toBe(true)
		expect(parts.summary.hidden).toBe(0)
	})

	it('marks what is inside a hidden row as covered', () => {
		const { world, root, assembly } = scene()
		const parts = usePartsTree()
		parts.init(root, world)
		parts.toggleExpanded(parts.rows[0].id, true)

		parts.toggleHidden(parts.rows[0].id)
		expect(assembly.visible).toBe(false)
		expect(parts.rows[1]).toMatchObject({ label: 'Left', covered: true })
	})

	it('isolates the chosen part, and a second press shows what was showing before', () => {
		const { world, root, assembly, pin, left, right } = scene()
		const parts = usePartsTree()
		parts.init(root, world)
		parts.toggleExpanded(parts.rows[0].id, true)
		const leftId = parts.rows[1].id

		parts.isolate(leftId)
		expect(left.visible).toBe(true)
		expect(assembly.visible).toBe(true)
		expect(right.visible).toBe(false)
		expect(pin.visible).toBe(false)
		expect(parts.rows[1].isolated).toBe(true)
		expect(parts.summary.isolated).toBe(true)

		parts.isolate(leftId)
		expect(right.visible).toBe(true)
		expect(pin.visible).toBe(true)
		expect(parts.summary.isolated).toBe(false)
	})

	it('Show all restores every part and ends an isolation', () => {
		const { world, root, pin, right } = scene()
		const parts = usePartsTree()
		parts.init(root, world)
		parts.toggleExpanded(parts.rows[0].id, true)
		parts.toggleHidden(parts.rows[2].id)
		parts.isolate(parts.rows[1].id)

		parts.showAll()

		expect(pin.visible).toBe(true)
		expect(right.visible).toBe(true)
		expect(parts.summary).toMatchObject({ hidden: 0, isolated: false })
	})

	it('shows every part while an export runs', () => {
		const { world, root, pin } = scene()
		const parts = usePartsTree()
		parts.init(root, world)
		parts.toggleHidden(parts.rows[1].id)

		const token = parts.suspend()
		expect(pin.visible).toBe(true)
		parts.resume(token)
		expect(pin.visible).toBe(false)
	})
})

describe('choosing a part', () => {
	it('tints the chosen part and nothing else, and clears the tint when none is chosen', () => {
		const { world, root, left } = scene()
		const parts = usePartsTree()
		parts.init(root, world)
		parts.toggleExpanded(parts.rows[0].id, true)
		const materialBefore = left.material

		parts.select(parts.rows[1].id)
		const overlays = world.children.filter((child) => child.name === 'parts-highlight')
		expect(overlays).toHaveLength(1)
		expect(overlays[0].children).toHaveLength(1)
		expect(left.material).toBe(materialBefore)
		expect(parts.rows[1].selected).toBe(true)
		expect(parts.selection).toMatchObject({ label: 'Left', kind: 'part', path: 'Assembly' })

		parts.select(null)
		expect(world.children.filter((child) => child.name === 'parts-highlight')).toHaveLength(0)
		expect(parts.selection).toBeNull()
	})

	it('tints every mesh of a group', () => {
		const { world, root } = scene()
		const parts = usePartsTree()
		parts.init(root, world)
		parts.select(parts.rows[0].id)
		const group = world.children.find((child) => child.name === 'parts-highlight')
		expect(group.children).toHaveLength(2)
		expect(parts.selection).toMatchObject({ kind: 'group', parts: 2 })
	})

	it('hides the tint of a part that is hidden', () => {
		const { world, root } = scene()
		const parts = usePartsTree()
		parts.init(root, world)
		parts.select(parts.rows[1].id)
		const [overlay] = world.children.find((child) => child.name === 'parts-highlight').children
		expect(overlay.visible).toBe(true)
		parts.toggleHidden(parts.rows[1].id)
		expect(overlay.visible).toBe(false)
		parts.toggleHidden(parts.rows[1].id)
		expect(overlay.visible).toBe(true)
	})

	it('clears the choice, and the tint, when the list goes off screen', () => {
		const { world, root } = scene()
		const parts = usePartsTree()
		parts.init(root, world)
		parts.setActive(true)
		parts.select(parts.rows[1].id)
		parts.setActive(false)
		expect(parts.selectedId).toBeNull()
		expect(world.children.some((child) => child.name === 'parts-highlight')).toBe(false)
	})

	it('zooms to the box around the chosen part, and not to a hidden part', () => {
		const { world, root } = scene()
		const zoomTo = jest.fn()
		const parts = usePartsTree({ zoomTo })
		parts.init(root, world)

		parts.zoomToPart(parts.rows[1].id)
		expect(zoomTo).toHaveBeenCalledTimes(1)
		const target = zoomTo.mock.calls[0][0]
		expect(target.min.y).toBeCloseTo(3.5)
		expect(target.max.y).toBeCloseTo(4.5)

		parts.toggleHidden(parts.rows[1].id)
		parts.zoomToPart(parts.rows[1].id)
		expect(zoomTo).toHaveBeenCalledTimes(1)
	})
})

describe('a click on the viewport', () => {
	it('chooses the part under it, opening the rows above it', () => {
		const { world, root, right } = scene()
		const cam = camera()
		const parts = usePartsTree()
		parts.init(root, world)

		const [x, y] = screenOf(cam, new THREE.Vector3(2, 0, 0))
		expect(parts.handleClick(clickAt(x, y), cam)).toBe(true)

		expect(parts.selectedId).toBe(right.uuid)
		expect(labels(parts)).toEqual(['Assembly', 'Left', 'Right', 'Pin'])
		expect(parts.rows[2].selected).toBe(true)
	})

	it('clears the choice when it lands on nothing', () => {
		const { world, root } = scene()
		const cam = camera()
		const parts = usePartsTree()
		parts.init(root, world)
		parts.select(parts.rows[1].id)

		parts.handleClick(clickAt(2, 2), cam)
		expect(parts.selectedId).toBeNull()
	})

	it('is not a choice when the pointer moved between going down and coming up', () => {
		const { world, root } = scene()
		const cam = camera()
		const parts = usePartsTree()
		parts.init(root, world)
		const [x, y] = screenOf(cam, new THREE.Vector3(2, 0, 0))

		parts.notePointerDown({ clientX: x + 30, clientY: y })
		expect(parts.handleClick(clickAt(x, y), cam)).toBe(false)
		expect(parts.selectedId).toBeNull()

		parts.notePointerDown({ clientX: x + 1, clientY: y })
		expect(parts.handleClick(clickAt(x, y), cam)).toBe(true)
		expect(parts.selectedId).not.toBeNull()
	})

	it('passes through a hidden part to the one behind it, and picks nothing in a hidden group', () => {
		const { world, root, left } = scene()
		const cam = camera()
		const behind = box('Behind', -2)
		behind.position.z = -3
		root.add(behind)
		world.updateMatrixWorld(true)
		const parts = usePartsTree()
		parts.init(root, world)
		const [x, y] = screenOf(cam, new THREE.Vector3(-2, 0, 0))

		parts.handleClick(clickAt(x, y), cam)
		expect(parts.selectedId).toBe(left.uuid)

		left.visible = false
		parts.handleClick(clickAt(x, y), cam)
		expect(parts.selectedId).toBe(behind.uuid)

		behind.visible = false
		parts.handleClick(clickAt(x, y), cam)
		expect(parts.selectedId).toBeNull()
	})

	it('does not pick the tint it draws itself', () => {
		const { world, root, left } = scene()
		const cam = camera()
		const parts = usePartsTree()
		parts.init(root, world)
		parts.toggleExpanded(parts.rows[0].id, true)
		parts.select(left.uuid)
		const [x, y] = screenOf(cam, new THREE.Vector3(-2, 0, 0))
		parts.handleClick(clickAt(x, y), cam)
		expect(parts.selectedId).toBe(left.uuid)
	})
})

describe('IFC properties', () => {
	const ifcScene = () => {
		const wall = box('North wall', 0)
		wall.userData.ifc = { expressID: 26, name: 'North wall', typeLabel: 'Wall', storey: 'Level 1', globalId: 'abc' }
		const slab = box('Slab 1', 3)
		slab.userData.ifc = { expressID: 27, name: 'Slab 1', typeLabel: 'Slab' }
		const root = new THREE.Group()
		root.add(wall, slab)
		const world = new THREE.Scene()
		world.add(root)
		world.updateMatrixWorld(true)
		return { world, root }
	}

	it('asks for an element\'s properties when it is chosen, not before', async () => {
		const readIfcProperties = jest.fn().mockResolvedValue({ sets: [{ name: 'Pset_WallCommon', fromType: false, properties: [{ name: 'FireRating', value: '2HR' }] }] })
		const { world, root } = ifcScene()
		const parts = usePartsTree({ readIfcProperties })
		parts.init(root, world)
		expect(readIfcProperties).not.toHaveBeenCalled()

		parts.select(parts.rows[0].id)
		expect(parts.selection.ifc).toMatchObject({ type: 'Wall', storey: 'Level 1', globalId: 'abc', state: 'loading', sets: [] })
		await nextTick()
		await Promise.resolve()
		await nextTick()

		expect(readIfcProperties).toHaveBeenCalledWith(26)
		expect(parts.selection.ifc.state).toBe('ready')
		expect(parts.selection.ifc.sets[0].properties).toEqual([{ name: 'FireRating', value: '2HR' }])
	})

	it('says so when an element has none, and when they could not be read', async () => {
		const readIfcProperties = jest.fn()
			.mockResolvedValueOnce({ sets: [] })
			.mockRejectedValueOnce(new Error('no wasm'))
		const { world, root } = ifcScene()
		const parts = usePartsTree({ readIfcProperties })
		parts.init(root, world)

		parts.select(parts.rows[0].id)
		await new Promise((resolve) => setTimeout(resolve))
		expect(parts.selection.ifc.state).toBe('none')

		parts.select(parts.rows[1].id)
		await new Promise((resolve) => setTimeout(resolve))
		expect(parts.selection.ifc.state).toBe('error')
	})

	it('does not show an earlier element\'s properties on the one chosen since', async () => {
		let release
		const readIfcProperties = jest.fn()
			.mockReturnValueOnce(new Promise((resolve) => { release = resolve }))
			.mockResolvedValueOnce({ sets: [] })
		const { world, root } = ifcScene()
		const parts = usePartsTree({ readIfcProperties })
		parts.init(root, world)

		parts.select(parts.rows[0].id)
		parts.select(parts.rows[1].id)
		release({ sets: [{ name: 'First', fromType: false, properties: [{ name: 'a', value: 'b' }] }] })
		await new Promise((resolve) => setTimeout(resolve))

		expect(parts.selection.label).toBe('Slab 1')
		expect(parts.selection.ifc.sets).toEqual([])
	})

	it('has no properties to show for a part that is not an IFC element', () => {
		const { world, root } = scene()
		const parts = usePartsTree({ readIfcProperties: jest.fn() })
		parts.init(root, world)
		parts.select(parts.rows[1].id)
		expect(parts.selection.ifc).toBeNull()
	})
})

describe('an IFC model drawn from geometry alone', () => {
	const drawn = () => {
		const root = new THREE.Group()
		for (const [expressID, x] of [[26, 0], [30, 2], [50, 4]]) {
			const mesh = box(`IFC_${expressID}_1`, x)
			mesh.userData.ifc = { expressID, geometryExpressID: 1 }
			root.add(mesh)
		}
		const world = new THREE.Scene()
		world.add(root)
		world.updateMatrixWorld(true)
		return { world, root }
	}
	const reader = () => ({
		describe: jest.fn(() => ({
			elements: new Map([
				[26, { expressID: 26, typeLabel: 'Wall', name: 'North wall', globalId: '' }],
				[30, { expressID: 30, typeLabel: 'Wall', name: 'South wall', globalId: '' }],
				[50, { expressID: 50, typeLabel: 'Slab', name: 'Slab 1', globalId: '' }],
			]),
			containerOf: new Map([[26, 17], [30, 17]]),
			containers: new Map([[17, { expressID: 17, typeLabel: 'Building Storey', name: 'Level 1' }]]),
		})),
		read: jest.fn().mockResolvedValue({ sets: [] }),
		dispose: jest.fn(),
	})

	it('opens the file, and names and groups the elements, only when the list is made', async () => {
		const file = {}
		const r = reader()
		openIfcProperties.mockResolvedValue(r)
		const { world, root } = drawn()
		const parts = usePartsTree({ sourceFile: () => file })
		expect(openIfcProperties).not.toHaveBeenCalled()

		parts.init(root, world)
		expect(parts.summary.preparing).toBe(true)
		expect(parts.rows).toEqual([])
		await new Promise((resolve) => setTimeout(resolve))

		expect(openIfcProperties).toHaveBeenCalledWith(file)
		expect(r.describe).toHaveBeenCalledWith(new Set([26, 30, 50]))
		expect(parts.summary.preparing).toBe(false)
		expect(labels(parts)).toEqual(['Slab 1', 'Level 1'])
		// The same file reads the properties of the element chosen: it is not opened again
		parts.toggleExpanded(parts.rows[1].id, true)
		parts.select(parts.rows[2].id)
		await new Promise((resolve) => setTimeout(resolve))
		expect(r.read).toHaveBeenCalledWith(26)
		expect(openIfcProperties).toHaveBeenCalledTimes(1)

		parts.clear()
		await new Promise((resolve) => setTimeout(resolve))
		expect(r.dispose).toHaveBeenCalled()
	})

	it('shows the elements by their express IDs when the file cannot be read', async () => {
		openIfcProperties.mockRejectedValue(new Error('no wasm'))
		const { world, root } = drawn()
		const parts = usePartsTree({ sourceFile: () => ({}) })
		parts.init(root, world)
		await new Promise((resolve) => setTimeout(resolve))
		expect(parts.summary.preparing).toBe(false)
		expect(labels(parts)).toEqual(['IFC_26_1', 'IFC_30_1', 'IFC_50_1'])
	})

	it('shows nothing for a model replaced while it was being named', async () => {
		openIfcProperties.mockResolvedValue(reader())
		const { world, root } = drawn()
		const parts = usePartsTree({ sourceFile: () => ({}) })
		parts.init(root, world)
		const next = scene()
		parts.init(next.root, next.world)
		await new Promise((resolve) => setTimeout(resolve))
		expect(labels(parts)).toEqual(['Assembly', 'Pin'])
	})
})
