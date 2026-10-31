import axios from '@nextcloud/axios'
import { createFileSettingsApi } from '../../../src/utils/fileSettingsApi.js'

jest.mock('@nextcloud/axios')
jest.mock('@nextcloud/router')

beforeEach(() => jest.clearAllMocks())

test('signed in: reads and saves on the file-settings route', async () => {
	axios.get.mockResolvedValue({ data: { canEdit: true, unit: 'in' } })
	axios.put.mockResolvedValue({ data: { canEdit: true, unit: 'cm' } })
	const api = createFileSettingsApi({ fileId: 7 })

	expect(api.readOnly).toBe(false)
	expect(await api.get()).toEqual({ canEdit: true, unit: 'in', up: null })
	expect(await api.setUnit('cm')).toEqual({ canEdit: true, unit: 'cm', up: null })

	expect(axios.get).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/file-settings/7')
	expect(axios.put).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/file-settings/7', { unit: 'cm' })
})

test('clearing the unit sends null', async () => {
	axios.put.mockResolvedValue({ data: { canEdit: true, unit: null } })

	expect(await createFileSettingsApi({ fileId: 7 }).setUnit(null)).toEqual({ canEdit: true, unit: null, up: null })
	expect(axios.put).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/file-settings/7', { unit: null })
})

test('public link: reads the public route, never edits, and refuses to save', async () => {
	axios.get.mockResolvedValue({ data: { canEdit: true, unit: 'ft' } })
	const api = createFileSettingsApi({ fileId: 7, shareToken: 'tok' })

	expect(api.readOnly).toBe(true)
	expect(await api.get()).toEqual({ canEdit: false, unit: 'ft', up: null })
	expect(axios.get).toHaveBeenCalledWith('/ocs/v2.php/apps/threedviewer/public/file-settings/tok/7', { headers: { 'OCS-APIRequest': 'true' } })
	await expect(api.setUnit('in')).rejects.toThrow('read-only')
	expect(axios.put).not.toHaveBeenCalled()
})

test('a unit the viewer does not know reads as none', async () => {
	axios.get.mockResolvedValue({ data: { canEdit: 'yes', unit: 'furlong' } })
	expect(await createFileSettingsApi({ fileId: 7 }).get()).toEqual({ canEdit: false, unit: null, up: null })

	axios.get.mockResolvedValue({ data: { unit: 'constructor' } })
	expect(await createFileSettingsApi({ fileId: 7 }).get()).toEqual({ canEdit: false, unit: null, up: null })
})

test('which way is up is read, saved, and dropped when unknown', async () => {
	axios.get.mockResolvedValue({ data: { canEdit: true, unit: null, up: '+z' } })
	axios.put.mockResolvedValue({ data: { canEdit: true, unit: 'ft', up: '-y' } })
	const api = createFileSettingsApi({ fileId: 7 })

	expect(await api.get()).toEqual({ canEdit: true, unit: null, up: '+z' })
	expect(await api.setUp('-y')).toEqual({ canEdit: true, unit: 'ft', up: '-y' })
	expect(axios.put).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/file-settings/7', { up: '-y' })

	axios.get.mockResolvedValue({ data: { canEdit: true, up: 'sideways' } })
	expect((await api.get()).up).toBeNull()
})

test('which way is up is read-only on a public link', async () => {
	axios.get.mockResolvedValue({ data: { canEdit: false, unit: null, up: '-z' } })
	const api = createFileSettingsApi({ fileId: 7, shareToken: 'tok' })

	expect((await api.get()).up).toBe('-z')
	await expect(api.setUp('+y')).rejects.toThrow('read-only')
	expect(axios.put).not.toHaveBeenCalled()
})
