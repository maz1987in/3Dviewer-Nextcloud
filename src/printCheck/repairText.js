/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What Print check says about a mesh's problems and about a repair, in plain words: one
 * line for each thing, so each is translated whole and none is a sentence built from parts.
 */

/**
 * @param {number} count - A count
 * @return {string} It with the reader's thousands separator: 1,204
 */
export function formatCount(count) {
	return Number(count).toLocaleString()
}

/**
 * What is wrong with a mesh, a line for each thing.
 *
 * @param {object} report - meshAnalysis.combineReports' result
 * @param {object} words - The translation functions
 * @param {function(string, string, string, number, object=): string} words.n - Translate a count
 * @return {string[]} The lines; none when the mesh has nothing wrong
 */
export function problemLines(report, { n }) {
	const lines = []
	if (report.holes.count > 0) {
		lines.push(n('threedviewer', '%n hole, open edges: {edges}', '%n holes, open edges: {edges}', report.holes.count, { edges: formatCount(report.openEdges) }))
	}
	if (report.flippedFaces > 0) {
		lines.push(n('threedviewer', '%n face turned the wrong way', '%n faces turned the wrong way', report.flippedFaces))
	}
	if (report.insideOutParts > 0) {
		lines.push(n('threedviewer', '%n part is inside out', '%n parts are inside out', report.insideOutParts))
	}
	if (report.degenerateFaces > 0) {
		lines.push(n('threedviewer', '%n face with no area', '%n faces with no area', report.degenerateFaces))
	}
	if (report.duplicateFaces > 0) {
		lines.push(n('threedviewer', '%n duplicate face', '%n duplicate faces', report.duplicateFaces))
	}
	if (report.nearVertices > 0) {
		lines.push(n('threedviewer', '%n place where vertices almost meet but do not', '%n places where vertices almost meet but do not', report.nearVertices))
	}
	if (report.nonManifoldEdges > 0) {
		lines.push(n('threedviewer', '%n edge shared by more than two faces', '%n edges shared by more than two faces', report.nonManifoldEdges))
	}
	if (report.twistedEdges > 0) {
		lines.push(n('threedviewer', '%n edge where the faces on both sides cannot face the same way', '%n edges where the faces on both sides cannot face the same way', report.twistedEdges))
	}
	return lines
}

/**
 * A note on vertices that repeat another one's place, which is how an STL file is made and
 * is not a problem.
 *
 * @param {object} report - meshAnalysis.combineReports' result
 * @param {object} words - The translation functions
 * @param {function(string, string, string, number, object=): string} words.n - Translate a count
 * @return {?string} The note, or null when there is nothing to note
 */
export function repeatedVerticesNote(report, { n }) {
	if (report.joinableVertices <= 0) {
		return null
	}
	return n('threedviewer', '{count} vertex repeats another one\'s place, as in most STL files', '{count} vertices repeat another one\'s place, as in most STL files', report.joinableVertices, { count: formatCount(report.joinableVertices) })
}

/**
 * What a repair did, a line for each thing it did.
 *
 * @param {object} summary - The repair's summary, added up over the model's parts
 * @param {object} words - The translation functions
 * @param {function(string, string, string, number, object=): string} words.n - Translate a count
 * @return {string[]} The lines
 */
export function doneLines(summary, { n }) {
	const lines = []
	if (summary.joinedVertices > 0) {
		lines.push(n('threedviewer', 'Joined {count} vertex', 'Joined {count} vertices', summary.joinedVertices, { count: formatCount(summary.joinedVertices) }))
	}
	if (summary.removedDegenerateFaces > 0) {
		lines.push(n('threedviewer', 'Removed {count} face with no area', 'Removed {count} faces with no area', summary.removedDegenerateFaces, { count: formatCount(summary.removedDegenerateFaces) }))
	}
	if (summary.removedDuplicateFaces > 0) {
		lines.push(n('threedviewer', 'Removed {count} duplicate face', 'Removed {count} duplicate faces', summary.removedDuplicateFaces, { count: formatCount(summary.removedDuplicateFaces) }))
	}
	if (summary.turnedFaces > 0) {
		lines.push(n('threedviewer', 'Turned {count} face the right way', 'Turned {count} faces the right way', summary.turnedFaces, { count: formatCount(summary.turnedFaces) }))
	}
	if (summary.turnedParts > 0) {
		lines.push(n('threedviewer', 'Turned {count} part right side out', 'Turned {count} parts right side out', summary.turnedParts, { count: formatCount(summary.turnedParts) }))
	}
	if (summary.filledHoles > 0) {
		lines.push(n('threedviewer', 'Filled {count} hole', 'Filled {count} holes', summary.filledHoles, { count: formatCount(summary.filledHoles) }))
	}
	return lines
}

/**
 * What a repair left, and why, a line for each thing.
 *
 * @param {object} summary - The repair's summary, added up over the model's parts
 * @param {object} after - meshAnalysis.combineReports' result for the repaired model
 * @param {object} words - The translation functions
 * @param {function(string, string, string, number, object=): string} words.n - Translate a count
 * @param {number} limit - The most edges a hole can have to be filled
 * @return {string[]} The lines; none when nothing is left
 */
export function leftLines(summary, after, { n }, limit) {
	const lines = []
	if (summary.leftTooLarge > 0) {
		lines.push(n('threedviewer', '{count} hole is too large to fill (over {limit} edges)', '{count} holes are too large to fill (over {limit} edges)', summary.leftTooLarge, { count: formatCount(summary.leftTooLarge), limit }))
	}
	if (summary.leftComplex > 0) {
		lines.push(n('threedviewer', '{count} hole touches itself, so it was left as it is', '{count} holes touch themselves, so they were left as they are', summary.leftComplex, { count: formatCount(summary.leftComplex) }))
	}
	if (summary.leftUnfillable > 0) {
		lines.push(n('threedviewer', '{count} hole could not be filled without a guess, so it was left as it is', '{count} holes could not be filled without a guess, so they were left as they are', summary.leftUnfillable, { count: formatCount(summary.leftUnfillable) }))
	}
	if (after.nonManifoldEdges > 0) {
		lines.push(n('threedviewer', '{count} edge is shared by more than two faces', '{count} edges are shared by more than two faces', after.nonManifoldEdges, { count: formatCount(after.nonManifoldEdges) }))
	}
	if (after.twistedEdges > 0) {
		lines.push(n('threedviewer', '{count} edge has faces on both sides that cannot face the same way', '{count} edges have faces on both sides that cannot face the same way', after.twistedEdges, { count: formatCount(after.twistedEdges) }))
	}
	return lines
}
