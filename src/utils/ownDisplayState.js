/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The model as it is, whatever the viewer is showing of it.
 *
 * Viewer tools change the live model object: a render mode puts stand-in materials on
 * it, Wireframe changes its materials, the G-code layer slider hides layers. Each tool
 * records what it changed in a small registry beside it, and `withOwnDisplayState` puts the model's own state back for one
 * synchronous call, then the viewer's. A thumbnail is shared with everyone who can see
 * the file, so it is rendered inside this; so are the exports that are written in one
 * synchronous call. A new tool that changes the model registers there and is covered.
 *
 * Plain module, no Vue and no DOM: the thumbnail renderer that reads it also runs in a
 * Web Worker, where no tool has registered anything and this does nothing.
 */

import { withOwnMaterials } from './materialStandIns.js'
import { withViewerHiddenShown } from './viewerHidden.js'
import { withOwnMaterialProps } from './viewerMaterialProps.js'

/**
 * Run `fn` with the model drawn as it is: its own materials (`withOwnMaterials`) with
 * their own property values (`withOwnMaterialProps`, inside it, so it sees them), and
 * every part a viewer tool hid shown again. Everything goes back to what the viewer was
 * showing before this returns or throws.
 *
 * @param {THREE.Object3D} root - The model
 * @param {Function} fn - Typically a single `renderer.render()` or exporter `parse()`
 * @return {*} What `fn` returns
 */
export function withOwnDisplayState(root, fn) {
	return withOwnMaterials(root, () => withOwnMaterialProps(root, () => withViewerHiddenShown(root, fn)))
}
