/**
 * Whether a PLY is a Gaussian splat, from its header alone (pointclouds/readers/plyPoints.js
 * reads it), so the PLY loader can send it to Spark before the scan reader or the mesh
 * loader sees it.
 */

/** The properties the 3D Gaussian Splatting PLY gives every splat. */
const GAUSSIAN = ['f_dc_0', 'scale_0', 'rot_0', 'opacity']

/**
 * @param {{elements: {name: string, properties: {name: string}[]}[]}} header - plyHeader's
 * @return {boolean} A 3DGS PLY, or SuperSplat's compressed one (a chunk element, and
 *   vertices that are packed_position and the like)
 */
export function isSplatPly(header) {
	const vertex = header.elements.find(({ name }) => name === 'vertex')
	if (!vertex) {
		return false
	}
	const names = new Set(vertex.properties.map(({ name }) => name))
	if (GAUSSIAN.every((name) => names.has(name))) {
		return true
	}
	return header.elements.some(({ name }) => name === 'chunk') && names.has('packed_position')
}
