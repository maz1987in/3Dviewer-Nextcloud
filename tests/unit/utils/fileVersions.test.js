import fs from 'fs'
import path from 'path'
import axios from '@nextcloud/axios'
import { versionsUrl, parseVersions, listVersions, fetchVersion, formatVersionDate } from '../../../src/utils/fileVersions.js'

jest.mock('@nextcloud/axios')
jest.mock('@nextcloud/router')

const FIXTURES = path.resolve(__dirname, '../../fixtures/versions')
const readFixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8')

// a.stl was uploaded three times; the third upload, at 04:08:23, is the current version
const CURRENT_MTIME = Date.UTC(2026, 9, 28, 4, 8, 23)

beforeEach(() => jest.clearAllMocks())

describe('versionsUrl', () => {
	test('names the user and the file id under the versions root', () => {
		expect(versionsUrl('alice', 154)).toBe('/remote.php/dav/versions/alice/versions/154')
	})

	test('encodes a user id that needs it', () => {
		expect(versionsUrl('a b@c', '7')).toBe('/remote.php/dav/versions/a%20b%40c/versions/7')
	})
})

describe('parseVersions', () => {
	test('lists earlier versions newest first, without the collection or the current version', () => {
		const versions = parseVersions(readFixture('owner-two-versions.xml'), { currentMtime: CURRENT_MTIME })

		expect(versions.map(v => v.id)).toEqual(['1793160500', '1793160498'])
		expect(versions[0].mtime).toBeGreaterThan(versions[1].mtime)
		expect(versions.every(v => v.url.includes('/versions/alice/versions/'))).toBe(true)
		expect(versions.map(v => v.size)).toEqual([28, 21])
		expect(versions[0].author).toBe('alice')
	})

	test('without the current mtime, the newest entry is taken as the current version', () => {
		const versions = parseVersions(readFixture('owner-two-versions.xml'))
		expect(versions.map(v => v.id)).toEqual(['1793160500', '1793160498'])
	})

	test('a file never edited has none', () => {
		expect(parseVersions(readFixture('only-current.xml'))).toEqual([])
	})

	test('a share recipient lists through their own collection', () => {
		const versions = parseVersions(readFixture('recipient.xml'), { currentMtime: CURRENT_MTIME })
		expect(versions).toHaveLength(2)
		expect(versions.every(v => v.url.includes('/versions/bob/versions/'))).toBe(true)
	})

	test('a missing label reads as null', () => {
		const versions = parseVersions(readFixture('owner-two-versions.xml'), { currentMtime: CURRENT_MTIME })
		expect(versions.every(v => v.label === null)).toBe(true)
	})

	test('a label, when the version has one, is read', () => {
		const xml = readFixture('owner-two-versions.xml').replace(
			'<nc:version-author>alice</nc:version-author></d:prop>',
			'<nc:version-author>alice</nc:version-author><nc:version-label>Before the fillet</nc:version-label></d:prop>',
		)
		const versions = parseVersions(xml, { currentMtime: CURRENT_MTIME })
		expect(versions.map(v => v.label)).toContain('Before the fillet')
	})
})

describe('listVersions', () => {
	test('sends PROPFIND with Depth 1 to the versions collection', async () => {
		axios.request.mockResolvedValue({ data: readFixture('owner-two-versions.xml') })

		const versions = await listVersions({ userId: 'alice', fileId: 154, currentMtime: CURRENT_MTIME })

		expect(versions).toHaveLength(2)
		const config = axios.request.mock.calls[0][0]
		expect(config.method).toBe('PROPFIND')
		expect(config.url).toBe('/remote.php/dav/versions/alice/versions/154')
		expect(config.headers.Depth).toBe('1')
	})

	test.each([404, 405])('resolves [] when the server answers %i', async (status) => {
		axios.request.mockRejectedValue(Object.assign(new Error('no'), { response: { status } }))
		await expect(listVersions({ userId: 'alice', fileId: 154 })).resolves.toEqual([])
	})

	test('rejects on 403', async () => {
		axios.request.mockRejectedValue(Object.assign(new Error('forbidden'), { response: { status: 403 } }))
		await expect(listVersions({ userId: 'bob', fileId: 154 })).rejects.toThrow('forbidden')
	})
})

test('fetchVersion resolves the body as an ArrayBuffer', async () => {
	const bytes = new Uint8Array([1, 2, 3]).buffer
	axios.get.mockResolvedValue({ data: bytes })
	const signal = new AbortController().signal

	const result = await fetchVersion({ url: '/remote.php/dav/versions/alice/versions/154/1793160498' }, { signal })

	expect(result).toBe(bytes)
	expect(axios.get).toHaveBeenCalledWith('/remote.php/dav/versions/alice/versions/154/1793160498', { responseType: 'arraybuffer', signal })
})

test('formatVersionDate gives the date and time in the user\'s locale', () => {
	const ms = Date.UTC(2026, 9, 28, 4, 8, 23)
	expect(formatVersionDate(ms)).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms)))
	expect(formatVersionDate(ms)).toMatch(/2026/)
})
