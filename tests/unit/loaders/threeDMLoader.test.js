/**
 * The 3DM loader settles, whatever its worker does (#204).
 *
 * Rhino3dmLoader hears from its worker only by message. When the rhino3dm runtime failed
 * to start — blocked by the CSP, or with no wasm to load — the worker never sent one,
 * parse() never called back, and the viewer spun with no error. The loader now gives the
 * decode a deadline, reports the worker's own error text when it does send one, and
 * terminates its worker on every outcome.
 */

import ThreeDMLoader from '../../../src/loaders/types/threeDM.js'

const mockParse = jest.fn()
const mockDispose = jest.fn()

jest.mock('three/examples/jsm/loaders/3DMLoader.js', () => ({
	Rhino3dmLoader: jest.fn().mockImplementation(() => ({
		setLibraryPath: jest.fn(),
		parse: mockParse,
		dispose: mockDispose,
	})),
}))

jest.mock('@nextcloud/router', () => ({
	generateFilePath: (app, type, file) => `/custom_apps/${app}/${type}/${file}`,
	// viewer-config pulls this in for its format icons; irrelevant here.
	imagePath: (app, p) => `/custom_apps/${app}/img/${p}`,
}))

beforeEach(() => {
	mockParse.mockReset()
	mockDispose.mockReset()
	jest.useRealTimers()
})

test('a worker that never answers becomes an error, and its worker is terminated', async () => {
	jest.useFakeTimers()
	mockParse.mockImplementation(() => {})

	const loading = new ThreeDMLoader().loadModel(new ArrayBuffer(8), {})
	const settled = expect(loading).rejects.toThrow(/rhino3dm runtime did not respond/)
	jest.advanceTimersByTime(120000)
	await settled

	expect(mockDispose).toHaveBeenCalledTimes(1)
})

test('a worker error is reported by its message, not as [object Object]', async () => {
	mockParse.mockImplementation((buffer, onLoad, onError) => {
		onError({ type: 'error', id: 1, error: { message: 'Invalid 3DM archive', stack: '' } })
	})

	await expect(new ThreeDMLoader().loadModel(new ArrayBuffer(8), {}))
		.rejects.toThrow('3DM decoding failed: Invalid 3DM archive')
	expect(mockDispose).toHaveBeenCalledTimes(1)
})

test('a successful decode also terminates its worker', async () => {
	mockParse.mockImplementation((buffer, onLoad) => onLoad({ children: [] }))

	// An empty object is still rejected, but only after parse() has settled.
	await expect(new ThreeDMLoader().loadModel(new ArrayBuffer(8), {}))
		.rejects.toThrow('No valid geometry found in 3DM file')
	expect(mockDispose).toHaveBeenCalledTimes(1)
})
