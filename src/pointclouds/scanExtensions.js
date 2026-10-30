/**
 * The extensions that are always scans, apart from the readers, so the download code can
 * ask without loading them. A PLY is a scan only when it has no faces.
 */
export const SCAN_EXTENSIONS = Object.freeze(['las', 'laz', 'e57', 'pcd', 'xyz'])

/**
 * @param {string} ext - A file extension
 * @return {boolean} Whether files of this kind are always scans
 */
export function isScanExtension(ext) {
	return SCAN_EXTENSIONS.includes(String(ext).toLowerCase())
}
