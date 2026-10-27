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
