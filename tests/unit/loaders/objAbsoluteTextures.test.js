/**
 * An OBJ exported on Windows may name its material, and the material its maps, by a path
 * on the author's machine, or by one relative to the project that climbs above the
 * model's folder. Those companions were fetched under their bare, decoded names, so the
 * OBJ loader matches the material and each map by that name.
 */
import * as THREE from 'three'
import ObjLoader from '../../../src/loaders/types/obj.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// jsdom's Blob predates Blob.arrayBuffer() and Blob.text(), which the loader reads the
// material with
if (typeof Blob.prototype.arrayBuffer !== 'function') {
	Blob.prototype.arrayBuffer = function() {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result)
			reader.onerror = reject
			reader.readAsArrayBuffer(this)
		})
	}
}
if (typeof Blob.prototype.text !== 'function') {
	Blob.prototype.text = function() {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result)
			reader.onerror = reject
			reader.readAsText(this)
		})
	}
}

const QUAD = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl seat\nf 1/1 2/2 3/3 4/4\n'

const buffer = (text) => new TextEncoder().encode(text).buffer

/**
 * @param {object} object3D - Loaded model
 * @return {THREE.Material[]} Every mesh's materials
 */
function materials(object3D) {
	const found = []
	object3D.traverse((child) => {
		if (child.isMesh) {
			found.push(...[].concat(child.material))
		}
	})
	return found
}

describe('OBJ loader, companions named by absolute paths', () => {
	let image
	let decoded

	beforeEach(() => {
		// The worker's path: no <img>, the File decoded straight to a bitmap
		image = global.Image
		delete global.Image
		decoded = []
		global.createImageBitmap = jest.fn(async (file) => {
			decoded.push(file.name)
			return { width: 1, height: 1, close: () => {} }
		})
	})

	afterEach(() => {
		global.Image = image
		delete global.createImageBitmap
	})

	/**
	 * @param {string} mtllib - What the OBJ's mtllib names
	 * @param {string} map - What the material's map_Kd names
	 * @param {File[]} files - The companions, as fetched
	 * @return {Promise<THREE.Material[]>} The model's materials once loaded
	 */
	async function load(mtllib, map, files) {
		const result = await new ObjLoader().loadModel(buffer(`mtllib ${mtllib}\n${QUAD}`), {
			THREE,
			filename: 'chair.obj',
			additionalFiles: files,
		})
		return materials(result.object3D)
	}

	const mtl = (map) => new File([`newmtl seat\nKd 1 1 1\nmap_Kd ${map}\n`], 'chair.mtl', { type: 'model/mtl' })
	const png = (name) => new File(['png'], name, { type: 'image/png' })

	// The material's own map being loaded is what shows the material was found and read
	it.each([
		['a drive-letter path', 'D:\\exports\\chair.mtl'],
		['a file: URL', 'file:///D:/exports/chair.mtl'],
		['a UNC path', '\\\\server\\share\\chair.mtl'],
		['a path above the model\'s folder', '..\\..\\materials\\chair.mtl'],
	])('finds an mtllib written as %s by its bare name', async (_, mtllib) => {
		const found = await load(mtllib, 'wood.png', [mtl('wood.png'), png('wood.png')])

		expect(decoded).toEqual(['wood.png'])
		expect(found.some((material) => material.map)).toBe(true)
	})

	it('does not take a material of another name for an absolute mtllib', async () => {
		const found = await load('D:\\exports\\other.mtl', 'wood.png', [mtl('wood.png'), png('wood.png')])

		expect(decoded).toEqual([])
		expect(found.some((material) => material.map)).toBe(false)
	})

	it.each([
		['a drive-letter path', 'C:\\Users\\anna\\textures\\wood grain.png'],
		['a percent-encoded file: URL', 'file:///C:/My%20Textures/wood%20grain.png'],
		['a file: URL with a query', 'file:///C:/My%20Textures/wood%20grain.png?v=2'],
		['a path above the model\'s folder, as 3ds Max writes', '..\\..\\textures\\wood grain.png'],
		['a path that collapses and climbs out', 'textures/../../wood grain.png'],
	])('maps a map_Kd written as %s to the texture fetched by its name', async (_, map) => {
		const found = await load('chair.mtl', map, [mtl(map), png('wood grain.png')])

		expect(decoded).toEqual(['wood grain.png'])
		expect(found.some((material) => material.map)).toBe(true)
	})

	it('loads nothing for a map it was not given', async () => {
		const found = await load('chair.mtl', 'C:\\textures\\other.png', [mtl('C:\\textures\\other.png'), png('wood grain.png')])

		expect(decoded).toEqual([])
		expect(found.some((material) => material.map)).toBe(false)
	})
})
