/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The model as it is, whatever the viewer is showing of it.
 *
 * Viewer tools change the live model object: a render mode puts stand-in materials on
 * it; Wireframe, an open cut and the G-code colour change its materials; the G-code
 * layer slider hides layers; Exploded view moves its parts, the transform gizmo the
 * whole model, and a playing animation its nodes. Each tool records what it changed in
 * a small registry beside it, and `withOwnDisplayState` puts the model's own state back
 * for one synchronous call, then the viewer's. A thumbnail is shared with everyone who
 * can see the file, so it is rendered inside this. Exports written in one synchronous
 * call use `withExportState`, which keeps where the user placed the model and the pose
 * its animation is in. A new tool that changes the model registers in one of these
 * registries, or in a new one added here, and is covered.
 *
 * Plain module, no Vue and no DOM: the thumbnail renderer that reads it also runs in a
 * Web Worker, where no tool has registered anything and this does nothing.
 */

import { withOwnMaterials } from './materialStandIns.js'
import { withViewerHiddenShown } from './viewerHidden.js'
import { withOwnMaterialProps } from './viewerMaterialProps.js'
import { withOwnTransforms, withPartsTogether } from './viewerTransforms.js'

/**
 * Run `fn` with the model drawn as it is: its own materials (`withOwnMaterials`) with
 * their own property values (`withOwnMaterialProps`, inside it, so it sees them), every
 * part a viewer tool hid shown again, and every object a tool moved where the model puts
 * it, with world matrices to match. Everything goes back to what the viewer was showing
 * before this returns or throws. This is what a thumbnail is drawn in.
 *
 * @param {THREE.Object3D} root - The model
 * @param {Function} fn - Typically a single `renderer.render()`
 * @return {*} What `fn` returns
 */
export function withOwnDisplayState(root, fn) {
	return withOwnMaterials(root, () => withOwnMaterialProps(root, () => withViewerHiddenShown(root, () => withOwnTransforms(root, fn))))
}

/**
 * Run `fn` with the model as an export writes it. Every format agrees on this: the
 * model's own materials, and its parts together however Exploded view has moved them,
 * but placed where the user put it with the transform gizmo and in the pose its
 * animation is in. STL, OBJ and PLY, and Send to Slicer's copies of them, are written
 * inside this; GLB, USDZ and 3MF are written asynchronously, so the viewer sets the
 * render mode and the explosion aside for them instead (`useRenderMode` and
 * `useExplodedView`'s `suspend`), which comes to the same.
 *
 * @param {THREE.Object3D} root - The model
 * @param {Function} fn - A single synchronous exporter `parse()`
 * @return {*} What `fn` returns
 */
export function withExportState(root, fn) {
	return withOwnMaterials(root, () => withOwnMaterialProps(root, () => withViewerHiddenShown(root, () => withPartsTogether(root, fn))))
}
