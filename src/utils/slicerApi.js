/**
 * The two slicer-handoff requests that change data on the server.
 *
 * Both routes check Nextcloud's CSRF token, so both go through `@nextcloud/axios`,
 * which sends it as the `requesttoken` header (and fetches a fresh one if it has gone
 * stale). A bare `fetch` or `XMLHttpRequest` sends none and the server answers 412.
 * Axios runs on XMLHttpRequest in the browser, so upload progress still reports.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const UPLOAD_TIMEOUT_MS = 120000

/**
 * Upload a model to a temporary file and get a public download link for the slicer.
 *
 * @param {string} filename name the slicer should see
 * @param {Blob} blob the file
 * @param {(percent: number) => void} [onProgress] upload progress, 0 to 100
 * @return {Promise<object>} the server's JSON answer
 */
export async function uploadTempFile(filename, blob, onProgress) {
	const url = generateUrl('/apps/threedviewer/api/slicer/temp') + `?filename=${encodeURIComponent(filename)}`
	try {
		const response = await axios.post(url, blob, {
			headers: { 'Content-Type': 'application/octet-stream' },
			timeout: UPLOAD_TIMEOUT_MS,
			onUploadProgress: (event) => {
				if (onProgress && event.total) {
					onProgress(Math.round((event.loaded / event.total) * 100))
				}
			},
		})
		onProgress?.(100)
		return response.data
	} catch (error) {
		if (error?.code === 'ECONNABORTED') {
			throw new Error('Upload timed out (2 min)')
		}
		if (error?.response) {
			throw new Error(`Server returned ${error.response.status}`)
		}
		throw new Error('Network error')
	}
}

/**
 * Delete a temporary file and its share link.
 *
 * @param {number|string} fileId id the upload returned
 * @return {Promise<unknown>}
 */
export function deleteTempFile(fileId) {
	return axios.delete(generateUrl(`/apps/threedviewer/api/slicer/temp/${fileId}`))
}
