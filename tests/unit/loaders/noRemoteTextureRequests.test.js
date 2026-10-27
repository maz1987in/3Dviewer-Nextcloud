/**
 * A texture URL that matches none of a model's companions is never requested on the page.
 *
 * A model names its textures with any URL it likes. Handed back to the browser as
 * written, `https://elsewhere/x.png` or a UNC path, which a browser reads as
 * `https://host/x.png`, made the viewer's browser contact a host of the model author's
 * choosing, with only the page's Content Security Policy in the way. Every loader with a
 * loading manager now turns such a URL into a placeholder that requests nothing, keeps
 * the data: and blob: URLs loaders make for themselves, and, in the thumbnail worker,
 * still hands the URL to the worker's resolver, which refuses it.
 */

import * as THREE from 'three'
import { NO_TEXTURE_URL, companionLoadingManager, unmatchedResourceUrl } from '../../../src/loaders/BaseLoader.js'
import { GltfLoader } from '../../../src/loaders/types/gltf.js'
import DaeLoader from '../../../src/loaders/types/dae.js'
import X3dLoader from '../../../src/loaders/types/x3d.js'
import VrmlLoader from '../../../src/loaders/types/vrml.js'
import FbxLoader from '../../../src/loaders/types/fbx.js'
import ObjLoader from '../../../src/loaders/types/obj.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

/** What a model may name that is none of its companions. */
const UNMATCHED = [
	['a remote URL', 'https://example.invalid/x.png'],
	['a plain-HTTP URL', 'http://example.invalid/x.png'],
	['a UNC path', '\\\\evil-host\\share\\x.png'],
	['a protocol-relative URL', '//evil-host/x.png'],
	['a drive-letter path', 'C:\\textures\\x.png'],
	['a file: URL', 'file:///C:/textures/x.png'],
	['a relative path', 'textures/x.png'],
	['a path above the model\'s folder', '../../maps/x.png'],
	['a Windows path above the model\'s folder', '..\\..\\textures\\x.png'],
]

/** A 1×1 PNG, not the placeholder's own pixel. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

// jsdom's Blob predates Blob.arrayBuffer(), which the OBJ loader reads its material with
if (typeof Blob.prototype.arrayBuffer !== 'function') {
	Blob.prototype.arrayBuffer = function() {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result)
			reader.onerror = reject
			reader.readAsArrayBuffer(this)
		})
	}
}

let imageLoads
let fetched

beforeEach(() => {
	THREE.DefaultLoadingManager.setURLModifier(undefined)
	// What three would load: the URL after the loader's manager has had its say. Nothing
	// is actually loaded, and fetch must not be reached at all
	imageLoads = []
	jest.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation(function(url) {
		imageLoads.push(this.manager.resolveURL(this.path === undefined ? url : this.path + url))
		return null
	})
	fetched = []
	global.fetch = jest.fn(async (url) => {
		fetched.push(String(url))
		throw new Error('no request may be made')
	})
	let made = 0
	URL.createObjectURL = jest.fn(() => `blob:test/${++made}`)
})

afterEach(() => {
	jest.restoreAllMocks()
	THREE.DefaultLoadingManager.setURLModifier(undefined)
})

describe('unmatchedResourceUrl', () => {
	it.each(UNMATCHED)('turns %s into a placeholder that requests nothing, on the page', (_, url) => {
		expect(unmatchedResourceUrl(url)).toBe(NO_TEXTURE_URL)
	})

	it('keeps the data: and blob: URLs loaders make for themselves', () => {
		expect(unmatchedResourceUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
		expect(unmatchedResourceUrl('blob:https://cloud.example.com/1234')).toBe('blob:https://cloud.example.com/1234')
	})

	it('in the thumbnail worker, hands the URL to the worker\'s resolver', () => {
		const resolver = jest.fn((url) => (url.endsWith('handed.png') ? 'blob:worker/1' : url))
		THREE.DefaultLoadingManager.setURLModifier(resolver)

		expect(unmatchedResourceUrl('C:\\x\\handed.png')).toBe('blob:worker/1')
		// Refused: the resolver records it and the job fails, and still nothing is requested
		expect(unmatchedResourceUrl('https://example.invalid/x.png')).toBe(NO_TEXTURE_URL)
		expect(resolver).toHaveBeenCalledWith('https://example.invalid/x.png')
	})

	it('a companion manager maps what it matches and nothing else', () => {
		const manager = companionLoadingManager((url) => (url.endsWith('wood.png') ? 'data:image/png;base64,V09PRA==' : null))

		expect(manager.resolveURL('C:\\x\\wood.png')).toBe('data:image/png;base64,V09PRA==')
		expect(manager.resolveURL('https://example.invalid/x.png')).toBe(NO_TEXTURE_URL)
	})
})

describe('DAE', () => {
	const dae = (image) => `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><up_axis>Y_UP</up_axis></asset>
<library_images><image id="img"><init_from>${image.replace(/&/g, '&amp;')}</init_from></image></library_images>
<library_effects><effect id="fx"><profile_COMMON><newparam sid="surf"><surface type="2D"><init_from>img</init_from></surface></newparam><newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam><technique sid="common"><lambert><diffuse><texture texture="samp" texcoord="UV"/></diffuse></lambert></technique></profile_COMMON></effect></library_effects>
<library_materials><material id="mat"><instance_effect url="#fx"/></material></library_materials>
<library_geometries><geometry id="quad"><mesh>
<source id="pos"><float_array id="pos-a" count="9">0 0 0 1 0 0 1 1 0</float_array><technique_common><accessor source="#pos-a" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<vertices id="v"><input semantic="POSITION" source="#pos"/></vertices>
<triangles count="1" material="m"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="s"><node id="n"><instance_geometry url="#quad"><bind_material><technique_common><instance_material symbol="m" target="#mat"/></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene>
</COLLADA>`

	it.each(UNMATCHED)('loads a placeholder for %s, with companions and without', async (_, url) => {
		for (const additionalFiles of [[], [new File([PNG], 'wood.png', { type: 'image/png' })]]) {
			imageLoads = []
			await new DaeLoader().loadModel(new TextEncoder().encode(dae(url)).buffer, { THREE, additionalFiles })

			expect(imageLoads).toEqual([NO_TEXTURE_URL])
		}
		expect(fetched).toEqual([])
	})

	it('still loads the companion it was given', async () => {
		await new DaeLoader().loadModel(new TextEncoder().encode(dae('C:\\textures\\wood.png')).buffer, {
			THREE,
			additionalFiles: [new File([PNG], 'wood.png', { type: 'image/png' })],
		})

		expect(imageLoads).toHaveLength(1)
		expect(imageLoads[0]).toMatch(/^data:image\/png;base64,/)
		expect(imageLoads[0]).not.toBe(NO_TEXTURE_URL)
	})
})

describe('3DS', () => {
	it.each(UNMATCHED)('its manager resolves %s to a placeholder, with companions and without', async (_, url) => {
		const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js')
		const managers = []
		jest.spyOn(TDSLoader.prototype, 'parse').mockImplementation(function() {
			managers.push(this.manager)
			const group = new THREE.Group()
			group.add(new THREE.Mesh(new THREE.BoxGeometry()))
			return group
		})
		const ThreeDSLoader = (await import('../../../src/loaders/types/threeDS.js')).default

		for (const additionalFiles of [[], [new File([PNG], 'wood.png', { type: 'image/png' })]]) {
			await new ThreeDSLoader().loadModel(new ArrayBuffer(8), { THREE, additionalFiles })
		}

		expect(managers).toHaveLength(2)
		for (const manager of managers) {
			expect(manager).not.toBe(THREE.DefaultLoadingManager)
			expect(manager.resolveURL(url)).toBe(NO_TEXTURE_URL)
		}
	})
})

describe('FBX', () => {
	it.each(UNMATCHED)('gives %s its placeholder', (_, url) => {
		const resolved = new FbxLoader().resolveTextureUrl(url, new Map(), [new File(['x'], 'wood.png')])

		expect(resolved.startsWith('data:image/png;base64,')).toBe(true)
	})
})

describe('X3D', () => {
	it.each(UNMATCHED)('loads no texture for %s', async (_, url) => {
		const x3d = `<X3D><Scene><Shape><Appearance><Material/><ImageTexture url='"${url}"'/></Appearance>
<IndexedFaceSet coordIndex="0 1 2 -1"><Coordinate point="0 0 0 1 0 0 1 1 0"/></IndexedFaceSet></Shape></Scene></X3D>`
		const load = jest.spyOn(THREE.TextureLoader.prototype, 'load')

		const { object3D } = await new X3dLoader().loadModel(new TextEncoder().encode(x3d).buffer, {
			THREE,
			additionalFiles: [new File([PNG], 'wood.png', { type: 'image/png' })],
		})

		const maps = []
		object3D.traverse((child) => child.isMesh && maps.push(child.material.map))
		expect(maps).toEqual([null])
		expect(load).not.toHaveBeenCalled()
		expect(imageLoads).toEqual([])
	})
})

describe('OBJ', () => {
	it.each(UNMATCHED)('three\'s own MTL loader would load a placeholder for %s', async (_, url) => {
		const loader = new ObjLoader()
		await loader.loadModel(new TextEncoder().encode('mtllib chair.mtl\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n').buffer, {
			THREE,
			additionalFiles: [new File([`newmtl seat\nmap_Kd ${url}\n`], 'chair.mtl')],
		})

		expect(loader.mtlLoader.manager.resolveURL(url)).toBe(NO_TEXTURE_URL)
		expect(fetched).toEqual([])
	})
})

describe('glTF', () => {
	it.each(UNMATCHED)('resolves %s to a placeholder, with companions and without', async (_, url) => {
		const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
		for (const files of [[], [new File(['png'], 'wood.png', { type: 'image/png' })]]) {
			const loader = new GltfLoader()
			loader.loader = new GLTFLoader()
			await loader.setupResourceManager(files)

			expect(loader.loader.manager.resolveURL(url)).toBe(NO_TEXTURE_URL)
		}
	})

	it('sends a KTX2 image through the same rule, and leaves the KTX2 transcoder alone', async () => {
		const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
		const loader = new GltfLoader()
		loader.loader = new GLTFLoader()
		const ktx2Loader = { transcoderPath: '/custom_apps/threedviewer/basis/', manager: THREE.DefaultLoadingManager }
		loader.loader.setKTX2Loader(ktx2Loader)

		await loader.setupResourceManager([new File(['ktx'], 'wood.ktx2', { type: 'image/ktx2' })])

		expect(ktx2Loader.manager.resolveURL('https://example.invalid/x.ktx2')).toBe(NO_TEXTURE_URL)
		expect(ktx2Loader.manager.resolveURL('C:\\textures\\wood.ktx2')).toMatch(/^blob:test\//)
		expect(ktx2Loader.manager.resolveURL('/custom_apps/threedviewer/basis/basis_transcoder.wasm'))
			.toBe('/custom_apps/threedviewer/basis/basis_transcoder.wasm')
	})

	it('hooks the manager when the model has no companions at all', async () => {
		const loader = new GltfLoader()
		const gltf = JSON.stringify({
			asset: { version: '2.0' },
			images: [{ uri: 'https://example.invalid/x.png' }],
			textures: [{ source: 0 }],
			materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
		})

		await loader.loadModel(new TextEncoder().encode(gltf).buffer, { THREE, additionalFiles: [] }).catch(() => {})

		expect(loader.loader.manager).not.toBe(THREE.DefaultLoadingManager)
		expect(loader.loader.manager.resolveURL('https://example.invalid/x.png')).toBe(NO_TEXTURE_URL)
	})
})

describe('VRML', () => {
	it.each(UNMATCHED)('loads a placeholder for an ImageTexture of %s', async (_, url) => {
		const vrml = `#VRML V2.0 utf8
Shape {
  appearance Appearance { texture ImageTexture { url "${url.replace(/\\/g, '\\\\')}" } }
  geometry IndexedFaceSet { coord Coordinate { point [ 0 0 0, 1 0 0, 0 1 0 ] } coordIndex [ 0, 1, 2, -1 ] }
}
`
		await new VrmlLoader().loadModel(new TextEncoder().encode(vrml).buffer, {})

		expect(imageLoads).toEqual([NO_TEXTURE_URL])
		expect(fetched).toEqual([])
	})
})
