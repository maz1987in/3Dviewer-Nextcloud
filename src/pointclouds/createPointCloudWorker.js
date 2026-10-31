/**
 * Starts the scan-reading worker. Kept in a file of its own, as createThumbnailWorker is,
 * because Jest can't parse `import.meta`; tests mock this module.
 *
 * @return {Worker} A fresh worker, for one file
 */
export function createPointCloudWorker() {
	return new Worker(new URL('./pointCloud.worker.js', import.meta.url), { type: 'module' })
}
