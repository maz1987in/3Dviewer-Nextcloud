/**
 * A view of a model, carried in a link: `?view=1.<base64url JSON>`.
 *
 * The leading number is the format's version, so a link made today still opens after the
 * format changes. The JSON uses one-letter keys and rounded numbers to keep links short
 * enough for chat and email.
 *
 * Whatever arrives in a link was typed or edited by someone, so `decodeView` trusts none
 * of it: every value is checked against what the viewer accepts and clamped to its range.
 * A camera that fails the check rejects the whole view; any other field that fails is
 * dropped and the rest still applies.
 *
 * The older `cam=` links, which carried the camera alone, are still read
 * (`cameraUrlState.js`).
 */

import { parseCameraState, CAMERA_URL_PARAM } from './cameraUrlState.js'
import { LIGHTING_PRESETS } from '../config/lightingPresets.js'
import { RENDER_MODES } from '../composables/useRenderMode.js'

export const VIEW_PARAM = 'view'
export const VIEW_VERSION = 1

/** Coordinates past this are not a camera anyone placed by orbiting a model. */
const MAX_COORDINATE = 1e7
const ZOOM_RANGE = [0.01, 100]
const AXES = ['x', 'y', 'z']
const BOX_FACES = ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax']

const round = (n, places) => Number(Number(n).toFixed(places))
const clamp = (n, [lo, hi]) => Math.min(hi, Math.max(lo, n))
const isNumber = (n) => typeof n === 'number' && Number.isFinite(n)
const isVector = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => isNumber(n) && Math.abs(n) <= MAX_COORDINATE)

/**
 * @typedef {object} ViewState
 * @property {{position: number[], target: number[], zoom: number, projection: ('perspective'|'orthographic')}} camera
 * @property {string} [renderMode] - one of RENDER_MODES
 * @property {boolean} [wireframe]
 * @property {string} [lighting] - a key of LIGHTING_PRESETS
 * @property {{mode: 'plane', axis: string, position: number, flipped: boolean}|{mode: 'box', offsets: object}} [clipping]
 * @property {number} [exploded] - 0..1
 * @property {number} [note] - a shared note's id
 */

/**
 * @param {string} text - ASCII text
 * @return {string} base64url, without padding
 */
function toBase64Url(text) {
	return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * @param {string} value - base64url, with or without padding
 * @return {string}
 */
function fromBase64Url(value) {
	return atob(value.replace(/-/g, '+').replace(/_/g, '/'))
}

/**
 * Write a view as the value of the `view` parameter.
 *
 * @param {ViewState} view
 * @return {string}
 */
export function encodeView(view) {
	const { camera } = view
	const out = {
		c: {
			p: camera.position.map((n) => round(n, 4)),
			t: camera.target.map((n) => round(n, 4)),
			z: round(camera.zoom, 4),
			o: camera.projection === 'orthographic' ? 1 : 0,
		},
	}
	if (view.renderMode !== undefined) out.r = view.renderMode
	if (view.wireframe !== undefined) out.w = view.wireframe ? 1 : 0
	if (view.lighting !== undefined) out.l = view.lighting
	if (view.clipping) {
		out.k = view.clipping.mode === 'box'
			? { m: 'b', o: BOX_FACES.map((face) => round(view.clipping.offsets?.[face], 3)) }
			: { m: 'p', a: view.clipping.axis, s: round(view.clipping.position, 3), f: view.clipping.flipped ? 1 : 0 }
	}
	if (view.exploded !== undefined) out.e = round(view.exploded, 3)
	if (view.note !== undefined) out.n = view.note
	return `${VIEW_VERSION}.${toBase64Url(JSON.stringify(out))}`
}

/**
 * @param {*} k - the compact cut
 * @return {object|undefined} the cut, or undefined when it doesn't check out
 */
function decodeClipping(k) {
	if (!k || typeof k !== 'object') return undefined
	if (k.m === 'p') {
		if (!AXES.includes(k.a) || !isNumber(k.s)) return undefined
		return { mode: 'plane', axis: k.a, position: clamp(k.s, [-1, 1]), flipped: k.f === 1 }
	}
	if (k.m === 'b') {
		if (!Array.isArray(k.o) || k.o.length !== BOX_FACES.length || !k.o.every(isNumber)) return undefined
		return { mode: 'box', offsets: Object.fromEntries(BOX_FACES.map((face, i) => [face, clamp(k.o[i], [0, 1])])) }
	}
	return undefined
}

/**
 * Read a `view` parameter's value. Null for anything that isn't a view this version wrote.
 *
 * @param {*} raw
 * @return {ViewState|null}
 */
export function decodeView(raw) {
	if (typeof raw !== 'string') return null
	const dot = raw.indexOf('.')
	if (dot < 1 || raw.slice(0, dot) !== String(VIEW_VERSION)) return null

	let data
	try {
		data = JSON.parse(fromBase64Url(raw.slice(dot + 1)))
	} catch {
		return null
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) return null

	const c = data.c
	if (!c || typeof c !== 'object' || !isVector(c.p) || !isVector(c.t) || !isNumber(c.z)) return null
	const view = {
		camera: {
			position: c.p,
			target: c.t,
			zoom: clamp(c.z, ZOOM_RANGE),
			projection: c.o === 1 ? 'orthographic' : 'perspective',
		},
	}

	if (RENDER_MODES.includes(data.r)) view.renderMode = data.r
	if (data.w === 0 || data.w === 1) view.wireframe = data.w === 1
	if (typeof data.l === 'string' && Object.prototype.hasOwnProperty.call(LIGHTING_PRESETS, data.l)) view.lighting = data.l
	const clipping = decodeClipping(data.k)
	if (clipping) view.clipping = clipping
	if (isNumber(data.e)) view.exploded = clamp(data.e, [0, 1])
	if (Number.isSafeInteger(data.n) && data.n > 0) view.note = data.n
	return view
}

/**
 * The view the page's URL carries: `view`, or else the older camera-only `cam`.
 *
 * @param {string} [search] - a query string; the page's own by default
 * @return {ViewState|null}
 */
export function readViewFromUrl(search = (typeof window !== 'undefined' ? window.location.search : '')) {
	const params = new URLSearchParams(search)
	if (params.has(VIEW_PARAM)) {
		const view = decodeView(params.get(VIEW_PARAM))
		if (view) return view
	}
	const legacy = parseCameraState(params.get(CAMERA_URL_PARAM) ?? '')
	if (!legacy) return null
	const { position: p, target: t } = legacy
	return {
		camera: {
			position: [p.x, p.y, p.z],
			target: [t.x, t.y, t.z],
			zoom: clamp(legacy.zoom, ZOOM_RANGE),
			projection: 'perspective',
		},
	}
}

/**
 * A link to `base` showing `view`. Every other parameter of `base` is kept; an older
 * `cam` is dropped, since `view` replaces it.
 *
 * @param {string} base - an absolute URL
 * @param {ViewState} view
 * @return {string}
 */
export function buildViewUrl(base, view) {
	const url = new URL(base)
	url.searchParams.delete(CAMERA_URL_PARAM)
	url.searchParams.set(VIEW_PARAM, encodeView(view))
	return url.toString()
}
