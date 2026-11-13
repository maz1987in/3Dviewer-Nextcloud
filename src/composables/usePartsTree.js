/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Parts panel composable
 *
 * The state behind the Parts panel: which rows of the model's tree are showing, which
 * part is chosen, what is hidden, and what the chosen part is (for an IFC element, its
 * properties, read when it is chosen and not before). The tree itself, and what hiding
 * and isolating do to the scene, are in utils/partsTree.js; the tint on the chosen part
 * is utils/partHighlight.js.
 *
 * Everything the panel reads is plain data (`rows`, `selection`, `summary`). The scene's
 * own objects stay out of reactive state, where Vue would wrap them.
 */

import { computed, reactive, ref, shallowRef } from 'vue'
import { Box3, MathUtils, Vector3 } from 'three'
import { logger } from '../utils/logger.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { clearRaycastCache, isHelperMesh, raycastObject } from '../utils/modelScaleUtils.js'
import { createPartHighlight } from '../utils/partHighlight.js'
import { createPartsModel, createPartsVisibility, ifcElementOf, isRenderable } from '../utils/partsTree.js'

/**
 * @param {THREE.Object3D} node - A node
 * @param {THREE.Object3D} root - A node it may be under
 * @return {boolean} Whether `root` is `node` or above it
 */
function isInside(node, root) {
	for (let current = node; current; current = current.parent) {
		if (current === root) {
			return true
		}
	}
	return false
}

/** How far a pointer may move between going down and coming up and still be a click. */
const CLICK_SLOP_PX = 5

/**
 * @param {object} [options] - What the viewer supplies
 * @param {() => {camera: THREE.Camera, controls: object}} [options.camera] - The camera and
 *   its orbit controls, to move to a part
 * @param {(position: THREE.Vector3, target: THREE.Vector3, ms: number) => void} [options.animateCamera]
 *   - Moves the camera there, over a time
 * @param {() => ?Blob} [options.sourceFile] - The model's own file, to read an IFC
 *   element's properties from
 * @param {(expressID: number) => Promise<object>} [options.readIfcProperties] - Reads an
 *   IFC element's properties, in place of opening `sourceFile` (a test's)
 * @param {(box: THREE.Box3) => void} [options.zoomTo] - Moves the camera to a box, in place
 *   of the viewer's own way (a test's)
 * @return {object} The panel's API
 */
export function usePartsTree({ camera = null, animateCamera = null, sourceFile = null, readIfcProperties = null, zoomTo = null } = {}) {
	// Bumped when anything the rows or the summary show has changed
	const revision = ref(0)
	// Bumped when the model is replaced: a search is of one model, and hiding changes no match
	const modelRevision = ref(0)
	const expanded = shallowRef(new Set())
	const filter = ref('')
	const selectedId = ref(null)
	// Whether the list is on screen: a click on the viewport chooses a part only then
	const active = ref(false)
	const ifc = shallowRef({ id: null, state: 'idle', data: null })

	let model = null
	let visibility = null
	let highlight = null
	let sceneRef = null
	let pointerDown = null

	const touch = () => { revision.value += 1 }

	/**
	 * @param {PartRecord} record - A row
	 * @param {number} posInSet - Its place among its siblings, from 1
	 * @param {number} setSize - How many siblings it has
	 * @param {object} [extra] - Fields that replace the usual ones
	 * @return {object} What the panel draws of it, as plain data
	 */
	const describe = (record, posInSet, setSize, extra = {}) => ({
		id: record.id,
		label: record.label,
		secondary: record.secondary,
		level: record.depth + 1,
		posInSet,
		setSize,
		expandable: record.expandable,
		expanded: record.expandable && expanded.value.has(record.id),
		hidden: visibility.isHidden(record),
		covered: visibility.isCoveredByAncestor(record),
		selected: record.id === selectedId.value,
		isolated: record.id === visibility.isolatedId,
		parts: record.parts,
		...extra,
	})

	const searchResult = computed(() => {
		modelRevision.value
		return model && filter.value.trim() !== '' ? model.search(filter.value) : null
	})

	const rows = computed(() => {
		revision.value
		if (!model) {
			return []
		}
		if (searchResult.value) {
			const { matches } = searchResult.value
			return matches.map((record, i) => describe(record, i + 1, matches.length, {
				level: 1,
				expandable: false,
				expanded: false,
				// Where it is, since the tree is not shown
				path: pathLabel(record),
			}))
		}
		const out = []
		const walk = (siblings) => {
			siblings.forEach((record, i) => {
				out.push(describe(record, i + 1, siblings.length))
				if (record.expandable && expanded.value.has(record.id)) {
					walk(model.childrenOf(record))
				}
			})
		}
		walk(model.topLevel())
		return out
	})

	/**
	 * @param {PartRecord} record - A row
	 * @return {string} The rows it is inside, outermost first
	 */
	function pathLabel(record) {
		const names = []
		for (let row = record.parent; row; row = row.parent) {
			names.unshift(row.label)
		}
		return names.join(' › ')
	}

	const summary = computed(() => {
		revision.value
		return {
			loaded: model !== null,
			parts: model ? model.parts : 0,
			hidden: visibility ? visibility.hiddenCount : 0,
			isolated: visibility ? visibility.isolatedId !== null : false,
			searching: searchResult.value !== null,
			matches: searchResult.value ? searchResult.value.matches.length : 0,
			truncated: searchResult.value ? searchResult.value.truncated : false,
		}
	})

	const selection = computed(() => {
		revision.value
		const record = model && selectedId.value ? model.get(selectedId.value) : null
		if (!record) {
			return null
		}
		const element = ifcElementOf(record)
		return {
			id: record.id,
			label: record.label,
			secondary: record.secondary,
			kind: record.expandable ? 'group' : 'part',
			parts: record.parts,
			path: pathLabel(record),
			hidden: visibility.isHidden(record),
			covered: visibility.isCoveredByAncestor(record),
			isolated: record.id === visibility.isolatedId,
			ifc: element
				? {
					type: element.typeLabel || '',
					name: element.name || '',
					storey: element.storey || '',
					globalId: element.globalId || '',
					state: ifc.value.id === record.id ? ifc.value.state : 'idle',
					sets: ifc.value.id === record.id && ifc.value.data ? ifc.value.data.sets : [],
				}
				: null,
		}
	})

	const recordOf = (id) => (model && id ? model.get(id) : null)

	/** Re-tint the chosen part, after it or what covers it has changed. */
	const refreshHighlight = () => {
		highlight?.refresh()
		clearRaycastCache()
	}

	// An IFC element's properties, from the model's own file, which is opened the first
	// time one is asked for and freed when the model goes
	let opening = null
	const readProperties = readIfcProperties ?? (async (expressID) => {
		if (!opening) {
			const file = sourceFile ? sourceFile() : null
			if (!file) {
				throw new Error('There is no IFC file to read properties from')
			}
			opening = import('../loaders/ifcProperties.js').then(({ openIfcProperties }) => openIfcProperties(file))
			opening.catch(() => { opening = null })
		}
		return (await opening).read(expressID)
	})
	const closeProperties = () => {
		const pending = opening
		opening = null
		pending?.then((reader) => reader.dispose(), () => {})
	}

	/**
	 * Move the camera to a box, keeping the direction it looks from. Reset View keeps
	 * going back to where the whole model was framed.
	 *
	 * @param {THREE.Box3} box - The part, in the scene
	 */
	const moveCameraTo = (box) => {
		const view = camera ? camera() : null
		if (!view?.camera || !view.controls || !animateCamera) {
			return
		}
		const { camera: cam, controls } = view
		const center = box.getCenter(new Vector3())
		const size = box.getSize(new Vector3())
		const radius = Math.max(size.length() / 2, 1e-6)
		const direction = cam.position.clone().sub(controls.target)
		if (direction.lengthSq() < 1e-12) {
			direction.set(1, 1, 1)
		}
		direction.normalize()
		let distance
		if (cam.isOrthographicCamera) {
			distance = Math.max(cam.position.distanceTo(controls.target), radius * 2)
			cam.zoom = VIEWER_CONFIG.camera.orthographic.frustumSize / (Math.max(size.x, size.y, size.z, 1e-6) * 1.3)
		} else {
			distance = (radius / Math.sin(MathUtils.degToRad(cam.fov) / 2)) * 1.2
		}
		// The rest of the model stays inside the clipping range
		cam.near = Math.min(cam.near, distance / 100)
		cam.far = Math.max(cam.far, distance * 100)
		cam.updateProjectionMatrix()
		animateCamera(center.clone().addScaledVector(direction, distance), center, 400)
	}

	const loadIfc = async (record) => {
		const element = ifcElementOf(record)
		if (!element || !(readIfcProperties || sourceFile)) {
			ifc.value = { id: record?.id ?? null, state: 'none', data: null }
			return
		}
		ifc.value = { id: record.id, state: 'loading', data: null }
		try {
			const data = await readProperties(element.expressID)
			if (selectedId.value === record.id) {
				ifc.value = { id: record.id, state: data && data.sets.length > 0 ? 'ready' : 'none', data }
				touch()
			}
		} catch (error) {
			logger.warn('usePartsTree', 'Reading IFC properties failed', error)
			if (selectedId.value === record.id) {
				ifc.value = { id: record.id, state: 'error', data: null }
				touch()
			}
		}
	}

	/**
	 * Choose a part, or none.
	 *
	 * @param {?string} id - A row's id
	 */
	const select = (id) => {
		const record = recordOf(id)
		selectedId.value = record ? record.id : null
		if (!record) {
			highlight?.clear()
			ifc.value = { id: null, state: 'idle', data: null }
			touch()
			return
		}
		const meshes = model.renderablesOf(record)
		highlight.show(meshes)
		touch()
		loadIfc(record)
	}

	/**
	 * Open the rows above a part so its own is in the list.
	 *
	 * @param {PartRecord[]} path - Rows from the first level to the part
	 */
	const reveal = (path) => {
		const next = new Set(expanded.value)
		path.slice(0, -1).forEach((record) => next.add(record.id))
		expanded.value = next
	}

	const toggleExpanded = (id, open) => {
		const record = recordOf(id)
		if (!record || !record.expandable) {
			return
		}
		const next = new Set(expanded.value)
		const want = open === undefined ? !next.has(id) : open
		if (want) {
			next.add(id)
		} else {
			next.delete(id)
		}
		expanded.value = next
	}

	const toggleHidden = (id) => {
		const record = recordOf(id)
		if (record && visibility.setHidden(record, !visibility.isHidden(record))) {
			refreshHighlight()
			touch()
		}
	}

	const isolate = (id) => {
		const record = recordOf(id)
		if (!record) {
			return
		}
		if (visibility.isolatedId === record.id) {
			visibility.unisolate()
		} else {
			visibility.isolate(record)
		}
		refreshHighlight()
		touch()
	}

	const showAll = () => {
		visibility?.showAll()
		refreshHighlight()
		touch()
	}

	const zoomToPart = (id) => {
		const record = recordOf(id)
		if (!record) {
			return
		}
		const box = new Box3()
		model.renderablesOf(record).forEach((node) => {
			if (node.visible) {
				box.expandByObject(node)
			}
		})
		if (!box.isEmpty()) {
			(zoomTo ?? moveCameraTo)(box)
		}
	}

	const setFilter = (text) => {
		filter.value = typeof text === 'string' ? text : ''
	}

	/**
	 * Take over a newly loaded model.
	 *
	 * @param {THREE.Object3D} root - The model
	 * @param {THREE.Scene} scene - Where the tint is drawn
	 */
	const init = (root, scene) => {
		clear()
		if (!root) {
			return
		}
		sceneRef = scene
		model = createPartsModel(root)
		visibility = createPartsVisibility(model)
		highlight = createPartHighlight(scene)
		// Collapsed, except that a model with a single first row opens on its children
		const first = model.topLevel()
		if (first.length === 1 && first[0].expandable) {
			expanded.value = new Set([first[0].id])
		}
		modelRevision.value += 1
		touch()
	}

	/** Forget the model, putting back whatever was hidden. */
	function clear() {
		closeProperties()
		highlight?.dispose()
		visibility?.dispose()
		highlight = null
		visibility = null
		model = null
		sceneRef = null
		selectedId.value = null
		expanded.value = new Set()
		filter.value = ''
		ifc.value = { id: null, state: 'idle', data: null }
		clearRaycastCache()
		modelRevision.value += 1
		touch()
	}

	/**
	 * A click on the viewport chooses the part under it, or none where there is none.
	 * A drag that ends over the model is the camera moving, not a choice.
	 *
	 * @param {PointerEvent} event - The press
	 */
	const notePointerDown = (event) => {
		pointerDown = { x: event.clientX, y: event.clientY }
	}

	/**
	 * @param {MouseEvent} event - The click
	 * @param {THREE.Camera} camera - The camera drawn through
	 * @return {boolean} Whether it was taken as a choice
	 */
	const handleClick = (event, camera) => {
		if (!model || !sceneRef || !camera) {
			return false
		}
		const start = pointerDown
		pointerDown = null
		if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) {
			return false
		}
		const hit = raycastObject(event, camera, sceneRef, {
			filterMesh: (mesh) => isRenderable(mesh) && !isHelperMesh(mesh) && isInside(mesh, model.root),
			recursive: false,
			useCache: false,
			maxDistance: Infinity,
		})
		const path = hit ? model.pathTo(hit) : null
		if (!path) {
			select(null)
			return true
		}
		reveal(path)
		select(path[path.length - 1].id)
		return true
	}

	/**
	 * @param {boolean} on - Whether the panel's list is on screen. When it goes, so does
	 *   the tint on the part that was chosen.
	 */
	const setActive = (on) => {
		active.value = on
		if (!on && selectedId.value) {
			select(null)
		}
	}

	/** @return {number} A token for `resume`; the parts are all shown until then */
	const suspend = () => (visibility ? visibility.suspend() : -1)

	/** @param {number} token - What `suspend` returned */
	const resume = (token) => {
		if (visibility) {
			visibility.resume(token)
		}
	}

	return reactive({
		rows,
		summary,
		selection,
		filter,
		selectedId,
		active,
		setActive,
		init,
		clear,
		dispose: clear,
		select,
		toggleExpanded,
		toggleHidden,
		isolate,
		showAll,
		zoomToPart,
		setFilter,
		notePointerDown,
		handleClick,
		suspend,
		resume,
	})
}
