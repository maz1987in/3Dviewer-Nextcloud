/**
 * What the "3D" tab shows for a model and how it gets there: stored numbers when this
 * version has them, otherwise a measurement made in the browser and stored for the next
 * person, within limits, and an honest answer when it cannot.
 */
import { autoMeasure, loadTabState } from '../../../src/stats/loadTabState.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const STATS = { v: 1, kind: 'mesh', size: [1, 2, 3] }
const FILE = { fileId: 7, name: 'part.stl', dir: '/models' }

function info(overrides = {}) {
	return {
		fileId: 7,
		name: 'part.stl',
		size: 2048,
		etag: 'etag-1',
		canEdit: true,
		stats: null,
		settings: { unit: null, up: null },
		notes: { count: 0, firstId: null },
		...overrides,
	}
}

function setup({ model = info(), measured = { status: 'measured', stats: STATS, complete: true }, upload = 'stored' } = {}) {
	return {
		fetchModelInfo: jest.fn(async () => model),
		uploadModelStats: jest.fn(async () => upload),
		measure: jest.fn(async () => measured),
	}
}

describe('autoMeasure', () => {
	it.each(['a.stl', 'a.GLB', 'scan.las', 'plan.ifc', 'a.gcode', 'splat.spz'])('measures %s on its own', (name) => {
		expect(autoMeasure(name)).toBe(true)
	})

	it.each(['data.nc', 'thing.g', 'noextension', '', null, undefined])('leaves %p to be asked for', (name) => {
		expect(autoMeasure(name)).toBe(false)
	})
})

describe('loadTabState', () => {
	it('shows the stored numbers without measuring or storing anything', async () => {
		const deps = setup({ model: info({ stats: STATS }) })

		const state = await loadTabState(FILE, deps)

		expect(state).toMatchObject({ phase: 'ready', stats: STATS, source: 'stored' })
		expect(deps.measure).not.toHaveBeenCalled()
		expect(deps.uploadModelStats).not.toHaveBeenCalled()
	})

	it('measures a version that has no numbers, and stores them under the version it was told of', async () => {
		const deps = setup()

		const state = await loadTabState(FILE, deps)

		expect(state).toMatchObject({ phase: 'ready', stats: STATS, source: 'measured' })
		expect(deps.measure).toHaveBeenCalledWith({ fileId: 7, name: 'part.stl', dir: '/models', size: 2048 }, undefined)
		expect(deps.uploadModelStats).toHaveBeenCalledWith(7, 'etag-1', STATS)
	})

	it('measures for someone who can only read the file, shows it, and stores nothing', async () => {
		const deps = setup({ model: info({ canEdit: false }) })

		const state = await loadTabState(FILE, deps)

		expect(state).toMatchObject({ phase: 'ready', stats: STATS, source: 'measured' })
		expect(deps.measure).toHaveBeenCalledTimes(1)
		expect(deps.uploadModelStats).not.toHaveBeenCalled()
	})

	it('still shows the stored numbers to someone who can only read the file', async () => {
		const deps = setup({ model: info({ canEdit: false, stats: STATS }) })

		expect(await loadTabState(FILE, deps)).toMatchObject({ phase: 'ready', stats: STATS, source: 'stored' })
		expect(deps.measure).not.toHaveBeenCalled()
	})

	it('says when it starts to measure', async () => {
		const onMeasuring = jest.fn()
		const deps = setup()

		await loadTabState(FILE, deps, { onMeasuring })

		expect(onMeasuring).toHaveBeenCalledTimes(1)
		onMeasuring.mockClear()
		await loadTabState(FILE, setup({ model: info({ stats: STATS }) }), { onMeasuring })
		expect(onMeasuring).not.toHaveBeenCalled()
	})

	it('shows numbers that are not stored by someone else\'s tab as they are', async () => {
		const deps = setup({ upload: 'exists' })

		expect(await loadTabState(FILE, deps)).toMatchObject({ phase: 'ready', source: 'measured' })
	})

	it('shows numbers measured from a model that went without a file it declares, and stores nothing', async () => {
		const deps = setup({ measured: { status: 'measured', stats: STATS, complete: false } })

		const state = await loadTabState(FILE, deps)

		expect(state).toMatchObject({ phase: 'ready', stats: STATS, incomplete: true })
		expect(deps.uploadModelStats).not.toHaveBeenCalled()
	})

	it('measures again once when the file changed while it was measured, and never shows the old version\'s numbers', async () => {
		const deps = setup()
		const older = { ...STATS, size: [9, 9, 9] }
		deps.fetchModelInfo.mockResolvedValueOnce(info({ etag: 'etag-1' })).mockResolvedValueOnce(info({ etag: 'etag-2' }))
		deps.measure.mockResolvedValueOnce({ status: 'measured', stats: older, complete: true }).mockResolvedValueOnce({ status: 'measured', stats: STATS, complete: true })
		deps.uploadModelStats.mockResolvedValueOnce('stale').mockResolvedValueOnce('stored')

		const state = await loadTabState(FILE, deps)

		expect(state).toMatchObject({ phase: 'ready', stats: STATS })
		expect(deps.uploadModelStats).toHaveBeenNthCalledWith(1, 7, 'etag-1', older)
		expect(deps.uploadModelStats).toHaveBeenNthCalledWith(2, 7, 'etag-2', STATS)
	})

	it('gives up when the file keeps changing', async () => {
		const deps = setup({ upload: 'stale' })

		expect(await loadTabState(FILE, deps)).toMatchObject({ phase: 'failed', stats: null })
		expect(deps.measure).toHaveBeenCalledTimes(2)
	})

	it('shows what the server found of the notes and the settings with the numbers', async () => {
		const model = info({ stats: STATS, settings: { unit: 'in', up: null }, notes: { count: 2, firstId: 5 } })

		expect((await loadTabState(FILE, setup({ model }))).info).toBe(model)
	})

	it.each(['too-large', 'failed'])('says %s when the measurement ends that way', async (status) => {
		const deps = setup({ measured: { status } })

		const state = await loadTabState(FILE, deps)

		expect(state).toMatchObject({ phase: status, stats: null })
		expect(deps.uploadModelStats).not.toHaveBeenCalled()
	})

	it('says it failed for a model that loaded and has nothing to measure', async () => {
		const deps = setup({ measured: { status: 'measured', stats: null, complete: true } })

		expect(await loadTabState(FILE, deps)).toMatchObject({ phase: 'failed' })
	})

	it('says the file is unavailable when the server will not tell', async () => {
		const deps = setup()
		deps.fetchModelInfo.mockRejectedValue(new Error('404'))

		const state = await loadTabState(FILE, deps)

		expect(state).toMatchObject({ phase: 'unavailable', info: null, stats: null })
		expect(deps.measure).not.toHaveBeenCalled()
	})

	it('waits to be asked before it measures a file type other programs use', async () => {
		const deps = setup()

		const state = await loadTabState({ ...FILE, name: 'cut.nc' }, deps)

		expect(state).toMatchObject({ phase: 'idle', stats: null })
		expect(deps.measure).not.toHaveBeenCalled()
	})

	it('measures such a file when asked', async () => {
		const deps = setup()

		const state = await loadTabState({ ...FILE, name: 'cut.nc' }, deps, { force: true })

		expect(state).toMatchObject({ phase: 'ready', source: 'measured' })
	})

	it('still shows the numbers stored for such a file, without asking', async () => {
		const deps = setup({ model: info({ stats: STATS }) })

		expect(await loadTabState({ ...FILE, name: 'cut.nc' }, deps)).toMatchObject({ phase: 'ready', source: 'stored' })
	})

	it('reports being left, from either wait, and stores nothing', async () => {
		const controller = new AbortController()
		const deps = setup()
		deps.measure.mockImplementation(async () => {
			controller.abort()
			return { status: 'aborted' }
		})

		expect(await loadTabState(FILE, deps, { signal: controller.signal })).toMatchObject({ phase: 'aborted' })
		expect(deps.uploadModelStats).not.toHaveBeenCalled()

		const left = new AbortController()
		const quick = setup()
		quick.fetchModelInfo.mockImplementation(async () => {
			left.abort()
			return info()
		})
		expect(await loadTabState(FILE, quick, { signal: left.signal })).toMatchObject({ phase: 'aborted' })
		expect(quick.measure).not.toHaveBeenCalled()
	})
})
