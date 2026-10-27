/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Parts of a model a viewer tool has hidden for the moment, as opposed to parts the
 * model itself hides.
 *
 * The G-code layer slider hides the layers above the one chosen. A thumbnail is the
 * whole model, shared with everyone who can see the file, so the thumbnail renderer
 * draws inside `withViewerHiddenShown`, which shows those layers again for the render.
 * An object the model file hides is left hidden.
 *
 * Plain module, no Vue and no DOM: the thumbnail renderer that reads it also runs in a
 * Web Worker.
 */

const hiddenByViewer = new WeakSet()

/**
 * Hide or show an object for a viewer tool, remembering that the tool hid it.
 *
 * @param {THREE.Object3D} object - The object
 * @param {boolean} hidden - True to hide it
 */
export function setHiddenByViewer(object, hidden) {
	object.visible = !hidden
	if (hidden) {
		hiddenByViewer.add(object)
	} else {
		hiddenByViewer.delete(object)
	}
}

/**
 * Run `fn` with every object under `root` that a viewer tool hid shown again, then hide
 * them again. Synchronous, so nothing else can draw the model in between.
 *
 * @param {THREE.Object3D} root - The model
 * @param {Function} fn - Typically a single `renderer.render()`
 * @return {*} What `fn` returns
 */
export function withViewerHiddenShown(root, fn) {
	const shown = []
	root.traverse((child) => {
		if (!child.visible && hiddenByViewer.has(child)) {
			child.visible = true
			shown.push(child)
		}
	})
	try {
		return fn()
	} finally {
		for (const child of shown) {
			child.visible = false
		}
	}
}
