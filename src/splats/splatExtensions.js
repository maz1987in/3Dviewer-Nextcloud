/**
 * The extensions that are always splats, apart from the loaders, so the download code can
 * ask without loading Spark. A PLY is a splat only when its header says so.
 */
export const SPLAT_EXTENSIONS = Object.freeze(['splat', 'spz'])

/**
 * @param {string} ext - A file extension
 * @return {boolean} Whether files of this kind are always splats
 */
export function isSplatExtension(ext) {
	return SPLAT_EXTENSIONS.includes(String(ext).toLowerCase())
}
