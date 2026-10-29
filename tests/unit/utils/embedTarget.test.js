/**
 * The embed page's token, read from its own address, and what the server says about it.
 */
import axios from '@nextcloud/axios'
import { embedTokenFromPath, loadEmbedTarget } from '../../../src/utils/embedTarget.js'

jest.mock('@nextcloud/axios')
jest.mock('@nextcloud/router')

beforeEach(() => jest.clearAllMocks())

const TARGET = { fileId: 42, filename: 'part.stl', mime: 'model/stl', shareUrl: 'https://cloud.example/s/AbC', downloadUrl: null }

test('reads the token from the embed path, with or without index.php', () => {
	expect(embedTokenFromPath('/index.php/apps/threedviewer/embed/AbC123_-x')).toBe('AbC123_-x')
	expect(embedTokenFromPath('/apps/threedviewer/embed/AbC123_-x')).toBe('AbC123_-x')
	expect(embedTokenFromPath('/nextcloud/index.php/apps/threedviewer/embed/AbC123')).toBe('AbC123')
})

test('anything that is not one token is no token', () => {
	expect(embedTokenFromPath('/index.php/apps/threedviewer/embed/')).toBeNull()
	expect(embedTokenFromPath('/index.php/apps/threedviewer/embed/a b')).toBeNull()
	expect(embedTokenFromPath('/index.php/apps/threedviewer/embed/a%20b')).toBeNull()
	expect(embedTokenFromPath('/index.php/apps/threedviewer/embed/abc/def')).toBeNull()
	expect(embedTokenFromPath('/index.php/apps/threedviewer/embed/' + 'a'.repeat(65))).toBeNull()
	expect(embedTokenFromPath('/index.php/apps/threedviewer/embed/' + 'a'.repeat(64))).toBe('a'.repeat(64))
	expect(embedTokenFromPath('/index.php/s/abc')).toBeNull()
})

test('asks the public embed route, as an OCS request', async () => {
	axios.get.mockResolvedValue({ data: TARGET })

	expect(await loadEmbedTarget('AbC')).toEqual(TARGET)
	expect(axios.get).toHaveBeenCalledWith('/ocs/v2.php/apps/threedviewer/public/embed/AbC', { headers: { 'OCS-APIRequest': 'true' } })
})

test('a refusal is no target', async () => {
	axios.get.mockRejectedValue(Object.assign(new Error('Not Found'), { response: { status: 404 } }))

	expect(await loadEmbedTarget('AbC')).toBeNull()
})

test('an answer without the file is no target', async () => {
	axios.get.mockResolvedValue({ data: { filename: 'part.stl' } })
	expect(await loadEmbedTarget('AbC')).toBeNull()

	axios.get.mockResolvedValue({ data: { fileId: 42 } })
	expect(await loadEmbedTarget('AbC')).toBeNull()

	axios.get.mockResolvedValue({ data: '<html>' })
	expect(await loadEmbedTarget('AbC')).toBeNull()
})
