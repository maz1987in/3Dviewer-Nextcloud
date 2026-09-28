import axios from '@nextcloud/axios'
import { createNotesApi } from '../../../src/utils/notesApi.js'

jest.mock('@nextcloud/axios')
jest.mock('@nextcloud/router')

beforeEach(() => jest.clearAllMocks())

test('signed in: lists, creates, updates and deletes on the notes route', async () => {
	axios.get.mockResolvedValue({ data: { canEdit: true, notes: [{ id: 1 }], private: [] } })
	axios.post.mockResolvedValue({ data: { id: 2 } })
	axios.patch.mockResolvedValue({ data: { id: 2 } })
	axios.delete.mockResolvedValue({})
	const api = createNotesApi({ fileId: 7 })

	expect(await api.list()).toEqual({ canEdit: true, notes: [{ id: 1 }], private: [] })
	await api.create('annotation', { a: 1 })
	await api.update(2, { b: 1 })
	await api.remove(2)

	expect(axios.get).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/notes/7')
	expect(axios.post).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/notes/7', { type: 'annotation', payload: { a: 1 } })
	expect(axios.patch).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/notes/7/2', { payload: { b: 1 } })
	expect(axios.delete).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/notes/7/2')
})

test('public link: reads the public route and refuses every write', async () => {
	axios.get.mockResolvedValue({ data: { canEdit: false, notes: [{ id: 1 }] } })
	const api = createNotesApi({ fileId: 7, shareToken: 'tok' })

	expect(api.readOnly).toBe(true)
	expect(await api.list()).toEqual({ canEdit: false, notes: [{ id: 1 }], private: [] })
	expect(axios.get).toHaveBeenCalledWith('/ocs/v2.php/apps/threedviewer/public/notes/tok/7', { headers: { 'OCS-APIRequest': 'true' } })
	await expect(api.create('annotation', {})).rejects.toThrow('read-only')
	expect(axios.post).not.toHaveBeenCalled()
})

test('a malformed list response still yields arrays', async () => {
	axios.get.mockResolvedValue({ data: {} })

	expect(await createNotesApi({ fileId: 7 }).list()).toEqual({ canEdit: false, notes: [], private: [] })
})
