/**
 * The public share page has no session, so the authenticated file endpoint 404s
 * there. These tests pin which endpoint each context resolves to — getting it wrong
 * is exactly the bug in issue #115, where a constant pointed at a route that was
 * never registered.
 */

jest.mock('@nextcloud/router', () => ({
	generateUrl: (p) => `/index.php${p}`,
	generateOcsUrl: (p, params) => {
		const filled = Object.entries(params || {}).reduce(
			(acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
			p,
		)
		return `/ocs/v2.php/${filled}`
	},
}))

/**
 * Render the initial-state element exactly as IInitialState does server-side.
 *
 * @param {object|null} state - payload, or null to render no element at all
 * @return {Promise<object>} freshly imported module
 */
async function withState(state) {
	document.body.replaceChildren()
	if (state !== null) {
		const el = document.createElement('input')
		el.type = 'hidden'
		el.id = 'initial-state-threedviewer-publicShare'
		el.value = btoa(JSON.stringify(state))
		document.body.appendChild(el)
	}
	jest.resetModules()
	const mod = await import('../usePublicShare.js')
	mod.__resetPublicShareContext()
	return mod
}

describe('usePublicShare', () => {
	describe('on an authenticated page', () => {
		it('reports not-public when the element is absent', async () => {
			const m = await withState(null)
			expect(m.isPublicShare()).toBe(false)
			expect(m.getPublicShareContext()).toBeNull()
		})

		it('uses the session-authenticated file endpoint', async () => {
			const m = await withState(null)
			expect(m.buildFileUrl(42)).toBe('/index.php/apps/threedviewer/api/file/42')
		})

		it('has no public MTL URL to offer', async () => {
			const m = await withState(null)
			expect(m.buildPublicMtlUrl(42, 'model.mtl')).toBeNull()
		})
	})

	describe('on a public share page', () => {
		const ctx = { token: 'Ed96SnZ8K4PW4dx', fileId: 42, isSingleFile: true }

		it('reports public', async () => {
			const m = await withState(ctx)
			expect(m.isPublicShare()).toBe(true)
			expect(m.getPublicShareContext()).toEqual(ctx)
		})

		it('uses the token-keyed OCS endpoint for the model', async () => {
			const m = await withState(ctx)
			expect(m.buildFileUrl(42)).toBe(
				'/ocs/v2.php/apps/threedviewer/public/file/Ed96SnZ8K4PW4dx/42',
			)
		})

		it('uses the dedicated sibling route for the MTL', async () => {
			const m = await withState(ctx)
			expect(m.buildPublicMtlUrl(42, 'model.mtl')).toBe(
				'/ocs/v2.php/apps/threedviewer/public/file/Ed96SnZ8K4PW4dx/42/mtl/model.mtl',
			)
		})

		it('never falls back to the authenticated endpoint, which 404s anonymously', async () => {
			const m = await withState(ctx)
			expect(m.buildFileUrl(42)).not.toContain('/apps/threedviewer/api/file')
		})
	})

	describe('folder share', () => {
		it('carries no fileId and is not a single file', async () => {
			const m = await withState({ token: 'tok', fileId: null, isSingleFile: false })
			expect(m.isPublicShare()).toBe(true)
			expect(m.getPublicShareContext().isSingleFile).toBe(false)
		})
	})

	describe('malformed state', () => {
		it('falls back to not-public rather than emitting a broken URL', async () => {
			document.body.replaceChildren()
			const el = document.createElement('input')
			el.id = 'initial-state-threedviewer-publicShare'
			el.value = 'not-base64-json!!'
			document.body.appendChild(el)
			jest.resetModules()
			const m = await import('../usePublicShare.js')
			m.__resetPublicShareContext()

			expect(m.isPublicShare()).toBe(false)
			expect(m.buildFileUrl(42)).toBe('/index.php/apps/threedviewer/api/file/42')
		})

		it('treats a payload with no token as not-public', async () => {
			const m = await withState({ fileId: 42, isSingleFile: true })
			expect(m.isPublicShare()).toBe(false)
		})
	})
})
