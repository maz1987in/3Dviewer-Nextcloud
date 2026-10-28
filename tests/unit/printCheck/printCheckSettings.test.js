/**
 * The printer and settings Print check remembers: per user in the viewer's preferences,
 * or in the browser on a public link, always cleaned before use.
 */
import axios from '@nextcloud/axios'
import { readFileSync } from 'fs'
import { join } from 'path'
import { sanitizePrintCheckSettings, loadPrintCheckSettings, savePrintCheckSettings, flushPrintCheckSettings } from '../../../src/printCheck/printCheckSettings.js'
import { PRINT_CHECK_DEFAULTS } from '../../../src/printCheck/printers.js'
import { VIEWER_CONFIG } from '../../../src/config/viewer-config.js'
import { isPublicShare } from '../../../src/composables/usePublicShare.js'

jest.mock('@nextcloud/axios')
jest.mock('@nextcloud/router')
jest.mock('../../../src/composables/usePublicShare.js', () => ({ isPublicShare: jest.fn(() => false) }))

beforeEach(() => {
	jest.clearAllMocks()
	isPublicShare.mockReturnValue(false)
	delete VIEWER_CONFIG.printCheck
	window.localStorage.clear()
})

describe('sanitizePrintCheckSettings', () => {
	test('nothing gives the defaults', () => {
		expect(sanitizePrintCheckSettings(undefined)).toEqual({ ...PRINT_CHECK_DEFAULTS, custom: { ...PRINT_CHECK_DEFAULTS.custom } })
	})

	test('sanitize clamps and falls back', () => {
		const clean = sanitizePrintCheckSettings({
			printerId: 'no-such-printer',
			custom: { width: 5, depth: 5000, height: 'tall' },
			overhangAngle: 95,
			infill: -3,
			material: 'unobtainium',
			minThickness: 0,
		})
		expect(clean).toEqual({
			printerId: PRINT_CHECK_DEFAULTS.printerId,
			custom: { width: 10, depth: 2000, height: PRINT_CHECK_DEFAULTS.custom.height },
			overhangAngle: 80,
			infill: 0,
			material: 'pla',
			minThickness: 0.1,
		})
	})

	test('keeps a valid choice, custom included', () => {
		const choice = { printerId: 'custom', custom: { width: 300, depth: 300, height: 400 }, overhangAngle: 55, infill: 15, material: 'petg', minThickness: 1.2 }
		expect(sanitizePrintCheckSettings(choice)).toEqual(choice)
	})
})

describe('loading', () => {
	test('logged in: from the viewer preferences', () => {
		VIEWER_CONFIG.printCheck = { printerId: 'bambu-a1', infill: 30 }
		const settings = loadPrintCheckSettings()
		expect(settings.printerId).toBe('bambu-a1')
		expect(settings.infill).toBe(30)
		expect(settings.overhangAngle).toBe(PRINT_CHECK_DEFAULTS.overhangAngle)
	})

	test('public share: from this browser', () => {
		isPublicShare.mockReturnValue(true)
		window.localStorage.setItem('threedviewer.printCheck', JSON.stringify({ material: 'abs' }))
		expect(loadPrintCheckSettings().material).toBe('abs')
	})
})

describe('saving', () => {
	test('logged-in save keeps the other preferences', async () => {
		axios.get.mockResolvedValue({ data: { settings: { grid: { visible: false } } } })
		axios.put.mockResolvedValue({})
		const choice = sanitizePrintCheckSettings({ printerId: 'prusa-mini' })

		await savePrintCheckSettings(choice, { delayMs: 0 })

		expect(axios.put).toHaveBeenCalledTimes(1)
		const body = axios.put.mock.calls[0][1]
		expect(body.settings.grid).toEqual({ visible: false })
		expect(body.settings.printCheck.printerId).toBe('prusa-mini')
		expect(VIEWER_CONFIG.printCheck.printerId).toBe('prusa-mini')
	})

	test('several changes in a row are saved once, with the last', async () => {
		jest.useFakeTimers()
		axios.get.mockResolvedValue({ data: { settings: {} } })
		axios.put.mockResolvedValue({})
		const first = savePrintCheckSettings(sanitizePrintCheckSettings({ infill: 10 }))
		const second = savePrintCheckSettings(sanitizePrintCheckSettings({ infill: 25 }))
		jest.advanceTimersByTime(500)
		jest.useRealTimers()
		await Promise.all([first, second])
		expect(axios.put).toHaveBeenCalledTimes(1)
		expect(axios.put.mock.calls[0][1].settings.printCheck.infill).toBe(25)
	})

	test('a failed save is logged, not thrown', async () => {
		axios.get.mockRejectedValue(new Error('offline'))
		await expect(savePrintCheckSettings(sanitizePrintCheckSettings({}), { delayMs: 0 })).resolves.toBeUndefined()
	})

	test('public share uses localStorage and survives it throwing', async () => {
		isPublicShare.mockReturnValue(true)
		await savePrintCheckSettings(sanitizePrintCheckSettings({ material: 'tpu' }), { delayMs: 0 })
		expect(JSON.parse(window.localStorage.getItem('threedviewer.printCheck')).material).toBe('tpu')
		expect(axios.put).not.toHaveBeenCalled()

		const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
		const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
		await expect(savePrintCheckSettings(sanitizePrintCheckSettings({}), { delayMs: 0 })).resolves.toBeUndefined()
		expect(loadPrintCheckSettings()).toEqual(sanitizePrintCheckSettings({}))
		setItem.mockRestore()
		getItem.mockRestore()
	})

	test('flushPrintCheckSettings saves a pending change at once', async () => {
		axios.get.mockResolvedValue({ data: { settings: {} } })
		axios.put.mockResolvedValue({})
		const pending = savePrintCheckSettings(sanitizePrintCheckSettings({ infill: 40 }), { delayMs: 60000 })
		await flushPrintCheckSettings()
		await pending
		expect(axios.put).toHaveBeenCalledTimes(1)
	})
})

test('PersonalSettings save keeps printCheck: it PUTs the whole blob it loaded', () => {
	const source = readFileSync(join(__dirname, '..', '..', '..', 'src', 'views', 'PersonalSettings.vue'), 'utf8')
	// What it loads is every saved preference, the viewer's printCheck among them
	expect(source).toMatch(/let settings = response\.data\.settings \|\| \{\}[\s\S]*?this\.userSettings = settings/)
	// and what it saves is that same object, changed only where the page changed it
	expect(source).toMatch(/axios\.put\(generateUrl\('\/apps\/threedviewer\/settings'\), \{\s*settings: this\.userSettings,\s*\}\)/)
	expect(source).toMatch(/updateValue\(section, key, value\) \{[\s\S]*?JSON\.parse\(JSON\.stringify\(this\.userSettings\)\)/)
})
