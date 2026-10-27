/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Measurements in the annotations JSON file.
 *
 * Distances go under `measurements`, as point1 / point2, which is the shape 3.6 and 3.7
 * read. Angles go under a key of their own, `angles`, as point1 / vertex / point2: those
 * versions read only `measurements` and would take an angle there for a distance between
 * its outer points, and an editor's import would save that as a shared note.
 */

const plain = (p) => ({ x: p.x, y: p.y, z: p.z })
const isPoint = (p) => p !== null && typeof p === 'object' && [p.x, p.y, p.z].every(Number.isFinite)

/**
 * @param {object[]} list - useMeasurement's measurements
 * @return {{ measurements: object[], angles: object[] }} the two keys to write
 */
export function measurementsToJson(list) {
	const measurements = []
	const angles = []
	for (const m of list) {
		if (m.type === 'angle') {
			angles.push({ point1: plain(m.point1), vertex: plain(m.vertex), point2: plain(m.point2) })
		} else {
			measurements.push({ point1: plain(m.point1), point2: plain(m.point2) })
		}
	}
	return { measurements, angles }
}

/**
 * Read the measurements of a parsed file, of any version: a file without `angles` has
 * only distances. An entry with a missing or non-numeric point is skipped.
 * @param {object} doc - the parsed JSON
 * @return {{ items: Array<{ type: 'distance'|'angle', points: object[] }>, skipped: number }}
 */
export function measurementsFromJson(doc) {
	const items = []
	let skipped = 0
	const read = (entries, type, keys) => {
		for (const entry of Array.isArray(entries) ? entries : []) {
			const points = keys.map((k) => entry?.[k])
			if (points.every(isPoint)) {
				items.push({ type, points: points.map(plain) })
			} else {
				skipped++
			}
		}
	}
	read(doc?.measurements, 'distance', ['point1', 'point2'])
	read(doc?.angles, 'angle', ['point1', 'vertex', 'point2'])
	return { items, skipped }
}
