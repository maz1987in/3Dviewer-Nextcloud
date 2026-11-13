/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The parts of a model: the tree the Parts panel shows, and what hiding and isolating a
 * part does to the scene.
 *
 * The tree is read straight from the model's own scene graph and is never built in full.
 * A row's children are made when it is expanded (`childrenOf`), the number of parts under
 * every node is counted once in a single pass, and a chain of nodes that each hold exactly
 * one other (a CAD export's "Assembly > Sub-assembly > Body > Mesh") is one row, so the
 * tree starts at the first place there is a choice.
 *
 * Hiding sets `visible` on the part's own node, so it stays hidden through render modes
 * (which change materials) and Exploded view (which changes positions), and it is recorded
 * with the other parts of the model a viewer tool hides (viewerHidden.js): a thumbnail and
 * an export show the whole model.
 *
 * Plain module, no Vue and no DOM.
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { ownMaterialOf } from './materialStandIns.js'
import { setHiddenByViewer } from './viewerHidden.js'

/** How many matches a search lists: more would be a list to scroll, not an answer. */
export const SEARCH_LIMIT = 300

/** Names a loader or an exporter gives what had none: they say nothing about the part. */
// glTF's loader numbers the meshes a file does not name, "mesh_3", and "mesh_3_instance_0" for a node
const GENERIC_NAME = /^(?:scene|root|rootnode|group|object3d|object|node|mesh|geometry|default|defaultobject|sketchfab_model)[\s._-]*\d*(?:_instance_\d+)?$/i

/**
 * @param {string} name - A node's name
 * @return {boolean} Whether it tells one part from another
 */
export function isGenericName(name) {
	const trimmed = typeof name === 'string' ? name.trim() : ''
	return trimmed === '' || GENERIC_NAME.test(trimmed)
}

/**
 * @param {THREE.Object3D} object - A node
 * @return {boolean} Whether it draws something: a mesh, a line or points
 */
export function isRenderable(object) {
	return Boolean(object.isMesh || object.isLine || object.isPoints)
}

/**
 * The name of the first of a mesh's materials that has one worth showing.
 *
 * @param {THREE.Object3D} object - A node
 * @return {string} It, or an empty string
 */
function materialName(object) {
	if (!object.isMesh) {
		return ''
	}
	const own = ownMaterialOf(object)
	for (const material of Array.isArray(own) ? own : [own]) {
		if (material && !isGenericName(material.name)) {
			return material.name.trim()
		}
	}
	return ''
}

/**
 * What to call one node of the model.
 *
 * Its own name when that tells it apart; an IFC element's name or, failing that, its IFC
 * type; otherwise the kind of node and its place among its siblings ("Mesh 3"), and for a
 * mesh the name of its material beside it.
 *
 * @param {THREE.Object3D} object - The node
 * @param {number} index - Its place among its siblings, from 1
 * @return {{label: string, secondary: string, named: boolean}} `named` is false for a
 *   made-up label, which a row made of several nodes passes over for a real one
 */
export function partLabel(object, index) {
	const name = typeof object.name === 'string' ? object.name.trim() : ''
	const ifc = object.userData?.ifc
	if (ifc) {
		const label = isGenericName(ifc.name) ? (ifc.typeLabel || '') : ifc.name.trim()
		if (label) {
			return { label, secondary: ifc.typeLabel && label !== ifc.typeLabel ? ifc.typeLabel : '', named: true }
		}
	}
	if (!isGenericName(name)) {
		return { label: name, secondary: '', named: true }
	}
	if (isRenderable(object)) {
		return { label: t('threedviewer', 'Mesh {index}', { index }), secondary: materialName(object), named: false }
	}
	return { label: t('threedviewer', 'Group {index}', { index }), secondary: '', named: false }
}

/**
 * The label of a row that stands for a chain of nodes: the real names along the chain,
 * outermost first, so "Assembly › Bolt" says where the bolt is without a tree to open.
 *
 * @param {{label: string, secondary: string, named: boolean}[]} labels - One per node of the chain
 * @return {{label: string, secondary: string}} The row's
 */
export function chainLabel(labels) {
	const named = labels.filter((entry) => entry.named).map((entry) => entry.label)
	const distinct = named.filter((label, i) => label !== named[i - 1])
	if (distinct.length === 0) {
		return { label: labels[0].label, secondary: labels[labels.length - 1].secondary || labels[0].secondary }
	}
	const shown = distinct.length > 3 ? [distinct[0], '…', distinct[distinct.length - 1]] : distinct
	const last = labels[labels.length - 1]
	return { label: shown.join(' › '), secondary: last.secondary }
}

/**
 * @typedef {object} PartRecord
 * @property {string} id - The outermost node's uuid
 * @property {THREE.Object3D} head - The outermost node of the row's chain
 * @property {THREE.Object3D[]} chain - Every node the row stands for, outermost first
 * @property {THREE.Object3D} tail - The innermost; its children are the row's children
 * @property {string} label - What the row is called
 * @property {string} secondary - A second line of text, or an empty string
 * @property {PartRecord|null} parent - The row it is under, or null for a first row
 * @property {number} depth - 0 for the first rows
 * @property {number} parts - How many meshes, lines and points the row holds
 * @property {boolean} expandable - Whether it has children to show
 */

/**
 * The tree of a model's parts.
 *
 * @param {THREE.Object3D} root - The model
 * @return {object} See the methods below
 */
export function createPartsModel(root) {
	// node -> how many renderable nodes it holds, itself included; a node that holds none
	// (a light, a camera, an empty group) is not a part
	const counts = new Map()
	// node -> its row's record, made when the row first is needed
	const records = new Map()
	const children = new Map()

	const count = (node) => {
		// Iterative: a deep assembly must not overflow the call stack
		const stack = [[node, 0]]
		while (stack.length > 0) {
			const frame = stack[stack.length - 1]
			const [current, next] = frame
			if (next < current.children.length) {
				frame[1] += 1
				stack.push([current.children[next], 0])
			} else {
				let total = isRenderable(current) ? 1 : 0
				for (const child of current.children) {
					total += counts.get(child) ?? 0
				}
				counts.set(current, total)
				stack.pop()
			}
		}
	}
	count(root)

	const partsIn = (node) => counts.get(node) ?? 0
	const partChildren = (node) => node.children.filter((child) => partsIn(child) > 0)

	// The rows begin below the first node that has more than one part under it: a model
	// exported as Scene > Group > [parts] opens on the parts, not on two single-child rows
	let container = root
	for (;;) {
		const only = partChildren(container)
		if (only.length === 1 && partChildren(only[0]).length > 0) {
			container = only[0]
		} else {
			break
		}
	}

	const makeRecord = (node, index, parent) => {
		const chain = [node]
		let tail = node
		for (let next = partChildren(tail); next.length === 1; next = partChildren(tail)) {
			tail = next[0]
			chain.push(tail)
		}
		const labelled = chainLabel(chain.map((link, i) => partLabel(link, i === 0 ? index : 1)))
		const record = {
			id: node.uuid,
			head: node,
			chain,
			tail,
			label: labelled.label,
			secondary: labelled.secondary,
			parent,
			depth: parent ? parent.depth + 1 : 0,
			parts: partsIn(node),
			expandable: partChildren(tail).length > 0,
		}
		records.set(node.uuid, record)
		return record
	}

	const listChildren = (node, parent) => partChildren(node).map((child, i) => makeRecord(child, i + 1, parent))

	let top = null

	return {
		root,

		/** @return {PartRecord[]} The first rows */
		topLevel() {
			if (!top) {
				top = listChildren(container, null)
			}
			return top
		},

		/**
		 * @param {PartRecord} record - A row
		 * @return {PartRecord[]} Its children, made on the first call
		 */
		childrenOf(record) {
			if (!children.has(record.id)) {
				children.set(record.id, record.expandable ? listChildren(record.tail, record) : [])
			}
			return children.get(record.id)
		},

		/**
		 * @param {string} id - A row's id
		 * @return {?PartRecord} The row, if it has been made
		 */
		get(id) {
			return records.get(id) ?? null
		},

		/** @return {number} How many parts the model has */
		get parts() {
			return partsIn(root)
		},

		/**
		 * The row a node belongs to: the one whose chain holds it, or whose subtree does.
		 *
		 * @param {THREE.Object3D} object - A node, typically a picked mesh
		 * @return {?PartRecord[]} Rows from the first level down to the one the node is in;
		 *   null for a node that is no part of this model
		 */
		pathTo(object) {
			const ancestors = new Set()
			for (let node = object; node; node = node.parent) {
				ancestors.add(node)
			}
			if (!ancestors.has(root)) {
				return null
			}
			const path = []
			let level = this.topLevel()
			while (level.length > 0) {
				const next = level.find((record) => ancestors.has(record.head))
				if (!next) {
					break
				}
				path.push(next)
				if (next.chain.includes(object) || !ancestors.has(next.tail)) {
					break
				}
				level = this.childrenOf(next)
			}
			return path.length > 0 ? path : null
		},

		/**
		 * Rows whose name matches, anywhere in the tree, as a flat list.
		 *
		 * @param {string} query - What to look for, in any case
		 * @param {number} [limit] - How many to stop at
		 * @return {{matches: PartRecord[], truncated: boolean}}
		 */
		search(query, limit = SEARCH_LIMIT) {
			const needle = query.trim().toLowerCase()
			const matches = []
			if (needle === '') {
				return { matches, truncated: false }
			}
			const stack = [...this.topLevel()].reverse()
			while (stack.length > 0) {
				const record = stack.pop()
				if (record.label.toLowerCase().includes(needle) || record.secondary.toLowerCase().includes(needle)) {
					if (matches.length === limit) {
						return { matches, truncated: true }
					}
					matches.push(record)
				}
				stack.push(...[...this.childrenOf(record)].reverse())
			}
			return { matches, truncated: false }
		},

		/**
		 * Every renderable node a row stands for, to draw or measure.
		 *
		 * @param {PartRecord} record - A row
		 * @return {THREE.Object3D[]} Its meshes, lines and points
		 */
		renderablesOf(record) {
			const found = []
			record.head.traverse((node) => {
				if (isRenderable(node)) {
					found.push(node)
				}
			})
			return found
		},
	}
}

/**
 * @param {PartRecord} record - A row
 * @return {?object} The `userData.ifc` of the IFC element a row stands for, if it is one
 */
export function ifcElementOf(record) {
	// From the innermost: a storey that holds one element is a row with the element in it,
	// and it is the element that was chosen
	for (let i = record.chain.length - 1; i >= 0; i--) {
		const ifc = record.chain[i].userData?.ifc
		if (ifc && Number.isFinite(ifc.expressID)) {
			return ifc
		}
	}
	return null
}

/**
 * What hiding and isolating do to a model.
 *
 * Every change goes through `setVisible`, which remembers what the model itself had a
 * node's visibility as the first time it is changed, so showing everything puts back what
 * the file asked for and not simply "visible": FreeCAD, for one, stores which bodies were
 * hidden when the file was saved.
 *
 * @param {object} model - From `createPartsModel`
 * @return {object} See the methods below
 */
export function createPartsVisibility(model) {
	// node -> its visibility before this tool first changed it
	const own = new Map()
	let isolated = null
	// How many exports have everything shown, and the nodes put back after the last
	let suspended = 0
	let generation = 0
	let hiddenByExport = []

	const setVisible = (node, visible) => {
		if (!own.has(node)) {
			own.set(node, node.visible)
		}
		setHiddenByViewer(node, !visible)
	}

	const isHidden = (record) => !record.chain.every((node) => node.visible)
	const isCoveredByAncestor = (record) => {
		for (let ancestor = record.parent; ancestor; ancestor = ancestor.parent) {
			if (isHidden(ancestor)) {
				return true
			}
		}
		return false
	}

	const restoreOwn = (node) => {
		const was = own.get(node)
		setHiddenByViewer(node, false)
		node.visible = was
	}

	return {
		isHidden,

		/**
		 * @param {PartRecord} record - A row
		 * @return {boolean} Whether a row above it is hidden, which hides it too
		 */
		isCoveredByAncestor,

		/** @return {?string} The row that is isolated */
		get isolatedId() {
			return isolated ? isolated.id : null
		},

		/** @return {number} How many nodes the user has hidden */
		get hiddenCount() {
			let hidden = 0
			own.forEach((was, node) => {
				if (!node.visible && was) {
					hidden += 1
				}
			})
			return hidden
		},

		/**
		 * Hide a row, or show it again. A row under a hidden one is not shown by itself:
		 * showing it would mean showing the row above, and with it everything else in it.
		 *
		 * @param {PartRecord} record - A row
		 * @param {boolean} hidden - The state to put it in
		 * @return {boolean} Whether anything changed
		 */
		setHidden(record, hidden) {
			if (hidden === isHidden(record) || isCoveredByAncestor(record)) {
				return false
			}
			if (hidden) {
				setVisible(record.head, false)
			} else {
				record.chain.forEach((node) => setVisible(node, true))
			}
			return true
		},

		/**
		 * Show only a row: everything beside it, and beside the rows it is inside, is
		 * hidden. Isolating another row first puts back what was showing before.
		 *
		 * @param {PartRecord} record - The row to isolate
		 */
		isolate(record) {
			if (isolated) {
				this.unisolate()
			}
			const undo = new Map()
			const touch = (node, visible) => {
				if (!undo.has(node)) {
					undo.set(node, node.visible)
				}
				setVisible(node, visible)
			}
			isolated = { id: record.id, undo }

			for (let row = record; ; row = row.parent) {
				const siblings = row.parent ? model.childrenOf(row.parent) : model.topLevel()
				siblings.forEach((sibling) => {
					if (sibling !== row) {
						touch(sibling.head, false)
					}
				})
				if (!row.parent) {
					break
				}
				row.parent.chain.forEach((node) => touch(node, true))
			}
			record.chain.forEach((node) => touch(node, true))
			// Whatever the user hid inside it comes back
			record.head.traverse((node) => {
				if (own.has(node) && !node.visible && own.get(node)) {
					touch(node, true)
				}
			})
		},

		/** Put back what was showing before the last `isolate`. */
		unisolate() {
			if (!isolated) {
				return
			}
			isolated.undo.forEach((was, node) => {
				setVisible(node, was)
			})
			isolated = null
		},

		/** Show everything the user hid, and what the model hid itself as it was. */
		showAll() {
			own.forEach((was, node) => restoreOwn(node))
			own.clear()
			isolated = null
		},

		/**
		 * Show everything for a while (an export, say) without losing what is hidden;
		 * `resume` hides it again. Counted, so two exports at once both finish first.
		 *
		 * @return {number} The token to hand `resume`
		 */
		suspend() {
			if (suspended++ === 0) {
				hiddenByExport = []
				own.forEach((was, node) => {
					if (!node.visible && was) {
						hiddenByExport.push(node)
						node.visible = true
					}
				})
			}
			return generation
		},

		/**
		 * End one suspension. A token from before the model was replaced does nothing.
		 *
		 * @param {number} token - What `suspend` returned
		 */
		resume(token) {
			if (token !== generation || suspended === 0) {
				return
			}
			if (--suspended === 0) {
				hiddenByExport.forEach((node) => {
					node.visible = false
				})
				hiddenByExport = []
			}
		},

		/** Put everything back as the model had it, and forget it. */
		dispose() {
			own.forEach((was, node) => restoreOwn(node))
			own.clear()
			isolated = null
			suspended = 0
			hiddenByExport = []
			generation++
		},
	}
}
