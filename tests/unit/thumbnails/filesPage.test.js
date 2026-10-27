import { getCurrentUser } from '@nextcloud/auth'
import { createBackgroundQueue } from '../../../src/thumbnails/backgroundQueue.js'
import { loadModelForBackground } from '../../../src/thumbnails/backgroundLoad.js'
import { loadModelWithDependencies } from '../../../src/loaders/multiFileHelpers.js'
import { probeWorkerRendering, renderInWorker } from '../../../src/thumbnails/workerRenderer.js'
import { loadThumbnailSettings } from '../../../src/thumbnails/thumbnailSettings.js'
import {
	folderKey,
	isEligibleFilesView,
	readRows,
	startFilesThumbnails,
	swapRowIcon,
} from '../../../src/thumbnails/filesPage.js'

jest.mock('@nextcloud/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('../../../src/thumbnails/backgroundQueue.js', () => ({ createBackgroundQueue: jest.fn() }))
jest.mock('../../../src/thumbnails/thumbnailSettings.js', () => ({ loadThumbnailSettings: jest.fn() }))
jest.mock('../../../src/thumbnails/thumbnailApi.js', () => ({ fetchStatus: jest.fn(), uploadThumbnail: jest.fn() }))
jest.mock('../../../src/thumbnails/workerRenderer.js', () => ({ renderInWorker: jest.fn(), probeWorkerRendering: jest.fn() }))
jest.mock('../../../src/thumbnails/backgroundLoad.js', () => ({ loadModelForBackground: jest.fn() }))
jest.mock('../../../src/loaders/multiFileHelpers.js', () => ({ loadModelWithDependencies: jest.fn() }))

const SETTINGS = { enabled: true, background: true, maxFileSizeMB: 50, timeoutSeconds: 30, folderBudgetMB: 500 }

const url = (path) => new URL(path, 'https://cloud.example.com')

/**
 * Build a files list the way the Files app renders it.
 *
 * @param {Array<{id: number, name?: string, top?: number}>} rows - One entry per row
 * @return {HTMLElement} The list's table
 */
function filesList(rows) {
	const table = document.createElement('table')
	for (const { id, name = `model-${id}.stl`, top = 0 } of rows) {
		const tr = document.createElement('tr')
		tr.setAttribute('data-cy-files-list-row', '')
		tr.setAttribute('data-cy-files-list-row-fileid', String(id))
		tr.setAttribute('data-cy-files-list-row-name', name)
		tr.innerHTML = '<td><span class="files-list__row-icon">'
			+ '<span class="files-list__row-icon-preview-container"><svg class="file-icon"></svg></span>'
			+ '<span class="files-list__row-icon-favorite"></span>'
			+ '</span></td>'
		tr.getBoundingClientRect = () => ({ top, bottom: top + 50, left: 0, right: 400, width: 400, height: 50 })
		table.appendChild(tr)
	}
	document.body.appendChild(table)
	return table
}

/**
 * @param {string} path - Path and query to show
 */
function navigate(path) {
	window.history.pushState({}, '', path)
}

beforeEach(() => {
	jest.clearAllMocks()
	document.body.innerHTML = ''
	delete window.__threedviewerFilesThumbnails
	navigate('/index.php/apps/files/files?dir=/models')
	getCurrentUser.mockReturnValue({ uid: 'alice' })
	loadThumbnailSettings.mockResolvedValue({ ...SETTINGS })
	createBackgroundQueue.mockImplementation(() => ({ setFolder: jest.fn(), stop: jest.fn(), idle: jest.fn() }))
	global.URL.createObjectURL = jest.fn(() => 'blob:thumb')
	global.URL.revokeObjectURL = jest.fn()
})

afterEach(async () => {
	// Earlier tests' observers stay connected; let them see an empty page now, while the
	// document still exists, rather than after the environment is torn down
	document.body.innerHTML = ''
	await Promise.resolve()
	jest.clearAllTimers()
	jest.useRealTimers()
})

describe('isEligibleFilesView', () => {
	test('eligible: /apps/files/files?dir=/models', () => {
		expect(isEligibleFilesView(url('/index.php/apps/files/files?dir=/models'))).toBe(true)
		expect(isEligibleFilesView(url('/apps/files/files/42?dir=/models'))).toBe(true)
		expect(isEligibleFilesView(url('/apps/files/'))).toBe(true)
		expect(isEligibleFilesView(url('/apps/files'))).toBe(true)
	})

	test('eligible: /apps/files/favorites?dir=/a', () => {
		expect(isEligibleFilesView(url('/index.php/apps/files/favorites?dir=/a'))).toBe(true)
	})

	test('not eligible: the flat top-level lists of favorites, shares and tags', () => {
		for (const view of ['favorites', 'sharingin', 'sharingout', 'sharinglinks', 'shareoverview', 'tags']) {
			expect(isEligibleFilesView(url(`/index.php/apps/files/${view}`))).toBe(false)
			expect(isEligibleFilesView(url(`/index.php/apps/files/${view}?dir=/`))).toBe(false)
			expect(isEligibleFilesView(url(`/index.php/apps/files/${view}?dir=`))).toBe(false)
			expect(isEligibleFilesView(url(`/index.php/apps/files/${view}/42?dir=/`))).toBe(false)
		}
		// A tag is a flat list of everything carrying it, however the path goes on
		expect(isEligibleFilesView(url('/index.php/apps/files/tags?dir=/5'))).toBe(false)
		expect(isEligibleFilesView(url('/index.php/apps/files/tags?dir=/5/'))).toBe(false)
		expect(isEligibleFilesView(url('/index.php/apps/files/tags?dir=/5/models'))).toBe(false)
	})

	test('eligible: a folder opened inside favorites, shares or tags', () => {
		expect(isEligibleFilesView(url('/index.php/apps/files/favorites?dir=/Projects/models'))).toBe(true)
		expect(isEligibleFilesView(url('/index.php/apps/files/sharingin?dir=/Shared/parts'))).toBe(true)
		expect(isEligibleFilesView(url('/index.php/apps/files/sharingout/17?dir=/Exports'))).toBe(true)
		expect(isEligibleFilesView(url('/index.php/apps/files/sharinglinks?dir=/public'))).toBe(true)
		expect(isEligibleFilesView(url('/index.php/apps/files/tags?dir=/Projects/models'))).toBe(true)
	})

	test('the files view stays eligible at its root', () => {
		expect(isEligibleFilesView(url('/index.php/apps/files/files?dir=/'))).toBe(true)
		expect(isEligibleFilesView(url('/index.php/apps/files/files'))).toBe(true)
	})

	test('not eligible: recent, trashbin, search, or ?query=x', () => {
		expect(isEligibleFilesView(url('/index.php/apps/files/recent'))).toBe(false)
		expect(isEligibleFilesView(url('/index.php/apps/files/trashbin?dir=/'))).toBe(false)
		expect(isEligibleFilesView(url('/index.php/apps/files/search'))).toBe(false)
		expect(isEligibleFilesView(url('/index.php/apps/files/files?dir=/&query=x'))).toBe(false)
		expect(isEligibleFilesView(url('/index.php/apps/files_sharing/foo'))).toBe(false)
		expect(isEligibleFilesView(url('/index.php/apps/threedviewer/'))).toBe(false)
	})
})

describe('folderKey', () => {
	test('folderKey differs per dir', () => {
		const a = folderKey(url('/apps/files/files?dir=/a'))
		const b = folderKey(url('/apps/files/files?dir=/b'))
		expect(a).toBe('files:/a')
		expect(b).toBe('files:/b')
		expect(folderKey(url('/apps/files/favorites?dir=/a'))).toBe('favorites:/a')
		expect(folderKey(url('/apps/files/files/42'))).toBe('files:42')
		// Opening a file changes the route's file id, not the folder
		expect(folderKey(url('/apps/files/files/99?dir=/a&openfile=true'))).toBe(a)
	})
})

describe('readRows', () => {
	test('readRows reads ids and visibility', () => {
		window.innerHeight = 600
		window.innerWidth = 1000
		filesList([
			{ id: 1, top: 0 },
			{ id: 2, top: 550 },
			{ id: 3, top: 900 },
			{ id: 4, top: -200 },
		])

		const { ids, visible } = readRows(document)

		expect(ids).toEqual([1, 2, 3, 4])
		expect(visible).toBeInstanceOf(Set)
		expect([...visible]).toEqual([1, 2])
	})

	test('leaves out rows that are not models the worker can render', () => {
		filesList([
			{ id: 1, name: 'notes.txt' },
			{ id: 2, name: 'Photos' },
			{ id: 3, name: 'part.STL' },
			{ id: 4, name: 'scene.dae' },
			{ id: 5, name: 'mesh.glb' },
			{ id: 6, name: 'climate.nc' },
		])

		// .nc may be NetCDF as well as G-code, so it is left to the viewer
		expect(readRows(document).ids).toEqual([3, 4, 5])
	})

	test('ignores rows without a usable id', () => {
		const table = filesList([{ id: 7 }])
		table.rows[0].setAttribute('data-cy-files-list-row-fileid', 'abc')
		filesList([{ id: 8 }, { id: 8 }])

		expect(readRows(document).ids).toEqual([8])
	})
})

describe('swapRowIcon', () => {
	test('swapRowIcon replaces the icon and returns false for a missing row', () => {
		filesList([{ id: 5 }])
		const blob = new Blob(['png'], { type: 'image/png' })

		expect(swapRowIcon(document, 5, blob)).toBe(true)

		const icon = document.querySelector('[data-cy-files-list-row-fileid="5"] .files-list__row-icon')
		const img = icon.querySelector('img.threedviewer-thumbnail')
		expect(img).not.toBeNull()
		expect(img.getAttribute('alt')).toBe('')
		expect(img.getAttribute('src')).toBe('blob:thumb')
		expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
		// The Files app's own icon no longer shows; its favourite badge does
		expect(icon.querySelector('.files-list__row-icon-preview-container').style.display).toBe('none')
		expect(icon.querySelector('.files-list__row-icon-favorite').style.display).toBe('')

		expect(swapRowIcon(document, 6, blob)).toBe(false)
		document.querySelector('.files-list__row-icon').remove()
		expect(swapRowIcon(document, 5, blob)).toBe(false)
	})

	test('a second swap replaces the first thumbnail', () => {
		filesList([{ id: 5 }])
		swapRowIcon(document, 5, new Blob(['a']))
		swapRowIcon(document, 5, new Blob(['b']))

		expect(document.querySelectorAll('img.threedviewer-thumbnail')).toHaveLength(1)
	})
})

/** Let promise chains, such as a dynamic import, run to their end. */
async function settle() {
	for (let i = 0; i < 20; i++) {
		await Promise.resolve()
	}
}

describe('startFilesThumbnails', () => {
	test('does nothing without a user or with background off', async () => {
		filesList([{ id: 1 }])
		getCurrentUser.mockReturnValue(null)
		await startFilesThumbnails()
		expect(loadThumbnailSettings).not.toHaveBeenCalled()
		expect(createBackgroundQueue).not.toHaveBeenCalled()

		delete window.__threedviewerFilesThumbnails
		getCurrentUser.mockReturnValue({ uid: 'alice' })
		loadThumbnailSettings.mockResolvedValue({ ...SETTINGS, enabled: true, background: false })
		await startFilesThumbnails()
		expect(createBackgroundQueue).not.toHaveBeenCalled()
	})

	test('with background off, gives up for the rest of the page', async () => {
		jest.useFakeTimers()
		filesList([{ id: 1 }])
		loadThumbnailSettings.mockResolvedValue({ ...SETTINGS, background: false })
		await startFilesThumbnails()

		filesList([{ id: 2 }])
		await settle()
		jest.advanceTimersByTime(3000)
		await settle()

		expect(loadThumbnailSettings).toHaveBeenCalledTimes(1)
		expect(createBackgroundQueue).not.toHaveBeenCalled()
	})

	test('loads nothing until an eligible view shows a model row', async () => {
		jest.useFakeTimers()
		filesList([{ id: 1, name: 'notes.txt' }, { id: 2, name: 'Photos' }])
		await startFilesThumbnails()
		expect(getCurrentUser).not.toHaveBeenCalled()
		expect(loadThumbnailSettings).not.toHaveBeenCalled()

		navigate('/index.php/apps/files/recent')
		filesList([{ id: 3, name: 'part.stl' }])
		await settle()
		jest.advanceTimersByTime(500)
		await settle()
		expect(loadThumbnailSettings).not.toHaveBeenCalled()

		navigate('/index.php/apps/files/files?dir=/models')
		window.dispatchEvent(new PopStateEvent('popstate'))
		jest.advanceTimersByTime(500)
		await settle()

		expect(loadThumbnailSettings).toHaveBeenCalledTimes(1)
		const queue = createBackgroundQueue.mock.results[0].value
		expect(queue.setFolder).toHaveBeenCalledWith('files:/models', [3], expect.any(Set))
	})

	test('the gate statically imports nothing heavy', () => {
		const source = require('node:fs').readFileSync(require.resolve('../../../src/thumbnails/filesPage.js'), 'utf8')
		const staticImports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])

		expect(staticImports.sort()).toEqual(['../utils/logger.js', './formats.js'])
	})

	test('wires the background loader and the capability probe, not the viewer\'s loader', async () => {
		filesList([{ id: 1 }])
		await startFilesThumbnails()
		await settle()

		const deps = createBackgroundQueue.mock.calls[0][0]
		expect(deps.load).toBe(loadModelForBackground)
		expect(deps.load).not.toBe(loadModelWithDependencies)
		expect(deps.render).toBe(renderInWorker)
		expect(deps.probe).toBe(probeWorkerRendering)
	})

	test('runs with background on even when viewer capture is off', async () => {
		filesList([{ id: 1 }])
		loadThumbnailSettings.mockResolvedValue({ ...SETTINGS, enabled: false, background: true })
		await startFilesThumbnails()
		expect(createBackgroundQueue).toHaveBeenCalledTimes(1)
	})

	test('starts once per page', async () => {
		filesList([{ id: 1 }])
		await startFilesThumbnails()
		await startFilesThumbnails()
		expect(createBackgroundQueue).toHaveBeenCalledTimes(1)
	})

	test('gives the current folder to the queue, visible rows first', async () => {
		window.innerHeight = 600
		filesList([{ id: 1, top: 900 }, { id: 2, top: 10 }])

		await startFilesThumbnails()

		const queue = createBackgroundQueue.mock.results[0].value
		expect(queue.setFolder).toHaveBeenCalledWith('files:/models', [1, 2], new Set([2]))
		const deps = createBackgroundQueue.mock.calls[0][0]
		expect(deps.settings).toEqual(SETTINGS)
		expect(typeof deps.load).toBe('function')
		expect(typeof deps.render).toBe('function')
		expect(typeof deps.skips.isSkipped).toBe('function')
	})

	test('moving to a non-eligible view stops the queue', async () => {
		jest.useFakeTimers()
		filesList([{ id: 1 }])
		await startFilesThumbnails()
		const queue = createBackgroundQueue.mock.results[0].value
		expect(queue.setFolder).toHaveBeenCalledTimes(1)

		navigate('/index.php/apps/files/recent')
		window.dispatchEvent(new PopStateEvent('popstate'))
		jest.advanceTimersByTime(500)

		expect(queue.stop).toHaveBeenCalledTimes(1)
		expect(queue.setFolder).toHaveBeenCalledTimes(1)

		navigate('/index.php/apps/files/files?dir=/other')
		window.dispatchEvent(new PopStateEvent('popstate'))
		jest.advanceTimersByTime(500)

		expect(queue.setFolder).toHaveBeenLastCalledWith('files:/other', [1], expect.any(Set))
	})

	test('a folder without models still ends the previous folder visit', async () => {
		jest.useFakeTimers()
		const table = filesList([{ id: 1 }])
		await startFilesThumbnails()
		const queue = createBackgroundQueue.mock.results[0].value

		table.remove()
		filesList([{ id: 5, name: 'notes.txt' }])
		navigate('/index.php/apps/files/files?dir=/docs')
		await settle()
		jest.advanceTimersByTime(500)

		expect(queue.setFolder).toHaveBeenLastCalledWith('files:/docs', [], expect.any(Set))
	})

	test('re-reads rows after the list changes, debounced', async () => {
		jest.useFakeTimers()
		filesList([{ id: 2 }])
		await startFilesThumbnails()
		const queue = createBackgroundQueue.mock.results[0].value
		expect(queue.setFolder).toHaveBeenLastCalledWith('files:/models', [2], expect.any(Set))

		filesList([{ id: 3 }])
		await Promise.resolve() // MutationObserver callbacks run as microtasks
		filesList([{ id: 4 }])
		await Promise.resolve()
		jest.advanceTimersByTime(499)
		expect(queue.setFolder).toHaveBeenCalledTimes(1)

		jest.advanceTimersByTime(1)
		expect(queue.setFolder).toHaveBeenCalledTimes(2)
		expect(queue.setFolder).toHaveBeenLastCalledWith('files:/models', [2, 3, 4], expect.any(Set))
	})

	test('a page that never stops changing is still re-read', async () => {
		jest.useFakeTimers()
		filesList([{ id: 19 }])
		await startFilesThumbnails()
		const queue = createBackgroundQueue.mock.results[0].value

		for (let i = 0; i < 12; i++) {
			filesList([{ id: 20 + i }])
			await Promise.resolve()
			jest.advanceTimersByTime(300)
		}

		expect(queue.setFolder.mock.calls.length).toBeGreaterThan(1)
	})

	test('a stored thumbnail replaces its row icon', async () => {
		filesList([{ id: 9 }])
		await startFilesThumbnails()

		createBackgroundQueue.mock.calls[0][0].onThumbnail(9, new Blob(['png']))

		expect(document.querySelector('[data-cy-files-list-row-fileid="9"] img.threedviewer-thumbnail')).not.toBeNull()
	})

	test('a thumbnail moves out when the Files app reuses its row for another file', async () => {
		const table = filesList([{ id: 9 }])
		await startFilesThumbnails()
		createBackgroundQueue.mock.calls[0][0].onThumbnail(9, new Blob(['png']))

		table.rows[0].setAttribute('data-cy-files-list-row-fileid', '10')
		await Promise.resolve()

		expect(document.querySelector('img.threedviewer-thumbnail')).toBeNull()
		expect(document.querySelector('.files-list__row-icon-preview-container').style.display).toBe('')
	})

	test('a thumbnail comes back when its file is shown in a row again', async () => {
		const table = filesList([{ id: 11 }])
		await startFilesThumbnails()
		createBackgroundQueue.mock.calls[0][0].onThumbnail(11, new Blob(['png']))

		table.rows[0].setAttribute('data-cy-files-list-row-fileid', '12')
		await Promise.resolve()
		expect(document.querySelector('img.threedviewer-thumbnail')).toBeNull()

		table.rows[0].setAttribute('data-cy-files-list-row-fileid', '11')
		await Promise.resolve()
		expect(document.querySelector('img.threedviewer-thumbnail')?.dataset.fileid).toBe('11')
	})

	test('a thumbnail made for a row that is not rendered shows once it is', async () => {
		filesList([{ id: 14 }])
		await startFilesThumbnails()
		expect(createBackgroundQueue.mock.calls[0][0].onThumbnail(13, new Blob(['png']))).toBe(false)

		filesList([{ id: 13 }])
		await Promise.resolve()

		expect(document.querySelector('[data-cy-files-list-row-fileid="13"] img.threedviewer-thumbnail')).not.toBeNull()
	})

	describe('env', () => {
		/** @return {object} The env the queue was given */
		async function startedEnv() {
			filesList([{ id: 1 }])
			await startFilesThumbnails()
			return createBackgroundQueue.mock.calls[0][0].env
		}

		test('pauses while the tab is hidden or Save-Data is on', async () => {
			const env = await startedEnv()
			const hidden = jest.spyOn(document, 'hidden', 'get')

			hidden.mockReturnValue(false)
			expect(env.isPaused()).toBe(false)
			hidden.mockReturnValue(true)
			expect(env.isPaused()).toBe(true)

			hidden.mockReturnValue(false)
			Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true })
			expect(env.isPaused()).toBe(true)
			delete navigator.connection
			hidden.mockRestore()
		})

		test('pauses while the viewer is open over Files', async () => {
			const env = await startedEnv()

			navigate('/index.php/apps/files/files/42?dir=/models&openfile=true')
			expect(env.isPaused()).toBe(true)

			navigate('/index.php/apps/files/files/42?dir=/models')
			expect(env.isPaused()).toBe(false)

			const modal = document.createElement('div')
			modal.id = 'viewer'
			document.body.appendChild(modal)
			expect(env.isPaused()).toBe(true)
			modal.remove()
			expect(env.isPaused()).toBe(false)
		})

		test('onResume calls back once the viewer closes', async () => {
			const env = await startedEnv()
			navigate('/index.php/apps/files/files/42?dir=/models&openfile=true')
			const modal = document.createElement('div')
			modal.id = 'viewer'
			document.body.appendChild(modal)
			const cb = jest.fn()
			env.onResume(cb)

			// Closing it changes the URL without popstate and removes the modal
			navigate('/index.php/apps/files/files/42?dir=/models')
			modal.remove()
			await Promise.resolve()

			expect(cb).toHaveBeenCalledTimes(1)
			filesList([{ id: 2 }])
			await Promise.resolve()
			expect(cb).toHaveBeenCalledTimes(1)
		})

		test('onResume calls back once, on the next return to the tab', async () => {
			const env = await startedEnv()
			const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(true)
			const cb = jest.fn()
			env.onResume(cb)

			document.dispatchEvent(new Event('visibilitychange'))
			expect(cb).not.toHaveBeenCalled()

			hidden.mockReturnValue(false)
			document.dispatchEvent(new Event('visibilitychange'))
			document.dispatchEvent(new Event('visibilitychange'))
			expect(cb).toHaveBeenCalledTimes(1)
			hidden.mockRestore()
		})

		test('onResume calls back once Save-Data turns off', async () => {
			const env = await startedEnv()
			const connection = new EventTarget()
			connection.saveData = true
			Object.defineProperty(navigator, 'connection', { value: connection, configurable: true })
			const cb = jest.fn()
			env.onResume(cb)

			connection.saveData = false
			connection.dispatchEvent(new Event('change'))
			connection.dispatchEvent(new Event('change'))
			expect(cb).toHaveBeenCalledTimes(1)
			delete navigator.connection
		})

		test('waiting callbacks share one listener pair', async () => {
			const env = await startedEnv()
			const connection = new EventTarget()
			connection.saveData = true
			Object.defineProperty(navigator, 'connection', { value: connection, configurable: true })
			const onDocument = jest.spyOn(document, 'addEventListener')
			const onConnection = jest.spyOn(connection, 'addEventListener')
			const callbacks = Array.from({ length: 5 }, () => jest.fn())

			// One per folder visit while Save-Data stays on
			callbacks.forEach((cb) => env.onResume(cb))

			expect(onDocument.mock.calls.filter(([type]) => type === 'visibilitychange').length).toBeLessThanOrEqual(1)
			expect(onConnection).toHaveBeenCalledTimes(1)

			connection.saveData = false
			connection.dispatchEvent(new Event('change'))
			callbacks.forEach((cb) => expect(cb).toHaveBeenCalledTimes(1))
			onDocument.mockRestore()
			delete navigator.connection
		})

		test('whenIdle falls back to a 200 ms timer', async () => {
			jest.useFakeTimers()
			const env = await startedEnv()
			const done = jest.fn()
			env.whenIdle().then(done)

			jest.advanceTimersByTime(199)
			await Promise.resolve()
			expect(done).not.toHaveBeenCalled()
			jest.advanceTimersByTime(1)
			await Promise.resolve()
			expect(done).toHaveBeenCalled()
		})

		test('whenIdle uses requestIdleCallback when there is one', async () => {
			window.requestIdleCallback = jest.fn((cb) => cb())
			const env = await startedEnv()

			await env.whenIdle()

			expect(window.requestIdleCallback).toHaveBeenCalled()
			delete window.requestIdleCallback
		})
	})
})
