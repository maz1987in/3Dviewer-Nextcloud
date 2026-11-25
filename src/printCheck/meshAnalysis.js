/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What is wrong with a mesh for printing, counted: open edges and the holes they bound,
 * faces that point the wrong way, whole parts that are inside out, corners that are not
 * shared, zero-area and duplicate faces, and edges with more than two faces. The same
 * measures a repair starts from (meshRepair.js) and is held to afterwards.
 *
 * Everything runs over typed arrays and a spatial hash, with no object per vertex or per
 * triangle, so a model of millions of triangles is checked in a worker in seconds.
 *
 * Plain module, no DOM and no three.js, so the print-check worker can import it.
 */

import { measureBounds, weldTolerance, weldVertices } from './meshWeld.js'
import { usableTriangles, buildEdges, orientFaces, partVolumes, boundaryLoops } from './meshTopology.js'
import { MAX_HOLE_EDGES } from './meshReport.js'

/**
 * A mesh, looked at once and kept for repair to work from.
 *
 * @param {object} part - The mesh
 * @param {Float32Array|Float64Array} part.positions - xyz per vertex
 * @param {?(Uint16Array|Uint32Array)} [part.index] - Three vertex indices per triangle, or
 *   null for one triangle per three vertices
 * @param {number} [part.millimetresPerUnit] - Millimetres in one of its units, 1 when not known
 * @param {number} [part.tolerance] - How close vertices must be to count as one, in its units;
 *   from its size and unit (meshWeld.weldTolerance) when not given
 * @param {number} [part.maxHoleEdges] - Holes with more edges than this are too large to fill
 * @return {object} `report`: what analyzeMesh returns; and the working data: `bounds`,
 *   `tolerance`, `weld`, `points` (xyz of each welded vertex), `tri`, `source`, `edges`,
 *   `orientation`, `volumes` and `holes`
 */
export function inspectMesh({ positions, index = null, millimetresPerUnit = 1, tolerance = 0, maxHoleEdges = MAX_HOLE_EDGES }) {
	const bounds = measureBounds(positions)
	const tol = tolerance > 0 ? tolerance : weldTolerance(bounds, millimetresPerUnit)
	const weld = weldVertices(positions, tol, bounds)
	const points = new Float64Array(weld.count * 3)
	for (let id = 0; id < weld.count; id++) {
		const r = weld.representative[id] * 3
		points[id * 3] = positions[r]
		points[id * 3 + 1] = positions[r + 1]
		points[id * 3 + 2] = positions[r + 2]
	}
	const { tri, source, degenerate, duplicate } = usableTriangles(positions, index, weld, tol)
	const edges = buildEdges(tri)
	const orientation = orientFaces(tri, edges)
	const volumes = partVolumes(points, tri, orientation.flip, orientation.part, orientation.parts, bounds.extent)

	// The directions the mesh's own edges run in once every face agrees and every part faces out
	const turned = new Uint8Array(tri.length / 3)
	for (let t = 0; t < turned.length; t++) {
		turned[t] = orientation.flip[t] ^ volumes.insideOut[orientation.part[t]]
	}
	const holes = boundaryLoops(tri, edges, turned, weld.count)
	const fillable = holes.loops.filter((loop) => loop.simple && loop.vertices.length <= maxHoleEdges).length
	const complex = holes.loops.filter((loop) => !loop.simple).length
	const insideOutParts = volumes.insideOut.reduce((sum, flag) => sum + flag, 0)
	let volume = 0
	let area = 0
	for (let p = 0; p < orientation.parts; p++) {
		volume += volumes.insideOut[p] ? -volumes.volume[p] : volumes.volume[p]
		area += volumes.area[p]
	}

	const report = {
		triangles: Math.floor((index ? index.length : positions.length / 3) / 3),
		vertices: Math.floor(positions.length / 3),
		// Vertices that sit where an earlier one does: an STL has every corner of every face of its own,
		// which a slicer joins itself, so they are only noted
		joinableVertices: weld.repeats,
		// Vertices that miss another by a hair: a crack a slicer reads as a hole
		nearVertices: weld.nearPlaces,
		degenerateFaces: degenerate,
		duplicateFaces: duplicate,
		openEdges: edges.boundary,
		holes: {
			count: holes.loops.length,
			fillable,
			tooLarge: holes.loops.filter((loop) => loop.simple && loop.vertices.length > maxHoleEdges).length,
			complex,
		},
		nonManifoldEdges: edges.nonManifold,
		flippedFaces: orientation.flipped,
		twistedEdges: orientation.conflicts,
		insideOutParts,
		parts: orientation.parts,
		closed: tri.length > 0 && edges.boundary === 0 && edges.nonManifold === 0,
		volume,
		area,
		tolerance: tol,
	}
	report.fixable = report.nearVertices > 0 || report.degenerateFaces > 0 || report.duplicateFaces > 0
		|| report.flippedFaces > 0 || report.insideOutParts > 0 || fillable > 0

	return { report, bounds, tolerance: tol, weld, points, tri, source, edges, orientation, volumes, holes, turned }
}

/**
 * Count what is wrong with one mesh.
 *
 * @param {object} part - As for inspectMesh
 * @return {object} The counts: `triangles`, `vertices`, `joinableVertices`, `nearVertices`,
 *   `degenerateFaces`, `duplicateFaces`, `openEdges`, `holes` (`count`, `fillable`, `tooLarge`,
 *   `complex`), `nonManifoldEdges`, `flippedFaces`, `twistedEdges`, `insideOutParts`, `parts`,
 *   `closed` (every edge shared by exactly two faces), `volume` and `area` (in the part's units,
 *   cubed and squared), `tolerance`, and `fixable` (a repair can change something)
 */
export function analyzeMesh(part) {
	return inspectMesh(part).report
}
