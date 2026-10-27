/**
 * The viewer captures a thumbnail half a second after a model opens. Moving the G-code
 * layer slider in that time hid the layers above the chosen one on the live model, and
 * the capture drew the print only up to there. A thumbnail is the whole model: the
 * render must show every layer, and the viewer must keep the slider's view afterwards.
 */
import * as THREE from 'three'
import { renderThumbnail } from '../../../src/thumbnails/renderThumbnail.js'
import { useGcodeLayers } from '../../../src/composables/useGcodeLayers.js'

const rendered = []

jest.mock('three', () => {
	const actual = jest.requireActual('three')
	return {
		...actual,
		WebGLRenderer: jest.fn().mockImplementation(() => ({
			setClearColor: jest.fn(),
			setPixelRatio: jest.fn(),
			setSize: jest.fn(),
			// Which layers are drawn, read at the moment of the render
			render: jest.fn((scene) => {
				const shown = []
				scene.traverseVisible((child) => { if (child.isLine) shown.push(child.name) })
				rendered.push(shown)
			}),
			dispose: jest.fn(),
			forceContextLoss: jest.fn(),
		})),
	}
})

const canvas = () => ({ toBlob: (cb) => cb({ type: 'image/png' }) })

function toolpath(heights) {
	const group = new THREE.Group()
	group.name = 'GCodeToolpath'
	heights.forEach((z, i) => {
		const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, z, 0), new THREE.Vector3(10, z, 0)])
		const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial())
		line.name = `Layer_${i + 1}`
		line.userData.gcodeLayerZ = z
		group.add(line)
	})
	return group
}

const names = (group) => group.children.filter((c) => c.visible).map((c) => c.name)

beforeEach(() => { rendered.length = 0 })

it('draws every layer while the slider shows only the first ones', async () => {
	const group = toolpath([0.2, 0.4, 0.6, 0.8])
	const layers = useGcodeLayers()
	layers.init(group)
	layers.setLayer(2)
	expect(names(group)).toEqual(['Layer_1', 'Layer_2'])

	await renderThumbnail(group, { canvas: canvas() })

	expect(rendered[0]).toEqual(['Layer_1', 'Layer_2', 'Layer_3', 'Layer_4'])
	// The viewer still shows what the slider chose
	expect(names(group)).toEqual(['Layer_1', 'Layer_2'])
})

it('draws every layer while "Only this layer" is on, and keeps it on', async () => {
	const group = toolpath([0.2, 0.4, 0.6])
	const layers = useGcodeLayers()
	layers.init(group)
	layers.setSingleLayer(true)
	layers.setLayer(2)

	await renderThumbnail(group, { canvas: canvas() })

	expect(rendered[0]).toEqual(['Layer_1', 'Layer_2', 'Layer_3'])
	expect(names(group)).toEqual(['Layer_2'])
	// and the slider carries on from where it was
	layers.setLayer(3)
	expect(names(group)).toEqual(['Layer_3'])
})

it('leaves hidden what the model itself hides', async () => {
	const group = toolpath([0.2, 0.4])
	const own = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial())
	own.name = 'HiddenByTheFile'
	own.visible = false
	group.add(own)
	const layers = useGcodeLayers()
	layers.init(group)
	layers.setLayer(1)

	await renderThumbnail(group, { canvas: canvas() })

	expect(rendered[0]).toEqual(['Layer_1', 'Layer_2'])
})
