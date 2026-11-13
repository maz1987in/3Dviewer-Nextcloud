/**
 * The tools that are off for what is open, by key: the App and the panel read these, and
 * the lines saying why (the async controls' lists) use the same keys in the same order.
 */
import { POINT_CLOUD_OFF, SPLAT_OFF, offToolsFor } from '../../../src/utils/offTools.js'
import { POINT_CLOUD_UNAVAILABLE } from '../../../src/pointclouds/unavailable.js'
import { SPLAT_UNAVAILABLE } from '../../../src/splats/unavailable.js'

test('each list matches the lines that say why', () => {
	expect(POINT_CLOUD_OFF).toEqual(POINT_CLOUD_UNAVAILABLE.map((u) => u.key))
	expect(SPLAT_OFF).toEqual(SPLAT_UNAVAILABLE.map((u) => u.key))
})

test('a splat turns off every tool that needs a surface', () => {
	expect(SPLAT_OFF).toEqual(['shading', 'measure', 'notes', 'compare', 'crossSection', 'printCheck', 'exploded', 'parts', 'transform', 'export', 'vr', 'ar'])
})

test('what is open decides the list', () => {
	expect(offToolsFor({ pointCloud: { count: 1 } })).toBe(POINT_CLOUD_OFF)
	expect(offToolsFor({ splat: { count: 1 } })).toBe(SPLAT_OFF)
	expect(offToolsFor({})).toEqual([])
	expect(offToolsFor(null)).toEqual([])
})

test('every splat line says why', () => {
	const notes = Object.fromEntries(SPLAT_UNAVAILABLE.map((u) => [u.key, u.note]))
	expect(notes.measure).toBe('A splat has no real surface to measure.')
	expect(notes.notes).toBe('A splat has no real surface to pin a note to.')
	expect(notes.transform).toBe('A splat is for looking at. Which way is up turns it the right way.')
	expect(notes.vr).toBe('VR isn\'t available for splats.')
	expect(SPLAT_UNAVAILABLE.find((u) => u.key === 'notes').label).toBe('Annotation')
	expect(SPLAT_UNAVAILABLE.find((u) => u.key === 'crossSection').label).toBe('Cross-Section')
})

test('a scan and a splat have no surface to stand in a room, and each line says so', () => {
	expect(POINT_CLOUD_OFF).toContain('ar')
	expect(SPLAT_OFF).toContain('ar')
	const note = (list) => list.find((u) => u.key === 'ar')
	expect(note(POINT_CLOUD_UNAVAILABLE)).toEqual({ key: 'ar', label: 'View in AR', note: 'A scan is points, with no surface to stand in a room.' })
	expect(note(SPLAT_UNAVAILABLE)).toEqual({ key: 'ar', label: 'View in AR', note: 'A splat has no real surface to stand in a room.' })
	expect(offToolsFor({})).not.toContain('ar')
})
