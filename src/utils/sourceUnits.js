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
 *   fbx              the FBX loader shrinks any model larger than 50 units to 5 units
 *                    for lighting, so its real size is lost; it is taken as millimetres
 *                    like the rest.
 *
 * the file's own unit
 *   3dm              Rhino3dmLoader keeps the model's unit system and records it in the
 *                    root's userData.settings.modelUnitSystem; see `rhinoUnit`.
 *   3mf              the `unit` attribute of the file's <model> (micron, millimeter,
 *                    centimeter, inch, foot or meter; millimeter when absent). three's
 *                    ThreeMFLoader reads it but never applies it, so the scene keeps the
 *                    file's numbers; the app's loader records the unit in the root's
 *                    userData.threeMFUnit; see `threeMFUnit`.
 *
 * Anything not listed is taken as millimetres.
 */

const METRE = 1000
const MILLIMETRE = 1

/** Millimetres per scene unit, by lower-case extension. */
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
	fbx: MILLIMETRE,
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
 * Millimetres per scene unit for a model.
 *
 * @param {?string} filename - The file the model was loaded from (a path is fine)
 * @param {?THREE.Object3D} [root] - The loaded model, read for formats that record a unit
 * @return {number} Millimetres per unit
 */
export function millimetresPerUnit(filename, root = null) {
	const extension = String(filename ?? '').split('/').pop().split('.').pop().toLowerCase()
	if (extension === '3dm') {
		return rhinoUnit(root) ?? MILLIMETRE
	}
	if (extension === '3mf') {
		return threeMFUnit(root) ?? MILLIMETRE
	}
	return SOURCE_UNITS[extension] ?? MILLIMETRE
}
