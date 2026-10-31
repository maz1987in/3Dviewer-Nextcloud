/**
 * A view, carried in a link: written short, read back strictly. Whatever arrives in a
 * link was typed or edited by someone, so nothing in it is trusted until it is checked.
 */
import * as THREE from 'three'
import { encodeView, decodeView, readViewFromUrl, buildViewUrl, isUsableTarget, isUsableCamera, viewerLinkBase, cameraToScene, takeViewFromUrl, captureViewState, VIEW_PARAM, VIEW_VERSION } from '../../../src/utils/viewLink.js'

const full = {
	camera: { position: [1.23456, 2, 3], target: [0, 0.5, 0], zoom: 1, projection: 'orthographic' },
	renderMode: 'clay',
	wireframe: true,
	lighting: 'studio',
	clipping: { mode: 'plane', axis: 'z', position: -0.25, flipped: true },
	exploded: 0.4,
	note: 42,
}

/** A payload encoded the way the module does, for inputs it would never write itself. */
const raw = (object) => `${VIEW_VERSION}.` + Buffer.from(JSON.stringify(object)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('a view in a link', () => {
	it('round-trips a full view', () => {
		expect(decodeView(encodeView(full))).toEqual({ ...full, camera: { ...full.camera, position: [1.2346, 2, 3] } })
	})

	it('round-trips a box cut', () => {
		const view = { ...full, clipping: { mode: 'box', offsets: { xMin: 0.1, xMax: 0, yMin: 0, yMax: 0.2, zMin: 0, zMax: 0 } } }
		expect(decodeView(encodeView(view)).clipping).toEqual(view.clipping)
	})

	it('round-trips a camera-only view', () => {
		const view = { camera: full.camera }
		expect(Object.keys(decodeView(encodeView(view)))).toEqual(['camera'])
	})

	it('starts with the version', () => {
		expect(VIEW_PARAM).toBe('view')
		expect(encodeView(full).startsWith('1.')).toBe(true)
	})

	it('stays short', () => {
		expect(encodeView(full).length).toBeLessThan(400)
	})

	it('is safe in a URL as it is', () => {
		expect(encodeView(full)).toMatch(/^[0-9]+\.[A-Za-z0-9_-]+$/)
	})

	it.each([
		['empty', ''],
		['no version', 'x'],
		['another version', '2.e30'],
		['not base64', '1.!!!'],
		['not an object', raw([])],
		['a camera of the wrong shape', raw({ c: 'nope' })],
		['no camera', raw({ r: 'clay' })],
		['not a string', 42],
	])('rejects %s', (_, value) => {
		expect(decodeView(value)).toBeNull()
	})

	it('drops unknown or bad optional fields and keeps the camera', () => {
		const view = decodeView(encodeView({ ...full, renderMode: 'evil', lighting: '<img>', note: -1, exploded: 9 }))
		expect(view.camera).toBeDefined()
		expect(view.renderMode).toBeUndefined()
		expect(view.lighting).toBeUndefined()
		expect(view.note).toBeUndefined()
		expect(view.exploded).toBe(1)
	})

	it('ignores a lighting name inherited from Object.prototype', () => {
		expect(decodeView(encodeView({ ...full, lighting: 'constructor' })).lighting).toBeUndefined()
	})

	it('drops a cut with an unknown axis or face', () => {
		expect(decodeView(encodeView({ ...full, clipping: { mode: 'plane', axis: 'w', position: 0, flipped: false } })).clipping).toBeUndefined()
		expect(decodeView(encodeView({ ...full, clipping: { mode: 'box', offsets: { xMin: 'a' } } })).clipping).toBeUndefined()
	})

	it('clamps the cut position and zoom', () => {
		const view = decodeView(encodeView({ ...full, clipping: { ...full.clipping, position: 7 }, camera: { ...full.camera, zoom: 1e9 } }))
		expect(view.clipping.position).toBe(1)
		expect(view.camera.zoom).toBe(100)
	})

	it('rejects non-finite or huge coordinates', () => {
		expect(decodeView(encodeView({ ...full, camera: { ...full.camera, position: [1e12, 0, 0] } }))).toBeNull()
		expect(decodeView(raw({ c: { p: [0, 0, null], t: [0, 0, 0], z: 1, o: 0 } }))).toBeNull()
	})
})

describe('a scan\'s view', () => {
	const scan = { camera: full.camera, pointSize: 3.5, colourBy: 'intensity' }

	it('round-trips point size and colour by', () => {
		const view = decodeView(encodeView(scan))
		expect(view.pointSize).toBe(3.5)
		expect(view.colourBy).toBe('intensity')
	})

	it('rounds the point size to the slider\'s step', () => {
		expect(decodeView(encodeView({ ...scan, pointSize: 3.3 })).pointSize).toBe(3.5)
	})

	it('clamps a point size out of range', () => {
		expect(decodeView(raw({ c: { p: [0, 0, 5], t: [0, 0, 0], z: 1, o: 0 }, ps: 99 })).pointSize).toBe(10)
		expect(decodeView(raw({ c: { p: [0, 0, 5], t: [0, 0, 0], z: 1, o: 0 }, ps: -4 })).pointSize).toBe(1)
		expect(decodeView(raw({ c: { p: [0, 0, 5], t: [0, 0, 0], z: 1, o: 0 }, ps: 'big' })).pointSize).toBeUndefined()
	})

	it('drops a colour by it doesn\'t know, and keeps the rest', () => {
		const view = decodeView(raw({ c: { p: [0, 0, 5], t: [0, 0, 0], z: 1, o: 0 }, cb: 'rainbow', r: 'clay' }))
		expect(view.colourBy).toBeUndefined()
		expect(view.renderMode).toBe('clay')
	})

	it('is captured only for a scan', () => {
		const base = { camera: { position: new THREE.Vector3(0, 0, 5), zoom: 1, isOrthographicCamera: false }, controls: { target: new THREE.Vector3() }, renderMode: 'standard', wireframe: false, lightingPreset: 'default' }
		expect(captureViewState({ ...base, pointCloud: { pointSize: 4, colourBy: 'height' } })).toMatchObject({ pointSize: 4, colourBy: 'height' })
		const mesh = captureViewState(base)
		expect(mesh.pointSize).toBeUndefined()
		expect(mesh.colourBy).toBeUndefined()
	})
})

describe('reading the view from the page URL', () => {
	it('reads the legacy cam parameter, which is in the full viewer\'s scene', () => {
		const view = readViewFromUrl('?cam=1,2,3,0,0,0,1')
		expect(view.camera).toEqual({ position: [1, 2, 3], target: [0, 0, 0], zoom: 1, projection: 'perspective' })
		expect(view.inScene).toBe(true)
	})

	it('reads a view link as relative to the model', () => {
		expect(readViewFromUrl(`?view=${encodeView(full)}`).inScene).toBeUndefined()
	})

	it('prefers view over cam', () => {
		expect(readViewFromUrl(`?cam=9,9,9,0,0,0,1&view=${encodeView(full)}`).renderMode).toBe('clay')
	})

	it('is null with neither, or with a broken view and no cam', () => {
		expect(readViewFromUrl('?fileId=3')).toBeNull()
		expect(readViewFromUrl('?view=1.zzz')).toBeNull()
	})
})

describe('building a link', () => {
	it('keeps other parameters and drops cam', () => {
		const url = new URL(buildViewUrl('https://cloud.test/apps/threedviewer/f/7?dir=a&cam=1,2,3,0,0,0,1', full))
		expect(url.pathname).toBe('/apps/threedviewer/f/7')
		expect(url.searchParams.get('dir')).toBe('a')
		expect(url.searchParams.has('cam')).toBe(false)
		expect(decodeView(url.searchParams.get('view'))).not.toBeNull()
	})

	it('stays well under 2,000 characters', () => {
		expect(buildViewUrl('https://cloud.example.com/index.php/apps/threedviewer/f/123456', full).length).toBeLessThan(2000)
	})
})

describe('whether a linked camera still looks at the model', () => {
	const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 20, 10))

	it('takes a target on the model', () => {
		expect(isUsableTarget([5, 10, 5], box)).toBe(true)
	})

	it('takes a target off the model by up to its own size', () => {
		expect(isUsableTarget([-9.9, 39.9, 19.9], box)).toBe(true)
	})

	it('refuses a target further off than that', () => {
		expect(isUsableTarget([-10.1, 10, 5], box)).toBe(false)
		expect(isUsableTarget([5, 40.1, 5], box)).toBe(false)
	})

	it('takes anything when there is no box to judge by', () => {
		expect(isUsableTarget([1e6, 0, 0], new THREE.Box3())).toBe(true)
	})
})

describe('where a link from the light viewer points', () => {
	it('is the page itself for a public-link visitor', () => {
		expect(viewerLinkBase({ isPublic: true, pageUrl: 'https://cloud.test/s/abc?x=1', origin: 'https://cloud.test', fileId: 7 }))
			.toBe('https://cloud.test/s/abc?x=1')
	})

	it('is the full viewer for a logged-in user in Files', () => {
		expect(viewerLinkBase({ isPublic: false, pageUrl: 'https://cloud.test/apps/files/files/7?openfile=true', origin: 'https://cloud.test', fileId: 7 }))
			.toBe('https://cloud.test/index.php/apps/threedviewer/f/7')
	})
})

describe('the camera, relative to the model', () => {
	// The full viewer moves a model to the middle of the scene; the light viewer leaves it
	// where the file puts it. A link holds the camera relative to the model, so it means
	// the same in both.
	const placed = (x, y, z) => {
		const model = new THREE.Group()
		model.position.set(x, y, z)
		model.updateMatrixWorld(true)
		return model
	}
	const camera = () => {
		const c = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
		c.position.set(10, 20, 30)
		return c
	}
	const base = {
		renderMode: 'standard', wireframe: false, lightingPreset: 'default',
		clipping: { isActive: false }, exploded: { isActive: false, factor: 0 }, highlightedNoteId: null,
	}

	it('is captured relative to where the model sits', () => {
		const view = captureViewState({ ...base, camera: camera(), controls: { target: new THREE.Vector3(1, 2, 3) }, model: placed(-100, 0, 0) })
		expect(view.camera.position).toEqual([110, 20, 30])
		expect(view.camera.target).toEqual([101, 2, 3])
	})

	it('is put back in the scene of a viewer that placed the model elsewhere', () => {
		const linked = { position: [110, 20, 30], target: [101, 2, 3], zoom: 1, projection: 'perspective' }
		expect(cameraToScene(linked, placed(0, 0, 0))).toEqual({ position: [110, 20, 30], target: [101, 2, 3] })
		expect(cameraToScene(linked, placed(-100, 0, 0))).toEqual({ position: [10, 20, 30], target: [1, 2, 3] })
	})

	it('follows a rotated model too', () => {
		const model = placed(0, 0, 0)
		model.rotation.set(-Math.PI / 2, 0, 0)
		model.updateMatrixWorld(true)
		const view = captureViewState({ ...base, camera: camera(), controls: { target: new THREE.Vector3(0, 5, 0) }, model })
		const back = cameraToScene(view.camera, model)
		back.position.forEach((n, i) => expect(n).toBeCloseTo([10, 20, 30][i], 4))
		back.target.forEach((n, i) => expect(n).toBeCloseTo([0, 5, 0][i], 4))
	})
})

describe('whether a linked camera still frames the model', () => {
	const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 10, 10))

	it('takes a camera at a sensible distance', () => {
		expect(isUsableCamera([5, 5, 30], [5, 5, 5], box)).toBe(true)
	})

	it('refuses a camera much too far for the model, or inside a point of it', () => {
		expect(isUsableCamera([5, 5, 5 + 2000], [5, 5, 5], box)).toBe(false)
		expect(isUsableCamera([5, 5, 5.05], [5, 5, 5], box)).toBe(false)
	})

	it('refuses a target off the model, as isUsableTarget does', () => {
		expect(isUsableCamera([100, 5, 5], [80, 5, 5], box)).toBe(false)
	})
})

describe('reading the view once per page', () => {
	it('hands the view out once: the next viewer on the page frames as usual', () => {
		const search = `?view=${encodeView(full)}`
		expect(takeViewFromUrl(search)).not.toBeNull()
		expect(takeViewFromUrl(search)).toBeNull()
	})
})
