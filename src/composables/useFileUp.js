/**
 * Which way is up for the open scan, as the viewer turns it and as the people who can edit
 * the file choose it, for everyone (pointclouds/upAxis.js). As for the unit (useFileUnit),
 * every load and save is tied to the scan it was made for, and an answer for a scan that
 * has since been replaced is dropped.
 */

import { ref } from 'vue'
import { UPS } from '../pointclouds/upValues.js'

/**
 * @return {object} The direction's state and the calls that change it
 */
export function useFileUp() {
	// { up, saved, defaultUp, canEdit, status: ''|'saving'|'saved'|'failed' }, or null
	// while no scan is open. `up` is in force; `saved` is what the file has, or null.
	const state = ref(null)

	let generation = 0
	let api = null

	/**
	 * Start over for a scan just opened: its format's way up, nothing saved, no rights.
	 *
	 * @param {string} defaultUp - The format's (upAxis.defaultUp)
	 */
	const describe = (defaultUp) => {
		generation++
		api = null
		state.value = { up: defaultUp, saved: null, defaultUp, canEdit: false, status: '' }
	}

	/**
	 * Ask the server which way is up for the file, and who may change it.
	 *
	 * @param {object} settingsApi - from createFileSettingsApi()
	 * @return {Promise<boolean>} Whether the direction in force changed
	 */
	const load = async (settingsApi) => {
		if (!state.value) {
			return false
		}
		const asked = generation
		let answer
		try {
			answer = await settingsApi.get()
		} catch {
			return false
		}
		if (asked !== generation) {
			return false
		}
		api = settingsApi
		const before = state.value.up
		state.value = { ...state.value, saved: answer.up, up: answer.up ?? state.value.defaultUp, canEdit: answer.canEdit }
		return state.value.up !== before
	}

	// As for the unit: picks in quick succession send only the latest, one save at a time
	let saving = null
	let wanted = null

	/**
	 * Save which way is up for the file, for everyone who can open it.
	 *
	 * @param {?string} up - One of UPS, or null for the format's default
	 * @return {Promise<boolean>} Whether the direction in force changed
	 */
	const set = async (up) => {
		if (!api || !state.value?.canEdit || (up !== null && !UPS.includes(up))) {
			return false
		}
		wanted = up
		state.value = { ...state.value, status: 'saving' }
		saving ??= sendLatest().finally(() => { saving = null })
		return saving
	}

	/**
	 * Send the latest direction asked for until it is the one saved, or saving it fails.
	 *
	 * @return {Promise<boolean>} Whether the direction in force changed
	 */
	const sendLatest = async () => {
		const asked = generation
		const target = api
		const before = state.value.up
		let held = state.value.saved
		let canEdit = true
		let failed = false
		for (;;) {
			const sending = wanted
			try {
				const answer = await target.setUp(sending)
				held = answer.up
				canEdit = answer.canEdit
				failed = false
			} catch (error) {
				failed = true
				// No longer allowed to edit the file: nothing more is sent
				if (error?.response?.status === 403) {
					canEdit = false
					break
				}
			}
			if (asked !== generation) {
				return false
			}
			if (wanted === sending) {
				break
			}
		}
		state.value = { ...state.value, saved: held, up: held ?? state.value.defaultUp, canEdit, status: failed ? 'failed' : 'saved' }
		return state.value.up !== before
	}

	/** No scan open. */
	const reset = () => {
		generation++
		api = null
		state.value = null
	}

	return { state, describe, load, set, reset }
}
