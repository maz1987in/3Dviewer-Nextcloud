/**
 * The reasons a scan can't be read, translated on the page: a reader runs in a worker,
 * where no translations are loaded, so it says why in English (ScanError's `reason`, with
 * `{name}` placeholders) and the page looks the words up here. Every reason a reader can
 * give is listed; scanReasons.test.js holds that.
 */
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'

const REASONS = {
	"LAS point format {format} doesn't exist": (vars) => t('threedviewer', 'LAS point format {format} doesn\'t exist', vars),
	"LAZ point format {format} isn't supported": (vars) => t('threedviewer', 'LAZ point format {format} isn\'t supported', vars),
	"a field is of a type PCD doesn't have, {type}": (vars) => t('threedviewer', 'a field is of a type PCD doesn\'t have, {type}', vars),
	"a line is far longer than a point's; it may not be a text file": () => t('threedviewer', 'a line is far longer than a point\'s; it may not be a text file'),
	'a packet holds a different number of fields from its scan': () => t('threedviewer', 'a packet holds a different number of fields from its scan'),
	'a packet is damaged': () => t('threedviewer', 'a packet is damaged'),
	"a packet is of a kind E57 doesn't have": () => t('threedviewer', 'a packet is of a kind E57 doesn\'t have'),
	"a point field is of a type E57 doesn't have points of, {type}": (vars) => t('threedviewer', 'a point field is of a type E57 doesn\'t have points of, {type}', vars),
	"a point field's range is damaged": () => t('threedviewer', 'a point field\'s range is damaged'),
	'a scan claims more points than it holds': () => t('threedviewer', 'a scan claims more points than it holds'),
	'a scan has no points': () => t('threedviewer', 'a scan has no points'),
	'a scan has no x, y and z': () => t('threedviewer', 'a scan has no x, y and z'),
	"a scan's binary section is missing": () => t('threedviewer', 'a scan\'s binary section is missing'),
	"a scan's fields don't line up into points": () => t('threedviewer', 'a scan\'s fields don\'t line up into points'),
	'a vertex property is of an unknown type, {type}': (vars) => t('threedviewer', 'a vertex property is of an unknown type, {type}', vars),
	'it has no points': () => t('threedviewer', 'it has no points'),
	'it has no x, y and z': () => t('threedviewer', 'it has no x, y and z'),
	'it holds no scans': () => t('threedviewer', 'it holds no scans'),
	'it is compressed but has no LASzip record': () => t('threedviewer', 'it is compressed but has no LASzip record'),
	'it is too large to decompress': () => t('threedviewer', 'it is too large to decompress'),
	"it isn't a LAS file": () => t('threedviewer', 'it isn\'t a LAS file'),
	"it isn't a PLY file": () => t('threedviewer', 'it isn\'t a PLY file'),
	"it isn't an E57 file": () => t('threedviewer', 'it isn\'t an E57 file'),
	"its DATA, {data}, isn't one PCD has": (vars) => t('threedviewer', 'its DATA, {data}, isn\'t one PCD has', vars),
	"its FIELDS, SIZE, TYPE and COUNT don't agree": () => t('threedviewer', 'its FIELDS, SIZE, TYPE and COUNT don\'t agree'),
	"its XML can't be read": () => t('threedviewer', 'its XML can\'t be read'),
	'its XML has no E57 root': () => t('threedviewer', 'its XML has no E57 root'),
	'its XML is too large': () => t('threedviewer', 'its XML is too large'),
	'its chunk table is cut short': () => t('threedviewer', 'its chunk table is cut short'),
	'its chunk table is damaged': () => t('threedviewer', 'its chunk table is damaged'),
	'its chunk table is missing': () => t('threedviewer', 'its chunk table is missing'),
	"its compressed data asks for a model LASzip doesn't have": () => t('threedviewer', 'its compressed data asks for a model LASzip doesn\'t have'),
	'its compressed data is cut short': () => t('threedviewer', 'its compressed data is cut short'),
	'its compressed data is damaged': () => t('threedviewer', 'its compressed data is damaged'),
	'its compressed data is not the size its header says': () => t('threedviewer', 'its compressed data is not the size its header says'),
	'its data is cut short': () => t('threedviewer', 'its data is cut short'),
	"its format, {format}, isn't one PLY has": (vars) => t('threedviewer', 'its format, {format}, isn\'t one PLY has', vars),
	'its header and records are cut short': () => t('threedviewer', 'its header and records are cut short'),
	'its header has no DATA line': () => t('threedviewer', 'its header has no DATA line'),
	'its header has no end': () => t('threedviewer', 'its header has no end'),
	'its lines have fewer than three numbers': () => t('threedviewer', 'its lines have fewer than three numbers'),
	"its page size is one E57 doesn't have": () => t('threedviewer', 'its page size is one E57 doesn\'t have'),
	'its point count is damaged': () => t('threedviewer', 'its point count is damaged'),
	'its point records are shorter than their format': () => t('threedviewer', 'its point records are shorter than their format'),
	'its records take no space, so there is nothing to read': () => t('threedviewer', 'its records take no space, so there is nothing to read'),
	'its vertex count is damaged': () => t('threedviewer', 'its vertex count is damaged'),
	"its vertices aren't its first element": () => t('threedviewer', 'its vertices aren\'t its first element'),
	'its vertices have no x, y and z': () => t('threedviewer', 'its vertices have no x, y and z'),
	'its vertices hold lists': () => t('threedviewer', 'its vertices hold lists'),
	"spherical E57 scans aren't supported yet": () => t('threedviewer', 'spherical E57 scans aren\'t supported yet'),
	'there is no reader for .{ext}': (vars) => t('threedviewer', 'there is no reader for .{ext}', vars),
}

/**
 * @param {string} reason - A ScanError's reason
 * @param {object} [vars] - Its values
 * @return {string} It, translated; an unknown one as it is, filled in
 */
export function translateReason(reason, vars = {}) {
	const translated = Object.hasOwn(REASONS, reason) ? REASONS[reason](vars) : null
	return translated ?? reason.replace(/{(\w+)}/g, (_, key) => String(vars[key] ?? `{${key}}`))
}

export const SCAN_REASONS = Object.freeze(Object.keys(REASONS))
