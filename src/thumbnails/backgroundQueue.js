/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Works through the models of the folder the user is browsing, one at a time, making the
 * thumbnails that are missing. Each file is downloaded only within the user's size, time
 * and per-visit budget limits, rendered in a disposable worker and uploaded under the
 * version its status described.
 *
 * Every dependency is injected, so this module holds only the scheduling rules and runs
 * without a DOM. Nothing a dependency throws escapes it.
 *
 * A file is marked skipped only for what would happen again on the next visit: running
 * out of time, a model with nothing to draw, a download the server refuses (4xx), a
 * model the loader cannot parse, a model that names a URL outside the files it was handed
 * (refused by the worker), a companion the model declares that cannot be found, or a
 * model that with its companions needs more than a whole folder budget.
 * Failures of the browser or the network (no WebGL in a worker, a worker that will not
 * start or crashes, a network error or a 5xx) never skip a file. A one-time capability
 * probe before the first download, and a breaker after BREAKER_LIMIT failures of that
 * kind in a row, stop background work for the page instead. A refusal is not of that kind
 * and does not count: the file is skipped and the streak is left as it was.
 *
 * A thumbnail is written once per version and never replaced, so none is made from a
 * load that is missing a declared companion: one left out for the budget ends the visit
 * and is tried again with the next visit's fresh budget; one that is not there skips the
 * file, and the viewer, which searches more widely, makes its first thumbnail.
 */

import { logger } from '../utils/logger.js'
import {
	EmptyModelError,
	ThumbnailBudgetError,
	ThumbnailEnvironmentError,
	ThumbnailRefusedError,
	ThumbnailTimeoutError,
} from './errors.js'
// From formats.js rather than workerRenderer.js, which would pull in the worker factory
import { canRenderInBackground } from './formats.js'

const BYTES_PER_MB = 1048576
// Consecutive failures that are neither a timeout, an empty model nor a refusal, after which the
// browser is assumed unable to make thumbnails and the page stops trying
const BREAKER_LIMIT = 3

/** @typedef {import('./thumbnailApi.js').ThumbnailStatus} ThumbnailStatus */

/**
 * @typedef {object} BackgroundQueueDeps
 * @property {import('./thumbnailSettings.js').ThumbnailSettings} settings - Limits to work within
 * @property {object} api - Server calls
 * @property {(fileIds: number[]) => Promise<Map<number, ThumbnailStatus>>} api.fetchStatus - See thumbnailApi.js
 * @property {(fileId: number, etag: string, blob: Blob) => Promise<string>} api.uploadThumbnail - See thumbnailApi.js
 * @property {(fileId: number, filename: string, extension: string, dirPath: string, options: LoadOptions) => Promise<LoadResult>} load
 *   - Downloads a model and its companion files; see backgroundLoad.js
 * @property {(job: object, options: {timeoutMs: number, signal: AbortSignal}) => Promise<Blob>} render
 *   - Renders in a worker; see workerRenderer.js
 * @property {(options: {timeoutMs: number}) => Promise<boolean>} [probe] - Whether this
 *   browser can render in a worker at all; asked once, before the first download. Without
 *   it the browser is assumed able
 * @property {object} skips - The per-browser skip list
 * @property {(fileId: number, etag: string) => boolean} skips.isSkipped - See skipList.js
 * @property {(fileId: number, etag: string) => void} skips.markSkipped - See skipList.js
 * @property {object} env - The page around the queue
 * @property {() => boolean} env.isPaused - True while work should wait (e.g. hidden tab)
 * @property {(cb: () => void) => void} env.onResume - Calls `cb` once work may go on
 * @property {() => Promise<void>} env.whenIdle - Resolves at a moment the page is idle
 * @property {() => number} [env.now] - Current time in ms; defaults to Date.now
 * @property {(cb: () => void, ms: number) => (() => void)} [env.setTimer] - Calls `cb` after
 *   `ms` and returns a cancel function; defaults to setTimeout
 * @property {(fileId: number, blob: Blob) => void} [onThumbnail] - Told about each stored thumbnail
 */

/**
 * What `load` is given besides the file.
 *
 * @typedef {object} LoadOptions
 * @property {AbortSignal} signal - Fires at the file's time limit or when the visit ends;
 *   every request of the load must stop then
 * @property {number} budgetBytes - What is left of the folder budget; the load must not
 *   download more, main file and companions together
 * @property {(bytes: number) => void} onBytes - To be told about each chunk received, so
 *   a load stopped midway still counts what it downloaded
 */

/**
 * What `load` resolves with. Only `mainFile` is required; a load that leaves the rest
 * out had every companion the model declares.
 *
 * @typedef {object} LoadResult
 * @property {File} mainFile - The model
 * @property {File[]} [dependencies] - Its companions
 * @property {string[]} [missingFiles] - Declared companions that were not fetched
 * @property {boolean} [budgetReached] - One of them was left out for the budget
 * @property {number} [bytesNeeded] - With `budgetReached`, the fewest bytes the load
 *   needs, which a fresh visit's budget may or may not cover
 */

/**
 * @param {() => void} cb - What to call
 * @param {number} ms - After how long
 * @return {() => void} Cancels the call
 */
function defaultSetTimer(cb, ms) {
	const timer = setTimeout(cb, ms)
	return () => clearTimeout(timer)
}

/**
 * @param {string} name - File name
 * @return {string} Extension after the last dot, lower case; empty when there is none
 */
function extensionOf(name) {
	const dot = String(name ?? '').lastIndexOf('.')
	return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * Wait for a promise, but give up as soon as the signal fires.
 *
 * @template T
 * @param {Promise<T>} promise - What to wait for
 * @param {AbortSignal} signal - Ends the wait early
 * @return {Promise<T|undefined>} The promise's value, or undefined once aborted
 */
function untilAborted(promise, signal) {
	if (signal.aborted) {
		return Promise.resolve()
	}
	return new Promise((resolve, reject) => {
		const onAbort = () => resolve()
		signal.addEventListener('abort', onAbort, { once: true })
		Promise.resolve(promise).then(
			(value) => {
				signal.removeEventListener('abort', onAbort)
				resolve(value)
			},
			(error) => {
				signal.removeEventListener('abort', onAbort)
				reject(error)
			},
		)
	})
}

/**
 * @param {BackgroundQueueDeps} deps - Everything the queue talks to
 * @return {{setFolder: (folderKey: string, fileIds: number[], visibleIds?: Set<number>) => void, stop: () => void, idle: () => Promise<void>}}
 *   The queue
 */
export function createBackgroundQueue(deps) {
	const { settings, api, load, render, skips, env } = deps
	const now = () => (env.now ? env.now() : Date.now())
	const setTimer = env.setTimer ?? defaultSetTimer

	/**
	 * One visit to a folder.
	 *
	 * @typedef {object} Visit
	 * @property {string} key - The folder
	 * @property {AbortController} controller - Fires when the visit ends
	 * @property {Set<number>} known - Every id given for this visit
	 * @property {number[]} unfetched - Ids whose status has not been asked for yet
	 * @property {number[]} pending - Ids waiting to be processed, in order
	 * @property {Map<number, ThumbnailStatus>} statuses - Status by id, fetched once
	 * @property {number} budget - Bytes this visit may still download
	 * @property {boolean} ended - No more work will be done for this visit
	 * @property {boolean} running - A loop is working on this visit
	 */

	/** @type {?Visit} */
	let visit = null
	// Settles when the most recent loop has let go, so loops never overlap: a new folder
	// waits for the old one's job to wind down after its abort instead of starting a second
	let tail = Promise.resolve()
	// Set once this browser is found unable to make thumbnails; nothing runs on this page after
	let halted = false
	/** @type {?Promise<boolean>} The capability probe, asked once per page */
	let capability = null
	// Failures in a row that point at the browser rather than the file
	let failureStreak = 0

	/**
	 * Stop all background work on this page, skipping nothing.
	 *
	 * @param {string} reason - For the log
	 */
	const halt = (reason) => {
		if (halted) {
			return
		}
		halted = true
		logger.warn('backgroundQueue', 'Background thumbnails stopped for this page', { reason })
		visit?.controller.abort()
		visit = null
	}

	/** Count a failure that may be the browser's, and trip the breaker at the limit. */
	const noteFailure = () => {
		failureStreak += 1
		if (failureStreak >= BREAKER_LIMIT) {
			halt(`${failureStreak} renders in a row failed`)
		}
	}

	/**
	 * Whether the browser can render in a worker, probing it the first time.
	 *
	 * @param {Visit} v - The visit asking, whose end stops the wait (not the probe)
	 * @return {Promise<boolean|undefined>} The answer, or undefined if the visit ended first
	 */
	const isCapable = (v) => {
		if (!deps.probe) {
			return Promise.resolve(true)
		}
		capability ??= Promise.resolve()
			.then(() => deps.probe({ timeoutMs: settings.timeoutSeconds * 1000 }))
			.then((ok) => ok === true, () => false)
		return untilAborted(capability, v.controller.signal)
	}

	/**
	 * @param {Visit} v - A visit
	 * @return {boolean} False once the user has left it or it was stopped
	 */
	const isCurrent = (v) => visit === v && !v.controller.signal.aborted

	/**
	 * @param {Visit} v - The visit to add to
	 * @param {number[]} fileIds - Ids in the order the folder lists them
	 * @param {Set<number>} visibleIds - Ids on screen, which go first
	 */
	const enqueue = (v, fileIds, visibleIds) => {
		const fresh = fileIds.filter((id) => !v.known.has(id) && v.known.add(id))
		const ordered = [
			...fresh.filter((id) => visibleIds.has(id)),
			...fresh.filter((id) => !visibleIds.has(id)),
		]
		v.unfetched.push(...ordered)
		v.pending.push(...ordered)
	}

	/**
	 * Decide, before anything is downloaded, whether a file gets a thumbnail now. A file
	 * that does not fit what is left of the budget ends the visit: nothing more is
	 * downloaded, and the file is not skipped. One larger than a whole folder budget can
	 * never fit, so it is skipped instead and the visit goes on with the next file.
	 *
	 * @param {Visit} v - The visit
	 * @param {number} id - File id
	 * @return {?ThumbnailStatus} The file's status when it should be processed, else null
	 */
	function eligibleStatus(v, id) {
		const status = v.statuses.get(id)
		if (!status
			|| !canRenderInBackground(extensionOf(status.name))
			|| !status.canEdit
			|| status.hasThumbnail
			|| skips.isSkipped(id, status.etag)
			|| !(status.size <= settings.maxFileSizeMB * BYTES_PER_MB)) {
			return null
		}
		if (status.size > settings.folderBudgetMB * BYTES_PER_MB) {
			// No visit's budget can hold it; ending the visit would stop every visit here
			logger.info('backgroundQueue', 'Model is larger than a whole folder budget', { fileId: id, size: status.size })
			skips.markSkipped(id, status.etag)
			return null
		}
		if (status.size > v.budget) {
			v.ended = true
			return null
		}
		return status
	}

	/**
	 * Download, render and upload the thumbnail for one eligible file of the visit.
	 *
	 * @param {Visit} v - The visit
	 * @param {number} id - File id
	 * @param {ThumbnailStatus} status - Its status, fetched before the download
	 */
	async function processFile(v, id, status) {
		const extension = extensionOf(status.name)
		const timeoutMs = settings.timeoutSeconds * 1000
		const deadline = now() + timeoutMs
		const files = await download(v, id, status, extension, timeoutMs)
		if (!files) {
			return
		}
		const { mainFile, dependencies } = files

		const remaining = deadline - now()
		if (remaining <= 0) {
			logger.info('backgroundQueue', 'Download used up the time limit', { fileId: id })
			skips.markSkipped(id, status.etag)
			return
		}

		let blob
		try {
			blob = await render(
				{ extension, buffer: await mainFile.arrayBuffer(), additionalFiles: dependencies },
				{ timeoutMs: remaining, signal: v.controller.signal },
			)
		} catch (error) {
			if (!isCurrent(v)) {
				// Aborted because the user left; not the file's fault
				return
			}
			if (error instanceof ThumbnailTimeoutError) {
				logger.info('backgroundQueue', 'Render ran out of time', { fileId: id })
			} else if (error instanceof EmptyModelError) {
				// The worker ran fine; the model just has nothing to draw
				failureStreak = 0
				logger.info('backgroundQueue', 'Model has no geometry to render', { fileId: id })
			} else if (error instanceof ThumbnailRefusedError) {
				// The model's doing, and the same next visit; not the browser's, so it does
				// not count toward the breaker. Otherwise three crafted models in a folder
				// would stop background work for everyone who browses it
				logger.info('backgroundQueue', 'The worker refused a file the model named', { fileId: id, error })
			} else if (error instanceof ThumbnailEnvironmentError) {
				// The worker, not the file: try again next visit
				logger.warn('backgroundQueue', 'The thumbnail worker failed', { fileId: id, error })
				noteFailure()
				return
			} else {
				logger.warn('backgroundQueue', 'Render failed', { fileId: id, error })
				noteFailure()
			}
			// It would fail the same way next visit; "Retry skipped files" clears this
			skips.markSkipped(id, status.etag)
			return
		}
		failureStreak = 0
		if (!isCurrent(v)) {
			return
		}

		// The etag from before the download: if the file changed since, the server
		// answers 'stale' and the next visit renders the new version
		const outcome = await api.uploadThumbnail(id, status.etag, blob)
		if (outcome === 'stored') {
			deps.onThumbnail?.(id, blob)
		} else if (outcome !== 'exists') {
			logger.info('backgroundQueue', 'Thumbnail not stored', { fileId: id, outcome })
		}
	}

	/**
	 * Download a file and its companions under one signal that fires at the file's time
	 * limit or when the visit ends, so no request outlives either. Every byte received
	 * counts against the visit's budget, even when the download was stopped midway.
	 *
	 * @param {Visit} v - The visit
	 * @param {number} id - File id
	 * @param {ThumbnailStatus} status - Its status
	 * @param {string} extension - Its extension
	 * @param {number} timeoutMs - The file's time limit, which the download starts
	 * @return {Promise<?{mainFile: File, dependencies: File[]}>} The files, or null when
	 *   there is nothing to render
	 */
	async function download(v, id, status, extension, timeoutMs) {
		const job = new AbortController()
		let timedOut = false
		const leave = () => job.abort()
		v.controller.signal.addEventListener('abort', leave, { once: true })
		const cancelTimer = setTimer(() => {
			timedOut = true
			job.abort()
		}, timeoutMs)
		let received = 0

		try {
			const {
				mainFile,
				dependencies = [],
				missingFiles = [],
				budgetReached = false,
				bytesNeeded = 0,
			} = await load(id, status.name, extension, status.dir, {
				signal: job.signal,
				budgetBytes: v.budget,
				onBytes: (bytes) => {
					received += bytes
				},
			})
			if (!isCurrent(v)) {
				// Left the folder while downloading; the file is tried on the next visit
				return null
			}
			// A load that reports no progress is charged what it returned
			v.budget -= Math.max(received, dependencies.reduce((sum, file) => sum + file.size, mainFile.size))

			// Never render without a declared companion: the thumbnail would be permanent
			if (budgetReached) {
				if (bytesNeeded > settings.folderBudgetMB * BYTES_PER_MB) {
					// No visit's budget can hold it; skip rather than download it every visit
					logger.info('backgroundQueue', 'Model needs more than a whole folder budget', { fileId: id, bytesNeeded })
					skips.markSkipped(id, status.etag)
				} else {
					// Not enough left this visit; the next one starts with a fresh budget
					logger.info('backgroundQueue', 'Folder budget spent on a companion', { fileId: id, missingFiles })
					v.ended = true
				}
				return null
			}
			if (missingFiles.length > 0) {
				// The viewer looks further for them and makes the first thumbnail
				logger.info('backgroundQueue', 'Declared companions not found', { fileId: id, missingFiles })
				skips.markSkipped(id, status.etag)
				return null
			}
			return { mainFile, dependencies }
		} catch (error) {
			if (!isCurrent(v)) {
				// Aborted because the user left; not the file's fault
				return null
			}
			v.budget -= received
			if (timedOut) {
				logger.info('backgroundQueue', 'Download used up the time limit', { fileId: id })
				skips.markSkipped(id, status.etag)
			} else if (error instanceof ThumbnailBudgetError) {
				// Bigger than its status said: stop the visit here, as for any file that does not fit
				v.ended = true
			} else if (error instanceof ThumbnailEnvironmentError) {
				logger.warn('backgroundQueue', 'Could not download the model', { fileId: id, error })
				noteFailure()
			} else {
				// Refused by the server (gone, forbidden, too large for it)
				logger.info('backgroundQueue', 'Could not download the model', { fileId: id, error })
				skips.markSkipped(id, status.etag)
			}
			return null
		} finally {
			cancelTimer()
			v.controller.signal.removeEventListener('abort', leave)
		}
	}

	/**
	 * Wait until the page is idle and not paused, or the visit ends.
	 *
	 * @param {Visit} v - The visit
	 */
	async function waitForTurn(v) {
		const { signal } = v.controller
		await untilAborted(env.whenIdle(), signal)
		while (!signal.aborted && env.isPaused()) {
			await untilAborted(new Promise((resolve) => env.onResume(resolve)), signal)
		}
	}

	/**
	 * Work through the visit's pending files until none are left or it ends.
	 *
	 * @param {Visit} v - The visit
	 * @return {Promise<void>} Never rejects
	 */
	async function runVisit(v) {
		try {
			while (isCurrent(v) && !v.ended && v.pending.length > 0) {
				if (v.unfetched.length > 0) {
					const ids = v.unfetched.splice(0)
					const statuses = await untilAborted(api.fetchStatus(ids), v.controller.signal)
					if (!isCurrent(v)) {
						break
					}
					statuses?.forEach((entry, id) => v.statuses.set(id, entry))
				}

				const id = v.pending.shift()
				let status
				try {
					status = eligibleStatus(v, id)
				} catch (error) {
					logger.warn('backgroundQueue', 'Could not check the file', { fileId: id, error })
					continue
				}
				if (!status) {
					continue
				}

				// A failed wait ends the visit rather than racing through the rest
				await waitForTurn(v)
				if (!isCurrent(v)) {
					break
				}
				const capable = await isCapable(v)
				if (!isCurrent(v)) {
					break
				}
				if (!capable) {
					halt('This browser cannot render thumbnails in a worker')
					break
				}

				try {
					await processFile(v, id, status)
				} catch (error) {
					// A dependency failed in a way none of the rules cover; move on
					logger.warn('backgroundQueue', 'Background thumbnail failed', { fileId: id, error })
				}
			}
		} catch (error) {
			// The status request or an idle/pause wait failed: give up on this visit
			logger.warn('backgroundQueue', 'Background thumbnails stopped for this folder', error)
			v.ended = true
		}
		// Synchronous with the loop's last check: an id appended during any await above
		// was seen by the loop, and one appended from now on starts a new loop
		v.running = false
	}

	/**
	 * Start a loop for the visit unless one is already working on it.
	 *
	 * @param {Visit} v - The visit
	 */
	function ensureRunning(v) {
		if (v.running || v.ended || !isCurrent(v) || v.pending.length === 0) {
			return
		}
		v.running = true
		tail = tail.then(() => runVisit(v))
	}

	return {
		/**
		 * Point the queue at the folder being shown. A new folder ends the current visit,
		 * aborting its job without skipping the file, and starts one with a fresh budget;
		 * the same folder again only adds ids it has not seen.
		 *
		 * @param {string} folderKey - Identifies the folder
		 * @param {number[]} fileIds - The folder's file ids, in display order
		 * @param {Set<number>} [visibleIds] - Ids on screen, processed first
		 */
		setFolder(folderKey, fileIds, visibleIds = new Set()) {
			if (halted) {
				return
			}
			if (!visit || visit.key !== folderKey) {
				visit?.controller.abort()
				visit = {
					key: folderKey,
					controller: new AbortController(),
					known: new Set(),
					unfetched: [],
					pending: [],
					statuses: new Map(),
					budget: settings.folderBudgetMB * BYTES_PER_MB,
					ended: false,
					running: false,
				}
			}
			if (visit.ended) {
				return
			}
			enqueue(visit, fileIds ?? [], visibleIds)
			ensureRunning(visit)
		},

		/**
		 * End the current visit: abort its job without skipping the file, and process
		 * nothing more until the next `setFolder`.
		 */
		stop() {
			visit?.controller.abort()
			visit = null
		},

		/**
		 * @return {Promise<void>} Resolves once the queue has no work left running, either
		 *   finished or stopped. A job that was aborted is waited for until it has wound
		 *   down, which the abort makes quick.
		 */
		async idle() {
			// A setFolder() made while waiting can chain another loop onto `tail`
			let settled
			do {
				settled = tail
				await settled
			} while (settled !== tail)
		},
	}
}
