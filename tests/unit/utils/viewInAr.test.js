/**
 * View in AR's pure decisions: which way a device can show the model in the room, how big
 * a scene unit is in metres, and when a model is too heavy to try (utils/viewInAr.js and
 * ar/limits.js).
 */
import { AR_PATH, arButtonLabel, detectArPath, isArBusy, lightViewerOffersAr, supportsQuickLook, supportsWebXrAr } from '../../../src/utils/viewInAr.js'
import { AR_TRIANGLES, arSizeVerdict, metresPerUnit } from '../../../src/ar/limits.js'

/** A page whose links do, or do not, open in Quick Look. */
const page = (supportsAr) => ({
	createElement: () => ({ relList: { supports: (token) => supportsAr && token === 'ar' } }),
})

/** A `navigator.xr` that supports the sessions listed. */
const xr = (...modes) => ({ isSessionSupported: jest.fn(async (mode) => modes.includes(mode)) })

describe('which way a device can show the model', () => {
	it('uses AR Quick Look where a link can open it and there is no WebXR AR (an iPhone)', async () => {
		expect(await detectArPath({ doc: page(true), xr: null })).toBe(AR_PATH.QUICK_LOOK)
		// visionOS and some iPads have WebXR for VR only
		expect(await detectArPath({ doc: page(true), xr: xr('immersive-vr') })).toBe(AR_PATH.QUICK_LOOK)
	})

	it('uses a WebXR session where the browser can start an immersive-ar one (Android Chrome)', async () => {
		const chrome = xr('immersive-ar', 'immersive-vr')
		expect(await detectArPath({ doc: page(false), xr: chrome })).toBe(AR_PATH.WEBXR)
		expect(chrome.isSessionSupported).toHaveBeenCalledWith('immersive-ar')
	})

	it('asks WebXR first when a browser has both', async () => {
		expect(await detectArPath({ doc: page(true), xr: xr('immersive-ar') })).toBe(AR_PATH.WEBXR)
	})

	it('offers nothing on a desktop, so the button is hidden', async () => {
		expect(await detectArPath({ doc: page(false), xr: null })).toBeNull()
		// A desktop with a headset has VR, not AR
		expect(await detectArPath({ doc: page(false), xr: xr('immersive-vr') })).toBeNull()
	})

	it('treats a browser that throws as having no way', async () => {
		const broken = { isSessionSupported: jest.fn(async () => { throw new Error('denied') }) }
		expect(await supportsWebXrAr(broken)).toBe(false)
		expect(supportsQuickLook({ createElement: () => { throw new Error('no') } })).toBe(false)
		// A browser whose links have no relList at all
		expect(supportsQuickLook({ createElement: () => ({}) })).toBe(false)
		expect(await detectArPath({ doc: { createElement: () => ({}) }, xr: broken })).toBeNull()
	})
})

describe('the scale AR shows the model at', () => {
	it('is the file unit in metres: an STL in millimetres, a glTF in metres', () => {
		expect(metresPerUnit(1)).toBe(0.001)
		expect(metresPerUnit(10)).toBe(0.01)
		expect(metresPerUnit(1000)).toBe(1)
		expect(metresPerUnit(25.4)).toBeCloseTo(0.0254, 10)
	})

	it('falls back to metres for a unit it was not given', () => {
		expect(metresPerUnit(0)).toBe(1)
		expect(metresPerUnit(NaN)).toBe(1)
		expect(metresPerUnit(undefined)).toBe(1)
	})
})

describe('when a model is too heavy for a phone', () => {
	it('goes ahead, warns, or refuses by triangle count', () => {
		const { warn, refuse } = AR_TRIANGLES[AR_PATH.QUICK_LOOK]
		expect(arSizeVerdict(warn, AR_PATH.QUICK_LOOK).verdict).toBe('ok')
		expect(arSizeVerdict(warn + 1, AR_PATH.QUICK_LOOK).verdict).toBe('warn')
		expect(arSizeVerdict(refuse, AR_PATH.QUICK_LOOK).verdict).toBe('warn')
		expect(arSizeVerdict(refuse + 1, AR_PATH.QUICK_LOOK)).toEqual({ verdict: 'refuse', limit: refuse })
	})

	it('allows a live session more than a file made on the phone', () => {
		const file = AR_TRIANGLES[AR_PATH.QUICK_LOOK]
		const live = AR_TRIANGLES[AR_PATH.WEBXR]
		expect(live.warn).toBeGreaterThan(file.warn)
		expect(live.refuse).toBeGreaterThan(file.refuse)
		expect(arSizeVerdict(file.refuse + 1, AR_PATH.WEBXR).verdict).toBe('warn')
		expect(arSizeVerdict(live.refuse + 1, AR_PATH.WEBXR).verdict).toBe('refuse')
	})

	it('is the stricter limit for a way it does not know', () => {
		expect(arSizeVerdict(AR_TRIANGLES[AR_PATH.QUICK_LOOK].refuse + 1, 'other').verdict).toBe('refuse')
	})
})

describe('the button', () => {
	it('says what a press will do, by state', () => {
		expect(arButtonLabel('idle')).toBe('View in AR')
		expect(arButtonLabel('active')).toBe('View in AR')
		expect(arButtonLabel('preparing')).toBe('Preparing AR…')
		// A file waits for a tap Safari will count
		expect(arButtonLabel('ready')).toBe('Open in AR')
	})

	it('ignores a press while a file is written or a session runs, not while a file waits', () => {
		expect(isArBusy('preparing')).toBe(true)
		expect(isArBusy('active')).toBe(true)
		expect(isArBusy('idle')).toBe(false)
		expect(isArBusy('ready')).toBe(false)
	})
})

describe('the light viewer', () => {
	it('offers View in AR on a share page and in the Files preview, on a device with a way', () => {
		expect(lightViewerOffersAr(AR_PATH.QUICK_LOOK)).toBe(true)
		expect(lightViewerOffersAr(AR_PATH.WEBXR, { embedded: false })).toBe(true)
	})

	it('does not where the device has none', () => {
		expect(lightViewerOffersAr(null)).toBe(false)
		expect(lightViewerOffersAr(undefined)).toBe(false)
		expect(lightViewerOffersAr('scene-viewer')).toBe(false)
	})

	it('does not in a frame on another site, which cannot grant it', () => {
		expect(lightViewerOffersAr(AR_PATH.QUICK_LOOK, { embedded: true })).toBe(false)
		expect(lightViewerOffersAr(AR_PATH.WEBXR, { embedded: true })).toBe(false)
	})
})
