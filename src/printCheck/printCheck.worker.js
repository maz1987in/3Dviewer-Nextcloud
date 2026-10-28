/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The print-check worker: the two jobs too heavy for the page's thread. Whether each part
 * is closed, with no size cap, and how thick its walls are. three-mesh-bvh is imported
 * here and nowhere else, so the viewer never downloads it until someone runs a check.
 *
 * In:  { id, type: 'closed', parts: [{ positions, index }] }
 *      { id, type: 'thickness', parts: [{ positions, index, normals }], budget }
 * Out: { id, type: 'progress', done, total } while a thickness check runs, then
 *      { id, type: 'result', result } or { id, type: 'error', message }
 */

import { edgeReport } from './closedMesh.js'
import { measurePartThickness } from './thickness.js'

self.onmessage = (event) => {
	const { id, type, parts, budget } = event.data
	try {
		if (type === 'closed') {
			self.postMessage({ id, type: 'result', result: parts.map((part) => edgeReport(part)) })
			return
		}
		if (type === 'thickness') {
			const total = parts.reduce((sum, part) => sum + Math.floor((part.index ? part.index.length : part.positions.length / 3) / 3), 0)
			let before = 0
			const result = parts.map((part) => {
				const measured = measurePartThickness(part, {
					budget,
					onProgress: (done, partTotal) => self.postMessage({ id, type: 'progress', done: before + done, total: Math.max(total, before + partTotal) }),
				})
				before += Math.floor((part.index ? part.index.length : part.positions.length / 3) / 3)
				return measured
			})
			self.postMessage({ id, type: 'result', result }, result.flatMap((part) => [part.thickness.buffer, part.triangleThickness.buffer]))
			return
		}
		throw new Error(`Unknown print-check job: ${type}`)
	} catch (error) {
		self.postMessage({ id, type: 'error', message: error?.message || String(error) })
	}
}
