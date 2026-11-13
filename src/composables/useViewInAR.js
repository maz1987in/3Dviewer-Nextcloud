/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * View in AR: put the open model in the room at real size, on a phone.
 *
 * There are two ways, by device (utils/viewInAr.js decides which):
 *
 * - iPhone and iPad: the model is written as USDZ in the browser, in metres, and opened
 *   in AR Quick Look (src/ar/quickLook.js).
 * - Android Chrome and other WebXR browsers: a live `immersive-ar` session, a ring on the
 *   floor and a tap to place the model (src/ar/session.js).
 *
 * This holds what the viewer needs to know at all times, which is little: whether the
 * device has a way, and where a press stands. Everything a press does is in src/ar/,
 * loaded by the first one, so nothing here is in the way of a model opening.
 */

import { ref } from 'vue'
import { detectArPath } from '../utils/viewInAr.js'

/**
 * @return {object} The state and the calls of View in AR
 */
export function useViewInAR() {
	// A value of AR_PATH, or null where the device has no way (the button is then not offered)
	const path = ref(null)
	// 'idle'; 'preparing' (the file is being written, or the session is starting);
	// 'ready' (Quick Look's file is made and waits for a tap); 'active' (a session runs)
	const state = ref('idle')
	// The file waiting for a tap, the session running, and whether the viewer has gone
	const held = { ready: null, session: null, disposed: false }

	/**
	 * Ask the browser which way it has, and remember it. Safe to call again.
	 *
	 * @param {object} [env] - What to ask, for a test (see detectArPath)
	 * @return {Promise<?string>} The way, or null
	 */
	const detect = async (env) => {
		path.value = await detectArPath(env)
		return path.value
	}

	/** Let go of a file that waits for a tap, such as when the model is replaced. */
	const dropReady = () => {
		if (held.ready) {
			URL.revokeObjectURL(held.ready.url)
			held.ready = null
		}
		if (state.value === 'ready') {
			state.value = 'idle'
		}
	}

	/**
	 * Show the model in the room (see runViewInAR in src/ar/flow.js for the options and
	 * what comes back).
	 *
	 * @param {object} options - Options
	 * @return {Promise<{status: string}>} What happened
	 */
	const start = async (options) => {
		const { runViewInAR } = await import('../ar/flow.js')
		return runViewInAR({ path, state, held, dropReady }, options)
	}

	/** Leave AR, if a session runs. */
	const stop = async () => {
		await held.session?.end()
	}

	/** The viewer is going: end a session and let go of a file that waits. */
	const dispose = () => {
		held.disposed = true
		dropReady()
		held.session?.end()
	}

	return { path, state, detect, start, stop, dispose, dropReady }
}
