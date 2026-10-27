/**
 * A companion a model names but that was not among its files is not loaded from the
 * URL the model wrote (R16).
 *
 * The glTF and 3DS loaders map the files they were given through their own loading
 * manager, and handed anything else back as the URL the model wrote, which the loader
 * then fetched. In the background thumbnail worker that let a crafted model in a shared
 * folder make a browsing editor's browser request any URL. They now hand an unknown URL
 * to three's default loading manager instead: on a page it has no URL modifier, so the
 * URL comes back unchanged and the viewer behaves as before; in the worker the modifier
 * is the worker's resolver, which refuses it.
 */

import * as THREE from 'three'
import { GltfLoader } from '../../../src/loaders/types/gltf.js'
import ThreeDSLoader from '../../../src/loaders/types/threeDS.js'

let tdsManager = null

jest.mock('three/examples/jsm/loaders/TDSLoader.js', () => ({
	TDSLoader: jest.fn().mockImplementation((manager) => {
		tdsManager = manager
		return {
			setResourcePath: jest.fn(),
			parse: () => {
				const { Group, Mesh, BoxGeometry } = jest.requireActual('three')
				const group = new Group()
				group.add(new Mesh(new BoxGeometry()))
				return group
			},
		}
	}),
}))

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const resolver = jest.fn((url) => `refused:${url}`)

beforeEach(() => {
	resolver.mockClear()
	THREE.DefaultLoadingManager.setURLModifier(resolver)
	// jsdom has no object URLs; the glTF loader makes one per companion
	let made = 0
	URL.createObjectURL = jest.fn(() => `blob:test/${++made}`)
})

afterEach(() => {
	THREE.DefaultLoadingManager.setURLModifier(undefined)
})

describe('glTF', () => {
	it('maps a file it was given, and hands any other URL to the default manager', async () => {
		const loader = new GltfLoader()
		const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
		loader.loader = new GLTFLoader()

		await loader.setupResourceManager([new File(['bin'], 'scene.bin', { type: 'application/octet-stream' })])
		const { manager } = loader.loader

		expect(manager.resolveURL('scene.bin')).toBe('blob:test/1')
		expect(manager.resolveURL('https://example.invalid/x.png')).toBe('refused:https://example.invalid/x.png')
		expect(manager.resolveURL('../../other.bin')).toBe('refused:../../other.bin')
	})

	it('on a page, where the default manager has no modifier, the URL is unchanged', async () => {
		THREE.DefaultLoadingManager.setURLModifier(undefined)
		const loader = new GltfLoader()
		const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
		loader.loader = new GLTFLoader()

		await loader.setupResourceManager([new File(['bin'], 'scene.bin', { type: 'application/octet-stream' })])

		expect(loader.loader.manager.resolveURL('textures/wood.png')).toBe('textures/wood.png')
	})
})

describe('3DS', () => {
	it('maps a texture it was given, and hands any other URL to the default manager', async () => {
		const context = {
			THREE,
			additionalFiles: [new File(['png'], 'checker.png', { type: 'image/png' })],
		}

		await new ThreeDSLoader().loadModel(new ArrayBuffer(8), context)

		expect(tdsManager.resolveURL('checker.png')).toMatch(/^data:image\/png;base64,/)
		expect(tdsManager.resolveURL('https://example.invalid/x.png')).toBe('refused:https://example.invalid/x.png')
	})

	it('maps a texture named by an absolute path by its name, and refuses one it was not given', async () => {
		const context = {
			THREE,
			additionalFiles: [
				new File(['png'], 'checker.png', { type: 'image/png' }),
				new File(['png'], 'bump map.png', { type: 'image/png' }),
			],
		}

		await new ThreeDSLoader().loadModel(new ArrayBuffer(8), context)

		expect(tdsManager.resolveURL('C:\\3DSMAX\\MAPS\\CHECKER.PNG')).toMatch(/^data:image\/png;base64,/)
		expect(tdsManager.resolveURL('\\\\server\\share\\checker.png')).toMatch(/^data:image\/png;base64,/)
		expect(tdsManager.resolveURL('file:///C:/maps/bump%20map.png')).toMatch(/^data:image\/png;base64,/)
		expect(tdsManager.resolveURL('C:\\maps\\other.png')).toBe('refused:C:\\maps\\other.png')
	})
})
