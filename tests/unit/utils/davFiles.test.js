/**
 * Saving a file into the user's Nextcloud folder through WebDAV, and asking first whether
 * they may: a folder shared read-only has no `C` in its permissions.
 */
import axios from '@nextcloud/axios'
import { userFilesUrl, canCreateIn, listNames, putFile } from '../../../src/utils/davFiles.js'

jest.mock('@nextcloud/axios')
jest.mock('@nextcloud/router')

const propfind = (entries) => `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">${entries.map(({ href, name, permissions }) => `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${name !== undefined ? `<d:displayname>${name}</d:displayname>` : ''}${permissions !== undefined ? `<oc:permissions>${permissions}</oc:permissions>` : ''}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join('')}</d:multistatus>`

beforeEach(() => jest.clearAllMocks())

test('userFilesUrl encodes each segment of the path', () => {
	expect(userFilesUrl('alice', '/My models/a#1')).toBe('/remote.php/dav/files/alice/My%20models/a%231')
	expect(userFilesUrl('a b', '/')).toBe('/remote.php/dav/files/a%20b/')
})

test('permissions with C mean create', async () => {
	axios.request.mockResolvedValue({ data: propfind([{ href: '/remote.php/dav/files/alice/models/', permissions: 'RGDNVCK' }]) })
	await expect(canCreateIn('alice', '/models')).resolves.toBe(true)
	const config = axios.request.mock.calls[0][0]
	expect(config.method).toBe('PROPFIND')
	expect(config.headers.Depth).toBe('0')
	expect(config.url).toBe('/remote.php/dav/files/alice/models')
})

test('no C in permissions means no create', async () => {
	axios.request.mockResolvedValue({ data: propfind([{ href: '/remote.php/dav/files/alice/shared/', permissions: 'SRG' }]) })
	await expect(canCreateIn('alice', '/shared')).resolves.toBe(false)
})

test('an error means no create', async () => {
	axios.request.mockRejectedValue(Object.assign(new Error('nope'), { response: { status: 404 } }))
	await expect(canCreateIn('alice', '/gone')).resolves.toBe(false)
})

test('listNames reads the display names', async () => {
	axios.request.mockResolvedValue({ data: propfind([
		{ href: '/remote.php/dav/files/alice/models/', name: 'models' },
		{ href: '/remote.php/dav/files/alice/models/cube.stl', name: 'cube.stl' },
		{ href: '/remote.php/dav/files/alice/models/cube-turntable.webm', name: 'cube-turntable.webm' },
	]) })
	await expect(listNames('alice', '/models')).resolves.toEqual(['cube.stl', 'cube-turntable.webm'])
	expect(axios.request.mock.calls[0][0].headers.Depth).toBe('1')
})

test('listNames falls back to the href when there is no display name', async () => {
	axios.request.mockResolvedValue({ data: propfind([
		{ href: '/remote.php/dav/files/alice/models/' },
		{ href: '/remote.php/dav/files/alice/models/a%20b.stl' },
	]) })
	await expect(listNames('alice', '/models')).resolves.toEqual(['a b.stl'])
})

test('putFile encodes the path and sends the type', async () => {
	axios.put.mockResolvedValue({ status: 201 })
	const blob = new Blob(['x'], { type: 'video/webm' })
	await putFile('alice', '/models', 'cube-turntable (2).webm', blob)
	expect(axios.put).toHaveBeenCalledWith('/remote.php/dav/files/alice/models/cube-turntable%20(2).webm', blob, { headers: { 'Content-Type': 'video/webm', 'If-None-Match': '*' } })
})

test('putFile never replaces a file: one made since the folder was listed makes it fail with 412', async () => {
	axios.put.mockRejectedValue(Object.assign(new Error('Precondition Failed'), { response: { status: 412 } }))
	await expect(putFile('alice', '/models', 'a.webm', new Blob(['x']))).rejects.toMatchObject({ response: { status: 412 } })
})

test('putFile rejects on 507', async () => {
	axios.put.mockRejectedValue(Object.assign(new Error('Insufficient Storage'), { response: { status: 507 } }))
	await expect(putFile('alice', '/models', 'a.webm', new Blob(['x']))).rejects.toThrow('Insufficient Storage')
})
