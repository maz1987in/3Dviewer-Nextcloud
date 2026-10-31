/**
 * How many points this device is asked to draw. Phones and tablets get fewer, through the
 * same thinning as a large file; so does any device that says it has little memory.
 * The signals are hints (deviceMemory and userAgentData are Chromium-only, and an iPad
 * reports itself as a Mac), so each is read defensively.
 */
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { POINT_BUDGET } from './limits.js'

/**
 * @param {object} env - What the browser says about the device
 * @param {?{mobile?: boolean}} [env.userAgentData] - navigator.userAgentData
 * @param {string} [env.userAgent] - navigator.userAgent
 * @param {number} [env.maxTouchPoints] - navigator.maxTouchPoints
 * @param {boolean} [env.coarsePointer] - matchMedia('(pointer: coarse)').matches
 * @param {number} [env.screenMin] - The screen's shorter side, in CSS px
 * @param {number} [env.deviceMemory] - navigator.deviceMemory, in GB
 * @return {'desktop'|'tablet'|'phone'} The kind of device, for its budgets; one with
 *   little memory is at most a tablet
 */
export function deviceClass({ userAgentData = null, userAgent = '', maxTouchPoints = 0, coarsePointer = false, screenMin = Infinity, deviceMemory } = {}) {
	if (userAgentData?.mobile === true || (coarsePointer && screenMin < 600)) {
		return 'phone'
	}
	if (coarsePointer || (maxTouchPoints > 1 && /Macintosh/.test(userAgent))) {
		return 'tablet'
	}
	return typeof deviceMemory === 'number' && deviceMemory <= 4 ? 'tablet' : 'desktop'
}

/**
 * @param {object} env - What the browser says about the device, as for deviceClass
 * @return {number} Points to draw at most
 */
export function pointBudget(env = {}) {
	return POINT_BUDGET[deviceClass(env)]
}

/**
 * @return {object} What this browser says about its device, for deviceClass
 */
function currentEnv() {
	const nav = globalThis.navigator ?? {}
	const screen = globalThis.screen
	let coarsePointer = false
	try {
		coarsePointer = globalThis.matchMedia?.('(pointer: coarse)').matches === true
	} catch {
		// No media queries here: assume a mouse
	}
	return {
		userAgentData: nav.userAgentData ?? null,
		userAgent: nav.userAgent ?? '',
		maxTouchPoints: nav.maxTouchPoints ?? 0,
		coarsePointer,
		screenMin: screen ? Math.min(screen.width, screen.height) : Infinity,
		deviceMemory: nav.deviceMemory,
	}
}

/**
 * @return {'desktop'|'tablet'|'phone'} This device's kind
 */
export function currentDeviceClass() {
	return deviceClass(currentEnv())
}

/**
 * @return {number} This device's budget
 */
export function currentBudget() {
	return POINT_BUDGET[currentDeviceClass()]
}

/**
 * @param {number} kept - Points drawn
 * @param {number} total - Points in the file
 * @return {?string} What to tell the person, or null when nothing was left out
 */
export function thinningNote(kept, total) {
	if (!(kept < total) || kept <= 0) {
		return null
	}
	const n = Math.round(total / kept)
	return n >= 2
		? t('threedviewer', 'Showing 1 in {n} points', { n })
		: t('threedviewer', 'Showing {kept} of {total} points', { kept: kept.toLocaleString(), total: total.toLocaleString() })
}
