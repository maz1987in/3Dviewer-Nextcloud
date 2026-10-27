/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Where the model puts each object a viewer tool moves.
 *
 * Exploded view moves a model's parts apart, the transform gizmo moves, turns and
 * stretches the whole model. A tool that moves an object records its
 * own transform (position, rotation and scale, and morph target weights) with
 * `rememberOwnTransform` before it first moves it, and anything that must see the model
 * as it is runs inside `withOwnTransforms`, which puts every recorded object back where
 * the model puts it for one synchronous call.
 *
 * Plain module, no Vue and no DOM: the thumbnail renderer that reads it also runs in a
 * Web Worker.
 */

// object -> { position, quaternion, scale, influences }
const ownTransforms = new WeakMap()

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
 * cannot take the moved transform for the model's.
 *
 * @param {THREE.Object3D} object - The object
 */
export function rememberOwnTransform(object) {
	if (object?.position && !ownTransforms.has(object)) {
		ownTransforms.set(object, transformOf(object))
	}
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
 * @param {boolean} [options.keepRoot] - Leave `root` itself where the viewer has it (an
 *   export keeps the transform the gizmo gave the model)
 * @return {*} What `fn` returns
 */
export function withOwnTransforms(root, fn, { keepRoot = false } = {}) {
	const moved = []
	root.traverse((child) => {
		const own = ownTransforms.get(child)
		if (own && !(keepRoot && child === root)) {
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
