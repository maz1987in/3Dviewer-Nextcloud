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
	 * @return {object} The queue and the fakes to inspect
	 */
	function queueOn(statuses, folderBudgetMB) {
		const skipped = new Set()
		const deps = {
			settings: { background: true, maxFileSizeMB: 100, timeoutSeconds: 60, folderBudgetMB },
			api: {
				fetchStatus: jest.fn(async (ids) => new Map(ids.map((id) => [id, statuses[id]]))),
				uploadThumbnail: jest.fn(async () => 'stored'),
			},
			load: loadModelForBackground,
			render: jest.fn(async (job) => {
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
})
