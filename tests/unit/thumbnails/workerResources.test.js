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
