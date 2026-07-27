/**
 * Textures on public shares (issue #115 follow-up).
 *
 * Signed in, the loader turns "the texture my material names" into a file id through
 * the file-listing API and fetches it by id. That API needs a session, so on a share
 * page every one of those lookups short-circuits — which is why materials resolved but
 * the images they point at never did.
 *
 * The public path has to work from names alone, through the token-keyed dependency
 * route, and it has to walk the same OBJ → MTL → textures chain to know which names to
 * ask for.
 */

jest.mock('@nextcloud/router', () => ({
	generateUrl: (p) => `/index.php${p}`,
	// viewer-config pulls this in for its format icons; irrelevant here.
	imagePath: (app, p) => `/apps/${app}/img/${p}`,
	generateOcsUrl: (p, params) => {
		const filled = Object.entries(params || {}).reduce(
			(acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
			p,
		)
		return `/ocs/v2.php/${filled}`
	},
}))

jest.mock('../../../src/utils/dependencyCache.js', () => ({
	getCached: jest.fn(),
	setCached: jest.fn(),
	generateCacheKey: jest.fn(),
	isCacheAvailable: () => false,
}))

// jsdom's Blob predates Blob.text(); browsers have had it since 2019 and the loader
// relies on it to read a material back out. Faithful stand-in over FileReader.
if (typeof Blob.prototype.text !== 'function') {
	Blob.prototype.text = function () {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result)
			reader.onerror = reject
			reader.readAsText(this)
		})
	}
}

const OBJ = 'mtllib chair.mtl\nusemtl seat\nf 1 2 3\n'
const MTL = 'newmtl seat\nmap_Kd wood.png\nbump normal.png\n'

/**
 * @param {string} text - body content
 * @return {ArrayBuffer} what response.arrayBuffer() would hand back
 */
function toArrayBuffer(text) {
	const buffer = Buffer.from(text, 'utf8')
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

/** @type {string[]} */
let requested

/**
 * Install a fetch that serves a fixed body map and 404s everything else.
 *
 * @param {Record<string, string>} bodies - URL substring → response body
 */
function serve(bodies) {
	requested = []
	global.fetch = jest.fn(async (url) => {
		requested.push(url)
		const key = Object.keys(bodies).find((k) => url.endsWith(k))
		if (key === undefined) {
			return { ok: false, status: 404, statusText: 'Not Found' }
		}
		const buffer = toArrayBuffer(bodies[key])
		return {
			ok: true,
			status: 200,
			statusText: 'OK',
			headers: { get: () => 'application/octet-stream' },
			arrayBuffer: async () => buffer,
		}
	})
}

/**
 * Import the helpers with the public-share initial state present or absent.
 *
 * @param {object|null} state - share context, or null for an authenticated page
 * @return {Promise<object>} freshly imported module
 */
async function loadHelpers(state) {
	document.body.replaceChildren()
	if (state !== null) {
		const el = document.createElement('input')
		el.type = 'hidden'
		el.id = 'initial-state-threedviewer-publicShare'
		el.value = btoa(JSON.stringify(state))
		document.body.appendChild(el)
	}
	jest.resetModules()
	const share = await import('../../../src/composables/usePublicShare.js')
	share.__resetPublicShareContext()

	return import('../../../src/loaders/multiFileHelpers.js')
}

const PUBLIC = { token: 'Ed96SnZ8K4PW4dx', fileId: 42, isSingleFile: true }
const DEP = '/ocs/v2.php/apps/threedviewer/public/file/Ed96SnZ8K4PW4dx/42/dep'

describe('OBJ dependencies on a public share', () => {
	it('fetches the textures the material names, not just the material', async () => {
		serve({ '/dep/chair.mtl': MTL, '/dep/wood.png': 'PNG', '/dep/normal.png': 'PNG' })
		const { fetchObjDependencies } = await loadHelpers(PUBLIC)

		const result = await fetchObjDependencies(OBJ, 'chair.obj', 42, '')

		expect(result.found.map((f) => f.name).sort()).toEqual(['chair.mtl', 'normal.png', 'wood.png'])
		expect(result.missing).toEqual([])
	})

	it('asks the token-keyed dependency route, keyed by the OBJ that declared them', async () => {
		serve({ '/dep/chair.mtl': MTL, '/dep/wood.png': 'PNG', '/dep/normal.png': 'PNG' })
		const { fetchObjDependencies } = await loadHelpers(PUBLIC)

		await fetchObjDependencies(OBJ, 'chair.obj', 42, '')

		expect(requested).toEqual(expect.arrayContaining([
			`${DEP}/chair.mtl`,
			`${DEP}/wood.png`,
			`${DEP}/normal.png`,
		]))
	})

	it('never touches the file-listing API, which 401s anonymously', async () => {
		serve({ '/dep/chair.mtl': MTL, '/dep/wood.png': 'PNG', '/dep/normal.png': 'PNG' })
		const { fetchObjDependencies } = await loadHelpers(PUBLIC)

		await fetchObjDependencies(OBJ, 'chair.obj', 42, '')

		expect(requested.filter((u) => u.includes('/api/files/'))).toEqual([])
	})

	it('reports a texture the share will not serve instead of failing the model', async () => {
		// The server refuses anything the model does not declare, and a texture can also
		// simply be missing — either way the geometry should still render.
		serve({ '/dep/chair.mtl': MTL, '/dep/wood.png': 'PNG' })
		const { fetchObjDependencies } = await loadHelpers(PUBLIC)

		const result = await fetchObjDependencies(OBJ, 'chair.obj', 42, '')

		expect(result.found.map((f) => f.name).sort()).toEqual(['chair.mtl', 'wood.png'])
		expect(result.missing).toEqual(['normal.png'])
	})

	it('degrades to geometry alone when the material itself is refused', async () => {
		serve({})
		const { fetchObjDependencies } = await loadHelpers(PUBLIC)

		const result = await fetchObjDependencies(OBJ, 'chair.obj', 42, '')

		expect(result.found).toEqual([])
		expect(result.missing).toEqual(['chair.mtl'])
	})
})

describe('OBJ dependencies on an authenticated page', () => {
	it('still resolves through the file-listing API', async () => {
		requested = []
		global.fetch = jest.fn(async (url) => {
			requested.push(url)
			if (url.includes('/api/files/find')) {
				return { ok: true, status: 200, json: async () => ({ id: 7 }) }
			}
			const buffer = toArrayBuffer(MTL)
			return {
				ok: true,
				status: 200,
				statusText: 'OK',
				headers: { get: () => 'model/mtl' },
				arrayBuffer: async () => buffer,
			}
		})
		const { fetchObjDependencies } = await loadHelpers(null)

		await fetchObjDependencies(OBJ, 'chair.obj', 42, '')

		expect(requested.some((u) => u.includes('/api/files/find'))).toBe(true)
		expect(requested.some((u) => u.includes('/dep/'))).toBe(false)
	})
})

describe('FBX and 3DS dependencies on a public share', () => {
	const FBX_ASCII = [
		'; FBX 7.4.0 project file',
		'Objects:  {',
		'\tTexture: 1234, "Texture::map", "" {',
		'\t\tRelativeFilename: "textures/wood.png"',
		'\t}',
		'}',
	].join('\n')

	/**
	 * Smallest 3DS that declares one texture: main > editor > material > map > name.
	 *
	 * @param {string} name - the map name to declare
	 * @return {ArrayBuffer} document bytes
	 */
	function threeDsWith(name) {
		const chunk = (id, body) => {
			const out = new Uint8Array(6 + body.length)
			const view = new DataView(out.buffer)
			view.setUint16(0, id, true)
			view.setUint32(2, out.length, true)
			out.set(body, 6)
			return out
		}
		const asciiz = Uint8Array.from([...name].map((c) => c.charCodeAt(0)).concat(0))
		return chunk(0x4d4d, chunk(0x3d3d, chunk(0xafff, chunk(0xa200, chunk(0xa300, asciiz))))).buffer
	}

	it('fetches the texture an FBX names, rather than listing the folder', async () => {
		serve({ '/dep/wood.png': 'PNG' })
		const { fetchBinaryDependencies } = await loadHelpers(PUBLIC)

		const result = await fetchBinaryDependencies(
			new TextEncoder().encode(FBX_ASCII).buffer, 'fbx', 42, '',
		)

		expect(result.found.map((f) => f.name)).toEqual(['wood.png'])
		expect(requested).toEqual([`${DEP}/wood.png`])
	})

	it('keeps the declared subdirectory so the loader can match the FBX reference', async () => {
		serve({ '/dep/wood.png': 'PNG' })
		const { fetchBinaryDependencies } = await loadHelpers(PUBLIC)

		const result = await fetchBinaryDependencies(
			new TextEncoder().encode(FBX_ASCII).buffer, 'fbx', 42, '',
		)

		expect(result.found[0]._relativePath).toBe('textures/wood.png')
	})

	it('fetches the map name a 3DS declares', async () => {
		serve({ '/dep/WOOD.JPG': 'JPG' })
		const { fetchBinaryDependencies } = await loadHelpers(PUBLIC)

		const result = await fetchBinaryDependencies(threeDsWith('WOOD.JPG'), '3ds', 42, '')

		expect(result.found.map((f) => f.name)).toEqual(['WOOD.JPG'])
	})

	it('never touches the file-listing API, which 401s anonymously', async () => {
		serve({ '/dep/wood.png': 'PNG' })
		const { fetchBinaryDependencies } = await loadHelpers(PUBLIC)

		await fetchBinaryDependencies(new TextEncoder().encode(FBX_ASCII).buffer, 'fbx', 42, '')

		expect(requested.filter((u) => u.includes('/api/files/'))).toEqual([])
	})

	it('reports a declared texture the share will not serve instead of failing the model', async () => {
		serve({})
		const { fetchBinaryDependencies } = await loadHelpers(PUBLIC)

		const result = await fetchBinaryDependencies(
			new TextEncoder().encode(FBX_ASCII).buffer, 'fbx', 42, '',
		)

		expect(result.found).toEqual([])
		expect(result.missing).toEqual(['textures/wood.png'])
	})

	it('declares nothing for a model that names no textures', async () => {
		serve({})
		const { fetchBinaryDependencies } = await loadHelpers(PUBLIC)

		const result = await fetchBinaryDependencies(new ArrayBuffer(0), 'fbx', 42, '')

		expect(result.found).toEqual([])
		expect(requested).toEqual([])
	})
})

describe('glTF dependencies on a public share', () => {
	const GLTF = JSON.stringify({
		buffers: [{ uri: 'scene.bin' }],
		images: [{ uri: 'textures/diffuse.png' }],
	})

	it('fetches external buffers and images by name', async () => {
		serve({ '/dep/scene.bin': 'BIN', '/dep/diffuse.png': 'PNG' })
		const { fetchGltfDependencies } = await loadHelpers(PUBLIC)

		const result = await fetchGltfDependencies(GLTF, 'scene.gltf', 42, '')

		expect(result.found.map((f) => f.name).sort()).toEqual(['diffuse.png', 'scene.bin'])
		expect(requested).toEqual(expect.arrayContaining([`${DEP}/scene.bin`, `${DEP}/diffuse.png`]))
	})

	it('keeps the declared subdirectory on the file so the loader can match its URI', async () => {
		serve({ '/dep/scene.bin': 'BIN', '/dep/diffuse.png': 'PNG' })
		const { fetchGltfDependencies } = await loadHelpers(PUBLIC)

		const result = await fetchGltfDependencies(GLTF, 'scene.gltf', 42, '')
		const image = result.found.find((f) => f.name === 'diffuse.png')

		expect(image._relativePath).toBe('textures/diffuse.png')
	})
})
