/**
 * Freeing a splat when it leaves a viewer. Spark's SplatMesh holds the splats (an array on
 * the page and a texture on the GPU) outside any geometry, so disposing geometries and
 * materials, as the viewers do for a mesh, leaves them for the garbage collector.
 */

/**
 * @param {?import('three').Object3D} root - A model root; only a splat's is touched
 */
export function disposeSplat(root) {
	if (!root?.userData?.tdvSplat) {
		return
	}
	root.traverse((child) => {
		if (child.userData.tdvBoundsProxy) {
			child.geometry.dispose()
			child.material.dispose()
		} else if (child !== root && typeof child.dispose === 'function') {
			child.dispose()
		}
	})
}
