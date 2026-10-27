/**
 * A texture named by a path that climbs above the model's folder.
 *
 * 3ds Max and other exporters write texture paths relative to the project rather than
 * the model, `..\..\textures\wood.png`, while the user uploads the texture beside the
 * model. The declaration reduces such a path to its bare name and the companion is
 * fetched by it; each loader then asks for the path as the model wrote it, or resolved
 * against the model's URL, which can land anywhere above the app. Every loader has to map
 * that request to the companion by its name, and, given no companion of that name,
 * request nothing on the page and have the request refused in the thumbnail worker.
 */

import * as THREE from 'three'
import { NO_TEXTURE_URL, requestedFileNames } from '../../../src/loaders/BaseLoader.js'
import { GltfLoader } from '../../../src/loaders/types/gltf.js'
import DaeLoader from '../../../src/loaders/types/dae.js'
import X3dLoader from '../../../src/loaders/types/x3d.js'
import FbxLoader from '../../../src/loaders/types/fbx.js'
import { createWorkerResources } from '../../../src/thumbnails/workerResources.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

/** Where a model sits, for what a loader resolving against its URL would ask for. */
const MODEL_URL = 'https://cloud.example.com/index.php/apps/threedviewer/api/file/42'

/** Ways a loader may ask for `wood.png` declared above the model's folder. */
const CLIMBING = [
	['a path above the model\'s folder', '../../maps/wood.png'],
	['a Windows path above it, as 3ds Max writes', '..\\..\\textures\\wood.png'],
	['a path that collapses and then climbs out', 'textures/../../wood.png'],
	['a climb further than any folder goes', `${'../'.repeat(12)}wood.png`],
	['the path resolved against the model\'s URL', new URL('../../maps/wood.png', MODEL_URL).href],
	['a climb resolved past the root', new URL(`${'../'.repeat(12)}maps/wood.png`, MODEL_URL).href],
]

/** The same, for a name that is none of the companions. */
const CLIMBING_TO_OTHER = CLIMBING.map(([why, url]) => [why, url.replace('wood.png', 'other.png')])

/** A 1×1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const wood = () => new File([PNG], 'wood.png', { type: 'image/png' })

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

/**
 * @param {string} image - What the image's init_from names
 * @return {string} A COLLADA triangle textured with it
 */
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

/**
 * @param {string} url - What the ImageTexture's url names
 * @return {string} An X3D quad textured with it
 */
const x3d = (url) => `<X3D><Scene><Shape><Appearance><Material/><ImageTexture url='"${url}"'/></Appearance>
<IndexedFaceSet coordIndex="0 1 2 3 -1" texCoordIndex="0 1 2 3 -1"><Coordinate point="0 0 0 1 0 0 1 1 0 0 1 0"/><TextureCoordinate point="0 0 1 0 1 1 0 1"/></IndexedFaceSet></Shape></Scene></X3D>`

/**
 * @return {Promise<THREE.LoadingManager>} The manager the 3DS loader would load maps with,
 *   given wood.png
 */
async function threeDsManager() {
	const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js')
	let manager = null
	jest.spyOn(TDSLoader.prototype, 'parse').mockImplementation(function() {
		manager = this.manager
		const group = new THREE.Group()
		group.add(new THREE.Mesh(new THREE.BoxGeometry()))
		return group
	})
	const ThreeDSLoader = (await import('../../../src/loaders/types/threeDS.js')).default
	await new ThreeDSLoader().loadModel(new ArrayBuffer(8), { THREE, additionalFiles: [wood()] })
	return manager
}

/**
 * @return {Promise<THREE.LoadingManager>} The manager the glTF loader would load its
 *   images and buffers with, given wood.png
 */
async function gltfManager() {
	const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
	const loader = new GltfLoader()
	loader.loader = new GLTFLoader()
	await loader.setupResourceManager([wood()])
	return loader.loader.manager
}

describe('a texture named above the model\'s folder, on the page', () => {
	it.each(CLIMBING)('is asked for by its name: %s', (_, url) => {
		expect(requestedFileNames(url)).toContain('wood.png')
	})

	it.each(CLIMBING)('FBX maps %s to the companion of that name', (_, url) => {
		const dataUris = new Map([['wood.png', 'data:image/png;base64,V09PRA==']])

		expect(new FbxLoader().resolveTextureUrl(url, dataUris, [wood()])).toBe('data:image/png;base64,V09PRA==')
	})

	it.each(CLIMBING)('COLLADA maps %s to the companion of that name', async (_, url) => {
		await new DaeLoader().loadModel(new TextEncoder().encode(dae(url)).buffer, { THREE, additionalFiles: [wood()] })

		expect(imageLoads).toHaveLength(1)
		expect(imageLoads[0]).toMatch(/^data:image\/png;base64,/)
		expect(imageLoads[0]).not.toBe(NO_TEXTURE_URL)
	})

	it.each(CLIMBING)('3DS maps %s to the companion of that name', async (_, url) => {
		const manager = await threeDsManager()

		expect(manager.resolveURL(url)).toMatch(/^data:image\/png;base64,/)
	})

	it.each(CLIMBING)('X3D maps %s to the companion of that name', async (_, url) => {
		const load = jest.spyOn(THREE.TextureLoader.prototype, 'load')

		const { object3D } = await new X3dLoader().loadModel(new TextEncoder().encode(x3d(url)).buffer, { THREE, additionalFiles: [wood()] })

		const maps = []
		object3D.traverse((child) => child.isMesh && maps.push(child.material.map))
		expect(maps).toHaveLength(1)
		expect(maps[0]).toBeInstanceOf(THREE.Texture)
		expect(load.mock.calls[0][0]).toMatch(/^data:image\/png;base64,/)
	})

	it.each(CLIMBING)('glTF maps %s to the companion of that name', async (_, url) => {
		const manager = await gltfManager()

		expect(manager.resolveURL(url)).toMatch(/^blob:test\//)
	})

	it.each(CLIMBING_TO_OTHER)('requests nothing for %s when no companion has its name', async (_, url) => {
		expect(new FbxLoader().resolveTextureUrl(url, new Map([['wood.png', 'data:image/png;base64,V09PRA==']]), [wood()]))
			.not.toBe('data:image/png;base64,V09PRA==')
		expect((await threeDsManager()).resolveURL(url)).toBe(NO_TEXTURE_URL)
		expect((await gltfManager()).resolveURL(url)).toBe(NO_TEXTURE_URL)
		await new DaeLoader().loadModel(new TextEncoder().encode(dae(url)).buffer, { THREE, additionalFiles: [wood()] })
		expect(imageLoads).toEqual([NO_TEXTURE_URL])
		expect(fetched).toEqual([])
	})
})

describe('a texture named above the model\'s folder, in the thumbnail worker', () => {
	/**
	 * Install the worker's resolver on three's default manager, as thumbnail.worker.js does.
	 *
	 * @param {File[]} files - What the job was handed
	 * @return {object} The job's resources
	 */
	function inWorker(files) {
		const resources = createWorkerResources({
			files,
			appWebRoot: '/custom_apps/threedviewer/',
			baseUrl: 'https://cloud.example.com/custom_apps/threedviewer/js/thumbnail-worker.mjs',
			createObjectURL: (file) => `blob:worker/${file.name}`,
		})
		THREE.DefaultLoadingManager.setURLModifier((url) => resources.resolve(url))
		return resources
	}

	it.each(CLIMBING)('resolves %s to the handed file of that name', (_, url) => {
		const resources = inWorker([wood()])

		expect(THREE.DefaultLoadingManager.resolveURL(url)).toBe('blob:worker/wood.png')
		expect(resources.refused).toEqual([])
	})

	it.each(CLIMBING_TO_OTHER)('refuses %s when it was handed no file of that name, from any loader', async (_, url) => {
		const resources = inWorker([wood()])

		// The loaders that pass a request they cannot map to the default manager: the
		// worker's resolver records the refusal, which fails the job, and the loader is
		// left with a placeholder that requests nothing
		await new DaeLoader().loadModel(new TextEncoder().encode(dae(url)).buffer, { THREE, additionalFiles: [wood()] })
		expect(imageLoads).toEqual([NO_TEXTURE_URL])
		expect((await threeDsManager()).resolveURL(url)).toBe(NO_TEXTURE_URL)
		expect((await gltfManager()).resolveURL(url)).toBe(NO_TEXTURE_URL)

		expect(resources.refused).toEqual([url])
		expect(fetched).toEqual([])
	})
})
