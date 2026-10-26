import * as THREE from 'three'
import { renderThumbnail, EmptyModelError } from '../../../src/thumbnails/renderThumbnail.js'
import { LIGHTING_PRESETS } from '../../../src/config/lightingPresets.js'

const mockRenderers = []

jest.mock('three', () => {
	const actual = jest.requireActual('three')
	return {
		...actual,
		WebGLRenderer: jest.fn().mockImplementation((params) => {
			const renderer = {
				params,
				setClearColor: jest.fn(),
				setPixelRatio: jest.fn(),
				setSize: jest.fn(),
				// Snapshot the children: the scene is emptied once the render is over
				render: jest.fn((scene) => { renderer.renderedChildren = scene.children.slice() }),
				dispose: jest.fn(),
				forceContextLoss: jest.fn(),
			}
			mockRenderers.push(renderer)
			return renderer
		}),
	}
})

const PNG = { type: 'image/png', size: 4 }

function domCanvas() {
	return { toBlob: jest.fn((cb, type) => cb(type === 'image/png' ? PNG : null)) }
}

function offscreenCanvas() {
	return { convertToBlob: jest.fn(async () => PNG) }
}

function cube() {
	const material = new THREE.MeshStandardMaterial({ color: 0x336699 })
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material)
	mesh.position.set(5, -3, 1)
	return mesh
}

describe('renderThumbnail', () => {
	beforeEach(() => {
		mockRenderers.length = 0
		THREE.WebGLRenderer.mockClear()
	})

	it('creates a transparent, antialiased renderer on the given canvas', async () => {
		const canvas = domCanvas()

		await renderThumbnail(cube(), { canvas })

		const [renderer] = mockRenderers
		expect(renderer.params).toEqual({
			canvas, alpha: true, preserveDrawingBuffer: true, antialias: true,
		})
		expect(renderer.setClearColor).toHaveBeenCalledWith(0x000000, 0)
		expect(renderer.setSize).toHaveBeenCalledWith(512, 512, false)
	})

	it('honours a custom size', async () => {
		await renderThumbnail(cube(), { canvas: domCanvas(), size: 128 })

		expect(mockRenderers[0].setSize).toHaveBeenCalledWith(128, 128, false)
	})

	it('encodes a PNG through toBlob on an HTMLCanvasElement', async () => {
		const canvas = domCanvas()

		const blob = await renderThumbnail(cube(), { canvas })

		expect(blob).toBe(PNG)
		expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
	})

	it('encodes a PNG through convertToBlob on an OffscreenCanvas', async () => {
		const canvas = offscreenCanvas()

		const blob = await renderThumbnail(cube(), { canvas })

		expect(blob).toBe(PNG)
		expect(canvas.convertToBlob).toHaveBeenCalledWith({ type: 'image/png' })
	})

	it('rejects when toBlob yields nothing', async () => {
		const canvas = { toBlob: (cb) => cb(null) }

		await expect(renderThumbnail(cube(), { canvas })).rejects.toThrow('PNG')
		expect(mockRenderers[0].dispose).toHaveBeenCalled()
	})

	it('renders with the viewer camera and the default lighting preset', async () => {
		await renderThumbnail(cube(), { canvas: domCanvas() })

		const camera = mockRenderers[0].render.mock.calls[0][1]
		const children = mockRenderers[0].renderedChildren
		expect(camera.fov).toBe(75)
		expect(camera.aspect).toBe(1)
		const preset = LIGHTING_PRESETS.default
		const ambient = children.find(c => c.isAmbientLight)
		const directional = children.find(c => c.isDirectionalLight)
		const point = children.find(c => c.isPointLight)
		expect(ambient.intensity).toBe(preset.ambient.intensity)
		expect(directional.intensity).toBe(preset.directional.intensity)
		expect(directional.position.toArray()).toEqual([preset.directional.x, preset.directional.y, preset.directional.z])
		expect(point.intensity).toBe(preset.point.intensity)
	})

	it('uses a custom field of view', async () => {
		await renderThumbnail(cube(), { canvas: domCanvas(), fovDegrees: 40 })

		expect(mockRenderers[0].render.mock.calls[0][1].fov).toBe(40)
	})

	it('looks at the model centre from the fitted position', async () => {
		await renderThumbnail(cube(), { canvas: domCanvas() })

		const camera = mockRenderers[0].render.mock.calls[0][1]
		const d = 2 / Math.sin(37.5 * Math.PI / 180) * 0.75
		expect(camera.position.x).toBeCloseTo(5 + 0.5 * d, 5)
		expect(camera.position.y).toBeCloseTo(-3 + 0.5 * d, 5)
		expect(camera.position.z).toBeCloseTo(1 + d, 5)
		expect(camera.near).toBeLessThan(d)
		expect(camera.far).toBeGreaterThan(d * 2)
	})

	it('disposes the renderer and drops the lights on success', async () => {
		await renderThumbnail(cube(), { canvas: domCanvas() })

		const [renderer] = mockRenderers
		expect(renderer.dispose).toHaveBeenCalledTimes(1)
		expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1)
		const scene = renderer.render.mock.calls[0][0]
		expect(renderer.renderedChildren.some(c => c.isLight)).toBe(true)
		expect(scene.children).toEqual([])
	})

	it('rejects with EmptyModelError for an empty group and still disposes', async () => {
		await expect(renderThumbnail(new THREE.Group(), { canvas: domCanvas() }))
			.rejects.toBeInstanceOf(EmptyModelError)

		const [renderer] = mockRenderers
		expect(renderer.dispose).toHaveBeenCalledTimes(1)
		expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1)
		expect(renderer.render).not.toHaveBeenCalled()
	})

	it('disposes the renderer when rendering throws', async () => {
		THREE.WebGLRenderer.mockImplementationOnce(() => {
			const renderer = {
				setClearColor: jest.fn(),
				setPixelRatio: jest.fn(),
				setSize: jest.fn(),
				render: jest.fn(() => { throw new Error('context lost') }),
				dispose: jest.fn(),
				forceContextLoss: jest.fn(),
			}
			mockRenderers.push(renderer)
			return renderer
		})

		await expect(renderThumbnail(cube(), { canvas: domCanvas() })).rejects.toThrow('context lost')

		expect(mockRenderers[0].dispose).toHaveBeenCalledTimes(1)
		expect(mockRenderers[0].forceContextLoss).toHaveBeenCalledTimes(1)
	})

	it('leaves the model transforms, material and parent untouched', async () => {
		const model = cube()
		const parent = new THREE.Group()
		parent.add(model)
		const material = model.material
		const colour = material.color.getHex()
		const before = model.position.toArray()
		const emissive = material.emissive.getHex()

		await renderThumbnail(model, { canvas: domCanvas() })

		expect(model.material).toBe(material)
		expect(material.color.getHex()).toBe(colour)
		expect(material.emissive.getHex()).toBe(emissive)
		expect(model.position.toArray()).toEqual(before)
		expect(model.parent).toBe(parent)
		expect(parent.children).toEqual([model])
	})

	it('puts an unparented model back with no parent', async () => {
		const model = cube()

		await renderThumbnail(model, { canvas: domCanvas() })

		expect(model.parent).toBeNull()
	})

	it('restores the original parent even when rendering fails', async () => {
		const model = cube()
		const parent = new THREE.Group()
		parent.add(model)
		THREE.WebGLRenderer.mockImplementationOnce(() => ({
			setClearColor() {},
			setPixelRatio() {},
			setSize() {},
			render() { throw new Error('boom') },
			dispose() {},
			forceContextLoss() {},
		}))

		await expect(renderThumbnail(model, { canvas: domCanvas() })).rejects.toThrow('boom')

		expect(model.parent).toBe(parent)
	})

	it('does not touch document or window', async () => {
		const documentSpy = jest.spyOn(document, 'createElement')

		await renderThumbnail(cube(), { canvas: offscreenCanvas() })

		expect(documentSpy).not.toHaveBeenCalled()
		documentSpy.mockRestore()
	})
})
