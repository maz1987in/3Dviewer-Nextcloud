/**
 * What the embed page shows. The page is the same for every address (EmbedPageController),
 * so the token comes from its own URL, and the server says whether its share may be shown.
 */
import axios from '@nextcloud/axios'
import { generateOcsUrl } from '@nextcloud/router'

const TOKEN = /\/apps\/threedviewer\/embed\/([A-Za-z0-9_-]{1,64})$/

/**
 * @param {string} pathname - The page's path, as `location.pathname` gives it
 * @return {?string} The share token, or null when the path holds none
 */
export function embedTokenFromPath(pathname) {
	return TOKEN.exec(pathname)?.[1] ?? null
}

/**
 * Ask whether the share may be embedded.
 *
 * @param {string} token - The share token
 * @return {Promise<?{fileId: number, filename: string, mime: string, shareUrl: string, downloadUrl: ?string}>}
 *   The model and its links, or null when it may not be shown, for whatever reason
 */
export async function loadEmbedTarget(token) {
	try {
		const { data } = await axios.get(generateOcsUrl('apps/threedviewer/public/embed/{token}', { token }), { headers: { 'OCS-APIRequest': 'true' } })
		return data && typeof data === 'object' && data.fileId && typeof data.filename === 'string' ? data : null
	} catch (error) {
		return null
	}
}
