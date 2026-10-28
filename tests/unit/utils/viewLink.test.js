/**
 * A view, carried in a link: written short, read back strictly. Whatever arrives in a
 * link was typed or edited by someone, so nothing in it is trusted until it is checked.
 */
import * as THREE from 'three'
import { encodeView, decodeView, readViewFromUrl, buildViewUrl, isUsableTarget, viewerLinkBase, VIEW_PARAM, VIEW_VERSION } from '../../../src/utils/viewLink.js'

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

describe('reading the view from the page URL', () => {
	it('reads the legacy cam parameter', () => {
		expect(readViewFromUrl('?cam=1,2,3,0,0,0,1').camera).toEqual({ position: [1, 2, 3], target: [0, 0, 0], zoom: 1, projection: 'perspective' })
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
