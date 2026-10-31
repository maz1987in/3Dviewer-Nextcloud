/**
 * What every scan loader shares: read the file in a worker, build the cloud, and hand it
 * to the viewer like any other model. The page passes a Blob (the download is never one
 * ArrayBuffer); the thumbnailer passes an ArrayBuffer, read in its own thread.
 */
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { currentBudget } from '../../pointclouds/budget.js'
import { buildPointCloud } from '../../pointclouds/buildPointCloud.js'
import { POINT_BUDGET } from '../../pointclouds/limits.js'
import { parsePointCloud } from '../../pointclouds/parsePointCloud.js'
import { NotAScanError, ScanError } from '../../pointclouds/scanFormats.js'
import { translateReason } from '../../pointclouds/scanReasons.js'
import { defaultUp } from '../../pointclouds/upAxis.js'

/**
 * @param {import('../BaseLoader.js').BaseLoader} loader - The format's loader, for processModel
 * @param {Blob|ArrayBuffer} input - The file
 * @param {object} context - The loading context; `thumbnail` asks for the thumbnail budget
 * @return {Promise<object>} processModel's result
 */
export async function loadPointCloud(loader, input, context) {
	const blob = input instanceof Blob ? input : new Blob([input])
	const ext = String(context.fileExtension).toLowerCase()
	let read
	try {
		read = await parsePointCloud(blob, ext, {
			budget: context.thumbnail ? POINT_BUDGET.thumbnail : currentBudget(),
			inline: typeof window === 'undefined',
			signal: context.abortController?.signal,
			onProgress: (fraction) => context.updateProgress?.(Math.round(fraction * 100), 100),
		})
	} catch (error) {
		if (error instanceof NotAScanError) {
			throw new Error(t('threedviewer', 'This .xyz file lists atoms, not a scan, so it can\'t be shown here.'), { cause: error })
		}
		if (error instanceof ScanError) {
			throw new Error(t('threedviewer', 'This scan couldn\'t be read: {reason}', { reason: translateReason(error.reason ?? error.message, error.vars) }), { cause: error })
		}
		throw error
	}
	const points = buildPointCloud(read.sink, {
		fileName: context.fileName ?? '',
		format: read.format,
		unit: read.unit,
		defaultUp: defaultUp(read.format),
	})
	return loader.processModel(points, context)
}
