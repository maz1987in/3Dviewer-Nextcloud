/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What the Files sidebar's "3D" tab shows of a model, measured off the loaded model: its
 * size in the file's own unit, its triangles, vertices, parts, materials and textures, a
 * scan's points, a splat's splats, a toolpath's layers and print time.
 *
 * Measured wherever a model is loaded anyway: in the background thumbnail worker, in the
 * viewer, and in the tab itself when nothing was measured yet. The result is what
 * ModelStatsService stores (it checks every field again), keyed by the file version, so it
 * is the file's own numbers and not the viewer's: the model is measured as it is, whatever a
 * viewer tool is showing of it (see ownDisplayState.js), and in the file's unit before any
 * unit chosen for the file, so a unit chosen later changes the reading and not the number
 * stored (stats/describeStats.js).
 *
 * Plain module, no Vue and no DOM: it runs in the thumbnail worker.
 */

import { Box3, Vector3 } from 'three'
import { computeMeshStats, getGeometryStats, getMaterials, getTextures } from '../utils/modelMeasures.js'
import { withOwnDisplayState } from '../utils/ownDisplayState.js'
import { isUnitChangeable, millimetresPerFileUnit, viewerScale } from '../utils/sourceUnits.js'

/** The version of the stored shape; ModelStatsService::VERSION */
export const STATS_VERSION = 1

// Surface area and volume read every triangle: past this many, the model is counted and
// sized but its area and volume are left out
const MEASURE_MAX_TRIANGLES = 2_000_000

/**
 * A value some object in the model recorded in its userData (the loaders record a scan's,
 * a splat's and a toolpath's account of itself on the root, or on a part of it).
 *
 * @param {THREE.Object3D} root - The loaded model
 * @param {string} key - The userData key
 * @return {*} The first value found, or undefined
 */
function recordedOn(root, key) {
	let found
	root.traverse((child) => {
		if (found === undefined && child.userData?.[key] !== undefined) {
			found = child.userData[key]
		}
	})
	return found
}

/**
 * @param {*} value - A number from the model
 * @return {number} The number, or 0 for anything that is not a finite, non-negative one
 */
const count = (value) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0)

/**
 * Surface area and enclosed volume of the model's meshes, in scene units.
 *
 * The volume is the signed sum over the triangles, which is the volume only of a closed
 * model. The meshes are checked for that (computeMeshStats) when they are indexed and not
 * too large; a mesh that cannot be checked is not held against the model, as the viewer's
 * statistics panel does not, and `watertight` says which of the three it is.
 *
 * @param {THREE.Object3D} root - The loaded model
 * @return {{area: ?number, volume: ?number, watertight: ?boolean}} Null for each when the
 *   model has no mesh to measure; `watertight` is true when every mesh was checked and
 *   is closed, false when one was found open (the volume is then left out), and null when
 *   some could not be checked
 */
function surfaceOf(root) {
	let area = 0
	let volume = 0
	let meshes = 0
	let open = false
	let unknown = false
	root.traverse((child) => {
		if (!child.isMesh || !child.geometry?.attributes?.position || child.userData?.tdvBoundsProxy) {
			return
		}
		const name = child.name || ''
		if (name === 'TransformControlsPlane' || name.startsWith('__helper')) {
			return
		}
		const measured = computeMeshStats(child)
		meshes++
		area += measured.surfaceArea
		volume += measured.volume
		open = open || measured.watertight === false
		unknown = unknown || measured.watertight === null
	})
	if (meshes === 0) {
		return { area: null, volume: null, watertight: null }
	}
	if (open) {
		return { area, volume: null, watertight: false }
	}
	return { area, volume, watertight: unknown ? null : true }
}

/**
 * @param {THREE.Object3D} root - The loaded model
 * @param {string} filename - The file's name, for its format
 * @return {?object} The measurement, or null when the model has nothing to measure
 */
function measure(root, filename) {
	root.updateWorldMatrix(true, true)
	const box = new Box3().setFromObject(root)
	if (box.isEmpty()) {
		return null
	}
	const size = box.getSize(new Vector3())
	// A flat model turned upright is not 6e-17 tall: what is lost to rounding is no length
	const negligible = Math.max(size.x, size.y, size.z) * 1e-9
	const length = (value) => (value < negligible ? 0 : value)
	// The viewer may have scaled the model to fit its lighting (an FBX larger than 50
	// units); the file's own numbers are before that
	const rescale = viewerScale(root)

	const cloud = root.userData?.tdvPointCloud ?? null
	const splat = root.userData?.tdvSplat ?? null
	const geometry = getGeometryStats(root)
	const slicer = recordedOn(root, 'slicerSummary')
	let layers = 0
	root.traverse((child) => {
		if (child.userData?.gcodeLayerZ !== undefined) {
			layers++
		}
	})
	const toolpath = slicer !== undefined || layers > 0

	let kind = 'mesh'
	if (cloud) {
		kind = 'points'
	} else if (splat) {
		kind = 'splats'
	} else if (toolpath) {
		kind = 'toolpath'
	}

	let area = null
	let volume = null
	let watertight = null
	if (kind === 'mesh' && geometry.faces <= MEASURE_MAX_TRIANGLES) {
		const surface = surfaceOf(root)
		area = surface.area === null ? null : surface.area / (rescale * rescale)
		// A sheet, or anything that encloses nothing, has no volume to show
		volume = surface.volume > 0 ? surface.volume / (rescale * rescale * rescale) : null
		watertight = surface.watertight
	}

	return {
		v: STATS_VERSION,
		kind,
		size: [length(size.x) / rescale, length(size.y) / rescale, length(size.z) / rescale],
		unit: { mm: millimetresPerFileUnit(filename, root), changeable: isUnitChangeable(filename, root) },
		up: kind === 'points' || kind === 'splats' ? ((cloud ?? splat).up ?? null) : null,
		triangles: kind === 'mesh' ? geometry.faces : 0,
		vertices: geometry.vertices,
		points: kind === 'points' ? count(cloud.total ?? geometry.points) : 0,
		splats: kind === 'splats' ? count(splat.total ?? splat.count) : 0,
		parts: geometry.meshes,
		materials: getMaterials(root).length,
		textures: getTextures(root).count,
		area,
		volume,
		watertight,
		layers: kind === 'toolpath' ? layers : null,
		printSeconds: kind === 'toolpath' && Number.isFinite(slicer?.printSeconds) ? Math.round(slicer.printSeconds) : null,
	}
}

/**
 * Measure a loaded model.
 *
 * Never throws: a model that cannot be measured is not worth failing the thumbnail, the
 * viewer or the tab for.
 *
 * @param {THREE.Object3D} root - The loaded model
 * @param {object} options - What is known of the file
 * @param {string} options.filename - The file's name (its extension says the format)
 * @return {?object} What ModelStatsService stores, or null when the model has no extent
 *   to measure or the measurement failed
 */
export function extractModelStats(root, { filename }) {
	if (!root?.traverse) {
		return null
	}
	try {
		return withOwnDisplayState(root, () => measure(root, String(filename ?? '')))
	} catch {
		return null
	}
}
