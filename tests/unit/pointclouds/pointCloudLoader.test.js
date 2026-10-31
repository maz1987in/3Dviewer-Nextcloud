/**
 * A scan through the loader registry: the cloud the viewer gets, and the messages a
 * person sees when the file isn't a scan or can't be read.
 */
import * as THREE from 'three'
import { loadModelByExtension } from '../../../src/loaders/registry.js'
import { parsePointCloud } from '../../../src/pointclouds/parsePointCloud.js'
import { NotAScanError, ScanError } from '../../../src/pointclouds/scanFormats.js'

jest.mock('../../../src/pointclouds/parsePointCloud.js', () => ({ parsePointCloud: jest.fn() }))

const sink = { positions: new Float32Array([0, 0, 0, 2, 2, 2]), count: 2, total: 2, origin: [0, 0, 0], bounds: { min: [0, 0, 0], max: [2, 2, 2] } }
const context = (extra = {}) => ({ THREE, fileExtension: 'xyz', ensurePlaceholderRemoved: () => {}, ...extra })

beforeEach(() => parsePointCloud.mockReset())

test('an XYZ becomes a Points the viewer recognises as a scan', async () => {
	parsePointCloud.mockResolvedValue({ sink, unit: null, format: 'xyz' })

	const result = await loadModelByExtension('xyz', new Blob(['0 0 0']), context())

	expect(result.object3D).toBeInstanceOf(THREE.Points)
	expect(result.object3D.userData.tdvPointCloud).toMatchObject({ format: 'xyz', count: 2, defaultUp: '+y' })
	const [blob, ext, options] = parsePointCloud.mock.calls[0]
	expect(blob).toBeInstanceOf(Blob)
	expect(ext).toBe('xyz')
	expect(options.budget).toBe(20_000_000)
	expect(options.inline).toBe(false)
})

test('an ArrayBuffer is read as a Blob, and the thumbnailer gets its small budget', async () => {
	parsePointCloud.mockResolvedValue({ sink, unit: null, format: 'xyz' })

	await loadModelByExtension('xyz', new ArrayBuffer(4), context({ thumbnail: true }))

	expect(parsePointCloud.mock.calls[0][0]).toBeInstanceOf(Blob)
	expect(parsePointCloud.mock.calls[0][2].budget).toBe(300_000)
})

test('Cancel loading reaches the worker', async () => {
	parsePointCloud.mockResolvedValue({ sink, unit: null, format: 'xyz' })
	const abortController = new AbortController()

	await loadModelByExtension('xyz', new Blob(['']), context({ abortController }))

	expect(parsePointCloud.mock.calls[0][2].signal).toBe(abortController.signal)
})

test('a chemistry file says it lists atoms', async () => {
	parsePointCloud.mockRejectedValue(new NotAScanError())

	await expect(loadModelByExtension('xyz', new Blob(['']), context())).rejects.toThrow('This .xyz file lists atoms, not a scan, so it can\'t be shown here.')
})

test('an unreadable scan says why', async () => {
	parsePointCloud.mockRejectedValue(new ScanError('the header is cut short'))

	await expect(loadModelByExtension('xyz', new Blob(['']), context())).rejects.toThrow('This scan couldn\'t be read: the header is cut short')
})

test('a cancelled read stays a cancellation', async () => {
	parsePointCloud.mockRejectedValue(new DOMException('Aborted', 'AbortError'))

	await expect(loadModelByExtension('xyz', new Blob(['']), context())).rejects.toMatchObject({ name: 'AbortError' })
})
