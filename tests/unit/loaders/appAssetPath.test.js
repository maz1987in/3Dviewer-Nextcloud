/**
 * Decoder asset URLs inside the thumbnail worker, which has no page to read the app's
 * web root from and is handed it by its host instead. The page side is covered by
 * assetRoots.test.js.
 */
import { appAssetPath, setAppWebRoot } from '../../../src/loaders/appAssetPath.js'

describe('appAssetPath', () => {
	afterEach(() => {
		setAppWebRoot(null)
		delete window._oc_appswebroots
	})

	it('resolves against the page\'s app root by default', () => {
		window._oc_appswebroots = { threedviewer: '/cloud/custom_apps/threedviewer' }

		expect(appAssetPath('draco')).toBe('/cloud/custom_apps/threedviewer/draco/')
		expect(appAssetPath('occt', 'occt-import-js.wasm')).toBe('/cloud/custom_apps/threedviewer/occt/occt-import-js.wasm')
	})

	it('uses the root it was given, matching what the page would resolve', () => {
		window._oc_appswebroots = { threedviewer: '/cloud/custom_apps/threedviewer' }
		const onPage = [appAssetPath('rhino3dm'), appAssetPath('occt', 'occt-import-js.wasm')]

		setAppWebRoot('/cloud/custom_apps/threedviewer/')
		window._oc_appswebroots = { threedviewer: '/elsewhere' }

		expect([appAssetPath('rhino3dm'), appAssetPath('occt', 'occt-import-js.wasm')]).toEqual(onPage)
	})
})
