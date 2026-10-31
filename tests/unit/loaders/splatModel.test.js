/**
 * @jest-environment node
 */
/**
 * What every splat loader shares: the size it refuses, the budget it asks for, and what
 * the person is told when a file can't be shown.
 */
import { loadSplatModel } from '../../../src/loaders/types/splatModel.js'
import { SPLAT_BUDGET } from '../../../src/splats/limits.js'
import { loadSplat } from '../../../src/splats/loadSplat.js'
import { EmptySplatError, SplatError } from '../../../src/splats/splatErrors.js'

jest.mock('../../../src/splats/loadSplat.js', () => ({ loadSplat: jest.fn() }))

const root = { userData: { tdvSplat: { count: 1 } } }
const loader = { processModel: jest.fn((object3D) => ({ object3D })) }
const context = (extra = {}) => ({ fileExtension: 'spz', ...extra })

beforeEach(() => {
	loadSplat.mockReset()
	loader.processModel.mockClear()
})

test('a splat over 1 GB is refused before it is read', async () => {
	const big = new Blob([new Uint8Array(4)])
	Object.defineProperty(big, 'size', { value: 1.1 * 1024 ** 3 })

	await expect(loadSplatModel(loader, big, context())).rejects.toThrow('This splat is 1.1 GB. The viewer opens splats up to 1 GB.')
	expect(loadSplat).not.toHaveBeenCalled()
})

test('the bytes go to the splat reader with this device\'s budget, and the root to processModel', async () => {
	loadSplat.mockResolvedValue(root)
	const controller = new AbortController()

	const result = await loadSplatModel(loader, new Blob([new Uint8Array([1, 2, 3])]), context({ abortController: controller }))

	const [bytes, options] = loadSplat.mock.calls[0]
	expect(Array.from(bytes)).toEqual([1, 2, 3])
	expect(options.format).toBe('spz')
	expect(options.signal).toBe(controller.signal)
	expect(options.budget).toBeGreaterThan(0)
	expect(result.object3D).toBe(root)
})

test('the thumbnailer asks for its own budget, and may pass an ArrayBuffer', async () => {
	loadSplat.mockResolvedValue(root)

	await loadSplatModel(loader, new Uint8Array([1]).buffer, context({ thumbnail: true, fileExtension: 'SPLAT' }))

	expect(loadSplat.mock.calls[0][1]).toMatchObject({ format: 'splat', budget: SPLAT_BUDGET.thumbnail })
})

test('what the person is told', async () => {
	const empty = new EmptySplatError()
	loadSplat.mockRejectedValueOnce(empty)
	const unreadable = new SplatError(new Error('bad header'))
	loadSplat.mockRejectedValueOnce(unreadable)

	const first = await loadSplatModel(loader, new Blob([]), context()).catch((e) => e)
	const second = await loadSplatModel(loader, new Blob([]), context()).catch((e) => e)

	expect(first.message).toBe('This file holds no splats.')
	expect(first.cause).toBe(empty)
	expect(second.message).toBe('This splat couldn\'t be read.')
	expect(second.cause).toBe(unreadable)
})

test('a cancelled load passes through as it is', async () => {
	const abort = new DOMException('Aborted', 'AbortError')
	loadSplat.mockRejectedValue(abort)

	await expect(loadSplatModel(loader, new Blob([]), context())).rejects.toBe(abort)
})
