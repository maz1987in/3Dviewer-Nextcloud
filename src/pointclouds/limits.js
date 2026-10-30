/**
 * How much of a scan the viewer takes on. A file loads whole when its points fit the
 * device's budget; a 200 MB uncompressed LAS is about 6M points, so it does on a desktop.
 * Past the budget it is thinned as it is read; past the ceiling it is refused.
 */

/** Points drawn at most, by device; the thumbnailer draws few, in a 512 px image. */
export const POINT_BUDGET = Object.freeze({ desktop: 20_000_000, tablet: 4_000_000, phone: 2_000_000, thumbnail: 300_000 })

/** The largest scan the viewer opens; the server's SupportedFormats::SCAN_MAX_BYTES. */
export const SCAN_CEILING_BYTES = 2 * 1024 ** 3

/** A PLY that turns out to be a mesh is loaded whole, so it keeps the ordinary limit. */
export const PLY_MESH_CEILING_BYTES = 500 * 1024 ** 2

/** Screen-space point size, in px. */
export const POINT_SIZE = Object.freeze({ min: 1, max: 10, step: 0.5, initial: 2 })
