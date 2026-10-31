/**
 * The tools that are off for what is open, by key, and nothing else: the App and the
 * panel read these to gate their controls, and stay small. The words saying why live in
 * the async controls that list them (pointclouds/unavailable.js, splats/unavailable.js),
 * under the same keys, in the same order (tests/unit/utils/offTools.test.js).
 */

/** A scan: no closed surface to check, colour by for shading, one cloud, and only points. */
export const POINT_CLOUD_OFF = Object.freeze(['printCheck', 'shading', 'exploded', 'compare', 'export'])

/** A splat: no real surface, so every tool that needs one, and VR. */
export const SPLAT_OFF = Object.freeze(['shading', 'measure', 'notes', 'compare', 'crossSection', 'printCheck', 'exploded', 'transform', 'export', 'vr'])

const NONE = Object.freeze([])

/**
 * @param {?{pointCloud?: object, splat?: object}} meta - ThreeViewer's model-loaded meta
 * @return {readonly string[]} The keys of the tools that are off for it
 */
export function offToolsFor(meta) {
	if (meta?.pointCloud) {
		return POINT_CLOUD_OFF
	}
	return meta?.splat ? SPLAT_OFF : NONE
}
