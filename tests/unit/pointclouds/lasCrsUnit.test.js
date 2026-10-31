/**
 * The length unit a LAS file's coordinate system names, from its GeoTIFF keys or its WKT.
 * Nothing else of the coordinate system is read.
 */
import { geoKeys, wktRecord } from '../../../scripts/pointFixtureWriters.mjs'
import { crsUnit } from '../../../src/pointclouds/lasCrsUnit.js'

test('GeoKeys: the projected linear unit', () => {
	expect(crsUnit([geoKeys([[3076, 9001]])])).toBe('m')
	expect(crsUnit([geoKeys([[3076, 9002]])])).toBe('ft')
	expect(crsUnit([geoKeys([[3076, 9003]])])).toBe('us-ft')
})

test('GeoKeys: the vertical unit when no projected one is given', () => {
	expect(crsUnit([geoKeys([[4099, 9003]])])).toBe('us-ft')
	expect(crsUnit([geoKeys([[3076, 9001], [4099, 9002]])])).toBe('m')
})

test('GeoKeys: a unit that isn\'t a length the viewer knows is no unit', () => {
	expect(crsUnit([geoKeys([[3076, 9036]])])).toBeNull()
	expect(crsUnit([geoKeys([[3072, 32633]])])).toBeNull()
})

test('WKT: the projected unit, judged by its factor, not the geographic one', () => {
	const wkt = (unit) => `PROJCS["x",GEOGCS["y",DATUM["d",SPHEROID["s",6378137,298.257]],UNIT["degree",0.0174532925199433]],PROJECTION["p"],${unit}]`
	expect(crsUnit([wktRecord(wkt('UNIT["metre",1]'))])).toBe('m')
	expect(crsUnit([wktRecord(wkt('UNIT["foot",0.3048]'))])).toBe('ft')
	expect(crsUnit([wktRecord(wkt('UNIT["US survey foot",0.3048006096012192]'))])).toBe('us-ft')
	expect(crsUnit([wktRecord(wkt('UNIT["Foot_US",0.30480060960121924]'))])).toBe('us-ft')
})

test('WKT2: a LENGTHUNIT in the projected CRS', () => {
	const wkt = 'PROJCRS["x",BASEGEOGCRS["y",DATUM["d",ELLIPSOID["e",6378137,298.257]],ANGLEUNIT["degree",0.0174532925199433]],CONVERSION["c",METHOD["m"]],CS[Cartesian,2],AXIS["(E)",east,LENGTHUNIT["foot",0.3048]]]'
	expect(crsUnit([wktRecord(wkt)])).toBe('ft')
})

test('WKT: a geographic system only, or none at all, names no length', () => {
	expect(crsUnit([wktRecord('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],UNIT["degree",0.0174532925199433]]')])).toBeNull()
	expect(crsUnit([])).toBeNull()
})
