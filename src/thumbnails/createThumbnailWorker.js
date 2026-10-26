/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Starts a thumbnail worker. On its own so the `new URL(..., import.meta.url)` form,
 * which Vite needs to see literally to emit the worker as its own chunk, stays out of
 * the modules Jest has to parse. The URL is relative to this chunk, so the worker loads
 * from wherever the app is served: `apps/` or `custom_apps/`.
 */

/**
 * Start a fresh dedicated module worker for one thumbnail render.
 *
 * @return {Worker} The worker; the caller owns it and must terminate it
 */
export function createThumbnailWorker() {
	return new Worker(new URL('./thumbnail.worker.js', import.meta.url), { type: 'module' })
}
