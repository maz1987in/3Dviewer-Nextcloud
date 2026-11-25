/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Registers a tab with the Files sidebar of Nextcloud 33 and later, the way
 * `registerSidebarTab` of `@nextcloud/files` does.
 *
 * That function only writes the tab into a registry the library keeps on `window`, which the
 * server's sidebar reads (its own copy of the library, the same version scope). Importing it
 * from the package puts the whole package into this script, 139 KB of it with the Node
 * polyfills one of its dependencies needs, in a script every Files page loads. This writes
 * to the registry directly instead, as the app's link-preview card does with `@nextcloud/vue`'s
 * (src/reference.js). tests/unit/registerSidebarTab.test.js reads the tab back through the
 * real library, so it fails the day the library keeps its registry somewhere else.
 */

/** The library's registry scope; `scopedGlobals` of `@nextcloud/files` 4.x (globalScope.mjs) */
const SCOPE = 'v4_0'

/**
 * @typedef {object} SidebarTab
 * @property {string} id - Unique id, valid as an HTML id
 * @property {string} displayName - The tab's name
 * @property {string} iconSvgInline - The tab's icon, as SVG
 * @property {number} order - Where the tab goes among the others, low first
 * @property {string} tagName - The web component the sidebar renders for the tab
 * @property {(context: {node: object}) => boolean} [enabled] - Whether the tab shows for a file
 * @property {() => Promise<void>} [onInit] - Defines the web component, the first time the tab shows
 */

/**
 * @param {SidebarTab} tab - The tab to register; one with an id already registered is left alone
 */
export function registerSidebarTab(tab) {
	window._nc_files_scope ??= {}
	window._nc_files_scope[SCOPE] ??= {}
	const scope = window._nc_files_scope[SCOPE]
	scope.filesSidebarTabs ??= new Map()
	if (!scope.filesSidebarTabs.has(tab.id)) {
		scope.filesSidebarTabs.set(tab.id, tab)
	}
}
