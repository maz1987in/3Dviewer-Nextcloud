import axios from '@nextcloud/axios'
import { loadThumbnailSettings } from '../../../src/thumbnails/thumbnailSettings.js'
import { THUMBNAIL_SETTINGS } from '../../../src/config/viewer-config.js'

jest.mock('@nextcloud/axios')
jest.mock('@nextcloud/router')

const DEFAULTS = { enabled: true, background: true, maxFileSizeMB: 50, timeoutSeconds: 30, folderBudgetMB: 500 }

beforeEach(() => jest.clearAllMocks())

describe('loadThumbnailSettings', () => {
	test('defaults are background on, 50 MB, 30 s, 500 MB', () => {
		expect(THUMBNAIL_SETTINGS).toMatchObject(DEFAULTS)
	})

	test('merges saved values over defaults', async () => {
		axios.get.mockResolvedValue({ data: { settings: { thumbnails: { background: false, maxFileSizeMB: 200, timeoutSeconds: 60, folderBudgetMB: 1000 }, camera: { fov: 1 } } } })

		const result = await loadThumbnailSettings()

		expect(axios.get).toHaveBeenCalledWith('/index.php/apps/threedviewer/settings')
		expect(result).toEqual({ enabled: true, background: false, maxFileSizeMB: 200, timeoutSeconds: 60, folderBudgetMB: 1000 })
	})

	test('keeps defaults for fields that were not saved', async () => {
		axios.get.mockResolvedValue({ data: { settings: { thumbnails: { enabled: false } } } })

		expect(await loadThumbnailSettings()).toEqual({ ...DEFAULTS, enabled: false })
	})

	test('falls back to defaults on request failure', async () => {
		axios.get.mockRejectedValue(new Error('offline'))

		expect(await loadThumbnailSettings()).toEqual(DEFAULTS)
	})

	test('falls back to defaults when no settings were ever saved', async () => {
		axios.get.mockResolvedValue({ data: { settings: [] } })

		expect(await loadThumbnailSettings()).toEqual(DEFAULTS)
	})

	test('rejects out-of-range numbers', async () => {
		axios.get.mockResolvedValue({ data: { settings: { thumbnails: { maxFileSizeMB: 0, timeoutSeconds: 301, folderBudgetMB: 49 } } } })
		expect(await loadThumbnailSettings()).toEqual(DEFAULTS)

		axios.get.mockResolvedValue({ data: { settings: { thumbnails: { maxFileSizeMB: 2049, timeoutSeconds: 4, folderBudgetMB: 10001 } } } })
		expect(await loadThumbnailSettings()).toEqual(DEFAULTS)

		axios.get.mockResolvedValue({ data: { settings: { thumbnails: { maxFileSizeMB: 'big', timeoutSeconds: null, folderBudgetMB: NaN } } } })
		expect(await loadThumbnailSettings()).toEqual(DEFAULTS)
	})

	test('accepts the range limits themselves', async () => {
		axios.get.mockResolvedValue({ data: { settings: { thumbnails: { maxFileSizeMB: 2048, timeoutSeconds: 5, folderBudgetMB: 10000 } } } })
		expect(await loadThumbnailSettings()).toMatchObject({ maxFileSizeMB: 2048, timeoutSeconds: 5, folderBudgetMB: 10000 })

		axios.get.mockResolvedValue({ data: { settings: { thumbnails: { maxFileSizeMB: 1, timeoutSeconds: 300, folderBudgetMB: 50 } } } })
		expect(await loadThumbnailSettings()).toMatchObject({ maxFileSizeMB: 1, timeoutSeconds: 300, folderBudgetMB: 50 })
	})
})
