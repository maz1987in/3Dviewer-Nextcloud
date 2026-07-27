/**
 * Public share context.
 *
 * On a public share page there is no session, so the authenticated
 * `/apps/threedviewer/api/file/{id}` endpoint returns 404. `PublicFileController`
 * serves the same bytes through an OCS route keyed by the share token instead.
 *
 * Everything that builds a model URL must go through here, so there is exactly one
 * place that knows which of the two endpoints applies.
 */

import { generateOcsUrl, generateUrl } from '@nextcloud/router'

let cached

/**
 * Read the share context injected by LoadPublicShareListener.
 *
 * Reads Nextcloud's initial-state element directly rather than pulling in
 * `@nextcloud/initial-state`: this app does not depend on that package, and the
 * element's shape — `<input id="initial-state-{app}-{key}" value="{base64 json}">`
 * — is a long-standing server contract written by `IInitialState`.
 *
 * @return {{token: string, fileId: (number|null), isSingleFile: boolean}|null}
 *         null on ordinary authenticated pages.
 */
export function getPublicShareContext() {
	if (cached !== undefined) {
		return cached
	}

	cached = null
	const el = typeof document !== 'undefined'
		? document.getElementById('initial-state-threedviewer-publicShare')
		: null

	if (el?.value) {
		try {
			const parsed = JSON.parse(atob(el.value))
			// Guard against a malformed or half-written payload: without a token
			// there is nothing usable, and falling through to the authenticated
			// endpoint would 404 rather than fail loudly.
			if (parsed && typeof parsed.token === 'string' && parsed.token !== '') {
				cached = parsed
			}
		} catch (e) {
			console.warn('[ThreeDViewer] could not read public share state', e)
		}
	}

	return cached
}

/**
 * @return {boolean} whether the viewer is running on a public share page.
 */
export function isPublicShare() {
	return getPublicShareContext()?.token != null
}

/**
 * URL for a model's bytes, valid in both contexts.
 *
 * @param {number|string} fileId - Nextcloud file id
 * @return {string} absolute URL
 */
export function buildFileUrl(fileId) {
	const ctx = getPublicShareContext()
	if (ctx?.token) {
		return generateOcsUrl('apps/threedviewer/public/file/{token}/{fileId}', {
			token: ctx.token,
			fileId,
		})
	}
	return generateUrl(`/apps/threedviewer/api/file/${fileId}`)
}

/**
 * URL for an OBJ's sibling .mtl on a public share.
 *
 * Public-only by design. When signed in, the loader finds the .mtl through the
 * file-listing API and fetches it by its own id via buildFileUrl — that listing is
 * not reachable anonymously, which is why PublicFileController exposes a dedicated
 * route keyed by the OBJ's id plus the material name instead.
 *
 * @param {number|string} objFileId - file id of the .obj
 * @param {string} mtlName - material filename referenced by the OBJ
 * @return {string|null} absolute URL, or null when not on a public share
 */
export function buildPublicMtlUrl(objFileId, mtlName) {
	const ctx = getPublicShareContext()
	if (!ctx?.token) {
		return null
	}
	return generateOcsUrl('apps/threedviewer/public/file/{token}/{fileId}/mtl/{mtlName}', {
		token: ctx.token,
		fileId: objFileId,
		mtlName,
	})
}

/**
 * Reset the memoised context. Test-only.
 */
export function __resetPublicShareContext() {
	cached = undefined
}
