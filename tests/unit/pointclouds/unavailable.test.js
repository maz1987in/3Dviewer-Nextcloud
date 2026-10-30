/**
 * The tools that are off for a scan, and why: listed once, so the gated controls and the
 * list they point at can't disagree.
 */
import { POINT_CLOUD_UNAVAILABLE } from '../../../src/pointclouds/unavailable.js'

test('each tool that is off, with the note saying why', () => {
	expect(POINT_CLOUD_UNAVAILABLE.map(({ key }) => key)).toEqual(['printCheck', 'shading', 'exploded', 'compare', 'export'])
	expect(Object.fromEntries(POINT_CLOUD_UNAVAILABLE.map(({ key, note }) => [key, note]))).toEqual({
		printCheck: 'A scan is a cloud of points with no closed surface, so there\'s nothing to check for printing.',
		shading: 'Colour by takes the place of shading for a scan.',
		exploded: 'A scan is a single cloud of points, with no parts to pull apart.',
		compare: 'Comparing scans isn\'t available yet.',
		export: 'Export saves meshes, and a scan is points.',
	})
	expect(POINT_CLOUD_UNAVAILABLE.every(({ label }) => typeof label === 'string' && label.length > 0)).toBe(true)
})
