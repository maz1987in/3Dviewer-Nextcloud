/**
 * The public links of a file, read from Nextcloud's sharing API: the shares this user
 * manages, of which only link shares (type 3) can carry a view to someone without an
 * account.
 */
import axios from '@nextcloud/axios'
import { listLinkShares, pickableShares, modelPath } from '../../../src/utils/linkShares.js'

jest.mock('@nextcloud/axios')

/** A share as the OCS API formats it. */
const share = (over) => ({
	id: '11', share_type: 3, token: 'tok11', url: 'https://cloud.test/s/tok11', label: '', stime: 1761600000,
	expiration: null, password: null, hide_download: 0, permissions: 1, ...over,
})

describe('listLinkShares', () => {
	afterEach(() => jest.resetAllMocks())

	it('asks for the shares of that path this user made, and keeps the link shares', async () => {
		axios.get.mockResolvedValue({ data: { ocs: { data: [
			share({ id: '11', label: 'Client' }),
			share({ id: '12', share_type: 0, token: undefined, url: undefined }),
			share({ id: '13', token: 'tok13', url: 'https://cloud.test/s/tok13', password: '$2y$hash', expiration: '2026-12-01 00:00:00', hide_download: 1 }),
		] } } })
		const shares = await listLinkShares('/models/part.stl')
		const [url, options] = axios.get.mock.calls[0]
		expect(url).toBe('/ocs/v2.php/apps/files_sharing/api/v1/shares')
		expect(options.params).toEqual({ path: '/models/part.stl', reshares: false, subfiles: false, format: 'json' })
		expect(options.headers['OCS-APIRequest']).toBe('true')
		expect(shares).toEqual([
			{ id: '11', token: 'tok11', url: 'https://cloud.test/s/tok11', label: 'Client', created: 1761600000, hasPassword: false, expires: null, canDownload: true },
			{ id: '13', token: 'tok13', url: 'https://cloud.test/s/tok13', label: '', created: 1761600000, hasPassword: true, expires: Date.parse('2026-12-01T00:00:00'), canDownload: false },
		])
	})

	it('is empty when the file has no shares, or the API fails', async () => {
		axios.get.mockRejectedValueOnce(Object.assign(new Error('Not found'), { response: { status: 404 } }))
		expect(await listLinkShares('/a.stl')).toEqual([])
		axios.get.mockRejectedValueOnce(new Error('Network Error'))
		expect(await listLinkShares('/a.stl')).toEqual([])
		axios.get.mockResolvedValueOnce({ data: {} })
		expect(await listLinkShares('/a.stl')).toEqual([])
	})
})

describe('pickableShares', () => {
	it('drops expired shares and puts the newest first', () => {
		const now = Date.parse('2026-11-01T00:00:00')
		const shares = [
			{ id: 'old', created: 100, expires: null },
			{ id: 'gone', created: 300, expires: Date.parse('2026-10-31T00:00:00') },
			{ id: 'new', created: 200, expires: Date.parse('2026-11-02T00:00:00') },
		]
		expect(pickableShares(shares, now).map((s) => s.id)).toEqual(['new', 'old'])
	})
})

describe('modelPath', () => {
	it.each([
		['models', 'part.stl', '/models/part.stl'],
		['/models/sub/', 'part.stl', '/models/sub/part.stl'],
		[null, 'part.stl', '/part.stl'],
		[null, 'models/part.stl', '/models/part.stl'],
		[null, null, null],
	])('dir %p and filename %p is %p', (dir, filename, expected) => {
		expect(modelPath(dir, filename)).toBe(expected)
	})
})
