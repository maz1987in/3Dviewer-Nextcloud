/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Handing the repaired model over: downloaded, or written into the model's own folder
 * under a name nothing there has, the way Export's "Save next to the model" does, with the
 * same messages when it works and when the server refuses.
 *
 * Loaded when someone asks for the file, not with the viewer.
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { ExportSaveError, exportSaveFailure } from '../utils/exportErrors.js'
import { logger } from '../utils/logger.js'

/**
 * The name a repaired file takes: the model's own, without its extension, then " (repaired)".
 *
 * @param {string} modelName - The model's file name, as shown
 * @return {string} The name without an extension: "bracket (repaired)"
 */
export function repairedName(modelName) {
	return `${String(modelName || 'model').replace(/\.[^./]+$/, '') || 'model'} (repaired)`
}

/**
 * Write the repaired model as a file and hand it over, saying so in a toast.
 *
 * @param {object} options - Options
 * @param {{buildRepairedFile: function(string): Promise<?{blob: Blob, extension: string}>}} options.check - Print check
 * @param {string} options.format - 'stl' or '3mf'
 * @param {boolean} options.save - Write it into the model's folder instead of downloading it
 * @param {string} options.userId - The logged-in user, for a save
 * @param {?string} options.folder - The model's folder, for a save
 * @param {string} options.modelName - The model's file name
 * @param {function(object): void} options.notify - Shows a toast
 * @param {function(Blob, string): void} options.download - Downloads a file
 * @return {Promise<void>} Settled when it is out, or its failure has been shown
 */
export async function exportRepairedModel({ check, format, save, userId, folder, modelName, notify, download }) {
	try {
		const file = await check.buildRepairedFile(format)
		if (!file) {
			notify({
				type: 'error',
				title: t('threedviewer', 'Export Failed'),
				message: t('threedviewer', 'This model has no surfaces to save as {format}.', { format: format.toUpperCase() }),
			})
			return
		}
		const base = repairedName(modelName)
		if (save) {
			let name
			try {
				const { freeName, saveNewFile } = await import('../utils/davFiles.js')
				name = await saveNewFile(userId, folder, (existing) => freeName(base, file.extension, existing), file.blob)
			} catch (error) {
				throw new ExportSaveError(error)
			}
			notify({
				type: 'success',
				title: t('threedviewer', 'Export Successful'),
				message: t('threedviewer', 'Saved {name} next to the model', { name }),
				timeout: 5000,
			})
			return
		}
		download(file.blob, `${base}.${file.extension}`)
		notify({
			type: 'success',
			title: t('threedviewer', 'Export Successful'),
			message: t('threedviewer', 'Model exported as {name}', { name: `${base}.${file.extension}` }),
		})
	} catch (error) {
		logger.error('exportRepaired', 'Exporting the repaired model failed', error)
		notify({
			type: 'error',
			title: t('threedviewer', 'Export Failed'),
			message: error instanceof ExportSaveError ? exportSaveFailure(error.cause) : (error.message || t('threedviewer', 'Failed to export model')),
		})
	}
}
