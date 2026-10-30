/**
 * The scan as the viewer holds it: a THREE.Points whose `userData.tdvPointCloud` is the one
 * signal the rest of the viewer reads to know it has a scan, since a PLY can be either.
 */
import * as THREE from 'three'
import { availableColourBy, defaultColourBy, writeColours } from './colourBy.js'
import { POINT_SIZE } from './limits.js'

/**
 * @param {{positions: Float32Array, colors?: Uint8Array, intensity?: Uint16Array, classification?: Uint8Array, count: number, total: number, origin: number[], bounds: {min: number[], max: number[]}}} data - A finished PointSink
 * @param {object} about - What the reader found
 * @param {string} about.fileName - Shown as the object's name
 * @param {string} about.format - The extension it was read as
 * @param {?string} about.unit - The unit the file records, or null
 * @param {string} about.defaultUp - Its format's up (upAxis.defaultUp)
 * @return {THREE.Points} The cloud
 */
export function buildPointCloud(data, { fileName, format, unit, defaultUp }) {
	const attributes = { color: Boolean(data.colors), intensity: Boolean(data.intensity), classification: Boolean(data.classification) }
	const colourBy = defaultColourBy({ attributes })

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
	const colours = new Uint8Array(data.count * 3)
	writeColours(colours, colourBy, data, defaultUp)
	geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3, true))
	geometry.computeBoundingBox()
	geometry.computeBoundingSphere()

	const material = new THREE.PointsMaterial({ size: POINT_SIZE.initial, sizeAttenuation: false, vertexColors: true })
	const points = new THREE.Points(geometry, material)
	points.name = fileName
	points.userData.tdvPointCloud = {
		format,
		count: data.count,
		total: data.total,
		attributes,
		origin: data.origin,
		unit: unit ?? null,
		defaultUp,
		up: defaultUp,
		colourBy,
		source: data,
	}
	return points
}

/**
 * @param {THREE.Points} points - A cloud from buildPointCloud
 * @param {string} mode - One of COLOUR_BY
 * @return {boolean} Whether it changed; false for a mode the cloud has no data for
 */
export function setColourBy(points, mode) {
	const meta = points.userData.tdvPointCloud
	if (!availableColourBy(meta).includes(mode)) {
		return false
	}
	const colour = points.geometry.getAttribute('color')
	writeColours(colour.array, mode, meta.source, meta.up)
	colour.needsUpdate = true
	meta.colourBy = mode
	return true
}

/**
 * @param {THREE.Points} points - A cloud from buildPointCloud
 * @param {number} px - The size asked for
 * @return {number} The size set, within POINT_SIZE
 */
export function setPointSize(points, px) {
	const size = Math.min(POINT_SIZE.max, Math.max(POINT_SIZE.min, Number(px) || POINT_SIZE.initial))
	points.material.size = size
	return size
}
