/**
 * The code that shows a public link's model on another site: an iframe of the embed page
 * (EmbedPageController), which only the sites the admin lists may frame.
 */
import { generateUrl } from '@nextcloud/router'
import { pickableShares } from './linkShares.js'
import { buildViewUrl } from './viewLink.js'

const SIZE = { min: 200, max: 4000 }

/**
 * @param {string} origin - The instance's origin, e.g. `https://cloud.example`
 * @param {string} token - The public link's token
 * @param {?{camera: object}} view - The view to open with; only its camera is kept,
 *   which is all a public page applies
 * @return {string} The embed page's address
 */
export function embedUrl(origin, token, view) {
	const url = origin + generateUrl('/apps/threedviewer/embed/{token}', { token })
	return view ? buildViewUrl(url, { camera: view.camera }) : url
}

/**
 * @param {number|string} value - What was typed
 * @param {number} fallback - Used when it is not a number
 * @return {number} A whole number of pixels, within SIZE
 */
export function embedSize(value, fallback) {
	const n = Number(value)
	return Number.isFinite(n) ? Math.min(SIZE.max, Math.max(SIZE.min, Math.round(n))) : fallback
}

/**
 * @param {string|number} value - Text for a double-quoted HTML attribute
 * @return {string} The text, escaped
 */
function attribute(value) {
	return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * @param {{url: string, width: (number|string), height: (number|string), title: string}} options - The frame
 * @return {string} The iframe to paste
 */
export function buildEmbedCode({ url, width, height, title }) {
	return `<iframe src="${attribute(url)}" width="${embedSize(width, 640)}" height="${embedSize(height, 480)}" title="${attribute(title)}" style="border: 0" allow="fullscreen" allowfullscreen loading="lazy"></iframe>`
}

/**
 * The shares that can be shown on another site: as the server allows an embed, a
 * readable link to the file itself with no password, which a frame has nowhere to ask for.
 *
 * @param {import('./linkShares.js').LinkShare[]} shares - The model's link shares
 * @param {number} [now] - milliseconds
 * @return {import('./linkShares.js').LinkShare[]} Those, unexpired and newest first
 */
export function embeddableShares(shares, now = Date.now()) {
	return pickableShares(shares, now).filter((share) => share.isFile && share.canRead && !share.hasPassword)
}
