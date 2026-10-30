/**
 * laz-perf (Apache-2.0), the WebAssembly LAZ decoder, loaded once per thread. Its WASM is
 * served from the app's `lazperf/` folder, copied there by scripts/copy-decoders.mjs; in
 * a worker, the folder is found through the web root the page sent (setAppWebRoot).
 */
import createLazPerf from 'laz-perf/lib/worker/laz-perf.js'
import { appAssetPath } from '../loaders/appAssetPath.js'

let modulePromise = null

/**
 * @return {Promise<object>} The laz-perf module: ChunkDecoder, LASZip, _malloc, _free, HEAPU8
 */
export function getLazPerf() {
	modulePromise ??= createLazPerf({
		locateFile: (name) => (name.endsWith('.wasm') ? appAssetPath('lazperf', name) : name),
	})
	return modulePromise
}
