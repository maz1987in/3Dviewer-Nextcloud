/**
 * The background load mode: only declared companions, each checked against the budget
 * before it is fetched, one signal through every request, and no folder ever listed.
 *
 * The viewer's loader is run against the same server in one test, to show what the
 * background mode is protecting against: an FBX with no declared textures makes it list
 * the folder tree and download every image in it.
 */
import { loadModelForBackground } from '../../../src/thumbnails/backgroundLoad.js'
import { createBackgroundQueue } from '../../../src/thumbnails/backgroundQueue.js'
import { ThumbnailBudgetError, ThumbnailEnvironmentError } from '../../../src/thumbnails/errors.js'
import { loadModelWithDependencies } from '../../../src/loaders/multiFileHelpers.js'
import * as THREE from 'three'
import X3dLoader from '../../../src/loaders/types/x3d.js'
import DaeLoader from '../../../src/loaders/types/dae.js'

jest.mock('@nextcloud/router', () => ({
	generateUrl: (p) => `/index.php${p}`,
	imagePath: (app, p) => `/apps/${app}/img/${p}`,
	generateOcsUrl: (p) => `/ocs/v2.php/${p}`,
}))

jest.mock('../../../src/utils/dependencyCache.js', () => ({
	getCached: jest.fn(),
	setCached: jest.fn(),
	generateCacheKey: jest.fn(),
	isCacheAvailable: () => false,
}))

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// jsdom's Blob predates Blob.arrayBuffer(), which the queue reads the model with
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

// jsdom's Blob predates Blob.text(); browsers have had it since 2019
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

const MB = 1048576

/**
 * @param {string|number} content - Text, or a byte count of zeros
 * @return {ArrayBuffer} The bytes
 */
function bytes(content) {
	if (typeof content === 'number') {
		return new ArrayBuffer(content)
	}
	const buffer = Buffer.from(content, 'utf8')
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

/**
 * A stand-in for a user's files on the server.
 *
 * `files` maps a path below the user root to `{ id, body, size? }`; `size` is what the
 * lookup reports, which defaults to the body's length. Every request is recorded with
 * the signal it was given.
 *
 * @param {Record<string, {id: number, body: string|number, size?: number|null}>} files - The tree
 * @return {{requests: {url: string, signal: ?AbortSignal}[], urls: () => string[]}} The log
 */
function serve(files) {
	const requests = []
	const byId = new Map(Object.values(files).map((file) => [file.id, file]))
	const ok = (buffer, type = 'application/octet-stream') => ({
		ok: true,
		status: 200,
		headers: { get: (name) => (name === 'content-type' ? type : null) },
		arrayBuffer: async () => buffer,
		json: async () => JSON.parse(Buffer.from(buffer).toString('utf8')),
	})
	const missing = { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) }

	global.fetch = jest.fn(async (url, init = {}) => {
		requests.push({ url, signal: init.signal ?? null })
		const parsed = new URL(url, 'https://cloud.example.com')
		const fileMatch = /\/api\/file\/(\d+)$/.exec(parsed.pathname)
		if (fileMatch) {
			const file = byId.get(Number(fileMatch[1]))
			return file ? ok(bytes(file.body)) : missing
		}
		if (parsed.pathname.endsWith('/api/files/find')) {
			const path = parsed.searchParams.get('path')
			const file = files[path]
			if (!file) {
				return missing
			}
			const size = 'size' in file ? file.size : bytes(file.body).byteLength
			return ok(bytes(JSON.stringify({ id: file.id, name: path.split('/').pop(), size })))
		}
		if (parsed.pathname.endsWith('/api/files/list')) {
			// What the viewer's FBX fallback walks: every image in the folder tree
			const folder = parsed.searchParams.get('folder') ?? ''
			const inFolder = Object.entries(files).filter(([path]) => path.slice(0, path.lastIndexOf('/')) === folder)
			const subfolders = [...new Set(Object.keys(files)
				.filter((path) => path.startsWith(`${folder}/`) && path.slice(folder.length + 1).includes('/'))
				.map((path) => `${folder}/${path.slice(folder.length + 1).split('/')[0]}`))]
			return ok(bytes(JSON.stringify({
				files: inFolder.map(([path, file]) => ({ id: file.id, name: path.split('/').pop() })),
				folders: subfolders.map((path) => ({ name: path.split('/').pop(), path })),
			})))
		}
		return missing
	})

	return { requests, urls: () => requests.map((request) => request.url) }
}

const ASCII_FBX_WITHOUT_TEXTURES = '; FBX 7.4.0 project file\nFBXHeaderExtension:  {\n}\nObjects:  {\n}\n'

/** An ASCII FBX whose only texture is embedded as base64 Content in its Video node. */
const EMBEDDED_FBX = [
	'; FBX 7.4.0 project file',
	'Objects:  {',
	'\tVideo: 1, "Video::wood", "Clip" {',
	'\t\tRelativeFilename: "wood.png"',
	'\t\tContent: ,',
	'\t\t\t"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"',
	'\t}',
	'\tTexture: 2, "Texture::wood", "" {',
	'\t\tRelativeFilename: "wood.png"',
	'\t}',
	'}',
].join('\n')

/** A folder holding an untextured FBX, with a photo library beside and below it. */
const PHOTO_FOLDER = {
	'Projects/robot.fbx': { id: 10, body: ASCII_FBX_WITHOUT_TEXTURES },
	'Projects/cover.png': { id: 11, body: 'PNG' },
	'Projects/photos/a.jpg': { id: 12, body: 'JPG' },
	'Projects/photos/b.jpg': { id: 13, body: 'JPG' },
	'Projects/photos/2024/c.tga': { id: 14, body: 'TGA' },
}

describe('loadModelForBackground', () => {
	it('an untextured FBX next to a folder of images downloads only the FBX, and lists nothing', async () => {
		const server = serve(PHOTO_FOLDER)

		const result = await loadModelForBackground(10, 'robot.fbx', 'fbx', '/Projects', { budgetBytes: 500 * MB })

		expect(server.urls()).toEqual(['/index.php/apps/threedviewer/api/file/10'])
		expect(server.urls().some((url) => url.includes('/api/files/list'))).toBe(false)
		expect(result.mainFile.name).toBe('robot.fbx')
		expect(result.dependencies).toEqual([])
	})

	it('(the viewer\'s loader, for contrast, lists the tree and downloads every image)', async () => {
		const server = serve(PHOTO_FOLDER)

		await loadModelWithDependencies(10, 'robot.fbx', 'fbx', 'Projects')

		expect(server.urls().filter((url) => url.includes('/api/files/list')).length).toBeGreaterThan(0)
		expect(server.urls()).toEqual(expect.arrayContaining([
			'/index.php/apps/threedviewer/api/file/11',
			'/index.php/apps/threedviewer/api/file/12',
			'/index.php/apps/threedviewer/api/file/14',
		]))
	})

	it('a .gltf whose .bin is over the remaining budget stops before fetching it', async () => {
		const gltf = JSON.stringify({ buffers: [{ uri: 'scene.bin' }], images: [{ uri: 'small.png' }] })
		const server = serve({
			'models/scene.gltf': { id: 20, body: gltf },
			'models/scene.bin': { id: 21, body: 16, size: 5 * MB },
			'models/small.png': { id: 22, body: 'PNG' },
		})
		const budgetBytes = bytes(gltf).byteLength + MB

		const result = await loadModelForBackground(20, 'scene.gltf', 'gltf', '/models', { budgetBytes })

		expect(server.urls()).not.toContain('/index.php/apps/threedviewer/api/file/21')
		// Once one does not fit no more are fetched, even a small one after it
		expect(server.urls()).not.toContain('/index.php/apps/threedviewer/api/file/22')
		expect(result.dependencies).toEqual([])
		expect(result.missingFiles).toEqual(['scene.bin', 'small.png'])
		// Reported as the budget's doing, with what the load would have needed so far
		expect(result.budgetReached).toBe(true)
		expect(result.bytesNeeded).toBe(bytes(gltf).byteLength + 5 * MB)
	})

	it('a declared companion that is not there is reported missing, not as the budget', async () => {
		const server = serve({
			'parts/chair.obj': { id: 30, body: 'mtllib chair.mtl\nf 1 2 3\n' },
			'parts/chair.mtl': { id: 31, body: 'newmtl seat\nmap_Kd textures/wood.png\nbump normal.png\n' },
			'parts/normal.png': { id: 33, body: 'PNG' },
		})

		const result = await loadModelForBackground(30, 'chair.obj', 'obj', '/parts', { budgetBytes: MB })

		expect(result.budgetReached).toBe(false)
		expect(result.missingFiles).toEqual(['textures/wood.png', 'normal.png'])
		// The thumbnail will not be made from this load, so nothing more is downloaded for it
		expect(server.urls()).not.toContain('/index.php/apps/threedviewer/api/file/33')
	})

	it('an FBX that declares no textures reports nothing missing', async () => {
		serve(PHOTO_FOLDER)

		const result = await loadModelForBackground(10, 'robot.fbx', 'fbx', '/Projects', { budgetBytes: 500 * MB })

		expect(result).toMatchObject({ dependencies: [], missingFiles: [], budgetReached: false })
	})

	it('an FBX with an embedded texture reports nothing missing and asks for nothing beside it', async () => {
		// The image travels inside the model, so the file must render rather than be
		// skipped for a companion that was never meant to exist.
		const server = serve({ 'Projects/robot.fbx': { id: 10, body: EMBEDDED_FBX } })

		const result = await loadModelForBackground(10, 'robot.fbx', 'fbx', '/Projects', { budgetBytes: MB })

		expect(result).toMatchObject({ dependencies: [], missingFiles: [], budgetReached: false })
		expect(server.urls()).toEqual(['/index.php/apps/threedviewer/api/file/10'])
	})

	it('(the viewer\'s loader neither looks up an embedded texture nor lists the folder for one)', async () => {
		const server = serve({
			...PHOTO_FOLDER,
			'Projects/robot.fbx': { id: 10, body: EMBEDDED_FBX },
			'Projects/wood.png': { id: 15, body: 'PNG' },
		})

		const result = await loadModelWithDependencies(10, 'robot.fbx', 'fbx', 'Projects')

		expect(result.missingFiles).toEqual([])
		expect(server.urls()).toEqual(['/index.php/apps/threedviewer/api/file/10'])
	})

	it('fetches declared glTF companions that fit, buffers first, and counts every byte', async () => {
		const gltf = JSON.stringify({ images: [{ uri: 'textures/wood.png' }], buffers: [{ uri: 'scene.bin' }] })
		const server = serve({
			'models/scene.gltf': { id: 20, body: gltf },
			'models/scene.bin': { id: 21, body: 64 },
			'models/textures/wood.png': { id: 22, body: 32 },
		})
		const onBytes = jest.fn()

		const result = await loadModelForBackground(20, 'scene.gltf', 'gltf', '/models', { budgetBytes: MB, onBytes })

		expect(server.urls()).toEqual([
			'/index.php/apps/threedviewer/api/file/20',
			`/index.php/apps/threedviewer/api/files/find?path=${encodeURIComponent('models/scene.bin')}`,
			'/index.php/apps/threedviewer/api/file/21',
			`/index.php/apps/threedviewer/api/files/find?path=${encodeURIComponent('models/textures/wood.png')}`,
			'/index.php/apps/threedviewer/api/file/22',
		])
		expect(result.dependencies.map((file) => file.name)).toEqual(['scene.bin', 'wood.png'])
		const received = onBytes.mock.calls.reduce((sum, [n]) => sum + n, 0)
		expect(received).toBe(bytes(gltf).byteLength + 64 + 32)
	})

	it('fetches the images a COLLADA or X3D file declares, by declared path then by name beside it', async () => {
		const dae = '<COLLADA><library_images><image id="a"><init_from>textures/wood.png</init_from></image><image id="b"><init_from>C:/export/metal.png</init_from></image></library_images></COLLADA>'
		const x3d = '<X3D><Scene><Shape><Appearance><ImageTexture url=\'"maps/stone.png" "https://example.com/stone.png"\'/></Appearance></Shape></Scene></X3D>'
		const server = serve({
			'models/chair.dae': { id: 40, body: dae },
			'models/textures/wood.png': { id: 41, body: 16 },
			'models/metal.png': { id: 42, body: 16 },
			'models/wall.x3d': { id: 43, body: x3d },
			'models/stone.png': { id: 44, body: 16 },
		})

		const fromDae = await loadModelForBackground(40, 'chair.dae', 'dae', '/models', { budgetBytes: MB })
		const fromX3d = await loadModelForBackground(43, 'wall.x3d', 'x3d', '/models', { budgetBytes: MB })

		// A drive-letter path is from the author's machine, so it is looked for by its name
		// beside the model, and only there
		expect(fromDae.dependencies.map((file) => file.name)).toEqual(['wood.png', 'metal.png'])
		expect(fromDae.missingFiles).toEqual([])
		expect(server.urls().filter((url) => url.includes('metal.png'))).toEqual([
			`/index.php/apps/threedviewer/api/files/find?path=${encodeURIComponent('models/metal.png')}`,
		])
		// Not at maps/stone.png, so by its name beside the model; the remote one is not a companion
		expect(fromX3d.dependencies.map((file) => file.name)).toEqual(['stone.png'])
		expect(fromX3d.missingFiles).toEqual([])
		expect(server.urls().filter((url) => new URL(url, 'http://localhost').hostname === 'example.com')).toEqual([])
	})

	it('a COLLADA image that is not beside the model is reported missing', async () => {
		serve({
			'models/chair.dae': { id: 40, body: '<COLLADA><library_images><image id="a"><init_from>wood.png</init_from></image></library_images></COLLADA>' },
		})

		const result = await loadModelForBackground(40, 'chair.dae', 'dae', '/models', { budgetBytes: MB })

		expect(result.missingFiles).toEqual(['wood.png'])
		expect(result.budgetReached).toBe(false)
	})

	it('a 3MF or AMF declares no companions: a 3MF carries its textures, an AMF has none', async () => {
		const server = serve({
			'models/part.3mf': { id: 50, body: 'PK\u0003\u0004 3D/Texture/a.png' },
			'models/part.amf': { id: 51, body: '<amf><texture id="1">AAAA</texture></amf>' },
		})

		for (const [id, name, extension] of [[50, 'part.3mf', '3mf'], [51, 'part.amf', 'amf']]) {
			const result = await loadModelForBackground(id, name, extension, '/models', { budgetBytes: MB })
			expect(result).toMatchObject({ dependencies: [], missingFiles: [] })
		}
		expect(server.urls()).toEqual([
			'/index.php/apps/threedviewer/api/file/50',
			'/index.php/apps/threedviewer/api/file/51',
		])
	})

	it('does not fetch a companion whose size the lookup does not report', async () => {
		const gltf = JSON.stringify({ buffers: [{ uri: 'scene.bin' }] })
		const server = serve({
			'models/scene.gltf': { id: 20, body: gltf },
			'models/scene.bin': { id: 21, body: 64, size: null },
		})

		const result = await loadModelForBackground(20, 'scene.gltf', 'gltf', '/models', { budgetBytes: MB })

		expect(server.urls()).not.toContain('/index.php/apps/threedviewer/api/file/21')
		expect(result.missingFiles).toEqual(['scene.bin'])
	})

	it('resolves an OBJ\'s material and its maps by declared path, then by name beside the model', async () => {
		const server = serve({
			'parts/chair.obj': { id: 30, body: 'mtllib chair.mtl\nf 1 2 3\n' },
			'parts/chair.mtl': { id: 31, body: 'newmtl seat\nmap_Kd C:\\Users\\me\\wood.png\nbump maps/normal.png\n' },
			'parts/wood.png': { id: 32, body: 'PNG' },
			'parts/maps/normal.png': { id: 33, body: 'PNG' },
			'parts/unrelated.png': { id: 34, body: 'PNG' },
		})

		const result = await loadModelForBackground(30, 'chair.obj', 'obj', '/parts', { budgetBytes: MB })

		expect(result.dependencies.map((file) => file.name)).toEqual(['chair.mtl', 'wood.png', 'normal.png'])
		expect(server.urls()).not.toContain('/index.php/apps/threedviewer/api/file/34')
		expect(server.urls().some((url) => url.includes('/api/files/list'))).toBe(false)
	})

	it('looks for an MTL map named by an absolute path or a file: URL by its name beside the model only', async () => {
		const server = serve({
			'parts/chair.obj': { id: 30, body: 'mtllib chair.mtl\nf 1 2 3\n' },
			'parts/chair.mtl': { id: 31, body: 'newmtl seat\nmap_Kd file:///C:/My%20Textures/wood%20grain.png\nbump /home/anna/maps/normal.png\n' },
			'parts/wood grain.png': { id: 32, body: 'PNG' },
			'parts/normal.png': { id: 33, body: 'PNG' },
			// Where the absolute path's own directories would lead, were they followed
			'parts/home/anna/maps/normal.png': { id: 34, body: 'PNG' },
		})

		const result = await loadModelForBackground(30, 'chair.obj', 'obj', '/parts', { budgetBytes: MB })

		expect(result.dependencies.map((file) => file.name)).toEqual(['chair.mtl', 'wood grain.png', 'normal.png'])
		expect(result.missingFiles).toEqual([])
		expect(server.urls().filter((url) => url.includes('/api/files/find'))).toEqual([
			`/index.php/apps/threedviewer/api/files/find?path=${encodeURIComponent('parts/chair.mtl')}`,
			`/index.php/apps/threedviewer/api/files/find?path=${encodeURIComponent('parts/wood grain.png')}`,
			`/index.php/apps/threedviewer/api/files/find?path=${encodeURIComponent('parts/normal.png')}`,
		])
	})

	it('passes the one signal to every request', async () => {
		const gltf = JSON.stringify({ buffers: [{ uri: 'scene.bin' }] })
		const server = serve({
			'models/scene.gltf': { id: 20, body: gltf },
			'models/scene.bin': { id: 21, body: 64 },
		})
		const { signal } = new AbortController()

		await loadModelForBackground(20, 'scene.gltf', 'gltf', '/models', { signal, budgetBytes: MB })

		expect(server.requests).toHaveLength(3)
		expect(server.requests.every((request) => request.signal === signal)).toBe(true)
	})

	it('an abort mid-download rejects with AbortError after counting the bytes received', async () => {
		const controller = new AbortController()
		const onBytes = jest.fn()
		global.fetch = jest.fn(async (url, { signal }) => ({
			ok: true,
			status: 200,
			headers: { get: () => null },
			body: {
				getReader: () => {
					let calls = 0
					return {
						read: () => {
							calls += 1
							if (calls === 1) {
								return Promise.resolve({ done: false, value: new Uint8Array(1000) })
							}
							return new Promise((resolve, reject) => {
								signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
							})
						},
						cancel: () => Promise.resolve(),
					}
				},
			},
		}))

		const loading = loadModelForBackground(1, 'big.stl', 'stl', '/', { signal: controller.signal, budgetBytes: MB, onBytes })
		await new Promise((resolve) => setTimeout(resolve, 0))
		controller.abort()

		const error = await loading.catch((e) => e)
		expect(error.name).toBe('AbortError')
		expect(onBytes).toHaveBeenCalledWith(1000)
	})

	it('a main file larger than the budget stops with ThumbnailBudgetError', async () => {
		serve({ 'big.stl': { id: 1, body: 2048 } })

		const error = await loadModelForBackground(1, 'big.stl', 'stl', '/', { budgetBytes: 1024 }).catch((e) => e)

		expect(error).toBeInstanceOf(ThumbnailBudgetError)
	})

	it('a network error or a 5xx is an environment failure; a 4xx is not', async () => {
		global.fetch = jest.fn(async () => {
			throw new TypeError('Failed to fetch')
		})
		await expect(loadModelForBackground(1, 'a.stl', 'stl', '/')).rejects.toBeInstanceOf(ThumbnailEnvironmentError)

		global.fetch = jest.fn(async () => ({ ok: false, status: 503, headers: { get: () => null } }))
		await expect(loadModelForBackground(1, 'a.stl', 'stl', '/')).rejects.toBeInstanceOf(ThumbnailEnvironmentError)

		global.fetch = jest.fn(async () => ({ ok: false, status: 404, headers: { get: () => null } }))
		const notFound = await loadModelForBackground(1, 'a.stl', 'stl', '/').catch((e) => e)
		expect(notFound).toBeInstanceOf(Error)
		expect(notFound).not.toBeInstanceOf(ThumbnailEnvironmentError)
	})

	it('a 5xx on a companion is an environment failure, so no untextured thumbnail is stored for it', async () => {
		const gltf = JSON.stringify({ buffers: [{ uri: 'scene.bin' }] })
		serve({
			'models/scene.gltf': { id: 20, body: gltf },
			'models/scene.bin': { id: 21, body: 64 },
		})
		const serveFiles = global.fetch
		global.fetch = jest.fn(async (url, init) => (url.endsWith('/api/file/21')
			? { ok: false, status: 500, headers: { get: () => null } }
			: serveFiles(url, init)))

		await expect(loadModelForBackground(20, 'scene.gltf', 'gltf', '/models', { budgetBytes: MB }))
			.rejects.toBeInstanceOf(ThumbnailEnvironmentError)
	})
})

describe('loadModelForBackground in the queue', () => {
	/**
	 * The real queue on the real loader and the fake server, rendering with a stand-in
	 * that fails the way the worker does when a glTF arrives without its buffer.
	 *
	 * @param {object} statuses - Status by file id
	 * @param {number} folderBudgetMB - Budget per visit
	 * @param {Function} [render] - Stands in for the worker, instead of the default stub
	 * @return {object} The queue and the fakes to inspect
	 */
	function queueOn(statuses, folderBudgetMB, render = null) {
		const skipped = new Set()
		const deps = {
			settings: { background: true, maxFileSizeMB: 100, timeoutSeconds: 60, folderBudgetMB },
			api: {
				fetchStatus: jest.fn(async (ids) => new Map(ids.map((id) => [id, statuses[id]]))),
				uploadThumbnail: jest.fn(async () => 'stored'),
			},
			load: loadModelForBackground,
			render: render ? jest.fn(render) : jest.fn(async (job) => {
				if (job.extension === 'gltf' && !job.additionalFiles.some((file) => file.name === 'scene.bin')) {
					throw new Error('THREE.GLTFLoader: Failed to load buffer "scene.bin".')
				}
				return { type: 'image/png', size: 4 }
			}),
			skips: {
				isSkipped: (id, etag) => skipped.has(`${id}:${etag}`),
				markSkipped: jest.fn((id, etag) => skipped.add(`${id}:${etag}`)),
			},
			env: { isPaused: () => false, onResume: () => {}, whenIdle: async () => {} },
		}
		return { queue: createBackgroundQueue(deps), deps }
	}

	it('a .gltf whose .bin is over what is left of the budget waits for the next visit', async () => {
		const gltf = JSON.stringify({ buffers: [{ uri: 'scene.bin' }] })
		const server = serve({
			'models/big.stl': { id: 1, body: 8 * MB },
			'models/scene.gltf': { id: 2, body: gltf },
			'models/scene.bin': { id: 3, body: 5 * MB },
		})
		const statuses = {
			1: { name: 'big.stl', dir: '/models', size: 8 * MB, etag: 'e1', canEdit: true, hasThumbnail: false },
			2: { name: 'scene.gltf', dir: '/models', size: bytes(gltf).byteLength, etag: 'e2', canEdit: true, hasThumbnail: false },
		}
		const { queue, deps } = queueOn(statuses, 10)

		// The STL leaves 2 MB, too little for the 5 MB buffer
		queue.setFolder('/models', [1, 2], new Set())
		await queue.idle()

		expect(server.urls()).not.toContain('/index.php/apps/threedviewer/api/file/3')
		expect(deps.render.mock.calls.map(([job]) => job.extension)).toEqual(['stl'])
		expect(deps.skips.markSkipped).not.toHaveBeenCalled()

		// Next visit: the STL is done, and the glTF gets the whole budget
		statuses[1].hasThumbnail = true
		queue.setFolder('/elsewhere', [], new Set())
		queue.setFolder('/models', [1, 2], new Set())
		await queue.idle()

		expect(deps.render.mock.calls.map(([job]) => job.extension)).toEqual(['stl', 'gltf'])
		expect(deps.api.uploadThumbnail.mock.calls.map(([id]) => id)).toEqual([1, 2])
		expect(deps.skips.markSkipped).not.toHaveBeenCalled()
	})

	it('an OBJ whose MTL names a texture that is not beside it is skipped, not rendered untextured', async () => {
		serve({
			'parts/chair.obj': { id: 30, body: 'mtllib chair.mtl\nf 1 2 3\n' },
			'parts/chair.mtl': { id: 31, body: 'newmtl seat\nmap_Kd textures/wood.png\n' },
			// Where the viewer, which searches subfolders, would find it; the background does not look
			'parts/maps/wood.png': { id: 32, body: 'PNG' },
		})
		const statuses = { 30: { name: 'chair.obj', dir: '/parts', size: 64, etag: 'e30', canEdit: true, hasThumbnail: false } }
		const { queue, deps } = queueOn(statuses, 10)

		queue.setFolder('/parts', [30], new Set())
		await queue.idle()

		expect(deps.render).not.toHaveBeenCalled()
		expect(deps.api.uploadThumbnail).not.toHaveBeenCalled()
		expect(deps.skips.markSkipped.mock.calls).toEqual([[30, 'e30']])
	})

	it('a Blender-style DAE declares only its image file, and is rendered with it', async () => {
		// The effect's <surface><init_from> holds the image's id, not a file; taken for
		// one, it was always missing and every textured export was skipped
		const dae = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<library_images><image id="img" name="img"><init_from>checker.png</init_from></image></library_images>
<library_effects><effect id="fx"><profile_COMMON>
<newparam sid="surf"><surface type="2D"><init_from>img</init_from></surface></newparam>
<newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam>
<technique sid="common"><lambert><diffuse><texture texture="samp" texcoord="UV"/></diffuse></lambert></technique>
</profile_COMMON></effect></library_effects>
</COLLADA>`
		const server = serve({
			'scenes/quad.dae': { id: 70, body: dae },
			'scenes/checker.png': { id: 71, body: 'PNG' },
		})
		const statuses = { 70: { name: 'quad.dae', dir: '/scenes', size: dae.length, etag: 'e70', canEdit: true, hasThumbnail: false } }
		const { queue, deps } = queueOn(statuses, 10)

		queue.setFolder('/scenes', [70], new Set())
		await queue.idle()

		expect(server.urls().filter((url) => url.includes('/api/files/find'))).toEqual([
			`/index.php/apps/threedviewer/api/files/find?path=${encodeURIComponent('scenes/checker.png')}`,
		])
		expect(deps.render.mock.calls.map(([job]) => job.additionalFiles.map((file) => file.name))).toEqual([['checker.png']])
		expect(deps.api.uploadThumbnail.mock.calls.map(([id]) => id)).toEqual([70])
		expect(deps.skips.markSkipped).not.toHaveBeenCalled()
	})

	it('a DAE naming its image by a Windows path fetches it by name beside the model, renders and uploads', async () => {
		const dae = '<COLLADA><library_images><image id="img"><init_from>C:\\textures\\wood.png</init_from></image></library_images></COLLADA>'
		const server = serve({
			'scenes/room.dae': { id: 80, body: dae },
			'scenes/wood.png': { id: 81, body: 'PNG' },
		})
		const statuses = { 80: { name: 'room.dae', dir: '/scenes', size: dae.length, etag: 'e80', canEdit: true, hasThumbnail: false } }
		const { queue, deps } = queueOn(statuses, 10)

		queue.setFolder('/scenes', [80], new Set())
		await queue.idle()

		expect(server.urls().filter((url) => url.includes('/api/files/find'))).toEqual([
			`/index.php/apps/threedviewer/api/files/find?path=${encodeURIComponent('scenes/wood.png')}`,
		])
		expect(server.urls()).toContain('/index.php/apps/threedviewer/api/file/81')
		expect(deps.render.mock.calls.map(([job]) => job.additionalFiles.map((file) => file.name))).toEqual([['wood.png']])
		expect(deps.api.uploadThumbnail.mock.calls.map(([id]) => id)).toEqual([80])
		expect(deps.skips.markSkipped).not.toHaveBeenCalled()
	})

	it('a DAE naming its image by a Windows path that is not beside it is skipped, even when the path exists below', async () => {
		serve({
			'scenes/room.dae': { id: 90, body: '<COLLADA><library_images><image id="img"><init_from>file:///C:/textures/wood.png</init_from></image></library_images></COLLADA>' },
			// The directories of an absolute path are never followed
			'scenes/C:/textures/wood.png': { id: 91, body: 'PNG' },
			'scenes/textures/wood.png': { id: 92, body: 'PNG' },
		})
		const statuses = { 90: { name: 'room.dae', dir: '/scenes', size: 128, etag: 'e90', canEdit: true, hasThumbnail: false } }
		const { queue, deps } = queueOn(statuses, 10)

		queue.setFolder('/scenes', [90], new Set())
		await queue.idle()

		expect(deps.render).not.toHaveBeenCalled()
		expect(deps.api.uploadThumbnail).not.toHaveBeenCalled()
		expect(deps.skips.markSkipped.mock.calls).toEqual([[90, 'e90']])
	})

	describe('with the real loader drawing the model', () => {
		/** A 1×1 PNG. */
		const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
		const QUERY_URL = 'file:///C:/x/checker.png?v=2#top'

		let imageLoads
		beforeEach(() => {
			imageLoads = []
			// What the worker's image decoder would be asked to load, after the loader's
			// own manager has had its say
			jest.spyOn(THREE.ImageLoader.prototype, 'load').mockImplementation(function(url) {
				imageLoads.push(this.manager.resolveURL(this.path === undefined ? url : this.path + url))
				return null
			})
		})
		afterEach(() => jest.restoreAllMocks())

		/**
		 * @param {object} object3D - Loaded model
		 * @return {boolean} Whether any mesh got a texture
		 */
		const textured = (object3D) => {
			let found = false
			object3D.traverse((child) => {
				if (child.isMesh && [].concat(child.material).some((material) => material?.map)) {
					found = true
				}
			})
			return found
		}

		it('an X3D naming its image by a file: URL with a query renders textured, or is not uploaded', async () => {
			const x3d = `<X3D><Scene><Shape><Appearance><Material/><ImageTexture url='"${QUERY_URL}"'/></Appearance>
<IndexedFaceSet coordIndex="0 1 2 3 -1" texCoordIndex="0 1 2 3 -1"><Coordinate point="0 0 0 1 0 0 1 1 0 0 1 0"/><TextureCoordinate point="0 0 1 0 1 1 0 1"/></IndexedFaceSet>
</Shape></Scene></X3D>`
			serve({
				'scenes/wall.x3d': { id: 100, body: x3d },
				'scenes/checker.png': { id: 101, body: PNG.toString('latin1') },
			})
			const statuses = { 100: { name: 'wall.x3d', dir: '/scenes', size: x3d.length, etag: 'e100', canEdit: true, hasThumbnail: false } }
			const { queue, deps } = queueOn(statuses, 10, async (job) => {
				const files = job.additionalFiles.map((file) => new File([file], file.name, { type: 'image/png' }))
				const { object3D } = await new X3dLoader().loadModel(job.buffer, { THREE, additionalFiles: files })
				if (!textured(object3D)) {
					throw new Error('rendered untextured')
				}
				return { type: 'image/png', size: 4 }
			})

			queue.setFolder('/scenes', [100], new Set())
			await queue.idle()

			expect(deps.render).toHaveBeenCalledTimes(1)
			await expect(deps.render.mock.results[0].value).resolves.toEqual({ type: 'image/png', size: 4 })
			expect(deps.api.uploadThumbnail.mock.calls.map(([id]) => id)).toEqual([100])
		})

		it('a DAE naming its image by a file: URL with a query loads the fetched file, not the URL', async () => {
			const dae = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><up_axis>Y_UP</up_axis></asset>
<library_images><image id="img"><init_from>${QUERY_URL.replace('&', '&amp;')}</init_from></image></library_images>
<library_effects><effect id="fx"><profile_COMMON><newparam sid="surf"><surface type="2D"><init_from>img</init_from></surface></newparam><newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam><technique sid="common"><lambert><diffuse><texture texture="samp" texcoord="UV"/></diffuse></lambert></technique></profile_COMMON></effect></library_effects>
<library_materials><material id="mat"><instance_effect url="#fx"/></material></library_materials>
<library_geometries><geometry id="quad"><mesh>
<source id="pos"><float_array id="pos-a" count="12">0 0 0 1 0 0 1 1 0 0 1 0</float_array><technique_common><accessor source="#pos-a" count="4" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<source id="uv"><float_array id="uv-a" count="8">0 0 1 0 1 1 0 1</float_array><technique_common><accessor source="#uv-a" count="4" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>
<vertices id="v"><input semantic="POSITION" source="#pos"/></vertices>
<triangles count="2" material="m"><input semantic="VERTEX" source="#v" offset="0"/><input semantic="TEXCOORD" source="#uv" offset="0" set="0"/><p>0 1 2 0 2 3</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="s"><node id="n"><instance_geometry url="#quad"><bind_material><technique_common><instance_material symbol="m" target="#mat"/></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene>
</COLLADA>`
			serve({
				'scenes/quad.dae': { id: 110, body: dae },
				'scenes/checker.png': { id: 111, body: PNG.toString('latin1') },
			})
			const statuses = { 110: { name: 'quad.dae', dir: '/scenes', size: dae.length, etag: 'e110', canEdit: true, hasThumbnail: false } }
			const { queue, deps } = queueOn(statuses, 10, async (job) => {
				const files = job.additionalFiles.map((file) => new File([file], file.name, { type: 'image/png' }))
				await new DaeLoader().loadModel(job.buffer, { THREE, additionalFiles: files })
				if (!imageLoads.some((url) => url.startsWith('data:image/png;base64,'))) {
					throw new Error(`rendered untextured: asked for ${imageLoads.join(', ')}`)
				}
				return { type: 'image/png', size: 4 }
			})

			queue.setFolder('/scenes', [110], new Set())
			await queue.idle()

			expect(deps.render.mock.calls.map(([job]) => job.additionalFiles.map((file) => file.name))).toEqual([['checker.png']])
			await expect(deps.render.mock.results[0].value).resolves.toEqual({ type: 'image/png', size: 4 })
			expect(deps.api.uploadThumbnail.mock.calls.map(([id]) => id)).toEqual([110])
		})
	})

	it('a DAE or X3D whose texture is not beside it is skipped, not rendered untextured', async () => {
		serve({
			'scenes/room.dae': { id: 60, body: '<COLLADA><library_images><image id="a"><init_from>wood.png</init_from></image></library_images></COLLADA>' },
			'scenes/wall.x3d': { id: 61, body: '<X3D><Scene><ImageTexture url=\'"stone.png"\'/></Scene></X3D>' },
			'scenes/maps/wood.png': { id: 62, body: 'PNG' },
		})
		const statuses = {
			60: { name: 'room.dae', dir: '/scenes', size: 128, etag: 'e60', canEdit: true, hasThumbnail: false },
			61: { name: 'wall.x3d', dir: '/scenes', size: 128, etag: 'e61', canEdit: true, hasThumbnail: false },
		}
		const { queue, deps } = queueOn(statuses, 10)

		queue.setFolder('/scenes', [60, 61], new Set())
		await queue.idle()

		expect(deps.render).not.toHaveBeenCalled()
		expect(deps.api.uploadThumbnail).not.toHaveBeenCalled()
		expect(deps.skips.markSkipped.mock.calls).toEqual([[60, 'e60'], [61, 'e61']])
	})
})
