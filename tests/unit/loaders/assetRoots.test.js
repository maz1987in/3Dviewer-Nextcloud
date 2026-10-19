/**
 * Decoder and WASM assets resolve against the app's real web root (#188).
 *
 * The CAD, IFC, 3DM and compressed-glTF loaders fetch their runtimes from directories
 * the app serves statically: `occt/`, `web-ifc/`, `rhino3dm/`, `draco/` and `basis/`.
 * Those paths used to be written as `/apps/threedviewer/...`, which only exists when the
 * app sits in the shipped apps root. An App Store install lands in the writable root —
 * `custom_apps/` on the official image — so every one of those fetches came back 404 and
 * the loaders aborted with "both async and sync fetching of the wasm failed".
 *
 * Nextcloud tells the page where each app lives through `window._oc_appswebroots`. These
 * tests put the app in `custom_apps/` under a sub-directory install and check that each
 * loader asks for its runtime there.
 */

jest.mock('occt-import-js', () => jest.fn(() => Promise.resolve({})))

jest.mock('web-ifc', () => {
	const wasmPaths = []
	return {
		wasmPaths,
		IfcAPI: class {
			SetWasmPath(path, absolute) { wasmPaths.push({ path, absolute }) }
			Init() { return Promise.reject(new Error('stop after configuring')) }
		},
	}
})

jest.mock('three/examples/jsm/loaders/3DMLoader.js', () => {
	const libraryPaths = []
	return {
		libraryPaths,
		Rhino3dmLoader: class {
			setLibraryPath(path) { libraryPaths.push(path) }
			parse(buffer, onLoad, onError) { onError(new Error('stop after configuring')) }
		},
	}
})

jest.mock('three/examples/jsm/loaders/DRACOLoader.js', () => {
	const decoderPaths = []
	return {
		decoderPaths,
		DRACOLoader: class {
			setDecoderPath(path) { decoderPaths.push(path) }
		},
	}
})

jest.mock('three/examples/jsm/loaders/KTX2Loader.js', () => {
	const transcoderPaths = []
	return {
		transcoderPaths,
		KTX2Loader: class {
			setTranscoderPath(path) { transcoderPaths.push(path) }
			detectSupport() { return this }
		},
	}
})

const APP_ROOT = '/nextcloud/custom_apps/threedviewer'

beforeAll(() => {
	window._oc_webroot = '/nextcloud'
	window._oc_appswebroots = { threedviewer: APP_ROOT }
})

afterAll(() => {
	delete window._oc_webroot
	delete window._oc_appswebroots
})

test('OCCT (STEP/IGES/BREP/FCSTD) loads its wasm from the app web root', async () => {
	const occtimportjs = (await import('occt-import-js')).default
	const { getOcct } = await import('../../../src/loaders/occt-runtime.js')

	await getOcct()

	const { locateFile } = occtimportjs.mock.calls[0][0]
	expect(locateFile('occt-import-js.wasm')).toBe(`${APP_ROOT}/occt/occt-import-js.wasm`)
})

test('IFC loads web-ifc from the app web root', async () => {
	const { wasmPaths } = await import('web-ifc')
	const IfcLoader = (await import('../../../src/loaders/types/ifc.js')).default

	await expect(new IfcLoader().loadModel(new ArrayBuffer(0), {})).rejects.toThrow()

	expect(wasmPaths).toEqual([{ path: `${APP_ROOT}/web-ifc/`, absolute: true }])
})

test('3DM loads rhino3dm from the app web root', async () => {
	const { libraryPaths } = await import('three/examples/jsm/loaders/3DMLoader.js')
	const ThreeDMLoader = (await import('../../../src/loaders/types/threeDM.js')).default

	await expect(new ThreeDMLoader().loadModel(new ArrayBuffer(0), {})).rejects.toThrow()

	expect(libraryPaths).toEqual([`${APP_ROOT}/rhino3dm/`])
})

test('glTF loads the DRACO and Basis decoders from the app web root', async () => {
	const { decoderPaths } = await import('three/examples/jsm/loaders/DRACOLoader.js')
	const { transcoderPaths } = await import('three/examples/jsm/loaders/KTX2Loader.js')
	const { GltfLoader } = await import('../../../src/loaders/types/gltf.js')

	const loader = new GltfLoader()
	loader.loader = { setDRACOLoader: jest.fn(), setKTX2Loader: jest.fn() }
	await loader.configureDecoders({}, true, true, false)

	expect(loader.loader.setDRACOLoader).toHaveBeenCalled()
	expect(loader.loader.setKTX2Loader).toHaveBeenCalled()
	expect(decoderPaths).toEqual([`${APP_ROOT}/draco/`])
	expect(transcoderPaths).toEqual([`${APP_ROOT}/basis/`])
})
