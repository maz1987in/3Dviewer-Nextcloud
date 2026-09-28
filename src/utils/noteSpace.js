/**
 * Converting note points between the scene and the model.
 *
 * Notes are stored relative to the model root, not the scene: the viewer moves the model
 * on every load to centre it on the grid, and a scene position is only right for as long
 * as that placement never changes. A model-space point is right wherever the model is put.
 */

import * as THREE from 'three'

/**
 * @param {{x: number, y: number, z: number}} v - any point-like object
 * @return {{x: number, y: number, z: number}} a plain, serialisable copy
 */
export function toPlain(v) {
	return { x: v.x, y: v.y, z: v.z }
}

/**
 * @param {{x: number, y: number, z: number}} point - scene (world) position
 * @param {THREE.Object3D} modelRoot - the loaded model's root
 * @return {{x: number, y: number, z: number}} the same position in model space
 */
export function sceneToModel(point, modelRoot) {
	modelRoot.updateMatrixWorld(true)
	return toPlain(modelRoot.worldToLocal(new THREE.Vector3(point.x, point.y, point.z)))
}

/**
 * @param {{x: number, y: number, z: number}} point - model-space position
 * @param {THREE.Object3D} modelRoot - the loaded model's root
 * @return {THREE.Vector3} the same position in the scene
 */
export function modelToScene(point, modelRoot) {
	modelRoot.updateMatrixWorld(true)
	return modelRoot.localToWorld(new THREE.Vector3(point.x, point.y, point.z))
}

/**
 * @param {{x: number, y: number, z: number}} point - a stored note point
 * @param {'model'|'scene'} space - the space it was stored in
 * @param {?THREE.Object3D} modelRoot - the loaded model's root, if any
 * @return {THREE.Vector3} the position to draw at
 */
export function pointToScene(point, space, modelRoot) {
	if (space === 'scene' || !modelRoot) {
		return new THREE.Vector3(point.x, point.y, point.z)
	}
	return modelToScene(point, modelRoot)
}
