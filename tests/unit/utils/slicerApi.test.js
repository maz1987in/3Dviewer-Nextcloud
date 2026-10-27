/**
 * The slicer handoff's two writes must carry Nextcloud's CSRF token.
 *
 * Their routes check it (a write that skips the check can be triggered by any page the
 * signed-in user visits), so a caller that sends none gets a 412. This runs the real
 * `@nextcloud/axios` client, the one that adds the `requesttoken` header in the app,
 * against a recording adapter, so what is asserted is the request that would leave the
 * browser, not a mock of the call.
 */
// The package's exports allow only 'import', which jest cannot resolve, so go by path.
jest.mock('@nextcloud/axios', () => jest.requireActual('../../../node_modules/@nextcloud/axios/dist/index.js'))
jest.mock('@nextcloud/router', () => ({
	generateUrl: (url) => '/index.php' + url,
}))

const TOKEN = 'token-from-the-page-head'

let sent
let axios
let slicerApi

beforeEach(() => {
	sent = []
	document.head.dataset.requesttoken = TOKEN
	jest.isolateModules(() => {
		axios = require('@nextcloud/axios').default
		slicerApi = require('../../../src/utils/slicerApi.js')
	})
	axios.defaults.adapter = async (config) => {
		sent.push(config)
		// A browser adapter reports upload progress through this callback
		config.onUploadProgress?.({ loaded: 25, total: 100 })
		config.onUploadProgress?.({ loaded: 100, total: 100 })
		return { data: { success: true, fileId: 12 }, status: 200, statusText: 'OK', headers: {}, config }
	}
})

afterEach(() => {
	delete document.head.dataset.requesttoken
})

const header = (config, name) => config.headers.get ? config.headers.get(name) : config.headers[name]

describe('uploadTempFile', () => {
	test('POSTs the file to the temp route with the request token', async () => {
		const blob = new Blob(['solid t'])

		const data = await slicerApi.uploadTempFile('part one.stl', blob)

		expect(data).toEqual({ success: true, fileId: 12 })
		expect(sent).toHaveLength(1)
		expect(sent[0].method).toBe('post')
		expect(sent[0].url).toBe('/index.php/apps/threedviewer/api/slicer/temp?filename=part%20one.stl')
		expect(header(sent[0], 'requesttoken')).toBe(TOKEN)
		expect(header(sent[0], 'Content-Type')).toBe('application/octet-stream')
		expect(sent[0].data).toBe(blob)
	})

	test('still reports upload progress, ending at 100', async () => {
		const progress = []

		await slicerApi.uploadTempFile('a.stl', new Blob(['x']), (percent) => progress.push(percent))

		expect(progress).toEqual([25, 100, 100])
	})

	test('turns a failed upload into the message the modal logs', async () => {
		axios.defaults.adapter = async (config) => {
			const error = new Error('Request failed')
			error.response = { status: 412 }
			error.config = config
			throw error
		}

		await expect(slicerApi.uploadTempFile('a.stl', new Blob(['x']))).rejects.toThrow('Server returned 412')
	})
})

describe('deleteTempFile', () => {
	test('DELETEs the temp file with the request token', async () => {
		await slicerApi.deleteTempFile(12)

		expect(sent).toHaveLength(1)
		expect(sent[0].method).toBe('delete')
		expect(sent[0].url).toBe('/index.php/apps/threedviewer/api/slicer/temp/12')
		expect(header(sent[0], 'requesttoken')).toBe(TOKEN)
	})
})

describe('SlicerModal', () => {
	// Vue single-file components are not compiled under jest, so read the source: the
	// modal must reach the server through slicerApi, never through a bare XMLHttpRequest
	// or a fetch with a write verb, which would send no request token.
	const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../../src/components/SlicerModal.vue'), 'utf8')

	test('sends its writes through slicerApi', () => {
		expect(source).toContain("from '../utils/slicerApi.js'")
		expect(source).toMatch(/uploadTempFile\(/)
		expect(source).toMatch(/deleteTempFile\(/)
	})

	test('has no XMLHttpRequest and no fetch with a write verb', () => {
		expect(source).not.toContain('XMLHttpRequest')
		expect(source).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/)
	})
})
