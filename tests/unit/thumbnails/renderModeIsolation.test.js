/**
 * A thumbnail is shared by everyone who can see the file, so it has the fixed look
 * whatever the viewer that made it was showing. Clay, Normals and X-ray put stand-in
 * materials on the live model, and the viewer's capture renders that live model (moved
 * into a scene of its own, not cloned): the render must see each mesh's own material,
 * and the viewer must get its stand-ins back the moment the render is done.
 */
import * as THREE from 'three'
import { renderThumbnail } from '../../../src/thumbnails/renderThumbnail.js'
import { useRenderMode } from '../../../src/composables/useRenderMode.js'

const rendered = []

jest.mock('three', () => {
	const actual = jest.requireActual('three')
	return {
		...actual,
		WebGLRenderer: jest.fn().mockImplementation(() => ({
			setClearColor: jest.fn(),
			setPixelRatio: jest.fn(),
			setSize: jest.fn(),
			// What each mesh is drawn with, read at the moment of the render
			render: jest.fn((scene) => {
				const seen = new Map()
				scene.traverse((child) => { if (child.isMesh) seen.set(child, child.material) })
				rendered.push(seen)
			}),
			dispose: jest.fn(),
			forceContextLoss: jest.fn(),
		})),
	}
})

const canvas = () => ({ toBlob: (cb) => cb({ type: 'image/png' }) })

function model() {
	const group = new THREE.Group()
	const shared = new THREE.MeshStandardMaterial({ color: 0xff3300 })
	const a = new THREE.Mesh(new THREE.BoxGeometry(), shared)
	const b = new THREE.Mesh(new THREE.BoxGeometry(), shared) // shares its material with a
	b.position.x = 2
	const multiOwn = [shared, new THREE.MeshPhongMaterial({ color: 0x00ff00 })]
	const multi = new THREE.Mesh(new THREE.BoxGeometry(), multiOwn)
	multi.position.x = 4
	group.add(a, b, multi)
	const scene = new THREE.Scene()
	scene.add(group)
	return { scene, group, a, b, multi, shared, multiOwn }
}

beforeEach(() => { rendered.length = 0 })

describe.each(['clay', 'normals', 'xray'])('a thumbnail made while the viewer shows %s', (mode) => {
	it('is drawn with every mesh\'s own material, shared and multi-material ones included', async () => {
		const { group, a, b, multi, shared, multiOwn } = model()
		const rm = useRenderMode()
		rm.init(group)
		rm.setMode(mode)
		expect(a.material).not.toBe(shared)

		await renderThumbnail(group, { canvas: canvas() })

		const [seen] = rendered
		expect(seen.get(a)).toBe(shared)
		expect(seen.get(b)).toBe(shared)
		expect(seen.get(multi)).toBe(multiOwn)
	})

	it('leaves the viewer showing the mode, on the same stand-ins, once it is done', async () => {
		const { scene, group, a, b, multi, shared } = model()
		const rm = useRenderMode()
		rm.init(group)
		rm.setMode(mode)
		const standIn = a.material
		const multiStandIn = multi.material

		await renderThumbnail(group, { canvas: canvas() })

		expect(a.material).toBe(standIn)
		expect(b.material).toBe(standIn)
		expect(multi.material).toBe(multiStandIn)
		expect(group.parent).toBe(scene)
		// and the mode still comes off cleanly afterwards
		rm.setMode('standard')
		expect(a.material).toBe(shared)
	})

	it('gives the stand-ins back even when the render fails', async () => {
		const { group, a } = model()
		const rm = useRenderMode()
		rm.init(group)
		rm.setMode(mode)
		const standIn = a.material
		THREE.WebGLRenderer.mockImplementationOnce(() => ({
			setClearColor: jest.fn(),
			setPixelRatio: jest.fn(),
			setSize: jest.fn(),
			render: jest.fn(() => { throw new Error('context lost') }),
			dispose: jest.fn(),
			forceContextLoss: jest.fn(),
		}))

		await expect(renderThumbnail(group, { canvas: canvas() })).rejects.toThrow('context lost')
		expect(a.material).toBe(standIn)
	})
})

it('draws a model in Standard with the materials it has', async () => {
	const { group, a, shared } = model()
	const rm = useRenderMode()
	rm.init(group)
	await renderThumbnail(group, { canvas: canvas() })
	expect(rendered[0].get(a)).toBe(shared)
})

it('does not keep a model that has left its mode out of later thumbnails', async () => {
	// A mesh that was in a mode once and is back to its own material has nothing to swap
	const { group, a, shared } = model()
	const rm = useRenderMode()
	rm.init(group)
	rm.setMode('xray')
	rm.setMode('standard')
	const other = new THREE.MeshBasicMaterial()
	a.material = other // something else the viewer drew it with since, say
	await renderThumbnail(group, { canvas: canvas() })
	expect(rendered[0].get(a)).toBe(other)
	expect(shared).toBeDefined()
})
