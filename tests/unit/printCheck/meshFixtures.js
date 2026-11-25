/**
 * Small meshes for the mesh analysis and repair tests, built from plain triangles.
 */

/** The eight corners of a unit cube, by index. */
const CORNERS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]

/** The twelve triangles of the cube, each counter-clockwise seen from outside: normals face out. */
export const CUBE_TRIANGLES = [
	[0, 3, 2], [0, 2, 1], // bottom
	[4, 5, 6], [4, 6, 7], // top
	[0, 1, 5], [0, 5, 4], // front
	[1, 2, 6], [1, 6, 5], // right
	[2, 3, 7], [2, 7, 6], // back
	[3, 0, 4], [3, 4, 7], // left
]

/**
 * A cube as triangles of coordinates, not indices.
 *
 * @param {number} [size] - Edge length
 * @param {number[]} [at] - Where its lowest corner is
 * @return {number[][][]} Twelve triangles of three [x, y, z] corners
 */
export function cube(size = 10, at = [0, 0, 0]) {
	const corner = (i) => CORNERS[i].map((value, axis) => at[axis] + value * size)
	return CUBE_TRIANGLES.map((triangle) => triangle.map(corner))
}

/**
 * @param {number[][][]} triangles - Triangles of [x, y, z] corners
 * @return {Float32Array} The corners as an STL stores them: three vertices per triangle, no index
 */
export function soup(triangles) {
	return Float32Array.from(triangles.flat(2))
}

/**
 * Triangles as an indexed mesh, vertices shared where they are exactly the same place.
 *
 * @param {number[][][]} triangles - Triangles of [x, y, z] corners
 * @return {{positions: Float32Array, index: Uint32Array}} The mesh
 */
export function indexed(triangles) {
	const ids = new Map()
	const vertices = []
	const index = []
	for (const triangle of triangles) {
		for (const corner of triangle) {
			const key = corner.join(',')
			if (!ids.has(key)) {
				ids.set(key, vertices.length / 3)
				vertices.push(...corner)
			}
			index.push(ids.get(key))
		}
	}
	return { positions: Float32Array.from(vertices), index: Uint32Array.from(index) }
}

/**
 * @param {number[][]} triangle - Three [x, y, z] corners
 * @return {number[][]} The same triangle facing the other way
 */
export function flipped(triangle) {
	return [triangle[0], triangle[2], triangle[1]]
}

/**
 * Several meshes as one list of triangles.
 *
 * @param {...number[][][]} meshes - Each a list of triangles
 * @return {number[][][]} Every triangle
 */
export function together(...meshes) {
	return meshes.flat(1)
}

/**
 * A tube, open at both ends, `segments` faces round.
 *
 * @param {number} segments - Faces round it
 * @return {number[][][]} Its triangles, facing out
 */
export function tube(segments) {
	const triangles = []
	// The last face comes back to the first vertex, exactly, as an exporter writes it
	const at = (i, z) => [Math.cos(((i % segments) / segments) * Math.PI * 2), Math.sin(((i % segments) / segments) * Math.PI * 2), z]
	for (let i = 0; i < segments; i++) {
		triangles.push([at(i, 0), at(i + 1, 0), at(i + 1, 1)], [at(i, 0), at(i + 1, 1), at(i, 1)])
	}
	return triangles
}

/**
 * The signed volume of a set of triangles, about the origin.
 *
 * @param {number[][][]} triangles - Triangles of [x, y, z] corners
 * @return {number} Positive for faces that point out of what they enclose
 */
export function signedVolume(triangles) {
	let volume = 0
	for (const [a, b, c] of triangles) {
		volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
	}
	return volume
}

/**
 * A repaired mesh as triangles of coordinates.
 *
 * @param {{positions: ArrayLike<number>, index: ArrayLike<number>}} mesh - The mesh
 * @return {number[][][]} Its triangles
 */
export function trianglesOf({ positions, index }) {
	const out = []
	for (let t = 0; t < index.length; t += 3) {
		out.push([0, 1, 2].map((k) => [positions[index[t + k] * 3], positions[index[t + k] * 3 + 1], positions[index[t + k] * 3 + 2]]))
	}
	return out
}
