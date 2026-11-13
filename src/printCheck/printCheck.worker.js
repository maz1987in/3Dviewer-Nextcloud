/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The print-check worker: everything Print check does to every vertex or triangle, so the
 * page's thread only draws. The fit, overhangs, volume and area, and whether each part is
 * closed, are measured for one open Print check by a worker that keeps the model's
 * geometry between requests (a session); the wall thickness runs in a worker of its own.
 * three-mesh-bvh is imported here and nowhere else, so the viewer never downloads it
 * until someone runs a check.
 *
 * In:  { id, type: 'load', parts: [{ positions, index, surface }] }      a session's model
 *      { id, type: 'measure', matrices, axes, thresholdDeg, bedEpsilon } on that model
 *      { id, type: 'closed' }                                            on that model
 *      { id, type: 'thickness', parts: [{ positions, index, normals }], budget }
 * Out: { id, type: 'progress', done, total } while a thickness check runs, then
 *      { id, type: 'result', result } or { id, type: 'error', message }
 */

import { edgeReport } from './closedMesh.js'
import { measurePartThickness } from './thickness.js'
import { measureSurface } from './surfaceMeasures.js'

// The session's model, from 'load'
let held = []

self.onmessage = (event) => {
	const { id, type, parts, budget } = event.data
	try {
		if (type === 'load') {
			held = parts
			self.postMessage({ id, type: 'result', result: true })
			return
		}
		if (type === 'measure') {
			self.postMessage({ id, type: 'result', result: measureSurface(held, event.data) })
			return
		}
		if (type === 'closed') {
			self.postMessage({ id, type: 'result', result: held.filter((part) => part.surface).map((part) => edgeReport(part)) })
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
