import axios from '@nextcloud/axios'
import { fetchModelInfo, uploadModelStats } from '../../../src/stats/statsApi.js'

jest.mock('@nextcloud/axios')
jest.mock('@nextcloud/router')

const URL = '/index.php/apps/threedviewer/api/stats/7'
const STATS = { v: 1, kind: 'mesh', size: [1, 2, 3] }

beforeEach(() => jest.clearAllMocks())

describe('fetchModelInfo', () => {
	it('reads what the server knows of the model', async () => {
		axios.get.mockResolvedValue({
			data: {
				fileId: 7,
				name: 'a.stl',
				size: 2048,
				etag: 'e1',
				canEdit: true,
				stats: STATS,
				settings: { unit: 'in', up: '+z' },
				notes: { count: 3, open: 2, firstId: 11 },
			},
		})

		const info = await fetchModelInfo(7)

		expect(axios.get).toHaveBeenCalledWith(URL)
		expect(info).toEqual({
			fileId: 7,
			name: 'a.stl',
			size: 2048,
			etag: 'e1',
			canEdit: true,
			stats: STATS,
			settings: { unit: 'in', up: '+z' },
			notes: { count: 3, open: 2, firstId: 11 },
		})
	})

	it('copes with a model that has nothing yet', async () => {
		axios.get.mockResolvedValue({ data: { name: 'a.stl', size: 1, etag: 'e1', stats: null, settings: { unit: null, up: null }, notes: { count: 0, firstId: null } } })

		expect(await fetchModelInfo(7)).toMatchObject({ canEdit: false, stats: null, notes: { count: 0, open: 0, firstId: null } })
	})

	it('does not take what it did not expect for numbers', async () => {
		axios.get.mockResolvedValue({ data: { stats: 'x', size: 'big', notes: { count: 'many' } } })

		expect(await fetchModelInfo(7)).toMatchObject({ stats: null, size: 0, notes: { count: 0, open: 0, firstId: null }, settings: { unit: null, up: null } })
	})

	it('rejects when the server will not say', async () => {
		axios.get.mockRejectedValue({ response: { status: 404 } })

		await expect(fetchModelInfo(7)).rejects.toBeDefined()
	})
})

describe('uploadModelStats', () => {
	it('posts the numbers with the version they were measured from', async () => {
		axios.post.mockResolvedValue({ status: 201 })

		expect(await uploadModelStats(7, '"abc"', STATS)).toBe('stored')
		expect(axios.post).toHaveBeenCalledWith(URL, { etag: '"abc"', stats: STATS })
	})

	it.each([
		[201, 'stored'],
		[409, 'exists'],
		[412, 'stale'],
		[400, 'invalid'],
		[413, 'invalid'],
		[500, 'error'],
		[404, 'error'],
		[429, 'error'],
	])('maps %i to %s', async (status, expected) => {
		axios.post.mockResolvedValueOnce({ status })

		expect(await uploadModelStats(7, 'abc', STATS)).toBe(expected)
	})

	it.each([409, 412, 400, 413, 500])('maps a rejected %i the same way, as axios reports non-2xx statuses', async (status) => {
		axios.post.mockResolvedValueOnce({ status })
		const expected = await uploadModelStats(7, 'abc', STATS)
		axios.post.mockRejectedValueOnce({ response: { status } })

		expect(await uploadModelStats(7, 'abc', STATS)).toBe(expected)
	})

	it('is an error, not a throw, when the network fails', async () => {
		axios.post.mockRejectedValueOnce(new Error('offline'))

		expect(await uploadModelStats(7, 'abc', STATS)).toBe('error')
	})
})
