/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Default perspective camera values shared by the viewer and the thumbnail renderer.
 * Plain data with no imports, so a Web Worker can load it (viewer-config.js calls
 * imagePath() at load time, which needs `window`).
 */

/** Vertical field of view in degrees */
export const DEFAULT_CAMERA_FOV = 75
