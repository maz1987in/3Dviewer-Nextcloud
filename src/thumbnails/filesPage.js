/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Connects the background queue to the Files app: watches which folder is shown and which
 * of its rows are models, hands them to the queue, and puts each new thumbnail in its row
 * straight away rather than on the next reload.
 *
 * The Files app gives no event for "the folder changed" that other apps can use, so this
 * reads its rendered list (the `data-cy-files-list-row-*` attributes it puts on every row)
 * and the URL whenever the page changes.
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { getCurrentUser } from '@nextcloud/auth'
import { loadModelWithDependencies } from '../loaders/multiFileHelpers.js'
import { logger } from '../utils/logger.js'
import { createBackgroundQueue } from './backgroundQueue.js'
import { canRenderInBackground } from './formats.js'
import { isSkipped, markSkipped } from './skipList.js'
import { fetchStatus, uploadThumbnail } from './thumbnailApi.js'
import { loadThumbnailSettings } from './thumbnailSettings.js'
import { renderInWorker } from './workerRenderer.js'

/** Views that list files from many folders, or files that are gone. */
const EXCLUDED_VIEWS = new Set(['recent', 'trashbin', 'search'])
const ROW_SELECTOR = '[data-cy-files-list-row-fileid]'
const ICON_SELECTOR = '.files-list__row-icon'
const THUMBNAIL_CLASS = 'threedviewer-thumbnail'
// Marks the Files app's icon nodes this module hid, to show them again
const HIDDEN_ATTR = 'data-threedviewer-hidden'
// Badges drawn over the icon, which stay over a thumbnail too
const KEEP_SELECTOR = '.files-list__row-icon-favorite, .files-list__row-icon-overlay'
// Thumbnails made on this page, kept to show again when their row is rendered again
const MAX_REMEMBERED = 200
const REFRESH_DELAY_MS = 500
const REFRESH_MAX_WAIT_MS = 2000
const STARTED_KEY = '__threedviewerFilesThumbnails'

/** @type {Map<number, string>} Object URL of each thumbnail made on this page, oldest first */
const thumbnailUrls = new Map()

/**
 * @param {URL} url - A page URL
 * @return {?{view: string, fileId: string}} The Files route, or null for another page
 */
function filesRoute(url) {
	const match = /\/apps\/files(?:\/([^/]*)(?:\/([^/]*))?)?\/?$/.exec(url.pathname)
	if (!match) {
		return null
	}
	return { view: match[1] || 'files', fileId: match[2] ?? '' }
}

/**
 * Whether the URL shows one folder's files, which is where thumbnails are made. Recent
 * files, the trash bin and search results mix folders or hold deleted files.
 *
 * @param {URL} url - The page URL
 * @return {boolean} True for a Files view of one folder
 */
export function isEligibleFilesView(url) {
	const route = filesRoute(url)
	return route !== null
		&& !EXCLUDED_VIEWS.has(route.view)
		&& !url.searchParams.get('query')
}

/**
 * Identifies the folder a URL shows, so the queue can tell a new folder from more rows of
 * the same one.
 *
 * @param {URL} url - The page URL
 * @return {string} `<view>:<dir param or route fileid>`
 */
export function folderKey(url) {
	const route = filesRoute(url) ?? { view: '', fileId: '' }
	return `${route.view}:${url.searchParams.get('dir') ?? route.fileId}`
}

/**
 * @param {Element} row - A files list row
 * @return {number} Its file id, or NaN when it has none
 */
function rowFileId(row) {
	const value = row.getAttribute('data-cy-files-list-row-fileid')
	return /^\d+$/.test(value) ? Number(value) : NaN
}

/**
 * Whether a row may hold a model the worker can render. A row without a name is kept;
 * the status request filters it.
 *
 * @param {Element} row - A files list row
 * @return {boolean} False for folders and other files the queue would only discard
 */
function mayBeModel(row) {
	const name = row.getAttribute('data-cy-files-list-row-name')
	if (name === null) {
		return true
	}
	const dot = name.lastIndexOf('.')
	return dot !== -1 && canRenderInBackground(name.slice(dot + 1))
}

/**
 * @param {Element} row - A files list row
 * @return {boolean} True when part of it is inside the viewport
 */
function isOnScreen(row) {
	const rect = row.getBoundingClientRect()
	return rect.bottom > 0 && rect.right > 0
		&& rect.top < window.innerHeight && rect.left < window.innerWidth
}

/**
 * Read the model rows the Files app has rendered. Its list is virtual: only the rows near
 * the viewport exist, so scrolling adds more.
 *
 * @param {ParentNode} root - Where to look
 * @return {{ids: number[], visible: Set<number>}} Model file ids in display order, and
 *   those on screen
 */
export function readRows(root) {
	const ids = []
	const visible = new Set()
	for (const row of root.querySelectorAll(ROW_SELECTOR)) {
		const id = rowFileId(row)
		if (!Number.isSafeInteger(id) || id <= 0 || ids.includes(id) || !mayBeModel(row)) {
			continue
		}
		ids.push(id)
		if (isOnScreen(row)) {
			visible.add(id)
		}
	}
	return { ids, visible }
}

/**
 * Take a thumbnail out of its icon and show the Files app's icon again.
 *
 * @param {HTMLImageElement} img - A thumbnail this module added
 */
function removeThumbnail(img) {
	const icon = img.parentElement
	img.remove()
	for (const child of icon?.querySelectorAll(`:scope > [${HIDDEN_ATTR}]`) ?? []) {
		child.removeAttribute(HIDDEN_ATTR)
		child.style.display = ''
	}
}

/**
 * Put a thumbnail in a row's icon, in place of the Files app's preview or file icon.
 *
 * That icon is hidden, not removed: the Files app owns those nodes and patches them when
 * it reuses the row, which fails on nodes taken out of the page. The favourite and
 * overlay badges stay.
 *
 * @param {Element} icon - The row's `.files-list__row-icon`
 * @param {number} fileId - The file the thumbnail is for
 * @param {string} url - Object URL of the PNG
 */
function placeThumbnail(icon, fileId, url) {
	const previous = icon.querySelector(`:scope > img.${THUMBNAIL_CLASS}`)
	if (previous) {
		removeThumbnail(previous)
	}
	for (const child of icon.children) {
		if (!child.matches(KEEP_SELECTOR) && child.style.display !== 'none') {
			child.setAttribute(HIDDEN_ATTR, '')
			child.style.display = 'none'
		}
	}
	const img = document.createElement('img')
	img.className = THUMBNAIL_CLASS
	img.alt = ''
	img.dataset.fileid = String(fileId)
	img.src = url
	img.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain'
	icon.appendChild(img)
}

/**
 * @param {ParentNode} root - Where to look
 * @param {number} fileId - A file id
 * @return {?Element} The `.files-list__row-icon` of that file's row, when it is rendered
 */
function rowIcon(root, fileId) {
	return root.querySelector(`[data-cy-files-list-row-fileid="${Number(fileId)}"] ${ICON_SELECTOR}`)
}

/**
 * Show a new thumbnail in its row until the next reload, when the Files app shows it as
 * the file's preview. The thumbnail is remembered, so it also shows when the row is
 * rendered later (see restoreThumbnails). Best effort: false when the row or its icon is
 * not rendered now.
 *
 * @param {ParentNode} root - Where to look
 * @param {number} fileId - The file the thumbnail is for
 * @param {Blob} blob - The PNG
 * @return {boolean} True when the thumbnail was put in place
 */
export function swapRowIcon(root, fileId, blob) {
	const id = Number(fileId)
	if (thumbnailUrls.has(id)) {
		URL.revokeObjectURL(thumbnailUrls.get(id))
		thumbnailUrls.delete(id)
	}
	const url = URL.createObjectURL(blob)
	thumbnailUrls.set(id, url)
	if (thumbnailUrls.size > MAX_REMEMBERED) {
		const [oldestId, oldestUrl] = thumbnailUrls.entries().next().value
		thumbnailUrls.delete(oldestId)
		URL.revokeObjectURL(oldestUrl)
	}

	const icon = rowIcon(root, id)
	if (!icon) {
		return false
	}
	placeThumbnail(icon, id, url)
	return true
}

/**
 * Keep the thumbnails with their files as the list changes. The Files app renders only
 * the rows near the viewport and reuses row elements for other files as it scrolls: a
 * thumbnail in a row that now shows another file is taken out, and a row showing a file
 * that got a thumbnail on this page gets it back.
 *
 * @param {ParentNode} root - Where to look
 */
function restoreThumbnails(root) {
	for (const img of root.querySelectorAll(`img.${THUMBNAIL_CLASS}`)) {
		if (img.closest(ROW_SELECTOR)?.getAttribute('data-cy-files-list-row-fileid') !== img.dataset.fileid) {
			removeThumbnail(img)
		}
	}
	if (thumbnailUrls.size === 0) {
		return
	}
	// The rendered rows are few; the remembered thumbnails can be many
	for (const row of root.querySelectorAll(ROW_SELECTOR)) {
		const url = thumbnailUrls.get(rowFileId(row))
		const icon = url && row.querySelector(ICON_SELECTOR)
		if (icon && !icon.querySelector(`:scope > img.${THUMBNAIL_CLASS}`)) {
			placeThumbnail(icon, rowFileId(row), url)
		}
	}
}

/**
 * @return {boolean} True while background work should wait
 */
function isPaused() {
	return document.hidden || navigator.connection?.saveData === true
}

/**
 * Call back once, the first time the tab is shown again or Save-Data is turned off and
 * nothing else still pauses the work.
 *
 * @param {() => void} cb - Called once
 */
function onResume(cb) {
	const connection = navigator.connection
	const check = () => {
		if (isPaused()) {
			return
		}
		document.removeEventListener('visibilitychange', check)
		connection?.removeEventListener?.('change', check)
		cb()
	}
	document.addEventListener('visibilitychange', check)
	connection?.addEventListener?.('change', check)
}

/**
 * @return {Promise<void>} Resolves when the browser is idle, or after 200 ms where it
 *   cannot tell (Safari)
 */
function whenIdle() {
	return new Promise((resolve) => {
		if (typeof window.requestIdleCallback === 'function') {
			window.requestIdleCallback(() => resolve())
		} else {
			setTimeout(resolve, 200)
		}
	})
}

/**
 * Make thumbnails for the models in the folders the user browses in Files, if they are
 * logged in and have "Create thumbnails while browsing Files" on. Runs for the rest of
 * the page's life; a second call does nothing. Never rejects.
 *
 * @return {Promise<void>} Resolves once started, or once it decided not to
 */
export async function startFilesThumbnails() {
	if (window[STARTED_KEY] || !getCurrentUser()) {
		return
	}
	window[STARTED_KEY] = true

	try {
		const settings = await loadThumbnailSettings()
		// Independent of `enabled`, which is about capturing from the open viewer
		if (!settings.background) {
			return
		}

		const queue = createBackgroundQueue({
			settings,
			api: { fetchStatus, uploadThumbnail },
			load: loadModelWithDependencies,
			render: renderInWorker,
			skips: { isSkipped, markSkipped },
			env: { isPaused, onResume, whenIdle },
			onThumbnail: (fileId, blob) => swapRowIcon(document, fileId, blob),
		})

		const refresh = () => {
			const url = new URL(window.location.href)
			if (!isEligibleFilesView(url)) {
				queue.stop()
				return
			}
			const { ids, visible } = readRows(document)
			queue.setFolder(folderKey(url), ids, visible)
		}

		// Waits for the list to settle, but not for ever: an upload's progress or another
		// app can keep changing the page
		let timer = null
		let firstChange = 0
		const scheduleRefresh = () => {
			const now = Date.now()
			if (timer === null) {
				firstChange = now
			} else if (now - firstChange >= REFRESH_MAX_WAIT_MS) {
				return
			}
			clearTimeout(timer)
			timer = setTimeout(() => {
				timer = null
				refresh()
			}, REFRESH_DELAY_MS)
		}

		new MutationObserver(() => {
			restoreThumbnails(document)
			scheduleRefresh()
		}).observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['data-cy-files-list-row-fileid'],
		})
		window.addEventListener('popstate', scheduleRefresh)
		refresh()
	} catch (error) {
		logger.warn('filesPage', 'Background thumbnails did not start', error)
	}
}
