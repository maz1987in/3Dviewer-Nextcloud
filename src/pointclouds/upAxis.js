/**
 * Which way is up for a scan. Scanners, drones and phone apps write their files every
 * way up, so the person says which way, and the viewer turns the model root (not the
 * points, so notes and view-link cameras, kept in the root's space, still fit).
 */
import * as THREE from 'three'

/** The file settings' values (FileSettingsService::UPS). */
export const UPS = Object.freeze(['+y', '-y', '+z', '-z'])

const Z_UP_FORMATS = new Set(['las', 'laz', 'e57'])

/**
 * @param {string} format - The file's extension
 * @return {string} Survey formats are Z up; everything else Y up
 */
export function defaultUp(format) {
	return Z_UP_FORMATS.has(String(format).toLowerCase()) ? '+z' : '+y'
}

/**
 * @param {string} up - One of UPS
 * @return {THREE.Euler} The turn that brings the file's up to the viewer's +Y
 */
export function upRotation(up) {
	switch (up) {
	case '-y': return new THREE.Euler(Math.PI, 0, 0)
	case '+z': return new THREE.Euler(-Math.PI / 2, 0, 0)
	case '-z': return new THREE.Euler(Math.PI / 2, 0, 0)
	default: return new THREE.Euler(0, 0, 0)
	}
}

/**
 * @param {THREE.Object3D} root - The model root
 * @param {string} up - One of UPS
 */
export function applyUp(root, up) {
	root.rotation.copy(upRotation(up))
}
