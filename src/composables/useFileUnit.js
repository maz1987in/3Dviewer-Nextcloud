/**
 * The unit the open model's file is in, as the viewer shows it and as the people who can
 * edit the file choose it (utils/sourceUnits.js decides which files can have one chosen).
 *
 * The format's own unit is known as soon as the model is; a chosen one arrives from the
 * server afterwards, so every load and save is tied to the model it was made for, and an
 * answer for a model that has since been replaced is dropped.
 */

import { ref } from 'vue'
import { FILE_UNITS, fileUnitKey, isUnitChangeable, millimetresPerFileUnit, unitSuffix } from '../utils/sourceUnits.js'

/**
 * @return {object} The unit's state and the calls that change it
 */
export function useFileUnit() {
	// { millimetres, key, suffix, source: 'file'|'chosen'|'default', changeable, canEdit,
	//   status: ''|'saving'|'saved'|'failed' }, or null while no file is open
	const state = ref(null)
	// The key of FILE_UNITS in force for the file, or null for the format's own
	const chosen = ref(null)

	let generation = 0
	let file = null
	let api = null

	const describeUnit = (millimetres, source) => ({
		millimetres,
		key: fileUnitKey(millimetres),
		suffix: unitSuffix(millimetres),
		source,
	})

	/** The state for the unit in force, keeping the rights and the status. */
	const refresh = (patch = {}) => {
		const source = chosen.value ? 'chosen' : (file.changeable ? 'default' : 'file')
		state.value = {
			...state.value,
			...describeUnit(millimetresPerFileUnit(file.filename, file.root, chosen.value), source),
			...patch,
		}
	}

	/**
	 * Start over for a model just opened: its format's unit, nothing chosen, no rights.
	 *
	 * @param {string} filename - The file the model came from
	 * @param {?THREE.Object3D} root - The loaded model
	 */
	const describe = (filename, root) => {
		generation++
		api = null
		file = { filename, root, changeable: isUnitChangeable(filename, root) }
		chosen.value = null
		state.value = { changeable: file.changeable, canEdit: false, status: '' }
		refresh()
	}

	/**
	 * Ask the server for the unit chosen for the file, and who may change it.
	 *
	 * @param {object} settingsApi - from createFileSettingsApi()
	 * @return {Promise<boolean>} Whether the unit in force changed
	 */
	const load = async (settingsApi) => {
		if (!file?.changeable) {
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
		const before = chosen.value
		chosen.value = answer.unit
		refresh({ canEdit: answer.canEdit })
		return chosen.value !== before
	}

	/**
	 * Save a unit for the file, for everyone who can open it.
	 *
	 * @param {?string} key - A key of FILE_UNITS, or null for the format's default
	 * @return {Promise<boolean>} Whether it was saved and is now in force
	 */
	const set = async (key) => {
		if (!api || !state.value?.canEdit || (key !== null && !Object.hasOwn(FILE_UNITS, key))) {
			return false
		}
		const asked = generation
		state.value = { ...state.value, status: 'saving' }
		let answer
		try {
			answer = await api.setUnit(key)
		} catch {
			if (asked === generation) {
				state.value = { ...state.value, status: 'failed' }
			}
			return false
		}
		if (asked !== generation) {
			return false
		}
		chosen.value = answer.unit
		refresh({ canEdit: answer.canEdit, status: 'saved' })
		return true
	}

	/** No file open (the model was cleared, or the demo scene). */
	const reset = () => {
		generation++
		api = null
		file = null
		chosen.value = null
		state.value = null
	}

	return { state, chosen, describe, load, set, reset }
}
