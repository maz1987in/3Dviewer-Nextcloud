/**
 * Saving a file into the user's Nextcloud folder through WebDAV, and asking first whether
 * they may: a folder shared read-only has no `C` in its permissions.
 */
import axios from '@nextcloud/axios'
import { userFilesUrl, canCreateIn, canShare, freeName, listNames, putFile, saveNewFile } from '../../../src/utils/davFiles.js'

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

test('R in a file\'s permissions means it can be shared', async () => {
	axios.request.mockResolvedValue({ data: propfind([{ href: '/remote.php/dav/files/alice/models/part.stl', permissions: 'RGDNVW' }]) })

	await expect(canShare('alice', '/models/part.stl')).resolves.toBe(true)
	expect(axios.request.mock.calls[0][0].url).toBe('/remote.php/dav/files/alice/models/part.stl')
	expect(axios.request.mock.calls[0][0].headers.Depth).toBe('0')
})

test('no R means it cannot be shared', async () => {
	axios.request.mockResolvedValue({ data: propfind([{ href: '/remote.php/dav/files/alice/shared/part.stl', permissions: 'GD' }]) })
	await expect(canShare('alice', '/shared/part.stl')).resolves.toBe(false)
})

test('an error means it cannot be shared', async () => {
	axios.request.mockRejectedValue(new Error('nope'))
	await expect(canShare('alice', '/gone.stl')).resolves.toBe(false)
})

test('freeName is the name itself, then a numbered copy, as Nextcloud names one', () => {
	expect(freeName('bracket', 'stl', [])).toBe('bracket.stl')
	expect(freeName('bracket', 'stl', ['Bracket.STL'])).toBe('bracket (2).stl')
	expect(freeName('bracket', 'stl', ['bracket.stl', 'bracket (2).stl'])).toBe('bracket (3).stl')
	expect(freeName('', 'glb', [])).toBe('model.glb')
})

test('saveNewFile writes under a free name and says which', async () => {
	axios.request.mockResolvedValue({ data: propfind([
		{ href: '/remote.php/dav/files/alice/models/', name: 'models' },
		{ href: '/remote.php/dav/files/alice/models/bracket.stl', name: 'bracket.stl' },
	]) })
	axios.put.mockResolvedValue({})
	const blob = new Blob(['solid'], { type: 'model/stl' })
	await expect(saveNewFile('alice', '/models', (names) => freeName('bracket', 'stl', names), blob)).resolves.toBe('bracket (2).stl')
	expect(axios.put).toHaveBeenCalledTimes(1)
	expect(axios.put.mock.calls[0][0]).toBe('/remote.php/dav/files/alice/models/bracket%20(2).stl')
	expect(axios.put.mock.calls[0][2].headers['If-None-Match']).toBe('*')
})

test('saveNewFile lists again for a name taken between the listing and the write, and never replaces it', async () => {
	axios.request
		.mockResolvedValueOnce({ data: propfind([{ href: '/remote.php/dav/files/alice/m/a.glb', name: 'a.glb' }]) })
		.mockResolvedValueOnce({ data: propfind([{ href: '/remote.php/dav/files/alice/m/a.glb', name: 'a.glb' }, { href: '/remote.php/dav/files/alice/m/a%20(2).glb', name: 'a (2).glb' }]) })
	axios.put
		.mockRejectedValueOnce(Object.assign(new Error('Precondition Failed'), { response: { status: 412 } }))
		.mockResolvedValueOnce({})
	await expect(saveNewFile('alice', '/m', (names) => freeName('a', 'glb', names), new Blob(['x']))).resolves.toBe('a (3).glb')
	expect(axios.put.mock.calls.map((call) => decodeURIComponent(call[0].split('/').pop()))).toEqual(['a (2).glb', 'a (3).glb'])
})

test('saveNewFile gives up after its tries, and passes on any other refusal at once', async () => {
	axios.request.mockResolvedValue({ data: propfind([]) })
	axios.put.mockRejectedValue(Object.assign(new Error('Precondition Failed'), { response: { status: 412 } }))
	await expect(saveNewFile('alice', '/m', () => 'a.glb', new Blob(['x']), { attempts: 2 })).rejects.toMatchObject({ response: { status: 412 } })
	expect(axios.put).toHaveBeenCalledTimes(2)

	axios.put.mockReset()
	axios.put.mockRejectedValue(Object.assign(new Error('Insufficient Storage'), { response: { status: 507 } }))
	await expect(saveNewFile('alice', '/m', () => 'a.glb', new Blob(['x']))).rejects.toMatchObject({ response: { status: 507 } })
	expect(axios.put).toHaveBeenCalledTimes(1)
})
