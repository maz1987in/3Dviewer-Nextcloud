/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Adding up what is known of a model's parts: the counts of meshAnalysis for the Print check
 * card, and the summaries of a repair. On their own, so the page's code takes them without
 * the analysis and repair that make them, which run in the worker.
 */

/** Holes with more edges than this are left alone: filling one would be a guess. */
export const MAX_HOLE_EDGES = 500

/**
 * The reports of a model's parts as one.
 *
 * @param {object[]} reports - One analyzeMesh result per part
 * @return {object} The counts added up; `closed` when every part is and there is one; `fixable`
 *   when a repair can change any part
 */
export function combineReports(reports) {
	const total = {
		meshes: reports.length,
		triangles: 0,
		vertices: 0,
		joinableVertices: 0,
		nearVertices: 0,
		degenerateFaces: 0,
		duplicateFaces: 0,
		openEdges: 0,
		holes: { count: 0, fillable: 0, tooLarge: 0, complex: 0 },
		nonManifoldEdges: 0,
		flippedFaces: 0,
		twistedEdges: 0,
		insideOutParts: 0,
		parts: 0,
		volume: 0,
		area: 0,
		closed: reports.length > 0,
		fixable: false,
	}
	for (const report of reports) {
		for (const key of ['triangles', 'vertices', 'joinableVertices', 'nearVertices', 'degenerateFaces', 'duplicateFaces', 'openEdges',
			'nonManifoldEdges', 'flippedFaces', 'twistedEdges', 'insideOutParts', 'parts', 'volume', 'area']) {
			total[key] += report[key]
		}
		for (const key of ['count', 'fillable', 'tooLarge', 'complex']) {
			total.holes[key] += report.holes[key]
		}
		total.closed &&= report.closed
		total.fixable ||= report.fixable
	}
	return total
}

/**
 * A repair's summaries added up.
 *
 * @param {object[]} summaries - One per part
 * @return {object} The counts added up
 */
export function combineSummaries(summaries) {
	const total = {
		joinedVertices: 0,
		removedDegenerateFaces: 0,
		removedDuplicateFaces: 0,
		turnedFaces: 0,
		turnedParts: 0,
		filledHoles: 0,
		addedFaces: 0,
		leftTooLarge: 0,
		leftComplex: 0,
		leftUnfillable: 0,
	}
	for (const summary of summaries) {
		for (const key of Object.keys(total)) {
			total[key] += summary[key]
		}
	}
	return total
}
