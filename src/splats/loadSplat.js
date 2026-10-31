/**
 * Read a Gaussian splat with Spark and make it a model the viewer can place.
 *
 * Spark parses in its own workers, so the page's thread only waits; a download is streamed
 * to them, so the page never holds a copy of the whole file. Over the device's budget the
 * splats are thinned by an even stride through them (thinSplats.js). A SplatMesh has no geometry, so the root also holds an invisible box where the
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
import { thinSplats } from './thinSplats.js'

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
		if (signal.aborted) {
			onAbort()
			return
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
 * @param {Promise<object>} ready - Spark's wait
 * @param {AbortSignal} [signal] - Stops the wait
 * @return {Promise<object>} What `ready` resolves to; Spark's refusal as a SplatError
 */
async function sparkWait(ready, signal) {
	try {
		return await abortable(ready, signal)
	} catch (error) {
		if (error?.name === 'AbortError') {
			throw error
		}
		throw new SplatError(error)
	}
}

/**
 * @param {Blob|Uint8Array} input - The file: a download, streamed to Spark, or the
 *   thumbnailer's bytes
 * @param {object} options - How to read it
 * @param {string} options.format - 'splat', 'spz' or 'ply'
 * @param {number} options.budget - Splats drawn at most
 * @param {AbortSignal} [options.signal] - Cancels the load
 * @return {Promise<THREE.Group>} The model root, with userData.tdvSplat
 */
export async function loadSplat(input, { format, budget, signal }) {
	if (signal?.aborted) {
		throw abortError()
	}
	const { PackedSplats, SplatFileType, SplatMesh } = await import('@sparkjsdev/spark')
	if (signal?.aborted) {
		throw abortError()
	}
	// Spark can't tell a .splat from its bytes; it recognises .spz and .ply
	const read = new PackedSplats({
		...(input instanceof Blob ? { stream: input.stream(), streamLength: input.size } : { fileBytes: input }),
		fileType: format === 'splat' ? SplatFileType.SPLAT : undefined,
		fileName: `splat.${format}`,
	})
	let packed = await sparkWait(read.initialized, signal)

	const total = packed.numSplats
	if (!total) {
		packed.dispose()
		throw new EmptySplatError()
	}
	if (total > budget) {
		const thinned = thinSplats(packed, evenIndices(total, budget), PackedSplats)
		packed.dispose()
		packed = thinned
	}

	const mesh = new SplatMesh({ packedSplats: packed })
	try {
		await sparkWait(mesh.initialized, signal)
	} catch (error) {
		// Cancelled, the mesh is freed when Spark is done with it (abortable)
		if (error.name !== 'AbortError') {
			packed.dispose()
		}
		throw error
	}

	const root = new THREE.Group()
	root.name = 'tdv-splat'
	root.add(mesh)
	root.add(boundsBox(splatBounds(packed)))
	root.userData.tdvSplat = { format, count: packed.numSplats, total, unit: 'm', defaultUp: '+y', up: '+y' }
	return root
}
