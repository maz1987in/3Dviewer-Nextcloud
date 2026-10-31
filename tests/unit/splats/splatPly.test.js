/**
 * A PLY is a splat when its header says so: the 3DGS properties, or SuperSplat's
 * compressed layout. Anything else stays a scan or a mesh.
 */
import { isPointCloudPly, plyHeader } from '../../../src/pointclouds/readers/plyPoints.js'
import { isSplatPly } from '../../../src/splats/splatPly.js'

const header = (lines) => plyHeader(new TextEncoder().encode(`ply\nformat binary_little_endian 1.0\n${lines.join('\n')}\nend_header\n`))
const floats = (names) => names.map((n) => `property float ${n}`)

const GAUSSIAN = header(['element vertex 2', ...floats(['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'])])
const COMPRESSED = header([
	'element chunk 1', ...floats(['min_x', 'min_y', 'min_z', 'max_x', 'max_y', 'max_z']),
	'element vertex 256', 'property uint packed_position', 'property uint packed_rotation', 'property uint packed_scale', 'property uint packed_color',
])

test('a 3DGS PLY is a splat', () => {
	expect(isSplatPly(GAUSSIAN)).toBe(true)
})

test('a SuperSplat compressed PLY is a splat', () => {
	expect(isSplatPly(COMPRESSED)).toBe(true)
})

test('a scan is not', () => {
	expect(isSplatPly(header(['element vertex 2', ...floats(['x', 'y', 'z']), 'property uchar red', 'property uchar green', 'property uchar blue']))).toBe(false)
})

test('a PLY with some of the properties is not', () => {
	expect(isSplatPly(header(['element vertex 2', ...floats(['x', 'y', 'z', 'f_dc_0', 'opacity', 'scale_0'])]))).toBe(false)
})

test('neither kind of splat is a scan', () => {
	expect(isPointCloudPly(GAUSSIAN)).toBe(false)
	expect(isPointCloudPly(COMPRESSED)).toBe(false)
})
