/**
 * What the G-code loader hands the layer slider.
 *
 * Each layer is drawn as a set of separate moves. Stored as start/end pairs, they have
 * to be drawn as `LineSegments`: a `Line` joins the end of one move to the start of the
 * next, which draws every travel move the parser went out of its way to drop.
 */
import * as THREE from 'three'
import GCodeLoader from '../../../src/loaders/types/gcode.js'
import { collectGcodeLayers } from '../../../src/composables/useGcodeLayers.js'

// Two layers, each with a travel move between two extrusions, and a Z-hop in layer 1
const GCODE = `
G1 Z0.2 F600
G1 X0 Y0 E0
G1 X10 Y0 E1
G0 X20 Y20
G1 X30 Y20 E2
G1 Z0.6
G1 Z0.2
G1 X40 Y20 E3
G1 Z0.4
G1 X0 Y0 E3
G1 X10 Y0 E4
`

async function load(text) {
	const buffer = new TextEncoder().encode(text).buffer
	const { object3D } = await new GCodeLoader().loadModel(buffer, {})
	return object3D
}

describe('G-code toolpath layers', () => {
	it('draws every layer as separate moves', async () => {
		const group = await load(GCODE)
		expect(group.children.length).toBeGreaterThan(0)
		group.children.forEach((child) => {
			expect(child.isLineSegments).toBe(true)
			expect(child.geometry.attributes.position.count % 2).toBe(0)
		})
	})

	it('tags each object with its height, and a Z-hop does not add a layer', async () => {
		const group = await load(GCODE)
		group.children.forEach((child) => {
			expect(typeof child.userData.gcodeLayerZ).toBe('number')
		})
		const layers = collectGcodeLayers(group)
		expect(layers.map((l) => l.z)).toEqual([0.2, 0.4])
	})

	it('draws no travel move', async () => {
		const group = await load(GCODE)
		const first = group.children[0].geometry.attributes.position
		// Printed moves only: (0,0)→(10,0) and (20,20)→(30,20); the travel (10,0)→(20,20) is absent
		const pairs = []
		for (let i = 0; i < first.count; i += 2) {
			pairs.push([
				new THREE.Vector3().fromBufferAttribute(first, i),
				new THREE.Vector3().fromBufferAttribute(first, i + 1),
			])
		}
		const travel = pairs.find(([a, b]) => a.x === 10 && b.x === 20)
		expect(travel).toBeUndefined()
	})
})
