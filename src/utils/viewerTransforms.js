/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Where the model puts each object a viewer tool moves.
 *
 * Exploded view moves a model's parts apart, the transform gizmo moves, turns and
 * stretches the whole model, and an animation moves its nodes and morphs. A tool that
 * moves an object records its own transform (position, rotation and scale, and morph
 * target weights) with `rememberOwnTransform` before it first moves it, and anything
 * that must see the model as it is runs inside `withOwnTransforms`, which puts every
 * recorded object back where the model puts it for one synchronous call.
 *
 * Plain module, no Vue and no DOM: the thumbnail renderer that reads it also runs in a
 * Web Worker.
 */

/**
 * The tools that move objects, as they record themselves. A thumbnail undoes every one;
 * an export undoes only Exploded view, and keeps where the user placed the model and
 * the pose its animation is in (see `withExportState` in ownDisplayState.js).
 */
export const MOVED_BY = Object.freeze({
	exploded: 'exploded',
	gizmo: 'gizmo',
	animation: 'animation',
})

// object -> { position, quaternion, scale, influences }
const ownTransforms = new WeakMap()
// object -> Set of the MOVED_BY tools that recorded it
const recordedBy = new WeakMap()

/**
 * An object's transform as it is now.
 *
 * @param {THREE.Object3D} object - The object
 * @return {{position: THREE.Vector3, quaternion: THREE.Quaternion, scale: THREE.Vector3, influences: ?number[]}} A copy
 */
function transformOf(object) {
	return {
		position: object.position.clone(),
		quaternion: object.quaternion.clone(),
		scale: object.scale.clone(),
		influences: Array.isArray(object.morphTargetInfluences) ? object.morphTargetInfluences.slice() : null,
	}
}

/**
 * Put a recorded transform on an object.
 *
 * @param {THREE.Object3D} object - The object
 * @param {object} transform - From `transformOf`
 */
function applyTransform(object, transform) {
	object.position.copy(transform.position)
	object.quaternion.copy(transform.quaternion)
	object.scale.copy(transform.scale)
	if (transform.influences && Array.isArray(object.morphTargetInfluences)) {
		transform.influences.forEach((weight, i) => { object.morphTargetInfluences[i] = weight })
	}
}

/**
 * Remember an object's transform as the model's own, before a tool first moves it. Only
 * the first call for an object counts, so a later one, made after a tool has moved it,
 * cannot take the moved transform for the model's; every tool that calls is noted.
 *
 * @param {THREE.Object3D} object - The object
 * @param {string} tool - Which tool moves it, one of MOVED_BY
 */
export function rememberOwnTransform(object, tool) {
	if (!object?.position) {
		return
	}
	if (!ownTransforms.has(object)) {
		ownTransforms.set(object, transformOf(object))
		recordedBy.set(object, new Set())
	}
	recordedBy.get(object).add(tool)
}

/**
 * The transform the model gives an object, if a tool recorded one.
 *
 * @param {THREE.Object3D} object - The object
 * @return {?object} Its own position, quaternion, scale and morph weights, or null; not
 *   to be changed
 */
export function ownTransformOf(object) {
	return ownTransforms.get(object) ?? null
}

/**
 * Run `fn` with every recorded object under `root` where the model puts it, then put
 * each back where the viewer had it. World matrices are brought up to date both ways,
 * since exporters and bounding boxes read them. Synchronous, so nothing else can draw
 * the model in between.
 *
 * @param {THREE.Object3D} root - The model
 * @param {Function} fn - Typically a single `renderer.render()`
 * @param {object} [options] - Options
 * @param {?string[]} [options.movedBy] - Undo only what these MOVED_BY tools moved;
 *   every tool's when omitted
 * @return {*} What `fn` returns
 */
export function withOwnTransforms(root, fn, { movedBy = null } = {}) {
	const moved = []
	root.traverse((child) => {
		const own = ownTransforms.get(child)
		if (own && (!movedBy || movedBy.some((tool) => recordedBy.get(child).has(tool)))) {
			moved.push([child, transformOf(child)])
			applyTransform(child, own)
		}
	})
	if (moved.length === 0) {
		return fn()
	}
	try {
		root.updateWorldMatrix(true, true)
		return fn()
	} finally {
		for (const [child, shown] of moved) {
			applyTransform(child, shown)
		}
		root.updateWorldMatrix(true, true)
	}
}

/**
 * Run `fn` with a model's exploded parts together, and nothing else a tool moved
 * undone: what the model is, as placed and posed, for an export or a measurement.
 *
 * @param {THREE.Object3D} root - The model
 * @param {Function} fn - The call
 * @return {*} What `fn` returns
 */
export function withPartsTogether(root, fn) {
	return withOwnTransforms(root, fn, { movedBy: [MOVED_BY.exploded] })
}
