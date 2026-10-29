/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What one scene unit is, in millimetres, for a model loaded from a given format. The
 * viewer works it out once per model, and everything that shows or writes a real size
 * uses it: distance measurements, the model statistics (bounding box, area by its
 * square, volume by its cube), the comparison table, and the exports that carry a real
 * size (3MF in millimetres, USDZ in metres). Angles have no unit and are left alone.
 *
 * Decided per format, from the format's convention and from what the loader does:
 *
 * metres
 *   gltf, glb, vrm   glTF is metres by specification; GLTFLoader keeps it.
 *   usd, usda, usdc, usdz
 *                    USD as written by every tool this app meets (metersPerUnit = 1).
 *   dae              ColladaLoader scales the scene by the file's <unit meter=…>, so the
 *                    scene is in metres whatever the file was written in.
 *   ifc              web-ifc applies the file's IfcUnitAssignment and returns metres: a
 *                    box written in millimetres (.MILLI. .METRE.) comes out 3 units tall
 *                    for 3,000 mm, the same as one written in metres.
 *   x3d, wrl, vrml   metres by specification; both loaders keep the file's values.
 *   bim              dotbim is metres by specification.
 *
 * millimetres
 *   stl, obj, ply, off, 3ds
 *                    no unit in the file; millimetres is what printing and CAD tools
 *                    write, and what the viewer has always measured them in.
 *   amf              AMFLoader scales by the file's `unit` into millimetres.
 *   step, stp, iges, igs, brep, brp, fcstd
 *                    OCCT and FreeCAD shapes are millimetres.
 *   gcode and the other toolpath extensions
 *                    printer coordinates are millimetres (nothing to export anyway).
 *
 * the file's own unit
 *   3dm              Rhino3dmLoader keeps the model's unit system and records it in the
 *                    root's userData.settings.modelUnitSystem; see `rhinoUnit`.
 *   fbx              GlobalSettings' UnitScaleFactor, in centimetres per unit, which
 *                    FBXLoader records (binary and ASCII alike) in the root's
 *                    userData.unitScaleFactor and does not apply. A file without one is
 *                    centimetres, FBX's own default (UnitScaleFactor 1), rather than the
 *                    millimetres of a format with no unit at all. The app's loader then
 *                    shrinks a model larger than 50 units to 5, for lighting, and records
 *                    that factor in userData.viewerScale, which is divided back out; see
 *                    `fbxUnit` and `viewerScale`.
 *   3mf              the `unit` attribute of the file's <model> (micron, millimeter,
 *                    centimeter, inch, foot or meter; millimeter when absent). three's
 *                    ThreeMFLoader reads it but never applies it, so the scene keeps the
 *                    file's numbers; the app's loader records the unit in the root's
 *                    userData.threeMFUnit; see `threeMFUnit`.
 *
 * Anything not listed is taken as millimetres.
 *
 * a unit chosen for the file
 *   A file that records no unit (STL, OBJ, PLY, OFF, 3DS, and an FBX without a
 *   UnitScaleFactor) can have one chosen for it, saved with the file for everyone who can
 *   open it (`isUnitChangeable`, `FILE_UNITS`). It replaces the format's default above and
 *   nothing else: the viewer's own rescale is still divided out. A unit chosen for a file
 *   that records its own is ignored, whatever reaches the viewer.
 */

import { VIEWER_CONFIG } from '../config/viewer-config.js'

const METRE = 1000
const CENTIMETRE = 10
const MILLIMETRE = 1

/** Millimetres per unit, by lower-case extension, for a file that records none of its own. */
export const SOURCE_UNITS = Object.freeze({
	gltf: METRE,
	glb: METRE,
	vrm: METRE,
	usd: METRE,
	usda: METRE,
	usdc: METRE,
	usdz: METRE,
	dae: METRE,
	ifc: METRE,
	x3d: METRE,
	wrl: METRE,
	vrml: METRE,
	bim: METRE,
	stl: MILLIMETRE,
	obj: MILLIMETRE,
	ply: MILLIMETRE,
	off: MILLIMETRE,
	'3ds': MILLIMETRE,
	'3mf': MILLIMETRE,
	amf: MILLIMETRE,
	step: MILLIMETRE,
	stp: MILLIMETRE,
	iges: MILLIMETRE,
	igs: MILLIMETRE,
	brep: MILLIMETRE,
	brp: MILLIMETRE,
	fcstd: MILLIMETRE,
	fbx: CENTIMETRE,
	gcode: MILLIMETRE,
})

/**
 * The units a file that records none can be said to be in: millimetres per unit, the
 * suffix the panels write, and the display unit (a key of
 * VIEWER_CONFIG.measurement.unitScales) its readings start in. US survey feet read in
 * international feet, which differ by two parts per million.
 */
export const FILE_UNITS = Object.freeze({
	mm: Object.freeze({ millimetres: MILLIMETRE, suffix: 'mm', display: 'millimeters' }),
	cm: Object.freeze({ millimetres: CENTIMETRE, suffix: 'cm', display: 'centimeters' }),
	m: Object.freeze({ millimetres: METRE, suffix: 'm', display: 'meters' }),
	in: Object.freeze({ millimetres: 25.4, suffix: 'in', display: 'inches' }),
	ft: Object.freeze({ millimetres: 304.8, suffix: 'ft', display: 'feet' }),
	'us-ft': Object.freeze({ millimetres: 1200000 / 3937, suffix: 'ft (US)', display: 'feet' }),
})

// Recorded units the list above doesn't offer, for naming them
const OTHER_SUFFIXES = [[0.001, 'µm'], [100, 'dm'], [1e6, 'km'], [914.4, 'yd']]

// Rhino's UnitSystem values (rhino3dm's UnitSystem enum) in millimetres
const RHINO_UNITS = {
	1: 0.001, // microns
	2: 1, // millimetres
	3: 10, // centimetres
	4: 1000, // metres
	5: 1e6, // kilometres
	8: 25.4, // inches
	9: 304.8, // feet
	14: 100, // decimetres
	19: 914.4, // yards
}

/**
 * The unit a Rhino model was drawn in, from what Rhino3dmLoader records on the object it
 * returns: `userData.settings.modelUnitSystem`, as `{ name, value }`.
 *
 * @param {?THREE.Object3D} root - The loaded model
 * @return {?number} Millimetres per unit, or null when not recorded or not a length
 */
export function rhinoUnit(root) {
	let found = null
	root?.traverse?.((child) => {
		const system = child.userData?.settings?.modelUnitSystem
		if (found === null && system !== undefined) {
			found = RHINO_UNITS[typeof system === 'object' ? system?.value : system] ?? null
		}
	})
	return found
}

// The 3MF core specification's units, in millimetres
const THREE_MF_UNITS = {
	micron: 0.001,
	millimeter: 1,
	centimeter: 10,
	inch: 25.4,
	foot: 304.8,
	meter: 1000,
}

/**
 * @param {number} value - A scale read from a file, or worked out from one
 * @return {boolean} Whether it is a usable length: finite and greater than zero
 */
function isLength(value) {
	return Number.isFinite(value) && value > 0
}

/**
 * Look for a value the loader recorded in some object's userData: the model may be
 * wrapped in a group of the viewer's (the comparison model is).
 *
 * @param {?THREE.Object3D} root - The loaded model
 * @param {function(object): (string|number|undefined)} read - Returns the value from one
 *   object's userData, or undefined
 * @return {string|number|undefined} The first value found, or undefined
 */
function recorded(root, read) {
	let found
	root?.traverse?.((child) => {
		if (found === undefined && child.userData) {
			found = read(child.userData)
		}
	})
	return found
}

/**
 * The unit a 3MF file is written in, from what the app's 3MF loader records on the
 * object it returns: `userData.threeMFUnit`, the spec's name for it.
 *
 * @param {?THREE.Object3D} root - The loaded model
 * @return {?number} Millimetres per unit, or null when not recorded or not a 3MF unit
 */
export function threeMFUnit(root) {
	const unit = recorded(root, (data) => data.threeMFUnit)
	return THREE_MF_UNITS[String(unit ?? '').toLowerCase()] ?? null
}

/**
 * The unit an FBX file is written in, from GlobalSettings' UnitScaleFactor (centimetres
 * per unit), which FBXLoader records as the root's `userData.unitScaleFactor`.
 *
 * @param {?THREE.Object3D} root - The loaded model
 * @return {?number} Millimetres per file unit, or null when not recorded or not a length
 */
export function fbxUnit(root) {
	const factor = Number(recorded(root, (data) => data.unitScaleFactor))
	const millimetres = factor * CENTIMETRE
	// A crafted 1e308 is finite, and ten times it is not
	return isLength(factor) && isLength(millimetres) ? millimetres : null
}

/**
 * The uniform scale the viewer's loader applied to a model to fit it to its lighting (the
 * FBX loader does, to a model larger than 50 units): `userData.viewerScale`. A scene unit
 * is then 1/viewerScale of a file unit.
 *
 * @param {?THREE.Object3D} root - The loaded model
 * @return {number} The scale, 1 when none was applied
 */
export function viewerScale(root) {
	const scale = Number(recorded(root, (data) => data.viewerScale))
	return isLength(scale) ? scale : 1
}

// Formats whose files never record a unit, so one can be chosen for them (and FBX, when
// the file has no UnitScaleFactor)
const CHANGEABLE_FORMATS = new Set(['stl', 'obj', 'ply', 'off', '3ds'])

/**
 * @param {?string} filename - The file (a path is fine)
 * @return {string} Its lower-case extension
 */
function extensionOf(filename) {
	return String(filename ?? '').split('/').pop().split('.').pop().toLowerCase()
}

/**
 * Whether a unit can be chosen for a file: its format records none.
 *
 * @param {?string} filename - The file (a path is fine)
 * @param {?THREE.Object3D} [root] - The loaded model, read for an FBX's unit scale
 * @return {boolean}
 */
export function isUnitChangeable(filename, root = null) {
	if (!filename) {
		return false
	}
	const extension = extensionOf(filename)
	return CHANGEABLE_FORMATS.has(extension) || (extension === 'fbx' && fbxUnit(root) === null)
}

/**
 * Millimetres per unit of a chosen unit, when it applies to the file.
 *
 * @param {?string} filename - The file (a path is fine)
 * @param {?THREE.Object3D} root - The loaded model
 * @param {?string} chosenUnit - A key of FILE_UNITS, or null
 * @return {?number} Null when none was chosen, it is not a unit, or the file records its own
 */
function chosenMillimetres(filename, root, chosenUnit) {
	if (typeof chosenUnit !== 'string' || !Object.hasOwn(FILE_UNITS, chosenUnit) || !isUnitChangeable(filename, root)) {
		return null
	}
	return FILE_UNITS[chosenUnit].millimetres
}

/**
 * @param {number} millimetres - Millimetres per unit
 * @return {?string} The key of FILE_UNITS for that unit, or null when it isn't one
 */
export function fileUnitKey(millimetres) {
	const match = Object.entries(FILE_UNITS).find(([, unit]) => Math.abs(unit.millimetres - millimetres) < 1e-9 * unit.millimetres)
	return match ? match[0] : null
}

/**
 * How the panels write a unit: its suffix, or its size in millimetres for a unit with none.
 *
 * @param {number} millimetres - Millimetres per unit
 * @return {string} `in`, `µm`, `2.000 mm`, …
 */
export function unitSuffix(millimetres) {
	const key = fileUnitKey(millimetres)
	if (key) {
		return FILE_UNITS[key].suffix
	}
	const other = OTHER_SUFFIXES.find(([size]) => Math.abs(size - millimetres) < 1e-9 * size)
	return other ? other[1] : `${formatLength(millimetres)} mm`
}

/**
 * Millimetres per unit of the file a model was loaded from: the unit it was written in,
 * before any rescale of the viewer's.
 *
 * @param {?string} filename - The file the model was loaded from (a path is fine)
 * @param {?THREE.Object3D} [root] - The loaded model, read for formats that record a unit
 * @param {?string} [chosenUnit] - A key of FILE_UNITS chosen for the file, or null
 * @return {number} Millimetres per file unit
 */
export function millimetresPerFileUnit(filename, root = null, chosenUnit = null) {
	const chosen = chosenMillimetres(filename, root, chosenUnit)
	if (chosen !== null) {
		return chosen
	}
	const extension = extensionOf(filename)
	if (extension === '3dm') {
		return rhinoUnit(root) ?? MILLIMETRE
	}
	if (extension === '3mf') {
		return threeMFUnit(root) ?? MILLIMETRE
	}
	if (extension === 'fbx') {
		return fbxUnit(root) ?? CENTIMETRE
	}
	return SOURCE_UNITS[extension] ?? MILLIMETRE
}

/**
 * Millimetres per scene unit for a model.
 *
 * @param {?string} filename - The file the model was loaded from (a path is fine)
 * @param {?THREE.Object3D} [root] - The loaded model, read for formats that record a unit
 * @param {?string} [chosenUnit] - A key of FILE_UNITS chosen for the file, or null
 * @return {number} Millimetres per unit
 */
export function millimetresPerUnit(filename, root = null, chosenUnit = null) {
	const millimetres = millimetresPerFileUnit(filename, root, chosenUnit) / viewerScale(root)
	if (isLength(millimetres)) {
		return millimetres
	}
	// Only crafted values get here (a vanishing rescale, say): the format's own default
	const extension = extensionOf(filename)
	return SOURCE_UNITS[extension] ?? MILLIMETRE
}

/**
 * The display unit a model's readings start in, until the user picks one: the unit its
 * file is written in (m for a glTF, mm for an STL, cm for most FBX files, a Rhino or 3MF
 * file's own), or millimetres for a unit the picker does not offer. With no file (the
 * model cleared, or the demo scene), the configured default.
 *
 * @param {?string} filename - The file the model was loaded from (a path is fine)
 * @param {?THREE.Object3D} [root] - The loaded model, read for formats that record a unit
 * @param {?string} [chosenUnit] - A key of FILE_UNITS chosen for the file, or null
 * @return {string} A key of VIEWER_CONFIG.measurement.unitScales
 */
export function defaultDisplayUnit(filename, root = null, chosenUnit = null) {
	if (!filename) {
		return VIEWER_CONFIG.measurement.defaultUnit
	}
	if (chosenMillimetres(filename, root, chosenUnit) !== null) {
		return FILE_UNITS[chosenUnit].display
	}
	const fileUnit = millimetresPerFileUnit(filename, root)
	const match = Object.entries(VIEWER_CONFIG.measurement.unitScales)
		.find(([, unit]) => !unit.fileUnits && Math.abs(unit.factor - fileUnit) < 1e-9 * fileUnit)
	if (match) {
		return match[0]
	}
	// Kilometres and the like read best in metres; anything smaller in millimetres
	return fileUnit > METRE ? 'meters' : 'millimeters'
}

/**
 * What to multiply a length in scene units by to show it in a display unit.
 *
 * @param {{ factor: number, fileUnits?: boolean }} unit - An entry of
 *   VIEWER_CONFIG.measurement.unitScales (`factor` is millimetres per display unit)
 * @param {number} sceneMillimetres - Millimetres per scene unit, from millimetresPerUnit
 * @param {number} [fileMillimetres] - Millimetres per file unit, from
 *   millimetresPerFileUnit; the same as a scene unit unless the viewer rescaled the model
 * @return {number} Display units per scene unit. For "units", file units: the file's own
 *   numbers, with the viewer's rescale divided out.
 */
export function displayLengthFactor(unit, sceneMillimetres, fileMillimetres = sceneMillimetres) {
	return unit.fileUnits ? sceneMillimetres / fileMillimetres : sceneMillimetres / unit.factor
}

/**
 * A length as the panels write it: `minDecimals` decimals, or more for a small value, so
 * that it keeps three significant figures. In metres, a 0.4 mm feature reads 0.000400
 * rather than 0.000; 1.800 and 0.600 read as they always have.
 *
 * @param {number} value - The length, in its display unit
 * @param {number} [minDecimals] - Decimals for a length of 0.1 and over
 * @return {string} The number, without a unit
 */
export function formatLength(value, minDecimals = 3) {
	if (!Number.isFinite(value)) {
		return String(value)
	}
	if (value === 0) {
		return (0).toFixed(minDecimals)
	}
	const decimals = Math.max(minDecimals, 2 - Math.floor(Math.log10(Math.abs(value))))
	// Smaller than a billionth of the unit: a long row of zeros says less than an exponent
	return decimals > 9 ? value.toExponential(2) : value.toFixed(decimals)
}
