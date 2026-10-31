/**
 * @jest-environment node
 */
/**
 * A model's file is kept for Export, which a splat has none of: a splat's download, up to
 * a gigabyte, is let go once Spark has read it.
 */
import { useModelLoading } from '../../../src/composables/useModelLoading.js'
import { loadModelByExtension } from '../../../src/loaders/registry.js'

jest.mock('../../../src/loaders/registry.js', () => ({
	loadModelByExtension: jest.fn(),
	isSupportedExtension: () => true,
}))
jest.mock('../../../src/composables/usePublicShare.js', () => ({ buildFileUrl: (id) => `http://localhost/file/${id}` }))

const answer = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-length': '3' } })

beforeEach(() => {
	global.fetch = jest.fn(async () => answer())
})

test('a mesh keeps its file, for Export', async () => {
	loadModelByExtension.mockResolvedValue({ object3D: { userData: {}, children: [] } })

	const result = await useModelLoading().loadModelFromFileId(1, 'cube.stl', {})

	expect(result.sourceFiles).toHaveLength(1)
})

test('a splat keeps no copy of its file', async () => {
	loadModelByExtension.mockResolvedValue({ object3D: { userData: { tdvSplat: { count: 1 } }, children: [] } })

	const result = await useModelLoading().loadModelFromFileId(2, 'grid.spz', {})

	expect(result.sourceFiles).toBeUndefined()
})
