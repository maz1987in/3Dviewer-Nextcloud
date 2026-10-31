/**
 * Why a splat can't be shown. The words the person reads are the loader's
 * (loaders/types/splatModel.js); Spark's own errors are English and internal, so they
 * travel as the cause, for the log.
 */
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { formatBytes } from '../utils/validation.js'

/** Spark could not read the file. */
export class SplatError extends Error {

	/**
	 * @param {unknown} cause - Spark's error
	 */
	constructor(cause) {
		super('Spark could not read the splat', { cause })
		this.name = 'SplatError'
	}

}

/** The file reads, and holds no splats. */
export class EmptySplatError extends Error {

	constructor() {
		super('The file holds no splats')
		this.name = 'EmptySplatError'
	}

}

/** Past SPLAT_CEILING_BYTES, refused before it is read. */
export class SplatTooLargeError extends Error {

	/**
	 * @param {number} size - The file's size, in bytes
	 */
	constructor(size) {
		super(t('threedviewer', 'This splat is {size}. The viewer opens splats up to 1 GB.', { size: formatBytes(size) }))
		this.name = 'SplatTooLargeError'
	}

}
