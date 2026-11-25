/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The "3D" tab as the Files sidebar of Nextcloud 31 and 32 takes a tab: the sidebar calls
 * `mount(element, fileInfo)` for each tab of the file, `update(fileInfo)` when it shows
 * another file, `setIsActive` as the tab is shown or hidden, and `destroy()`. Nextcloud 33
 * replaced this with web components (stats/tabElement.js).
 *
 * Loaded by the tab's first `mount`.
 */

import { createApp, h, reactive } from 'vue'
// The tokens the tab's colours come from: the Files page does not load the app's design system
import '../css/design-system.css'
import ModelStatsTab from '../components/sidebar/ModelStatsTab.vue'

/**
 * @param {object} fileInfo - The sidebar's FileInfo: `id`, `name`, and `path` (the folder
 *   the file is in, with a leading slash) or `dir`
 * @return {{fileId: number, name: string, dir: string}} The tab's props
 */
export function propsFromFileInfo(fileInfo) {
	return {
		fileId: Number(fileInfo?.id),
		name: String(fileInfo?.name ?? ''),
		dir: fileInfo?.path || fileInfo?.dir || '/',
	}
}

/**
 * Mount the tab in the element the sidebar gave it.
 *
 * @param {HTMLElement} element - The sidebar's mount point
 * @param {object} fileInfo - The file the sidebar is open for
 * @param {boolean} active - Whether the tab is the one showing
 * @return {{update: Function, setActive: Function, destroy: Function}} What the sidebar's
 *   other calls do
 */
export function mountLegacyTab(element, fileInfo, active) {
	const props = reactive({ ...propsFromFileInfo(fileInfo), active })
	const host = document.createElement('div')
	element.appendChild(host)
	const app = createApp({
		// Keyed by file, so a new file starts the tab over
		render: () => h(ModelStatsTab, { ...props, key: props.fileId }),
	})
	app.mount(host)

	return {
		update(next) {
			Object.assign(props, propsFromFileInfo(next))
		},
		setActive(isActive) {
			props.active = isActive
		},
		destroy() {
			app.unmount()
			host.remove()
		},
	}
}
