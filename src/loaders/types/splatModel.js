/**
 * What every splat loader shares: refuse a file past the ceiling, read it with Spark
 * (splats/loadSplat.js) at this device's budget, and hand it to the viewer like any other
 * model. The page passes a Blob; the thumbnailer an ArrayBuffer, with its own budget.
 */
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { SPLAT_BUDGET, SPLAT_CEILING_BYTES } from '../../splats/limits.js'
import { loadSplat } from '../../splats/loadSplat.js'
import { splatBudget } from '../../splats/splatBudget.js'
import { EmptySplatError, SplatError, SplatTooLargeError } from '../../splats/splatErrors.js'

/**
 * @param {import('../BaseLoader.js').BaseLoader} loader - The format's loader, for processModel
 * @param {Blob|ArrayBuffer} input - The file
 * @param {object} context - The loading context; `thumbnail` asks for the thumbnail budget
 * @return {Promise<object>} processModel's result
 */
export async function loadSplatModel(loader, input, context) {
	const size = input instanceof Blob ? input.size : input.byteLength
	if (size > SPLAT_CEILING_BYTES) {
		throw new SplatTooLargeError(size)
	}
	const bytes = new Uint8Array(input instanceof Blob ? await input.arrayBuffer() : input)
	let root
	try {
		root = await loadSplat(bytes, {
			format: String(context.fileExtension).toLowerCase(),
			budget: context.thumbnail ? SPLAT_BUDGET.thumbnail : splatBudget(),
			signal: context.abortController?.signal,
		})
	} catch (error) {
		if (error instanceof EmptySplatError) {
			throw new Error(t('threedviewer', 'This file holds no splats.'), { cause: error })
		}
		if (error instanceof SplatError) {
			throw new Error(t('threedviewer', 'This splat couldn\'t be read.'), { cause: error })
		}
		throw error
	}
	return loader.processModel(root, context)
}
