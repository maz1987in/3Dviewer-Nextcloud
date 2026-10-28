/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Starts a print-check worker. On its own, like createThumbnailWorker.js, so the
 * `new URL(..., import.meta.url)` form Vite needs to see literally stays out of the
 * modules Jest parses.
 */

/**
 * Start a fresh dedicated module worker for one print-check job.
 *
 * @return {Worker} The worker; the caller owns it and must terminate it
 */
export function createPrintCheckWorker() {
	return new Worker(new URL('./printCheck.worker.js', import.meta.url), { type: 'module' })
}
