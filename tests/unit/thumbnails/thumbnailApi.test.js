import axios from '@nextcloud/axios'
import { fetchStatus, uploadThumbnail } from '../../../src/thumbnails/thumbnailApi.js'

jest.mock('@nextcloud/axios')
jest.mock('@nextcloud/router')

const STATUS_URL = '/index.php/apps/threedviewer/api/thumbnails/status'

beforeEach(() => jest.clearAllMocks())

describe('fetchStatus', () => {
	test('splits 450 ids into 3 requests and merges the results', async () => {
		axios.get.mockImplementation(async (url, { params }) => {
			const files = {}
			for (const id of params.ids.split(',')) {
				files[id] = { name: `m${id}.glb`, dir: '/', size: 1, etag: `e${id}`, canEdit: true, hasThumbnail: false }
			}
			return { data: { files } }
		})
		const ids = Array.from({ length: 450 }, (_, i) => i + 1)

		const result = await fetchStatus(ids)

		expect(axios.get).toHaveBeenCalledTimes(3)
		expect(axios.get.mock.calls.map(([url, { params }]) => [url, params.ids.split(',').length]))
			.toEqual([[STATUS_URL, 200], [STATUS_URL, 200], [STATUS_URL, 50]])
		expect(result).toBeInstanceOf(Map)
		expect(result.size).toBe(450)
		expect(result.get(1).etag).toBe('e1')
		expect(result.get(450).name).toBe('m450.glb')
	})

	test('an empty files object and an empty array both give an empty map', async () => {
		axios.get.mockResolvedValueOnce({ data: { files: {} } })
		axios.get.mockResolvedValueOnce({ data: { files: [] } })

		expect((await fetchStatus([1])).size).toBe(0)
		expect((await fetchStatus([1])).size).toBe(0)
	})

	test('makes no request for no ids', async () => {
		expect((await fetchStatus([])).size).toBe(0)
		expect(axios.get).not.toHaveBeenCalled()
	})
})

describe('uploadThumbnail', () => {
	const blob = new Blob(['png'], { type: 'image/png' })

	test.each([
		[201, 'stored'],
		[409, 'exists'],
		[412, 'stale'],
		[403, 'forbidden'],
		[500, 'error'],
	])('maps %i to %s', async (status, expected) => {
		axios.post.mockResolvedValueOnce({ status })

		expect(await uploadThumbnail(7, 'abc', blob)).toBe(expected)
	})

	test.each([
		[409, 'exists'],
		[412, 'stale'],
		[403, 'forbidden'],
		[500, 'error'],
	])('maps a rejected %i to %s, as axios reports non-2xx statuses', async (status, expected) => {
		axios.post.mockRejectedValueOnce({ response: { status } })

		expect(await uploadThumbnail(7, 'abc', blob)).toBe(expected)
	})

	test('a network failure is an error, not a throw', async () => {
		axios.post.mockRejectedValueOnce(new Error('offline'))
		expect(await uploadThumbnail(7, 'abc', blob)).toBe('error')
	})

	test('sends the png with its etag as image/png', async () => {
		axios.post.mockResolvedValueOnce({ status: 201 })

		await uploadThumbnail(7, '"abc"', blob)

		expect(axios.post).toHaveBeenCalledWith(
			'/index.php/apps/threedviewer/api/thumbnail/7',
			blob,
			{ params: { etag: '"abc"' }, headers: { 'Content-Type': 'image/png' } },
		)
	})
})
