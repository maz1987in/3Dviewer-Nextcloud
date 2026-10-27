/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What one scene unit is, in millimetres, for a model loaded from a given format: the
 * export formats that carry a real size (3MF in millimetres, USDZ in metres) need it.
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
 *                    write, and what the viewer's measurements assume.
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
 */

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
	return Number.isFinite(factor) && factor > 0 ? factor * CENTIMETRE : null
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
	return Number.isFinite(scale) && scale > 0 ? scale : 1
}

/**
 * Millimetres per unit of the file a model was loaded from: the unit it was written in,
 * before any rescale of the viewer's.
 *
 * @param {?string} filename - The file the model was loaded from (a path is fine)
 * @param {?THREE.Object3D} [root] - The loaded model, read for formats that record a unit
 * @return {number} Millimetres per file unit
 */
export function millimetresPerFileUnit(filename, root = null) {
	const extension = String(filename ?? '').split('/').pop().split('.').pop().toLowerCase()
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
 * @return {number} Millimetres per unit
 */
export function millimetresPerUnit(filename, root = null) {
	return millimetresPerFileUnit(filename, root) / viewerScale(root)
}
