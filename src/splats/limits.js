/**
 * How much of a splat the viewer takes on. Spark reads the whole file, then the viewer
 * thins it to the device's budget; a 200 MB .splat (32 bytes a splat) is about 6.5M
 * splats, so it loads whole on a desktop. Past the device's ceiling it is refused.
 */

/** Splats drawn at most, by device; the thumbnailer draws few, in a 512 px image. */
export const SPLAT_BUDGET = Object.freeze({ desktop: 8_000_000, tablet: 3_000_000, phone: 1_500_000, thumbnail: 500_000 })

/**
 * The largest splat the viewer opens; the server's SupportedFormats::SPLAT_MAX_BYTES.
 * Lower than a scan's: Spark decodes the whole file before it is thinned.
 */
export const SPLAT_CEILING_BYTES = 1024 ** 3

/**
 * The largest splat each kind of device opens. The decoded splats are about the file's
 * size before thinning, so a phone or a tablet, which has far less memory to give a tab,
 * refuses a file a desktop opens rather than lose the tab to it.
 */
export const SPLAT_CEILING = Object.freeze({ desktop: SPLAT_CEILING_BYTES, tablet: 512 * 1024 ** 2, phone: 256 * 1024 ** 2 })

/** Centres read at most to find where a splat is. */
export const BOUNDS_SAMPLE = 100_000

/** The share of centres left out at each end of each axis: a capture's strays. */
export const BOUNDS_PERCENTILE = 0.005
