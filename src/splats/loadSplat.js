/**
 * Read a Gaussian splat with Spark and make it a model the viewer can place.
 *
 * Spark parses in its own workers, so the page's thread only waits. Over the device's
 * budget the splats are thinned with Spark's own `extractSplats`, an even stride through
 * them. A SplatMesh has no geometry, so the root also holds an invisible box where the
 * splat is (splatBounds.js): the camera fit, the grid, the statistics and the thumbnail
 * framing all measure the root with Box3.setFromObject, and find it. The box is on layer
 * 31, which no camera or raycaster here uses.
 *
 * Spark's worker can't be stopped from outside, so cancelling stops the wait at once and
 * disposes the splats when Spark hands them over.
 */
import * as THREE from 'three'
import { abortError } from '../pointclouds/scanFormats.js'
import { evenIndices, splatBounds } from './splatBounds.js'
import { EmptySplatError, SplatError } from './splatErrors.js'

/**
 * @param {Promise<object>} ready - Resolves to something with dispose()
 * @param {AbortSignal} [signal] - Stops the wait
 * @return {Promise<object>} What `ready` resolves to, unless the signal comes first
 */
function abortable(ready, signal) {
	if (!signal) {
		return ready
	}
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(abortError())
			ready.then((late) => late.dispose(), () => {})
		}
		signal.addEventListener('abort', onAbort, { once: true })
		ready.then(
			(value) => {
				signal.removeEventListener('abort', onAbort)
				resolve(value)
			},
			(error) => {
				signal.removeEventListener('abort', onAbort)
				reject(error)
			},
		)
	})
}

/**
 * @param {THREE.Box3} box - Where the splat is
 * @return {THREE.Mesh} An invisible box there, for Box3.setFromObject
 */
function boundsBox(box) {
	const size = box.getSize(new THREE.Vector3())
	const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }))
	box.getCenter(proxy.position)
	proxy.name = 'tdv-splat-bounds'
	proxy.visible = false
	proxy.layers.set(31)
	proxy.userData.tdvBoundsProxy = true
	return proxy
}

/**
 * @param {Uint8Array} bytes - The file
 * @param {object} options - How to read it
 * @param {string} options.format - 'splat', 'spz' or 'ply'
 * @param {number} options.budget - Splats drawn at most
 * @param {AbortSignal} [options.signal] - Cancels the load
 * @return {Promise<THREE.Group>} The model root, with userData.tdvSplat
 */
export async function loadSplat(bytes, { format, budget, signal }) {
	if (signal?.aborted) {
		throw abortError()
	}
	const { PackedSplats, SplatFileType, SplatMesh } = await import('@sparkjsdev/spark')
	if (signal?.aborted) {
		throw abortError()
	}
	// Spark can't tell a .splat from its bytes; it recognises .spz and .ply
	const read = new PackedSplats({
		fileBytes: bytes,
		fileType: format === 'splat' ? SplatFileType.SPLAT : undefined,
		fileName: `splat.${format}`,
	})
	let packed
	try {
		packed = await abortable(read.initialized, signal)
	} catch (error) {
		if (error?.name === 'AbortError') {
			throw error
		}
		throw new SplatError(error)
	}

	const total = packed.numSplats
	if (!total) {
		packed.dispose()
		throw new EmptySplatError()
	}
	if (total > budget) {
		const thinned = packed.extractSplats(evenIndices(total, budget), false)
		packed.dispose()
		packed = thinned
	}

	const mesh = new SplatMesh({ packedSplats: packed })
	await abortable(mesh.initialized, signal)

	const root = new THREE.Group()
	root.name = 'tdv-splat'
	root.add(mesh)
	root.add(boundsBox(splatBounds(packed)))
	root.userData.tdvSplat = { format, count: packed.numSplats, total, unit: 'm', defaultUp: '+y', up: '+y' }
	return root
}
