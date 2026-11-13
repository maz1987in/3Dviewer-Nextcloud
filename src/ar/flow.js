/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What happens when View in AR is pressed (useViewInAR holds its state). Loaded then, so
 * the viewer carries none of it until someone asks: the choice of way, the size guard, the
 * words for each outcome, and, from here, the Quick Look file or the WebXR session.
 */

import { AR_PATH } from '../utils/viewInAr.js'
import { arSizeVerdict, metresPerUnit } from './limits.js'
import { logger } from '../utils/logger.js'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'

/**
 * @param {Function} fn - A call that must run once
 * @return {Function} `fn`, which later calls do nothing
 */
function once(fn) {
	let called = false
	return () => {
		if (!called) {
			called = true
			fn()
		}
	}
}

/**
 * Open the file Quick Look is given, and let go of it a while after: Quick Look reads
 * it from the address while it opens.
 *
 * @param {string} url - The blob address
 * @param {Function} openQuickLook - From ar/quickLook.js
 */
function open(url, openQuickLook) {
	openQuickLook(url)
	setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Show the model in the room.
 *
 * Pressed once, it prepares the model; if Safari no longer counts the tap by the time
 * a large model is ready (it lets a file be opened only soon after a tap), the file is
 * kept and `status: 'ready'` is returned, and the next press opens it.
 *
 * @param {object} view - useViewInAR's state: { path, state, held, dropReady }
 * @param {object} options - Options
 * @param {THREE.Object3D} options.object - The open model
 * @param {number} options.millimetresPerUnit - Millimetres a scene unit is
 * @param {number} options.triangles - The model's triangle count
 * @param {Function} [options.hold] - Called before the model is read, to put the viewer's
 *   shading and exploded view aside for it; returns the call that puts them back
 * @param {Function} [options.notify] - (type, message) => void, told in words what is
 *   happening or why not; `type` is 'info', 'warning' or 'error'
 * @param {object} [options.xr] - For WebXR: { renderer, scene, renderFrame, onEnd }
 * @return {Promise<{status: string}>} `status` is one of: 'opened' (Quick Look was
 *   opened), 'ready' (a file waits for a tap), 'session' (a WebXR session runs),
 *   'unavailable', 'busy', 'too-large' (with `triangles` and `limit`), 'no-surfaces',
 *   'refused' (the person or the browser declined the session), or 'failed' (with `error`)
 */
export async function runViewInAR(view, { object, millimetresPerUnit, triangles, hold = () => () => {}, notify = () => {}, xr = null }) {
	const { path, state, held } = view
	if (!path.value || !object) {
		return { status: 'unavailable' }
	}
	if (state.value === 'ready' && held.ready) {
		const { url } = held.ready
		held.ready = null
		state.value = 'idle'
		const { openQuickLook } = await import('./quickLook.js')
		open(url, openQuickLook)
		return { status: 'opened' }
	}
	if (state.value !== 'idle') {
		return { status: 'busy' }
	}

	const { verdict, limit } = arSizeVerdict(triangles, path.value)
	if (verdict === 'refuse') {
		notify('error', t('threedviewer', '{count} triangles is too many to show in AR on a phone (the limit is {limit}). Try a lighter version of the model.', {
			count: triangles.toLocaleString(),
			limit: limit.toLocaleString(),
		}))
		return { status: 'too-large', triangles, limit }
	}
	if (verdict === 'warn') {
		notify('warning', t('threedviewer', '{count}K triangles: this may take a while, or run slowly on a phone', { count: (triangles / 1000).toFixed(0) }))
	}

	state.value = 'preparing'
	const release = once(hold())
	try {
		if (path.value === AR_PATH.WEBXR) {
			const { startArSession } = await import('./session.js')
			held.session = await startArSession({
				model: object,
				renderer: xr.renderer,
				scene: xr.scene,
				renderFrame: xr.renderFrame,
				metresPerUnit: metresPerUnit(millimetresPerUnit),
				onEnd: () => {
					held.session = null
					state.value = 'idle'
					release()
					xr.onEnd()
				},
			})
			if (held.disposed) {
				held.session.end()
				return { status: 'failed', error: new Error('Closed') }
			}
			state.value = 'active'
			return { status: 'session' }
		}

		const { buildQuickLookFile, openQuickLook } = await import('./quickLook.js')
		let file
		try {
			file = await buildQuickLookFile(object, { millimetresPerUnit })
		} finally {
			release()
		}
		const url = URL.createObjectURL(file)
		// Safari opens Quick Look only soon after a tap. A long export has used that up:
		// the next tap opens the file
		if (typeof navigator !== 'undefined' && navigator.userActivation?.isActive === false) {
			view.dropReady()
			held.ready = { url }
			state.value = 'ready'
			notify('info', t('threedviewer', 'The model is ready. Press Open in AR to see it in your room.'))
			return { status: 'ready' }
		}
		state.value = 'idle'
		open(url, openQuickLook)
		return { status: 'opened' }
	} catch (error) {
		release()
		state.value = 'idle'
		if (error?.name === 'NothingToExportError') {
			notify('error', t('threedviewer', 'This model has no surfaces to show in AR.'))
			return { status: 'no-surfaces' }
		}
		logger.error('useViewInAR', 'View in AR failed', error)
		// The person said no, or the browser would not start a session
		if (['NotAllowedError', 'SecurityError', 'NotSupportedError'].includes(error?.name)) {
			notify('error', t('threedviewer', 'AR could not start. Check that this site may use the camera, then try again.'))
			return { status: 'refused', error }
		}
		notify('error', t('threedviewer', 'The model could not be shown in AR. It may be too large for this device.'))
		return { status: 'failed', error }
	}
}
