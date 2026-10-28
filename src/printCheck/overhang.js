/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Which surfaces of a model overhang: those facing down more steeply than a chosen angle.
 *
 * The angle is measured from vertical, as slicers measure it: 0° is a vertical wall and
 * 90° a flat ceiling. Each triangle is judged by its own flat normal, so a model's smooth
 * normals do not change the answer, and the shader that shades overhangs uses the same
 * rule on the GPU (`createOverhangMaterial`). A surface resting on the bed is printed on
 * the bed, not in the air, and is left out.
 */

import * as THREE from 'three'

const DEGREES = 180 / Math.PI

/**
 * How far a surface leans past vertical toward facing straight down.
 *
 * @param {THREE.Vector3} normal - The surface's unit normal, in world space
 * @param {THREE.Vector3} up - The bed's up axis, a unit vector
 * @return {?number} Degrees from vertical (0 a wall, 90 a ceiling), or null when the
 *   surface faces up
 */
export function overhangAngleDeg(normal, up) {
	const down = -normal.dot(up)
	// A wall (down = 0) leans 0° past vertical; only a surface facing up has no angle
	if (down < 0) {
		return null
	}
	return Math.asin(Math.min(1, down)) * DEGREES
}

/**
 * The overhanging area of some meshes and their whole area, in squared scene units.
 *
 * @param {THREE.Mesh[]} meshes - The meshes, with world matrices up to date
 * @param {THREE.Vector3} up - The bed's up axis
 * @param {number} thresholdDeg - Steeper than this is overhang
 * @param {number} bedHeight - The bed's height along `up`, in scene units
 * @param {number} bedEpsilon - A triangle no higher than `bedHeight + bedEpsilon` rests on the bed
 * @return {{overhangArea: number, totalArea: number}} The two areas
 */
export function overhangShare(meshes, up, thresholdDeg, bedHeight, bedEpsilon) {
	const a = new THREE.Vector3()
	const b = new THREE.Vector3()
	const c = new THREE.Vector3()
	const ab = new THREE.Vector3()
	const ac = new THREE.Vector3()
	const normal = new THREE.Vector3()
	let overhangArea = 0
	let totalArea = 0

	for (const mesh of meshes) {
		const position = mesh.geometry?.attributes?.position
		if (!position) {
			continue
		}
		const index = mesh.geometry.index
		const triangles = (index ? index.count : position.count) / 3
		const matrix = mesh.matrixWorld

		for (let t = 0; t < triangles; t++) {
			const i = t * 3
			a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix)
			b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(matrix)
			c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(matrix)
			normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a))
			const twiceArea = normal.length()
			// Degenerate, or a broken exporter's NaN: no area, no direction
			if (!(twiceArea > 1e-12) || !Number.isFinite(twiceArea)) {
				continue
			}
			const area = twiceArea / 2
			totalArea += area

			const angle = overhangAngleDeg(normal.divideScalar(twiceArea), up)
			if (angle === null || angle <= thresholdDeg) {
				continue
			}
			const highest = Math.max(a.dot(up), b.dot(up), c.dot(up))
			if (highest <= bedHeight + bedEpsilon) {
				continue
			}
			overhangArea += area
		}
	}
	return { overhangArea, totalArea }
}

const VERTEX_SHADER = `
#include <common>
#include <clipping_planes_pars_vertex>
varying vec3 vWorldPosition;
void main() {
	vec4 worldPosition = modelMatrix * vec4(position, 1.0);
	vWorldPosition = worldPosition.xyz;
	vec4 mvPosition = viewMatrix * worldPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <clipping_planes_vertex>
}
`

const FRAGMENT_SHADER = `
#include <common>
#include <clipping_planes_pars_fragment>
uniform vec3 uUp;
uniform float uCosLimit;
uniform float uBedHeight;
uniform float uBedEpsilon;
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vWorldPosition;
void main() {
	#include <clipping_planes_fragment>
	// The triangle's own flat normal, facing the camera: the side drawn is the outside
	vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
	if (dot(normal, -uUp) <= uCosLimit) discard;
	if (dot(vWorldPosition, uUp) <= uBedHeight + uBedEpsilon) discard;
	gl_FragColor = vec4(uColor, uOpacity);
}
`

/**
 * The material that shades a mesh's overhangs: drawn over the model, only where it
 * overhangs. Changing the angle is a uniform, not a new material.
 *
 * @param {object} options - Options
 * @param {THREE.Vector3} options.up - The bed's up axis
 * @param {number} options.thresholdDeg - Steeper than this is overhang
 * @param {number} options.bedHeight - The bed's height along `up`, in scene units
 * @param {number} options.bedEpsilon - How close to the bed counts as resting on it
 * @param {?THREE.Plane[]} [options.clippingPlanes] - The model's open cut, if any
 * @return {THREE.ShaderMaterial} The material
 */
export function createOverhangMaterial({ up, thresholdDeg, bedHeight, bedEpsilon, clippingPlanes = null }) {
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uUp: { value: up.clone() },
			uCosLimit: { value: Math.cos((90 - thresholdDeg) / DEGREES) },
			uBedHeight: { value: bedHeight },
			uBedEpsilon: { value: bedEpsilon },
			uColor: { value: new THREE.Color(0xe53935) },
			uOpacity: { value: 0.6 },
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -1,
		polygonOffsetUnits: -1,
	})
	if (clippingPlanes?.length) {
		material.clippingPlanes = clippingPlanes
		material.clipping = true
	}
	return material
}

/**
 * Point an overhang material at a new angle.
 *
 * @param {THREE.ShaderMaterial} material - From createOverhangMaterial
 * @param {number} thresholdDeg - Steeper than this is overhang
 */
export function setOverhangThreshold(material, thresholdDeg) {
	material.uniforms.uCosLimit.value = Math.cos((90 - thresholdDeg) / DEGREES)
}
