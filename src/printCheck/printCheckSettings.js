/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The printer and settings Print check remembers between visits.
 *
 * A logged-in user's choice is kept in the viewer's own preferences
 * (`/apps/threedviewer/settings`, the `user_preferences` blob App.vue merges into
 * VIEWER_CONFIG when the viewer opens), under `printCheck`. Saving reads the blob first
 * and writes it back whole, so the other preferences stay as they are. A public link has
 * no user, so there the choice stays in that browser. Whatever comes back is cleaned:
 * a stored value is never trusted to be in range.
 */

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { PRINTERS, MATERIALS, PRINT_CHECK_DEFAULTS, OVERHANG_ANGLE_RANGE } from './printers.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { isPublicShare } from '../composables/usePublicShare.js'
import { logger } from '../utils/logger.js'

const STORAGE_KEY = 'threedviewer.printCheck'

/**
 * @typedef {object} PrintCheckSettings
 * @property {string} printerId - One of PRINTERS, or 'custom'
 * @property {{width: number, depth: number, height: number}} custom - The custom size, mm
 * @property {number} overhangAngle - Degrees from vertical
 * @property {number} infill - Percent
 * @property {string} material - One of MATERIALS
 * @property {number} minThickness - mm
 */

/**
 * @param {unknown} value - A stored value
 * @param {number} min - Lowest allowed
 * @param {number} max - Highest allowed
 * @param {number} fallback - When it is not a number
 * @return {number} The value, in range
 */
function clamp(value, min, max, fallback) {
	const number = typeof value === 'number' ? value : Number.NaN
	return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

/**
 * A complete, in-range set of settings from whatever was stored.
 *
 * @param {unknown} raw - What was stored, if anything
 * @return {PrintCheckSettings} The settings to use
 */
export function sanitizePrintCheckSettings(raw) {
	const source = raw && typeof raw === 'object' ? raw : {}
	const custom = source.custom && typeof source.custom === 'object' ? source.custom : {}
	const defaults = PRINT_CHECK_DEFAULTS
	return {
		printerId: source.printerId === 'custom' || PRINTERS.some((p) => p.id === source.printerId) ? source.printerId : defaults.printerId,
		custom: {
			width: clamp(custom.width, 10, 2000, defaults.custom.width),
			depth: clamp(custom.depth, 10, 2000, defaults.custom.depth),
			height: clamp(custom.height, 10, 2000, defaults.custom.height),
		},
		overhangAngle: clamp(source.overhangAngle, OVERHANG_ANGLE_RANGE.min, OVERHANG_ANGLE_RANGE.max, defaults.overhangAngle),
		infill: clamp(source.infill, 0, 100, defaults.infill),
		material: MATERIALS.some((m) => m.id === source.material) ? source.material : defaults.material,
		minThickness: clamp(source.minThickness, 0.1, 10, defaults.minThickness),
	}
}

/**
 * @return {?object} What this browser kept for a public link, or null
 */
function readLocal() {
	try {
		return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
	} catch (error) {
		return null
	}
}

/**
 * The settings Print check opens with.
 *
 * @return {PrintCheckSettings} The remembered settings, cleaned
 */
export function loadPrintCheckSettings() {
	return sanitizePrintCheckSettings(isPublicShare() ? readLocal() : VIEWER_CONFIG.printCheck)
}

/**
 * Write one set of settings where it is kept.
 *
 * @param {PrintCheckSettings} settings - What to keep
 * @return {Promise<void>} Settled when written; a failure is logged, never thrown
 */
async function write(settings) {
	if (isPublicShare()) {
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
		} catch (error) {
			logger.warn('printCheckSettings', 'Could not keep the print check settings in this browser', error)
		}
		return
	}
	try {
		const url = generateUrl('/apps/threedviewer/settings')
		const response = await axios.get(url)
		let stored = response?.data?.settings
		// PHP sends an empty array for an empty blob
		if (!stored || Array.isArray(stored) || typeof stored !== 'object') {
			stored = {}
		}
		await axios.put(url, { settings: { ...stored, printCheck: settings } })
		VIEWER_CONFIG.printCheck = settings
	} catch (error) {
		logger.warn('printCheckSettings', 'Could not save the print check settings', error)
	}
}

// The latest settings waiting to be written, and everyone waiting for that write
let pending = null

/**
 * Remember settings. Changes that come in quick succession (a slider being dragged) are
 * written once, with the last of them.
 *
 * @param {PrintCheckSettings} settings - What to keep
 * @param {object} [options] - Options
 * @param {number} [options.delayMs] - How long to wait for the next change
 * @return {Promise<void>} Settled once these settings, or later ones, are written
 */
export function savePrintCheckSettings(settings, { delayMs = 500 } = {}) {
	return new Promise((resolve) => {
		if (pending) {
			clearTimeout(pending.timer)
		} else {
			pending = { settings: null, timer: null, waiting: [] }
		}
		pending.settings = settings
		pending.waiting.push(resolve)
		pending.timer = setTimeout(flushPrintCheckSettings, delayMs)
	})
}

/**
 * Write a waiting change now (the viewer is closing).
 *
 * @return {Promise<void>} Settled when written
 */
export async function flushPrintCheckSettings() {
	if (!pending) {
		return
	}
	const { settings, timer, waiting } = pending
	pending = null
	clearTimeout(timer)
	await write(settings)
	waiting.forEach((resolve) => resolve())
}
