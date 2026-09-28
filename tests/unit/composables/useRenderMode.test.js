/**
 * Render modes stand in for the model's materials; they must never change them. Every
 * path back to standard — switching mode, exporting, loading the next model — has to
 * hand each mesh exactly the material it came with.
 */

const THREE = require('three')
const { useRenderMode, RENDER_MODES } = require('../../../src/composables/useRenderMode.js')

function model() {
	const group = new THREE.Group()
	const red = new THREE.MeshStandardMaterial({ color: 0xff3300, opacity: 0.8 })
	const a = new THREE.Mesh(new THREE.BoxGeometry(), red)
	const b = new THREE.Mesh(new THREE.BoxGeometry(), red) // shares a material with a
	const multi = new THREE.Mesh(new THREE.BoxGeometry(), [red, new THREE.MeshPhongMaterial()])
	const line = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial())
	group.add(a, b, multi, line)
	return { group, a, b, multi, line, red }
}

describe('useRenderMode', () => {
	it('offers standard, clay, normals and x-ray', () => {
		expect(RENDER_MODES).toEqual(['standard', 'clay', 'normals', 'xray'])
	})

	it('rejects a mode it does not know', () => {
		expect(() => useRenderMode().setMode('toon')).toThrow()
	})

	it.each([
		['clay', 'MeshMatcapMaterial'],
		['normals', 'MeshNormalMaterial'],
		['xray', 'MeshStandardMaterial'],
	])('%s stands in for every mesh material', (m, type) => {
		const { group, a, b, multi, line, red } = model()
		const rm = useRenderMode()
		rm.init(group)
		rm.setMode(m)

		expect(a.material.type).toBe(type)
		// One stand-in per material, not per mesh
		expect(b.material).toBe(a.material)
		expect(multi.material).toHaveLength(2)
		expect(multi.material[0]).toBe(a.material)
		// Lines (G-code toolpaths) are left alone
		expect(line.material.type).toBe('LineBasicMaterial')
		// The model's own material is untouched
		expect(red.transparent).toBe(false)
		expect(red.opacity).toBe(0.8)
	})

	it('keeps each part its colour in clay', () => {
		const { group, a } = model()
		const rm = useRenderMode()
		rm.init(group)
		rm.setMode('clay')
		expect(a.material.color.getHex()).toBe(0xff3300)
	})

	it('makes x-ray see-through, relative to how see-through the part already was', () => {
		const { group, a } = model()
		const rm = useRenderMode()
		rm.init(group)
		rm.setMode('xray')
		expect(a.material.transparent).toBe(true)
		expect(a.material.opacity).toBeCloseTo(0.2, 6)
		expect(a.material.depthWrite).toBe(false)
	})

	it('gives every mesh its own material back', () => {
		const { group, a, b, multi, red } = model()
		const own = multi.material
		const rm = useRenderMode()
		rm.init(group)
		rm.setMode('normals')
		rm.setMode('clay')
		rm.setMode('standard')
		expect(a.material).toBe(red)
		expect(b.material).toBe(red)
		expect(multi.material).toBe(own)
	})

	it('carries wireframe, switched while a mode was showing, back to the model', () => {
		const { group, a, red } = model()
		const rm = useRenderMode()
		rm.init(group)
		rm.setMode('clay')
		a.material.wireframe = true
		rm.setMode('standard')
		expect(red.wireframe).toBe(true)
	})

	it('suspends for an export and resumes the same mode', () => {
		const { group, a, red } = model()
		const rm = useRenderMode()
		rm.init(group)
		rm.setMode('xray')
		rm.suspend()
		expect(a.material).toBe(red)
		expect(rm.mode.value).toBe('xray')
		rm.resume()
		expect(a.material).not.toBe(red)
		expect(a.material.transparent).toBe(true)
	})

	it('keeps the mode for the next model and releases the last one', () => {
		const first = model()
		const second = model()
		const rm = useRenderMode()
		rm.init(first.group)
		rm.setMode('normals')
		rm.init(second.group)
		expect(first.a.material).toBe(first.red)
		expect(second.a.material.type).toBe('MeshNormalMaterial')
	})
})

/*
 * The cross-section makes materials double-sided so the inside shows at the cut, and
 * remembers each one's own side to give back. A render mode swaps the materials under
 * it; neither set may be left double-sided once the cut is closed.
 */
describe('render modes under an open cross-section', () => {
	const { useClippingPlane } = require('../../../src/composables/useClippingPlane.js')

	function setup() {
		const { group, a, red } = model()
		const scene = new THREE.Scene()
		scene.add(group)
		const clipping = useClippingPlane()
		clipping.init({}, scene)
		const rm = useRenderMode()
		rm.init(group)
		return { clipping, rm, a, red }
	}

	it('keeps the stand-in materials double-sided while the cut is open', () => {
		const { clipping, rm, a } = setup()
		clipping.toggle()
		clipping.aroundMaterialSwap(() => rm.setMode('clay'))
		expect(a.material.side).toBe(THREE.DoubleSide)
	})

	it('leaves every material its own side once the cut closes and the mode ends', () => {
		const { clipping, rm, a, red } = setup()
		clipping.toggle()
		clipping.aroundMaterialSwap(() => rm.setMode('clay'))
		clipping.toggle()
		expect(a.material.side).toBe(THREE.FrontSide)
		clipping.aroundMaterialSwap(() => rm.setMode('standard'))
		expect(a.material).toBe(red)
		expect(red.side).toBe(THREE.FrontSide)
	})

	it('hands the model its materials back double-sided while the cut is still open', () => {
		const { clipping, rm, red } = setup()
		clipping.aroundMaterialSwap(() => rm.setMode('normals'))
		clipping.toggle()
		clipping.aroundMaterialSwap(() => rm.setMode('standard'))
		expect(red.side).toBe(THREE.DoubleSide)
		clipping.toggle()
		expect(red.side).toBe(THREE.FrontSide)
	})
})
