/**
 * Turning a declared name into a file id, signed in.
 *
 * On a public share a dependency resolves by name against the model's own declarations,
 * and the server does the matching. Signed in there is no such route: the client has to
 * find the file itself, through `/api/files/find` and `/api/files/list`, and it carries
 * a stack of fallbacks for when the declared path does not match what is on disk.
 *
 * Almost none of that was covered. These pin what it does today — including the parts
 * that guess, which are recorded here as behaviour rather than endorsed as correct.
 */

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

/** @type {string[]} */
let requested

/**
 * Serve the two file-browser endpoints from fixtures, 404 everything else.
 *
 * @param {object} routes - endpoint fixtures
 * @param {Record<string, number>} [routes.find] - exact path → file id
 * @param {Record<string, {files?: object[], folders?: object[]}>} [routes.list] - folder → listing
 */
function serveApi({ find = {}, list = {} }) {
	requested = []
	global.fetch = jest.fn(async (url) => {
		requested.push(url)
		const parsed = new URL(url, 'http://localhost')

		if (parsed.pathname.endsWith('/api/files/find')) {
			const path = parsed.searchParams.get('path') || ''
			return Object.hasOwn(find, path)
				? { ok: true, status: 200, json: async () => ({ id: find[path] }) }
				: { ok: false, status: 404, statusText: 'Not Found' }
		}

		if (parsed.pathname.endsWith('/api/files/list')) {
			const folder = parsed.searchParams.get('folder') || ''
			return Object.hasOwn(list, folder)
				? { ok: true, status: 200, json: async () => ({ files: [], folders: [], ...list[folder] }) }
				: { ok: false, status: 404, statusText: 'Not Found' }
		}

		return { ok: false, status: 404, statusText: 'Not Found' }
	})
}

const file = (id, name) => ({ id, name })

/**
 * Import the helpers as an authenticated page, where the lookups actually run.
 *
 * @return {Promise<object>} freshly imported module
 */
async function loadHelpers() {
	document.body.replaceChildren()
	jest.resetModules()
	const share = await import('../../../src/composables/usePublicShare.js')
	share.__resetPublicShareContext()

	return import('../../../src/loaders/multiFileHelpers.js')
}

const findCalls = () => requested.filter((url) => url.includes('/api/files/find'))
const listCalls = () => requested.filter((url) => url.includes('/api/files/list'))

describe('getFileIdByPath: the direct lookup', () => {
	it('resolves a material by its full declared path', async () => {
		serveApi({ find: { 'models/chair.mtl': 7 } })
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('models/chair.mtl')).toEqual({ id: 7, subdir: null })
	})

	/**
	 * Textures are frequently in a subdirectory the declaration does not name, so the
	 * direct lookup would 404 for most of them. It is skipped to avoid the noise.
	 */
	it('skips the direct lookup for an image and goes straight to the listing', async () => {
		serveApi({
			find: { 'models/wood.png': 7 },
			list: { models: { files: [file(9, 'wood.png')] } },
		})
		const { getFileIdByPath } = await loadHelpers()

		const result = await getFileIdByPath('models/wood.png')

		expect(listCalls().length).toBeGreaterThan(0)
		expect(findCalls()).toEqual([])
		// The listing answered, so the id is the listing's, not the direct lookup's.
		expect(result).toEqual({ id: 9, subdir: null })
	})
})

describe('getFileIdByPath: matching within a folder listing', () => {
	it('matches a name that differs only in case', async () => {
		serveApi({ list: { models: { files: [file(9, 'Wood.PNG')] } } })
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('models/wood.png')).toEqual({ id: 9, subdir: null })
	})

	it('reports the subdirectory a texture was found in', async () => {
		serveApi({
			list: {
				models: { files: [], folders: [{ name: 'textures', path: 'models/textures' }] },
				'models/textures': { files: [file(11, 'wood.png')] },
			},
		})
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('models/wood.png')).toEqual({ id: 11, subdir: 'textures' })
	})

	it('gives up rather than inventing an id when nothing matches', async () => {
		serveApi({ list: { models: { files: [file(9, 'other.png')] } } })
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('models/wood.png')).toBeNull()
	})

	it('refuses an empty path without calling the API', async () => {
		serveApi({})
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('')).toBeNull()
		expect(requested).toEqual([])
	})
})

describe('getFileIdByPath: a name that does not match any file', () => {
	/**
	 * These used to resolve, through about 150 lines of similarity rules: singular
	 * against plural, a leading word dropped, a length-ratio partial match, and a
	 * mapping from any colour-ish name to any body-ish one. They came from making one
	 * model work — the source named `eye_2.jpg` for `Wolf_Eyes_2.jpg` and `wolf col.jpg`
	 * for `Wolf_Body.jpg` — and then applied to every model.
	 *
	 * A rule that matches two different filenames is a guess, and a guess that lands
	 * wrong serves the wrong texture with nothing to say so. The case it was most likely
	 * to get right — a name differing only in case — is handled before this point, and
	 * on the server too since PathLocator. What remained only fired when the model
	 * referenced a file that genuinely is not there, where rendering untextured is the
	 * honest answer.
	 */
	it('does not substitute a file whose name merely resembles the declared one', async () => {
		serveApi({ list: { models: { files: [file(9, 'Wolf_Eyes_2.jpg')] } } })
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('models/eye_2.jpg')).toBeNull()
	})

	it('does not treat a colour map as the body map', async () => {
		serveApi({ list: { models: { files: [file(9, 'Wolf_Body.jpg')] } } })
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('models/wolf col.jpg')).toBeNull()
	})

	it('does not substitute a material with a similar name', async () => {
		serveApi({ list: { models: { files: [file(9, 'Wolf_obj.mtl')] } } })
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('models/Wolf_done_obj.mtl')).toBeNull()
	})

	it('still resolves a name that differs only in case, which is not a guess', async () => {
		serveApi({ list: { models: { files: [file(9, 'WOLF_BODY.JPG')] } } })
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('models/wolf_body.jpg')).toEqual({ id: 9, subdir: null })
	})

	it('will not match across different extensions', async () => {
		serveApi({ list: { models: { files: [file(9, 'wood.jpg')] } } })
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('models/wood.png')).toBeNull()
	})
})

describe('getFileIdByPath: the common texture directories', () => {
	/**
	 * Tried only for directories the listing says exist, so a model in a folder with no
	 * subdirectories costs no extra requests.
	 */
	it('searches a conventional texture directory that the listing reports', async () => {
		serveApi({
			find: { 'models/textures/wood.png': 13 },
			list: { models: { files: [], folders: [{ name: 'textures' }] } },
		})
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('models/wood.png')).toEqual({ id: 13, subdir: 'textures' })
	})

	it('makes no speculative requests when the model folder has no subdirectories', async () => {
		serveApi({ list: { models: { files: [file(9, 'other.png')], folders: [] } } })
		const { getFileIdByPath } = await loadHelpers()

		expect(await getFileIdByPath('models/wood.png')).toBeNull()
		expect(findCalls()).toEqual([])
	})
})
