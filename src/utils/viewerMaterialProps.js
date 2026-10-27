/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Material properties a viewer tool has changed, and the values the model gave them.
 *
 * Some tools change a property on the model's own materials rather than swapping the
 * material: Wireframe sets `wireframe`. Each change goes through `setForViewer`, which
 * remembers the material's own value the first time, and `restoreOwn` puts that value
 * back, which is not always the default: a file can ship a wireframe material. Anything
 * that must see the model as it is renders inside `withOwnMaterialProps`.
 *
 * Plain module, no Vue and no DOM: the thumbnail renderer that reads it also runs in a
 * Web Worker.
 */

import { ownMaterialOf } from './materialStandIns.js'

// material -> Map(property -> the material's own value)
const ownValues = new WeakMap()

/**
 * A copy of a property value that a later change cannot reach: a Color is changed in
 * place, so it is cloned. Other values (flags, numbers) are kept as they are.
 *
 * @param {*} value - The value
 * @return {*} A copy
 */
const snapshot = (value) => (value?.isColor ? value.clone() : value)

/**
 * Put a value on a material property, in place for a Color, so a reference to the
 * material's Color stays valid.
 *
 * @param {THREE.Material} material - The material
 * @param {string} property - The property
 * @param {*} value - The value
 */
function assign(material, property, value) {
	if (material[property]?.isColor && value?.isColor) {
		material[property].copy(value)
	} else {
		material[property] = value
	}
}

/**
 * Give a material property a viewer tool's value, remembering the material's own value
 * the first time.
 *
 * @param {THREE.Material} material - The material
 * @param {string} property - The property, such as `wireframe`
 * @param {*} value - What the tool shows
 */
export function setForViewer(material, property, value) {
	if (!material) {
		return
	}
	let own = ownValues.get(material)
	if (!own) {
		own = new Map()
		ownValues.set(material, own)
	}
	if (!own.has(property)) {
		own.set(property, snapshot(material[property]))
	}
	assign(material, property, value)
}

/**
 * Give a material property its own value back and forget that a tool changed it.
 *
 * @param {THREE.Material} material - The material
 * @param {string} property - The property
 */
export function restoreOwn(material, property) {
	const own = material && ownValues.get(material)
	if (!own || !own.has(property)) {
		return
	}
	assign(material, property, own.get(property))
	own.delete(property)
	if (own.size === 0) {
		ownValues.delete(material)
	}
}

/**
 * The value the model gave a material property, whether or not a tool changed it.
 *
 * @param {THREE.Material} material - The material
 * @param {string} property - The property
 * @return {*} Its own value
 */
export function ownValueOf(material, property) {
	const own = ownValues.get(material)
	return own && own.has(property) ? own.get(property) : material[property]
}

/**
 * The materials of an object, as a list.
 *
 * @param {THREE.Material|THREE.Material[]|undefined} material - What the object has
 * @return {THREE.Material[]} Its materials
 */
const listOf = (material) => (Array.isArray(material) ? material : material ? [material] : [])

/**
 * Switch the viewer's Wireframe on or off for a model. Its own materials take the
 * change through the registry, so off gives each its own value back, and a render
 * mode's stand-ins showing in their place follow them.
 *
 * @param {THREE.Object3D} root - The model
 * @param {boolean} on - True for wireframe
 */
export function setViewerWireframe(root, on) {
	root.traverse((child) => {
		if (!child.isMesh || !child.material) {
			return
		}
		const own = listOf(ownMaterialOf(child))
		for (const material of own) {
			if (on) {
				setForViewer(material, 'wireframe', true)
			} else {
				restoreOwn(material, 'wireframe')
			}
		}
		// Stand-ins line up with the materials they stand in for
		listOf(child.material).forEach((shown, i) => {
			if (shown && own[i] && shown !== own[i]) {
				shown.wireframe = own[i].wireframe
			}
		})
	})
}

/**
 * Run `fn` with every material under `root` showing its own property values, then put
 * back what the viewer showed. A material shared by several objects is changed once.
 * Synchronous, so nothing else can draw the model in between.
 *
 * @param {THREE.Object3D} root - The model
 * @param {Function} fn - Typically a single `renderer.render()`
 * @return {*} What `fn` returns
 */
export function withOwnMaterialProps(root, fn) {
	const seen = new Set()
	const shown = []
	root.traverse((child) => {
		for (const material of listOf(child.material)) {
			const own = ownValues.get(material)
			if (!own || seen.has(material)) {
				continue
			}
			seen.add(material)
			for (const [property, value] of own) {
				shown.push([material, property, snapshot(material[property])])
				assign(material, property, value)
			}
		}
	})
	try {
		return fn()
	} finally {
		for (const [material, property, value] of shown) {
			assign(material, property, value)
		}
	}
}
