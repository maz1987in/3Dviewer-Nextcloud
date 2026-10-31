/**
 * How many splats this device is asked to draw: the scans' kinds of device
 * (pointclouds/budget.js), with budgets of their own.
 */
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { currentDeviceClass } from '../pointclouds/budget.js'
import { SPLAT_BUDGET } from './limits.js'

/**
 * @param {'desktop'|'tablet'|'phone'} kind - From deviceClass
 * @return {number} Splats to draw at most
 */
export function splatBudgetFor(kind) {
	return SPLAT_BUDGET[kind] ?? SPLAT_BUDGET.desktop
}

/**
 * @return {number} This device's budget
 */
export function splatBudget() {
	return splatBudgetFor(currentDeviceClass())
}

/**
 * @param {number} kept - Splats drawn
 * @param {number} total - Splats in the file
 * @return {?string} What to tell the person, or null when nothing was left out
 */
export function splatThinningNote(kept, total) {
	if (!(kept < total) || kept <= 0) {
		return null
	}
	const n = Math.round(total / kept)
	return n >= 2
		? t('threedviewer', 'Showing 1 in {n} splats', { n })
		: t('threedviewer', 'Showing {kept} of {total} splats', { kept: kept.toLocaleString(), total: total.toLocaleString() })
}
