/**
 * E57's XML section: the scans the file holds (data3D's vectorChild elements), each with
 * its pose, its point prototype, its colour and intensity limits, and where its points are.
 * Workers have no DOMParser, so @xmldom/xmldom reads it, as it does the XML model formats.
 */
import { DOMParser } from '@xmldom/xmldom'
import { ScanError } from '../scanFormats.js'

const children = (element, name) => (element ? Array.from(element.childNodes).filter((n) => n.nodeType === 1 && (name === undefined || n.localName === name)) : [])
const child = (element, name) => children(element, name)[0] ?? null

/**
 * A number node's value: Integer and Float as written (empty is 0), a ScaledInteger times
 * its scale plus its offset.
 *
 * @param {?Element} element - The node
 * @param {number} fallback - When there is none
 * @return {number} Its value
 */
function numberOf(element, fallback) {
	if (!element) {
		return fallback
	}
	const raw = Number(element.textContent.trim() || 0)
	if (element.getAttribute('type') === 'ScaledInteger') {
		return raw * Number(element.getAttribute('scale') || 1) + Number(element.getAttribute('offset') || 0)
	}
	return raw
}

/**
 * @param {Element} element - A prototype child
 * @return {object} How its values are stored
 */
function fieldOf(element) {
	const type = element.getAttribute('type')
	const attr = (name, fallback) => (element.hasAttribute(name) ? Number(element.getAttribute(name)) : fallback)
	if (type === 'Float') {
		return { name: element.localName, type, single: element.getAttribute('precision') === 'single', min: attr('minimum', null), max: attr('maximum', null) }
	}
	if (type === 'Integer' || type === 'ScaledInteger') {
		return { name: element.localName, type, min: attr('minimum', 0), max: attr('maximum', 0), scale: attr('scale', 1), offset: attr('offset', 0) }
	}
	throw new ScanError('a point field is of a type E57 doesn\'t have points of, {type}', { type })
}

/**
 * The scale that maps a field's values onto [0, 1]: its limits, else its range.
 *
 * @param {?Element} structure - colorLimits or intensityLimits, if the scan has them
 * @param {string} prefix - colorRed, colorGreen, colorBlue or intensity
 * @param {?object} field - The prototype's field of that name
 * @param {{min: number, max: number}} fallback - When neither says
 * @return {{min: number, max: number}} The limits
 */
function limits(structure, prefix, field, fallback) {
	const min = child(structure, `${prefix}Minimum`)
	const max = child(structure, `${prefix}Maximum`)
	if (min || max) {
		return { min: numberOf(min, 0), max: numberOf(max, 1) }
	}
	if (field?.type !== 'Float') {
		return field ? { min: field.min * (field.scale ?? 1) + (field.offset ?? 0), max: field.max * (field.scale ?? 1) + (field.offset ?? 0) } : fallback
	}
	return field.min !== null && field.max !== null ? { min: field.min, max: field.max } : fallback
}

/**
 * @param {string} text - The XML section
 * @return {object[]} The scans
 */
export function e57Scans(text) {
	let doc
	try {
		doc = new DOMParser({ onError: () => {} }).parseFromString(text, 'text/xml')
	} catch {
		throw new ScanError('its XML can\'t be read')
	}
	const root = doc?.documentElement
	if (!root || root.localName !== 'e57Root') {
		throw new ScanError('its XML has no E57 root')
	}
	return children(child(root, 'data3D'), 'vectorChild').map((scan) => {
		const points = child(scan, 'points')
		if (!points) {
			throw new ScanError('a scan has no points')
		}
		const fields = children(child(points, 'prototype')).map(fieldOf)
		const field = (name) => fields.find((f) => f.name === name)
		const pose = child(scan, 'pose')
		const rotation = child(pose, 'rotation')
		const translation = child(pose, 'translation')
		const colors = child(scan, 'colorLimits')
		const intensities = child(scan, 'intensityLimits')
		return {
			fields,
			recordCount: Number(points.getAttribute('recordCount') || 0),
			fileOffset: Number(points.getAttribute('fileOffset') || 0),
			rotation: rotation ? ['w', 'x', 'y', 'z'].map((k, i) => numberOf(child(rotation, k), i === 0 ? 1 : 0)) : [1, 0, 0, 0],
			translation: translation ? ['x', 'y', 'z'].map((k) => numberOf(child(translation, k), 0)) : [0, 0, 0],
			color: ['Red', 'Green', 'Blue'].map((c) => limits(colors, `color${c}`, field(`color${c}`), { min: 0, max: 1 })),
			intensity: limits(intensities, 'intensity', field('intensity'), { min: 0, max: 1 }),
		}
	})
}
