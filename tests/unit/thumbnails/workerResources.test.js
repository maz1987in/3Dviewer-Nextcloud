/**
 * What the background thumbnail worker may load (R16).
 *
 * The worker renders models from shared folders while someone merely browses Files, and
 * it likely runs without the page's Content Security Policy. A model may name any URL for
 * a texture or buffer, so the worker resolves only the files it was handed, its own
 * data: and blob: URLs, and the decoder assets under the app's web root. Everything else
 * is refused without a request and recorded, so the job can fail as a load error.
 */

import {
	createWorkerResources,
	guardWorkerRequests,
	RefusedResourceError,
} from '../../../src/thumbnails/workerResources.js'

const ORIGIN = 'https://cloud.example.com'
const WORKER_URL = `${ORIGIN}/custom_apps/threedviewer/js/thumbnail-worker-abc.mjs`
const APP_ROOT = '/custom_apps/threedviewer/'

/**
 * @param {File[]} [files] - What the job was handed
 * @return {object} Resources with predictable blob: URLs
 */
function resourcesFor(files = []) {
	let made = 0
	return createWorkerResources({
		files,
		appWebRoot: APP_ROOT,
		baseUrl: WORKER_URL,
		createObjectURL: (file) => `blob:${ORIGIN}/${++made}-${file.name}`,
	})
}

describe('createWorkerResources', () => {
	it('resolves a handed file by its name, wherever the model says it is', () => {
		const resources = resourcesFor([new File(['bin'], 'scene.bin'), new File(['png'], 'Wood Grain.png')])

		const url = resources.resolve('scene.bin')

		expect(url).toBe(`blob:${ORIGIN}/1-scene.bin`)
		// The same file every time, and under any path that ends in its name
		expect(resources.resolve('../../buffers/scene.bin')).toBe(url)
		expect(resources.resolve('C:\\export\\scene.bin')).toBe(url)
		expect(resources.resolve('https://example.invalid/scene.bin?v=2')).toBe(url)
		// glTF URIs are percent-encoded; names are matched regardless of case
		expect(resources.resolve('wood%20grain.PNG')).toBe(`blob:${ORIGIN}/2-Wood Grain.png`)
		expect(resources.refused).toEqual([])
		expect(resources.isAllowed(url)).toBe(true)
	})

	it('refuses what it was not handed, and records it', () => {
		const resources = resourcesFor([new File(['bin'], 'scene.bin')])

		for (const url of [
			'https://example.invalid/x.png',
			'../../other.bin',
			'//example.invalid/y.png',
			`${ORIGIN}/index.php/apps/files/api/v1/thumbnail/1`,
			`${ORIGIN}/remote.php/dav/files/alice/secret.png`,
		]) {
			resources.resolve(url)
			expect(resources.isAllowed(url)).toBe(false)
		}

		expect(resources.refused).toEqual([
			'https://example.invalid/x.png',
			'../../other.bin',
			'//example.invalid/y.png',
			`${ORIGIN}/index.php/apps/files/api/v1/thumbnail/1`,
			`${ORIGIN}/remote.php/dav/files/alice/secret.png`,
		])
	})

	it('resolves a texture named by an absolute path or a file: URL to the handed file of that name', () => {
		// The queue fetched these by their bare names, decoded, beside the model
		const resources = resourcesFor([new File(['png'], 'wood.png'), new File(['png'], 'wood grain.png')])
		const wood = resources.resolve('wood.png')

		for (const url of [
			'C:\\Users\\anna\\Desktop\\textures\\wood.png',
			'C:/textures/wood.png',
			'/home/anna/textures/WOOD.PNG',
			'\\\\server\\share\\wood.png',
			'file:///C:/textures/wood.png',
			'file://server/share/wood.png',
			'file:/home/anna/wood.png',
		]) {
			expect(resources.resolve(url)).toBe(wood)
		}
		expect(resources.resolve('file:///C:/My%20Textures/wood%20grain.png')).toBe(`blob:${ORIGIN}/2-wood grain.png`)
		expect(resources.refused).toEqual([])
	})

	it('refuses an absolute path or a file: URL whose name it was not handed, without a request', async () => {
		const resources = resourcesFor([new File(['png'], 'wood.png')])
		const urls = [
			'C:\\textures\\secret.png',
			'/etc/passwd',
			'\\\\server\\share\\secret.png',
			'file:///C:/textures/secret.png',
			'file:///C:/textures/wood.png/',
			'file:///C:/textures/wood%2Epng%2F..',
		]

		for (const url of urls) {
			expect(resources.resolve(url)).toBe(url)
			expect(resources.isAllowed(url)).toBe(false)
		}
		expect(resources.refused).toEqual(urls)

		// A loader that fetches the URL as written is stopped by the guard, before any request
		const nativeFetch = jest.fn()
		const scope = { fetch: nativeFetch, URL: {} }
		guardWorkerRequests(scope, () => resources)
		await expect(scope.fetch('file:///C:/textures/wood.png')).rejects.toBeInstanceOf(RefusedResourceError)
		expect(nativeFetch).not.toHaveBeenCalled()
	})

	it('resolves a texture named above the model\'s folder to the handed file of that name', () => {
		// The queue fetched these by their bare names beside the model; a loader asks for
		// the path as written, or resolved against the model's URL, which may land
		// anywhere above the app
		const resources = resourcesFor([new File(['png'], 'checker.png'), new File(['png'], 'wood grain.png')])
		const checker = resources.resolve('checker.png')

		for (const url of [
			'../../maps/checker.png',
			'..\\..\\maps\\checker.png',
			'textures/../../checker.png',
			'../../MAPS/CHECKER.PNG',
			new URL('../../maps/checker.png', WORKER_URL).href,
			new URL('../../../../../maps/checker.png', WORKER_URL).href,
			`${ORIGIN}/custom_apps/threedviewer/js/../../maps/checker.png`,
		]) {
			expect(resources.resolve(url)).toBe(checker)
		}
		expect(resources.resolve('../maps/wood%20grain.png')).toBe(`blob:${ORIGIN}/2-wood grain.png`)
		expect(resources.refused).toEqual([])
	})

	it('refuses a texture named above the model\'s folder whose name it was not handed, without a request', async () => {
		const resources = resourcesFor([new File(['png'], 'checker.png')])
		const urls = [
			'../../maps/secret.png',
			'..\\..\\maps\\secret.png',
			'../../maps/checker.png/',
			'../../maps/..',
			new URL('../../maps/secret.png', WORKER_URL).href,
			new URL('../../../../remote.php/dav/files/alice/checker.png/', WORKER_URL).href,
		]

		for (const url of urls) {
			expect(resources.resolve(url)).toBe(url)
			expect(resources.isAllowed(url)).toBe(false)
		}
		expect(resources.refused).toEqual(urls)

		const nativeFetch = jest.fn()
		const scope = { fetch: nativeFetch, URL: {} }
		guardWorkerRequests(scope, () => resources)
		await expect(scope.fetch(new URL('../../maps/checker.png', WORKER_URL).href)).rejects.toBeInstanceOf(RefusedResourceError)
		expect(nativeFetch).not.toHaveBeenCalled()
	})

	it('resolves a reference with encoded separators to the handed file named by its decoded last segment', () => {
		// The declaration decoded these before normalising them, and the queue fetched
		// the file by the decoded reference's last segment
		const resources = resourcesFor([new File(['png'], 'checker.png'), new File(['png'], 'wood.png')])
		const checker = resources.resolve('checker.png')
		const wood = resources.resolve('wood.png')

		expect(resources.resolve('..%2F..%2Fmaps%2Fchecker.png')).toBe(checker)
		expect(resources.resolve(new URL('..%2F..%2Fmaps%2Fchecker.png', WORKER_URL).href)).toBe(checker)
		expect(resources.resolve('..%5C..%5Cmaps%5CCHECKER.PNG')).toBe(checker)
		expect(resources.resolve('%2Fhome%2Fanna%2Fwood.png')).toBe(wood)
		expect(resources.resolve('C:%5Cx%5Cwood.png')).toBe(wood)
		expect(resources.refused).toEqual([])
	})

	it('refuses a reference with encoded separators whose decoded name it was not handed, without a request', async () => {
		const resources = resourcesFor([new File(['png'], 'checker.png')])
		const urls = [
			'..%2F..%2Fmaps%2Fsecret.png',
			'%2Fetc%2Fpasswd',
			'C:%5Cx%5Csecret.png',
			'..%2F..%2Fmaps%2Fchecker.png%2F',
			'..%2F..%2Fmaps%2F..',
			new URL('..%2F..%2Fremote.php%2Fdav%2Fsecret.png', WORKER_URL).href,
		]

		for (const url of urls) {
			expect(resources.resolve(url)).toBe(url)
			expect(resources.isAllowed(url)).toBe(false)
		}
		expect(resources.refused).toEqual(urls)

		const nativeFetch = jest.fn()
		const scope = { fetch: nativeFetch, URL: {} }
		guardWorkerRequests(scope, () => resources)
		await expect(scope.fetch('..%2F..%2Fmaps%2Fsecret.png')).rejects.toBeInstanceOf(RefusedResourceError)
		expect(nativeFetch).not.toHaveBeenCalled()
	})

	it('allows data: URLs and the blob: URLs the worker made, but no other blob:', () => {
		const resources = resourcesFor()
		resources.noteObjectUrl(`blob:${ORIGIN}/made-here`)

		expect(resources.resolve('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=')
		expect(resources.resolve(`blob:${ORIGIN}/made-here`)).toBe(`blob:${ORIGIN}/made-here`)
		// A blob: the page made is readable from the worker too; the model must not name one
		expect(resources.isAllowed(`blob:${ORIGIN}/made-by-the-page`)).toBe(false)
		resources.resolve(`blob:${ORIGIN}/made-by-the-page`)
		expect(resources.refused).toEqual([`blob:${ORIGIN}/made-by-the-page`])
	})

	it('allows the decoder assets under the app web root, and nothing else there', () => {
		const resources = resourcesFor()

		for (const url of [
			`${APP_ROOT}draco/draco_decoder.wasm`,
			`${ORIGIN}${APP_ROOT}draco/draco_wasm_wrapper.js`,
			`${APP_ROOT}rhino3dm/rhino3dm.wasm`,
			`${APP_ROOT}occt/occt-import-js.wasm`,
			`${APP_ROOT}web-ifc/web-ifc.wasm`,
			`${APP_ROOT}basis/basis_transcoder.js`,
			// Relative to the worker script, as a loader with no path resolves it
			'../draco/draco_decoder.wasm',
		]) {
			expect([url, resources.isAllowed(url)]).toEqual([url, true])
			expect(resources.resolve(url)).toBe(url)
		}

		for (const url of [
			`${APP_ROOT}js/other-chunk.mjs`,
			`${APP_ROOT}appinfo/info.xml`,
			`${APP_ROOT}draco/../appinfo/info.xml`,
			`${APP_ROOT}draco%2F..%2F..%2Fother.bin`,
			'/apps/threedviewer/draco/draco_decoder.wasm',
			`https://example.invalid${APP_ROOT}draco/draco_decoder.wasm`,
		]) {
			expect([url, resources.isAllowed(url)]).toEqual([url, false])
		}
	})

	it('refuses an encoded slash or backslash under a decoder folder', () => {
		// WHATWG URL parsing resolves ../ and %2e%2e but leaves %2F and %5C alone, so
		// these keep the decoder prefix while a decoding server reads them as a climb.
		const resources = resourcesFor()

		for (const url of [
			`${APP_ROOT}draco/..%2F..%2Fremote.php/dav/files/alice/x`,
			`${ORIGIN}${APP_ROOT}draco/..%2F..%2F..%2Fremote.php/dav/files/alice/x`,
			`${APP_ROOT}draco/..%5C..%5Cremote.php/dav/files/alice/x`,
			`${APP_ROOT}draco/%2e%2e%2F%2e%2e%2Fremote.php/dav/files/alice/x`,
			`${APP_ROOT}draco/%2E%2E%2f..%2fremote.php/dav/files/alice/x`,
			`${APP_ROOT}basis/basis_transcoder%2Ejs`,
		]) {
			expect([url, resources.isAllowed(url)]).toEqual([url, false])
			resources.resolve(url)
		}
		expect(resources.refused).toHaveLength(6)
	})

	it('still allows decoder assets when the install path itself is percent-encoded', () => {
		const root = '/my%20cloud/custom_apps/threedviewer/'
		const resources = createWorkerResources({
			files: [],
			appWebRoot: root,
			baseUrl: `${ORIGIN}${root}js/thumbnail-worker-abc.mjs`,
			createObjectURL: () => 'blob:unused',
		})

		expect(resources.isAllowed(`${root}draco/draco_decoder.wasm`)).toBe(true)
		expect(resources.isAllowed(`${root}draco/..%2F..%2Fremote.php/dav/files/alice/x`)).toBe(false)
	})

	it('never lets a handed file stand in for a decoder', () => {
		// A companion named like the Draco wrapper must not replace the code the decoder runs
		const resources = resourcesFor([new File(['evil'], 'draco_wasm_wrapper.js')])

		expect(resources.resolve(`${APP_ROOT}draco/draco_wasm_wrapper.js`)).toBe(`${APP_ROOT}draco/draco_wasm_wrapper.js`)
	})

	it('refuses everything but data: before a job has named its files and root', () => {
		const resources = createWorkerResources({ baseUrl: WORKER_URL })

		expect(resources.isAllowed('data:,x')).toBe(true)
		expect(resources.isAllowed(`${APP_ROOT}draco/draco_decoder.wasm`)).toBe(false)
		expect(resources.isAllowed('https://example.invalid/x.png')).toBe(false)
	})
})

describe('guardWorkerRequests', () => {
	/**
	 * A stand-in for the worker's global scope.
	 *
	 * @return {object} The scope and what reached the network
	 */
	function fakeScope() {
		const sent = []
		class FakeXHR {

			open(method, url) {
				sent.push(`xhr ${url}`)
			}

		}
		let made = 0
		const scope = {
			fetch: jest.fn(async (input) => {
				sent.push(`fetch ${typeof input === 'string' ? input : input.url}`)
				return { ok: true }
			}),
			XMLHttpRequest: FakeXHR,
			URL: { createObjectURL: () => `blob:${ORIGIN}/${++made}` },
		}
		return { scope, sent }
	}

	it('fetch refuses what the resources do not allow, without a request', async () => {
		const { scope, sent } = fakeScope()
		const resources = resourcesFor()
		guardWorkerRequests(scope, () => resources)

		const refused = await scope.fetch('https://example.invalid/x.png').catch((error) => error)
		await scope.fetch(`${APP_ROOT}draco/draco_decoder.wasm`)
		await scope.fetch({ url: '../../other.bin' }).catch(() => {})

		expect(refused).toBeInstanceOf(RefusedResourceError)
		// Never one of the strings the worker reads as a network failure of its own
		expect(refused.message).not.toMatch(/dynamically imported module|Importing a module script failed|Failed to fetch|NetworkError/i)
		expect(sent).toEqual([`fetch ${APP_ROOT}draco/draco_decoder.wasm`])
		expect(resources.refused).toEqual(['https://example.invalid/x.png', '../../other.bin'])
	})

	it('XMLHttpRequest refuses the same way', () => {
		const { scope, sent } = fakeScope()
		const resources = resourcesFor()
		guardWorkerRequests(scope, () => resources)

		expect(() => new scope.XMLHttpRequest().open('GET', 'https://example.invalid/x.bin')).toThrow(RefusedResourceError)
		new scope.XMLHttpRequest().open('GET', `${APP_ROOT}rhino3dm/rhino3dm.wasm`)

		expect(sent).toEqual([`xhr ${APP_ROOT}rhino3dm/rhino3dm.wasm`])
		expect(resources.refused).toEqual(['https://example.invalid/x.bin'])
	})

	it('blob: URLs the worker makes are its own, and allowed', async () => {
		const { scope, sent } = fakeScope()
		const resources = resourcesFor()
		guardWorkerRequests(scope, () => resources)

		const url = scope.URL.createObjectURL(new Blob(['x']))
		await scope.fetch(url)

		expect(sent).toEqual([`fetch ${url}`])
		expect(resources.refused).toEqual([])
	})

	it('a refusal error names the URL, shortened when it is long', () => {
		const error = new RefusedResourceError(`https://example.invalid/${'a'.repeat(500)}`)

		expect(error.name).toBe('RefusedResourceError')
		expect(error.message).toMatch(/^Refused to load https:\/\/example\.invalid\/a+…: not one of the model's files$/)
		expect(error.message.length).toBeLessThan(200)
	})
})
