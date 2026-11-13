/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Name and group an IFC model's elements, after it has been drawn.
 *
 * The loader draws one mesh per (element x geometry), flat, and knows each element only by
 * its express ID. When the Parts panel is first shown, ifcProperties.js reads what the
 * file says about those elements (`describe`), and this gives them their names and types
 * and puts each under the storey, building or space that contains it. The groups carry no
 * transform, so nothing moves.
 *
 * Plain module, no DOM.
 */

import { Group } from 'three'

/**
 * @param {THREE.Object3D} root - The model, as the IFC loader made it
 * @param {{elements: Map, containerOf: Map, containers: Map}} description - From the
 *   properties reader's `describe`
 * @return {number} How many elements were named
 */
export function applyIfcStructure(root, description) {
	const { elements, containerOf, containers } = description
	// The drawn meshes of each element, in the order they were drawn
	const byElement = new Map()
	root.traverse((node) => {
		const expressID = node.userData?.ifc?.expressID
		if (node.isMesh && Number.isFinite(expressID) && node.userData.ifc.typeLabel === undefined) {
			if (!byElement.has(expressID)) {
				byElement.set(expressID, [])
			}
			byElement.get(expressID).push(node)
		}
	})

	const containerGroups = new Map()
	byElement.forEach((meshes, expressID) => {
		const info = elements.get(expressID) ?? { expressID, typeLabel: '', name: '', globalId: '' }
		const container = containerOf.get(expressID)
		const containerInfo = container === undefined ? null : containers.get(container)
		const label = info.name || info.typeLabel
		const parent = meshes[0].parent

		let node = meshes[0]
		if (meshes.length === 1) {
			Object.assign(node.userData.ifc, info)
		} else {
			node = new Group()
			node.userData.ifc = { ...info }
			meshes.forEach((mesh, i) => {
				mesh.name = `${label} (${i + 1}/${meshes.length})`
				node.add(mesh)
			})
		}
		if (containerInfo) {
			node.userData.ifc.storey = containerInfo.name
		}
		node.name = label || node.name

		if (!containerInfo) {
			if (node !== meshes[0]) {
				parent.add(node)
			}
			return
		}
		if (!containerGroups.has(container)) {
			const group = new Group()
			group.name = containerInfo.name
			group.userData.ifc = { ...containerInfo }
			containerGroups.set(container, group)
			parent.add(group)
		}
		containerGroups.get(container).add(node)
	})
	return byElement.size
}
