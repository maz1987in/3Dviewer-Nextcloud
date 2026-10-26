/**
 * Files served from the dependency cache are marked, so a thumbnail capture can refuse
 * them: the cache is keyed by file id and name, not version, and a thumbnail is kept for
 * good once stored.
 */
import { fetchFileFromUrl } from '../../../src/loaders/multiFileHelpers.js'
import { getCached } from '../../../src/utils/dependencyCache.js'

jest.mock('@nextcloud/router', () => ({
	generateUrl: (p) => `/index.php${p}`,
	imagePath: (app, p) => `/apps/${app}/img/${p}`,
	generateOcsUrl: (p) => `/ocs/v2.php/${p}`,
}))

jest.mock('../../../src/utils/dependencyCache.js', () => ({
	getCached: jest.fn(),
	setCached: jest.fn(),
	generateCacheKey: jest.fn((id, name) => `${id}:${name}`),
	isCacheAvailable: () => true,
}))

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

describe('fetchFileFromUrl', () => {
	it('marks a file that came from the cache', async () => {
		getCached.mockResolvedValue({ data: new ArrayBuffer(4), mimeType: 'model/mtl', expired: false })
		global.fetch = jest.fn()

		const file = await fetchFileFromUrl('/file/7', 'chair.mtl', 'model/mtl', { fileId: 7 })

		expect(file._fromCache).toBe(true)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it('leaves a file fetched from the network unmarked', async () => {
		getCached.mockResolvedValue(null)
		global.fetch = jest.fn(async () => ({
			ok: true,
			headers: { get: () => 'model/mtl' },
			arrayBuffer: async () => new ArrayBuffer(4),
		}))

		const file = await fetchFileFromUrl('/file/7', 'chair.mtl', 'model/mtl', { fileId: 7 })

		expect(file._fromCache).toBeUndefined()
	})
})
