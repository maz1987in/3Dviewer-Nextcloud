/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The "3D" tab as the Files sidebar of Nextcloud 33 and later takes a tab: a web component.
 * The sidebar renders `<tag :node.prop :folder.prop :view.prop :active.prop>` for the tab
 * that is showing, and the element hands them to the tab's component. No shadow root, as
 * the sidebar's own Versions tab has none, so the tab takes Nextcloud's theme and styles.
 *
 * Loaded by the tab's `onInit`, the first time the tab is shown.
 */

import { defineComponent, defineCustomElement, h } from 'vue'
// The tokens the tab's colours come from: the Files page does not load the app's design system
import '../css/design-system.css'
import ModelStatsTab from '../components/sidebar/ModelStatsTab.vue'

const TabElement = defineComponent({
	name: 'ThreeDViewerFilesSidebarTab',

	props: {
		/** The file the sidebar is open for, an INode of `@nextcloud/files` */
		node: { type: Object, default: null },
		/** The folder the Files app has open; not used */
		folder: { type: Object, default: null },
		/** The Files app's current view; not used */
		view: { type: Object, default: null },
		/** Whether this is the tab that is showing */
		active: { type: Boolean, default: false },
	},

	render() {
		if (!this.node) {
			return null
		}
		return h(ModelStatsTab, {
			// A different file is a different tab, not the same one with new numbers
			key: this.node.fileid,
			fileId: Number(this.node.fileid),
			name: this.node.basename,
			dir: this.node.dirname || '/',
			active: this.active,
		})
	},
})

/**
 * @return {CustomElementConstructor} The tab's element, to `customElements.define`
 */
export function createTabElement() {
	return defineCustomElement(TabElement, { shadowRoot: false })
}
