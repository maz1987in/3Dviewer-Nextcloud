/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Turns what is stored of a model (stats/extractStats.js) and what is chosen for its file
 * (its unit and which way is up) into what the Files sidebar's "3D" tab shows. The numbers
 * stored are the file's own; the unit and the direction are read here, every time, so one
 * chosen after the measurement is followed without measuring again.
 *
 * Plain module, no Vue: the strings are the component's.
 */

import { FILE_UNITS, unitSuffix } from '../utils/sourceUnits.js'

/** Survey formats are Z up, everything else Y up; the viewer's `defaultUp` (pointclouds/upAxis.js). */
const Z_UP_FORMATS = new Set(['las', 'laz', 'e57'])

/**
 * @param {string} extension - The file's extension
 * @return {string} Which way is up for a scan or splat that has no direction chosen
 */
export function defaultUpOf(extension) {
	return Z_UP_FORMATS.has(String(extension).toLowerCase()) ? '+z' : '+y'
}

/**
 * Where the unit of the size comes from, which decides what the tab says about it.
 *
 * - `file`: the format or the file records it (a glTF is metres, a STEP is millimetres, a Rhino
 *   file names its own), so it is not a guess
 * - `chosen`: nobody can know it from the file, and someone with edit rights set it on the file
 * - `default`: the file records none and none was chosen, so it is the format's usual one: a guess
 *
 * @typedef {'file'|'chosen'|'default'} UnitSource
 */

/**
 * The unit the stored size is in.
 *
 * @param {object} stats - A stored measurement
 * @param {?string} chosen - The unit chosen for the file (a key of FILE_UNITS), or null
 * @return {{millimetres: number, suffix: string, source: UnitSource}} Millimetres per unit
 *   and how the tab writes it; the numbers of the size are the same whichever it is
 */
export function unitOf(stats, chosen) {
	if (stats.unit.changeable && typeof chosen === 'string' && Object.hasOwn(FILE_UNITS, chosen)) {
		const unit = FILE_UNITS[chosen]
		return { millimetres: unit.millimetres, suffix: unit.suffix, source: 'chosen' }
	}
	return {
		millimetres: stats.unit.mm,
		suffix: unitSuffix(stats.unit.mm),
		source: stats.unit.changeable ? 'default' : 'file',
	}
}

/**
 * Which axis of the file stands up for a direction: a scan turned from Z up (or from
 * upside down) has its file's depth for height, and the other way round.
 *
 * @param {string} up - One of the file settings' UPS
 * @return {boolean} True when the file's Z axis is the vertical one
 */
const standsOnZ = (up) => up === '+z' || up === '-z'

/**
 * The size as the viewer shows the model: width along X, depth along Z, height along Y,
 * after the direction the file's scan or splat was turned to.
 *
 * The stored size is that of the model as it was when it was measured, which has its
 * `up` already applied; one chosen for the file since then swaps the file's two other axes.
 *
 * @param {object} stats - A stored measurement
 * @param {?string} chosenUp - The direction chosen for the file, or null for its format's own
 * @param {string} extension - The file's extension
 * @return {{width: number, depth: number, height: number}} In the file's unit
 */
export function dimensionsOf(stats, chosenUp, extension) {
	const [x, y, z] = stats.size
	const scan = stats.kind === 'points' || stats.kind === 'splats'
	if (scan) {
		const measuredUp = stats.up ?? defaultUpOf(extension)
		const nowUp = chosenUp ?? defaultUpOf(extension)
		if (standsOnZ(measuredUp) !== standsOnZ(nowUp)) {
			return { width: x, depth: y, height: z }
		}
	}
	return { width: x, depth: z, height: y }
}

/**
 * Everything the tab shows of a model.
 *
 * @param {object} stats - A stored measurement
 * @param {{unit: ?string, up: ?string}} settings - What is chosen for the file
 * @param {string} extension - The file's extension
 * @return {object} The format's kind, the size and its unit, and the counts that apply
 */
export function describeStats(stats, settings, extension) {
	const unit = unitOf(stats, settings?.unit ?? null)
	const rows = {
		kind: stats.kind,
		unit,
		dimensions: dimensionsOf(stats, settings?.up ?? null, extension),
		// A scan and a splat are points and splats, and a toolpath is layers: the triangles
		// and vertices of a mesh do not describe them
		triangles: stats.kind === 'mesh' ? stats.triangles : null,
		vertices: stats.kind === 'mesh' ? stats.vertices : null,
		points: stats.kind === 'points' ? stats.points : null,
		splats: stats.kind === 'splats' ? stats.splats : null,
		layers: stats.kind === 'toolpath' ? stats.layers : null,
		printSeconds: stats.kind === 'toolpath' ? stats.printSeconds : null,
		parts: stats.kind === 'mesh' ? stats.parts : null,
		materials: stats.kind === 'mesh' ? stats.materials : null,
		textures: stats.kind === 'mesh' ? stats.textures : null,
		area: stats.area,
		volume: stats.volume,
		// Whether the volume was checked to be that of a closed model: true, or null for a
		// mesh that could not be checked (an STL has no shared vertices to check)
		watertight: stats.watertight ?? null,
	}
	return rows
}
