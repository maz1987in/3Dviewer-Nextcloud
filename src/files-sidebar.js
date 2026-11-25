/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Registers the "3D" tab of the Files sidebar: what a model measures, its notes, and a
 * button that opens it. Its own entry, added by LoadSidebarListener where the Files app
 * asks for sidebar scripts, and kept to the registration: the tab itself (Vue, the
 * measuring code) loads when the sidebar first shows it.
 *
 * Nextcloud's two sidebars take a tab differently, and one script serves both:
 *
 * - Nextcloud 31 and 32: `OCA.Files.Sidebar.registerTab(new OCA.Files.Sidebar.Tab({...}))`,
 *   a tab mounted into an element by a function of its own (stats/legacyMount.js).
 * - Nextcloud 33 to 35: `registerSidebarTab` of `@nextcloud/files`, a tab that is a web
 *   component (stats/tabElement.js). The library keeps the registry on `window`, so the
 *   tab registered from this bundle is the one the server's sidebar lists; see
 *   stats/registerSidebarTab.js for why this script writes to it itself.
 *
 * The legacy sidebar exists once the Files app's own scripts have run, so the tab is
 * registered at DOMContentLoaded, when every script of the page has (not when this script
 * runs: a module runs with the document already `interactive`).
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { getCurrentUser } from '@nextcloud/auth'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { registerSidebarTab } from './stats/registerSidebarTab.js'
import { TAB_ICON_SVG } from './stats/tabIcon.js'
import { isThumbnailFormat } from './thumbnails/formats.js'

const TAB_ID = 'threedviewer'
const TAG_NAME = 'threedviewer-files-sidebar-tab'
// After Activity and Sharing, before Versions
const TAB_ORDER = 70

/**
 * @param {?string} name - A file name
 * @return {boolean} Whether it is a model the app opens, for a signed-in user: the tab's
 *   routes need a session, so a public share page, which has none, shows no tab
 */
function isModelName(name) {
	const dot = String(name ?? '').lastIndexOf('.')
	return dot !== -1 && isThumbnailFormat(String(name).slice(dot + 1)) && getCurrentUser() !== null
}

/**
 * Nextcloud 33 and later.
 */
function registerWebComponentTab() {
	registerSidebarTab({
		id: TAB_ID,
		displayName: t('threedviewer', '3D'),
		iconSvgInline: TAB_ICON_SVG,
		order: TAB_ORDER,
		tagName: TAG_NAME,
		enabled: ({ node }) => node?.type === 'file' && isModelName(node.basename),
		async onInit() {
			if (!window.customElements.get(TAG_NAME)) {
				const { createTabElement } = await import('./stats/tabElement.js')
				window.customElements.define(TAG_NAME, createTabElement())
			}
		},
	})
}

/**
 * Nextcloud 31 and 32.
 *
 * @param {object} sidebar - `OCA.Files.Sidebar`
 */
function registerLegacyTab(sidebar) {
	let mounted = null
	// The sidebar says which tab shows, possibly before the tab's code has loaded
	let active = false

	sidebar.registerTab(new sidebar.Tab({
		id: TAB_ID,
		name: t('threedviewer', '3D'),
		iconSvg: TAB_ICON_SVG,
		async mount(element, fileInfo) {
			const { mountLegacyTab } = await import('./stats/legacyMount.js')
			mounted?.destroy()
			mounted = mountLegacyTab(element, fileInfo, active)
		},
		update(fileInfo) {
			mounted?.update(fileInfo)
		},
		setIsActive(isActive) {
			active = isActive
			mounted?.setActive(isActive)
		},
		destroy() {
			mounted?.destroy()
			mounted = null
		},
		enabled: (fileInfo) => !(fileInfo?.isDirectory?.() ?? true) && isModelName(fileInfo?.name),
	}))
}

/**
 * Register the tab with whichever sidebar this server has.
 */
function register() {
	const legacy = window.OCA?.Files?.Sidebar
	if (typeof legacy?.registerTab === 'function' && typeof legacy.Tab === 'function') {
		registerLegacyTab(legacy)
	} else {
		registerWebComponentTab()
	}
}

// A module script runs while the document is `interactive`, before DOMContentLoaded, and an
// init script runs before the Files app's own scripts: the legacy sidebar does not exist yet.
// So the tab waits for DOMContentLoaded (and for `load`, in case this script came late) and
// registers once.
let registered = false
const registerOnce = () => {
	if (!registered) {
		registered = true
		register()
	}
}

if (document.readyState === 'complete') {
	registerOnce()
} else {
	window.addEventListener('DOMContentLoaded', registerOnce, { once: true })
	window.addEventListener('load', registerOnce, { once: true })
}
