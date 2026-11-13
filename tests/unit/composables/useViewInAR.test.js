/**
 * @jest-environment jsdom
 *
 * View in AR's flow, with the Quick Look file and the WebXR session replaced by stand-ins:
 * which way is taken, what happens to a model that is too big, a file made too late for
 * Safari to open it, and that the viewer's own state is set aside and put back.
 */
import { AR_PATH } from '../../../src/utils/viewInAr.js'
import { AR_TRIANGLES } from '../../../src/ar/limits.js'
import { useViewInAR } from '../../../src/composables/useViewInAR.js'

const mockBuild = jest.fn()
const mockOpen = jest.fn()
const mockStartSession = jest.fn()

jest.mock('../../../src/ar/quickLook.js', () => ({
	buildQuickLookFile: (...args) => mockBuild(...args),
	openQuickLook: (...args) => mockOpen(...args),
}))
jest.mock('../../../src/ar/session.js', () => ({
	startArSession: (...args) => mockStartSession(...args),
}))
jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const MODEL = { name: 'model' }

/** A composable that detected a way. */
async function ready(path) {
	const ar = useViewInAR()
	await ar.detect(path === AR_PATH.WEBXR
		? { xr: { isSessionSupported: async () => true }, doc: { createElement: () => ({}) } }
		: { xr: null, doc: { createElement: () => ({ relList: { supports: () => path === AR_PATH.QUICK_LOOK } }) } })
	return ar
}

const setActivation = (isActive) => Object.defineProperty(navigator, 'userActivation', { value: { isActive }, configurable: true })

beforeEach(() => {
	jest.clearAllMocks()
	URL.createObjectURL = jest.fn(() => 'blob:file')
	URL.revokeObjectURL = jest.fn()
	mockBuild.mockResolvedValue(new Blob(['usdz']))
	setActivation(true)
})

afterEach(() => { jest.useRealTimers() })

describe('on an iPhone or iPad', () => {
	it('writes the file at the model\'s unit and opens it in Quick Look', async () => {
		const ar = await ready(AR_PATH.QUICK_LOOK)
		expect(ar.path.value).toBe(AR_PATH.QUICK_LOOK)

		const result = await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12 })

		expect(result.status).toBe('opened')
		expect(mockBuild).toHaveBeenCalledWith(MODEL, { millimetresPerUnit: 1 })
		expect(mockOpen).toHaveBeenCalledWith('blob:file')
		expect(ar.state.value).toBe('idle')
	})

	it('lets go of the file a while after it is opened, not before', async () => {
		jest.useFakeTimers()
		const ar = await ready(AR_PATH.QUICK_LOOK)
		await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12 })
		expect(URL.revokeObjectURL).not.toHaveBeenCalled()
		jest.advanceTimersByTime(60_000)
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file')
	})

	it('shows it is working while the file is written, and cannot be started twice', async () => {
		let finish
		mockBuild.mockReturnValue(new Promise((resolve) => { finish = resolve }))
		const ar = await ready(AR_PATH.QUICK_LOOK)

		const first = ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12 })
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(ar.state.value).toBe('preparing')
		expect(await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12 })).toEqual({ status: 'busy' })

		finish(new Blob(['usdz']))
		expect((await first).status).toBe('opened')
		expect(mockBuild).toHaveBeenCalledTimes(1)
	})

	it('sets the viewer\'s shading and exploded view aside for the file, and puts them back', async () => {
		const events = []
		mockBuild.mockImplementation(async () => { events.push('built'); return new Blob(['usdz']) })
		const ar = await ready(AR_PATH.QUICK_LOOK)
		await ar.start({
			object: MODEL,
			millimetresPerUnit: 1,
			triangles: 12,
			hold: () => { events.push('held'); return () => events.push('released') },
		})
		expect(events).toEqual(['held', 'built', 'released'])
	})

	it('warns that a big model may take a while, and tries it', async () => {
		const ar = await ready(AR_PATH.QUICK_LOOK)
		const notify = jest.fn()
		const triangles = AR_TRIANGLES[AR_PATH.QUICK_LOOK].warn + 1000
		expect((await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles, notify })).status).toBe('opened')
		expect(notify).toHaveBeenCalledWith('warning', expect.stringContaining('this may take a while'))
	})

	it('refuses a model too big for a phone without making a file', async () => {
		const ar = await ready(AR_PATH.QUICK_LOOK)
		const { refuse } = AR_TRIANGLES[AR_PATH.QUICK_LOOK]
		const notify = jest.fn()
		const result = await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: refuse + 1, notify })
		expect(result).toEqual({ status: 'too-large', triangles: refuse + 1, limit: refuse })
		expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('too many to show in AR'))
		expect(mockBuild).not.toHaveBeenCalled()
		expect(ar.state.value).toBe('idle')
	})

	it('keeps the file for the next tap when Safari no longer counts this one', async () => {
		setActivation(false)
		const ar = await ready(AR_PATH.QUICK_LOOK)

		const notify = jest.fn()
		expect((await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12, notify })).status).toBe('ready')
		expect(notify).toHaveBeenCalledWith('info', expect.stringContaining('Press Open in AR'))
		expect(ar.state.value).toBe('ready')
		expect(mockOpen).not.toHaveBeenCalled()

		// The second tap opens it, without writing it again
		const second = await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12 })
		expect(second.status).toBe('opened')
		expect(mockOpen).toHaveBeenCalledWith('blob:file')
		expect(mockBuild).toHaveBeenCalledTimes(1)
		expect(ar.state.value).toBe('idle')
	})

	it('lets go of a file nobody opened when the model is replaced', async () => {
		setActivation(false)
		const ar = await ready(AR_PATH.QUICK_LOOK)
		await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12 })
		ar.dropReady()
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file')
		expect(ar.state.value).toBe('idle')
	})

	it('says a model with no surfaces has nothing to show, and recovers', async () => {
		const error = Object.assign(new Error('none'), { name: 'NothingToExportError' })
		mockBuild.mockRejectedValue(error)
		const released = jest.fn()
		const ar = await ready(AR_PATH.QUICK_LOOK)
		const notify = jest.fn()
		const result = await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 0, hold: () => released, notify })
		expect(result).toEqual({ status: 'no-surfaces' })
		expect(notify).toHaveBeenCalledWith('error', 'This model has no surfaces to show in AR.')
		expect(released).toHaveBeenCalledTimes(1)
		expect(ar.state.value).toBe('idle')
	})

	it('fails gracefully when the file cannot be written (out of memory on a phone)', async () => {
		mockBuild.mockRejectedValue(new RangeError('Array buffer allocation failed'))
		const ar = await ready(AR_PATH.QUICK_LOOK)
		const notify = jest.fn()
		const result = await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12, notify })
		expect(result.status).toBe('failed')
		expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('too large for this device'))
		expect(result.error).toBeInstanceOf(RangeError)
		expect(ar.state.value).toBe('idle')
		// and the button works again
		mockBuild.mockResolvedValue(new Blob(['usdz']))
		expect((await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12 })).status).toBe('opened')
	})
})

describe('on Android Chrome', () => {
	const xr = () => ({ renderer: { name: 'renderer' }, scene: { name: 'scene' }, renderFrame: jest.fn(), onEnd: jest.fn() })

	it('starts a session over the camera, with the scale in metres', async () => {
		const end = jest.fn()
		mockStartSession.mockResolvedValue({ end })
		const ar = await ready(AR_PATH.WEBXR)
		const options = xr()

		const result = await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12, xr: options })

		expect(result.status).toBe('session')
		expect(ar.state.value).toBe('active')
		const given = mockStartSession.mock.calls[0][0]
		expect(given.model).toBe(MODEL)
		expect(given.renderer).toBe(options.renderer)
		expect(given.scene).toBe(options.scene)
		// 1 scene unit is 1 mm, so 0.001 m
		expect(given.metresPerUnit).toBe(0.001)
		expect(mockBuild).not.toHaveBeenCalled()
	})

	it('scales a model in metres by one', async () => {
		mockStartSession.mockResolvedValue({ end: jest.fn() })
		const ar = await ready(AR_PATH.WEBXR)
		await ar.start({ object: MODEL, millimetresPerUnit: 1000, triangles: 12, xr: xr() })
		expect(mockStartSession.mock.calls[0][0].metresPerUnit).toBe(1)
	})

	it('holds the viewer\'s state aside for the whole session and gives the viewer back when it ends', async () => {
		let onEnd
		mockStartSession.mockImplementation(async (options) => { onEnd = options.onEnd; return { end: jest.fn() } })
		const events = []
		const options = xr()
		options.onEnd = () => events.push('viewer resumed')
		const ar = await ready(AR_PATH.WEBXR)
		await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12, xr: options, hold: () => { events.push('held'); return () => events.push('released') } })
		expect(events).toEqual(['held'])

		onEnd()

		expect(events).toEqual(['held', 'released', 'viewer resumed'])
		expect(ar.state.value).toBe('idle')
	})

	it('says the browser refused when the person says no or there is no camera', async () => {
		mockStartSession.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
		const released = jest.fn()
		const ar = await ready(AR_PATH.WEBXR)
		const notify = jest.fn()
		const result = await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12, xr: xr(), hold: () => released, notify })
		expect(result.status).toBe('refused')
		expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('may use the camera'))
		expect(released).toHaveBeenCalledTimes(1)
		expect(ar.state.value).toBe('idle')
	})

	it('says it failed for anything else', async () => {
		mockStartSession.mockRejectedValue(new Error('no gl'))
		const ar = await ready(AR_PATH.WEBXR)
		expect((await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12, xr: xr() })).status).toBe('failed')
	})

	it('allows more triangles than a file does, and refuses past its own limit', async () => {
		mockStartSession.mockResolvedValue({ end: jest.fn() })
		const ar = await ready(AR_PATH.WEBXR)
		expect((await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: AR_TRIANGLES[AR_PATH.QUICK_LOOK].refuse + 1, xr: xr() })).status).toBe('session')
		await ar.stop()
		const { refuse } = AR_TRIANGLES[AR_PATH.WEBXR]
		const ar2 = await ready(AR_PATH.WEBXR)
		expect((await ar2.start({ object: MODEL, millimetresPerUnit: 1, triangles: refuse + 1, xr: xr() })).status).toBe('too-large')
	})

	it('ends the session when the viewer goes', async () => {
		const end = jest.fn()
		mockStartSession.mockResolvedValue({ end })
		const ar = await ready(AR_PATH.WEBXR)
		await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12, xr: xr() })
		ar.dispose()
		expect(end).toHaveBeenCalled()
	})
})

describe('on a desktop', () => {
	it('has no way, so there is nothing to start', async () => {
		const ar = await ready(null)
		expect(ar.path.value).toBeNull()
		expect(await ar.start({ object: MODEL, millimetresPerUnit: 1, triangles: 12 })).toEqual({ status: 'unavailable' })
		expect(mockBuild).not.toHaveBeenCalled()
		expect(mockStartSession).not.toHaveBeenCalled()
	})
})
