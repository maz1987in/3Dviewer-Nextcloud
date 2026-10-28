/**
 * Loading an earlier version of the open file as the comparison model: the version's
 * bytes, today's supporting files, and nothing left behind when the load fails or is
 * cancelled.
 */
import * as THREE from 'three'
import { useComparison } from '../../../src/composables/useComparison.js'
import { loadModelByExtension } from '../../../src/loaders/registry.js'
import { fetchVersion } from '../../../src/utils/fileVersions.js'
import { loadModelWithDependencies } from '../../../src/loaders/multiFileHelpers.js'

jest.mock('@nextcloud/dialogs', () => ({ getFilePickerBuilder: jest.fn() }), { virtual: true })
jest.mock('../../../src/loaders/registry.js', () => ({ loadModelByExtension: jest.fn() }))
jest.mock('../../../src/utils/fileVersions.js', () => ({ fetchVersion: jest.fn() }))
jest.mock('../../../src/loaders/multiFileHelpers.js', () => ({
	getFileIdByPath: jest.fn(),
	loadModelWithDependencies: jest.fn(),
}))

const VERSION = { id: '1793160498', url: '/remote.php/dav/versions/alice/versions/154/1793160498', mtime: 1793160498000, size: 21, label: null, author: 'alice' }
const VERSION_BYTES = new Uint8Array([1, 2, 3]).buffer

function loadedModel() {
	return { object3D: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()), animations: [] }
}

function context() {
	return { THREE, scene: new THREE.Scene(), hasDraco: false, hasKtx2: false, hasMeshopt: false }
}

beforeEach(() => {
	jest.clearAllMocks()
	global.fetch = jest.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([9, 9]).buffer), headers: { get: () => null } }))
})

test("loads the version's bytes, not the current file's", async () => {
	fetchVersion.mockResolvedValue(VERSION_BYTES)
	loadModelByExtension.mockResolvedValue(loadedModel())
	const comparison = useComparison()

	await comparison.loadComparisonModelFromVersion(VERSION, { fileId: 154, filename: 'a.stl', dirPath: '/models' }, context())

	expect(fetchVersion).toHaveBeenCalledWith(VERSION, expect.objectContaining({ signal: expect.any(AbortSignal) }))
	expect(loadModelByExtension).toHaveBeenCalledWith('stl', VERSION_BYTES, expect.any(Object))
	expect(global.fetch).not.toHaveBeenCalled()
	expect(comparison.comparisonModel.value).not.toBeNull()
})

test('takes supporting files from the current folder for multi-file formats', async () => {
	const texture = new File([new Uint8Array([7])], 'wood.jpg')
	fetchVersion.mockResolvedValue(VERSION_BYTES)
	loadModelWithDependencies.mockResolvedValue({ mainFile: new File([new Uint8Array([9])], 'a.obj'), dependencies: [texture], missingFiles: [] })
	loadModelByExtension.mockResolvedValue(loadedModel())
	const comparison = useComparison()

	await comparison.loadComparisonModelFromVersion(VERSION, { fileId: 154, filename: 'a.obj', dirPath: '/models' }, context())

	expect(loadModelWithDependencies).toHaveBeenCalledWith(154, 'a.obj', 'obj', '/models')
	const [extension, bytes, loadContext] = loadModelByExtension.mock.calls[0]
	expect(extension).toBe('obj')
	expect(bytes).toBe(VERSION_BYTES)
	expect(loadContext.additionalFiles).toEqual([texture])
})

test('a single-file format does not look for supporting files', async () => {
	fetchVersion.mockResolvedValue(VERSION_BYTES)
	loadModelByExtension.mockResolvedValue(loadedModel())
	const comparison = useComparison()

	await comparison.loadComparisonModelFromVersion(VERSION, { fileId: 154, filename: 'a.stl', dirPath: '/models' }, context())

	expect(loadModelWithDependencies).not.toHaveBeenCalled()
})

test('failure leaves no comparison model', async () => {
	fetchVersion.mockResolvedValue(VERSION_BYTES)
	loadModelByExtension.mockRejectedValue(new Error('corrupt STL'))
	const comparison = useComparison()

	await expect(comparison.loadComparisonModelFromVersion(VERSION, { fileId: 154, filename: 'a.stl', dirPath: '/models' }, context())).rejects.toThrow('corrupt STL')

	expect(comparison.comparisonModel.value).toBeNull()
	expect(comparison.comparisonError.value).toBeTruthy()
	expect(comparison.isComparisonLoading.value).toBe(false)
})

test('abort stops the download and nothing is attached afterwards', async () => {
	let resolveFetch
	let seenSignal
	fetchVersion.mockImplementation((version, { signal }) => {
		seenSignal = signal
		return new Promise((resolve) => { resolveFetch = resolve })
	})
	loadModelByExtension.mockResolvedValue(loadedModel())
	const comparison = useComparison()

	const loading = comparison.loadComparisonModelFromVersion(VERSION, { fileId: 154, filename: 'a.stl', dirPath: '/models' }, context())
	await Promise.resolve()
	comparison.clearComparison()
	resolveFetch(VERSION_BYTES)
	await loading.catch(() => {})

	expect(seenSignal.aborted).toBe(true)
	expect(loadModelByExtension).not.toHaveBeenCalled()
	expect(comparison.comparisonModel.value).toBeNull()
})

test('a load that finishes after a cancel is thrown away', async () => {
	let resolveLoad
	fetchVersion.mockResolvedValue(VERSION_BYTES)
	loadModelByExtension.mockImplementation(() => new Promise((resolve) => { resolveLoad = resolve }))
	const comparison = useComparison()

	const loading = comparison.loadComparisonModelFromVersion(VERSION, { fileId: 154, filename: 'a.stl', dirPath: '/models' }, context())
	await new Promise((resolve) => setTimeout(resolve, 0))
	comparison.clearComparison()
	resolveLoad(loadedModel())
	await loading.catch(() => {})

	expect(comparison.comparisonModel.value).toBeNull()
})

test('source and version are recorded, and cleared with the comparison', async () => {
	fetchVersion.mockResolvedValue(VERSION_BYTES)
	loadModelByExtension.mockResolvedValue(loadedModel())
	const comparison = useComparison()

	await comparison.loadComparisonModelFromVersion(VERSION, { fileId: 154, filename: 'a.stl', dirPath: '/models' }, context())
	expect(comparison.comparisonSource.value).toBe('version')
	expect(comparison.comparisonVersion.value).toEqual(VERSION)
	expect(comparison.comparisonFilename.value).toBe('a.stl')

	comparison.clearComparison()
	expect(comparison.comparisonSource.value).toBeNull()
	expect(comparison.comparisonVersion.value).toBeNull()
})

test('the diff table can label its columns, as a version comparison does', async () => {
	fetchVersion.mockResolvedValue(VERSION_BYTES)
	loadModelByExtension.mockResolvedValue(loadedModel())
	const comparison = useComparison()
	await comparison.loadComparisonModelFromVersion(VERSION, { fileId: 154, filename: 'a.stl', dirPath: '/models' }, context())
	const open = loadedModel().object3D

	comparison.computeDiffStats(open, 'a.stl', 1, { original: 'This version', comparison: '28 Oct 2026, 04:08' })
	expect(comparison.diffStats.value.originalLabel).toBe('This version')
	expect(comparison.diffStats.value.comparisonLabel).toBe('28 Oct 2026, 04:08')

	comparison.computeDiffStats(open, 'models/a.stl', 1)
	expect(comparison.diffStats.value.originalLabel).toBe('a.stl')
})

test('a download stopped by axios reads as cancelled, not as a failure', async () => {
	fetchVersion.mockImplementation((version, { signal }) => new Promise((resolve, reject) => {
		signal.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' })))
	}))
	const comparison = useComparison()

	const loading = comparison.loadComparisonModelFromVersion(VERSION, { fileId: 154, filename: 'a.stl', dirPath: '/models' }, context())
	await Promise.resolve()
	comparison.clearComparison()

	await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
	expect(comparison.comparisonError.value).toBeNull()
})
