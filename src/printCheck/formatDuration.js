/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'

/**
 * A print time as a person says it: the two largest units.
 *
 * @param {number} seconds - The time
 * @return {string} For example "1 h 2 min"
 */
export function formatDuration(seconds) {
	const days = Math.floor(seconds / 86400)
	const hours = Math.floor((seconds % 86400) / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	if (days > 0) {
		return t('threedviewer', '{days} d {hours} h', { days, hours })
	}
	if (hours > 0) {
		return t('threedviewer', '{hours} h {minutes} min', { hours, minutes })
	}
	if (minutes > 0) {
		return t('threedviewer', '{minutes} min', { minutes })
	}
	return t('threedviewer', '{seconds} s', { seconds: Math.round(seconds) })
}
