/**
 * The G-code layer slider: which layers a given position shows, and how the loader's
 * per-Z objects are counted as layers.
 */

const THREE = require('three')
const { useGcodeLayers, collectGcodeLayers } = require('../../../src/composables/useGcodeLayers.js')

function toolpath(zs) {
	const group = new THREE.Group()
	group.name = 'GCodeToolpath'
	zs.forEach((z, i) => {
		const line = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial())
		line.name = `Layer_${i + 1}`
		line.userData.gcodeLayerZ = z
		group.add(line)
	})
	return group
}

const visible = (group) => group.children.map((c) => c.visible)

describe('collectGcodeLayers', () => {
	it('merges the objects a Z-hop splits one layer into', () => {
		const layers = collectGcodeLayers(toolpath([0.2, 0.2, 0.4, 0.6, 0.6, 0.6]))
		expect(layers.map((l) => l.z)).toEqual([0.2, 0.4, 0.6])
		expect(layers.map((l) => l.objects.length)).toEqual([2, 1, 3])
	})

	it('keeps a return to an earlier height as its own layer', () => {
		// Sequential printing: one object finished, the next started from the bed
		expect(collectGcodeLayers(toolpath([0.2, 0.4, 0.2, 0.4])).length).toBe(4)
	})

	it('finds nothing in a model that is not a toolpath', () => {
		const group = new THREE.Group()
		group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()))
		group.add(new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()))
		expect(collectGcodeLayers(group)).toEqual([])
		expect(collectGcodeLayers(null)).toEqual([])
	})
})

describe('useGcodeLayers', () => {
	it('starts with every layer shown', () => {
		const group = toolpath([0.2, 0.4, 0.6])
		const layers = useGcodeLayers()
		layers.init(group)
		expect(layers.isAvailable.value).toBe(true)
		expect(layers.layerCount.value).toBe(3)
		expect(layers.currentLayer.value).toBe(3)
		expect(visible(group)).toEqual([true, true, true])
	})

	it('shows layers up to the current one', () => {
		const group = toolpath([0.2, 0.2, 0.4, 0.6])
		const layers = useGcodeLayers()
		layers.init(group)
		layers.setLayer(2)
		expect(visible(group)).toEqual([true, true, true, false])
		expect(layers.currentZ.value).toBe(0.4)
	})

	it('shows only the current layer when asked', () => {
		const group = toolpath([0.2, 0.2, 0.4, 0.6])
		const layers = useGcodeLayers()
		layers.init(group)
		layers.setSingleLayer(true)
		layers.setLayer(1)
		expect(visible(group)).toEqual([true, true, false, false])
	})

	it('clamps and rounds what the slider sends, and steps within range', () => {
		const layers = useGcodeLayers()
		layers.init(toolpath([0.2, 0.4, 0.6]))
		layers.setLayer(99)
		expect(layers.currentLayer.value).toBe(3)
		layers.setLayer('1.6')
		expect(layers.currentLayer.value).toBe(2)
		layers.step(-5)
		expect(layers.currentLayer.value).toBe(1)
		layers.setLayer(Number.NaN)
		expect(layers.currentLayer.value).toBe(1)
	})

	it('is not offered for a single layer', () => {
		const layers = useGcodeLayers()
		layers.init(toolpath([0.2]))
		expect(layers.isAvailable.value).toBe(false)
	})

	it('shows the whole toolpath again when the next model loads', () => {
		const group = toolpath([0.2, 0.4, 0.6])
		const layers = useGcodeLayers()
		layers.init(group)
		layers.setLayer(1)
		layers.init(new THREE.Group())
		expect(visible(group)).toEqual([true, true, true])
		expect(layers.isAvailable.value).toBe(false)
	})
})

/*
 * A vase-mode print changes height on every move, so its toolpath can have tens of
 * thousands of layers, and a dragged slider sends an input for each layer it passes.
 * A step must change the layers it moves past, not every layer of the print.
 */
describe('a toolpath with many layers', () => {
	const LAYERS = 20000

	function countingToolpath(n) {
		const writes = { count: 0 }
		const objects = Array.from({ length: n }, (_, i) => {
			let visible = true
			return {
				isLine: true,
				userData: { gcodeLayerZ: 0.2 * (i + 1) },
				get visible() { return visible },
				set visible(v) { writes.count++; visible = v },
			}
		})
		const model = { traverse: (cb) => objects.forEach(cb) }
		return { model, objects, writes }
	}

	it('touches one layer per step of the slider', () => {
		const { model, objects, writes } = countingToolpath(LAYERS)
		const layers = useGcodeLayers()
		layers.init(model)
		expect(writes.count).toBe(0)

		layers.setLayer(LAYERS - 1)
		expect(writes.count).toBe(1)
		layers.step(-1)
		expect(writes.count).toBe(2)
		layers.step(1)
		expect(writes.count).toBe(3)
		expect(objects[LAYERS - 2].visible).toBe(true)
		expect(objects[LAYERS - 1].visible).toBe(false)
	})

	it('touches two layers to jump anywhere when only one layer is shown', () => {
		const { model, objects, writes } = countingToolpath(LAYERS)
		const layers = useGcodeLayers()
		layers.init(model)
		layers.setSingleLayer(true)
		writes.count = 0

		layers.setLayer(1)
		expect(writes.count).toBe(2)
		expect(objects.filter((o) => o.visible)).toEqual([objects[0]])
	})

	it('shows the same layers as stepping one by one would, whatever the path', () => {
		const { model, objects } = countingToolpath(50)
		const layers = useGcodeLayers()
		layers.init(model)
		const moves = [[10, false], [40, false], [3, true], [45, true], [45, false], [1, false], [50, true], [7, false]]
		for (const [n, single] of moves) {
			layers.setSingleLayer(single)
			layers.setLayer(n)
			const expected = objects.map((_, i) => (single ? i + 1 === n : i + 1 <= n))
			expect(objects.map((o) => o.visible)).toEqual(expected)
		}
	})
})
