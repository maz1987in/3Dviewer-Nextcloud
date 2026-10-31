/**
 * The tools that are off for a splat, and why, in the order the tools panel and top bar
 * show them. The panel lists these in a splat's section (SplatControls), and each gated
 * control is described by its line, `tdv-unavailable-{key}`; utils/offTools.js holds the
 * same keys for the App.
 */
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'

export const SPLAT_UNAVAILABLE = Object.freeze([
	{
		key: 'shading',
		label: t('threedviewer', 'Shading and wireframe'),
		note: t('threedviewer', 'A splat shows the colours it was captured with, so it has no shading or wireframe.'),
	},
	{
		key: 'measure',
		label: t('threedviewer', 'Measurement'),
		note: t('threedviewer', 'A splat has no real surface to measure.'),
	},
	{
		key: 'notes',
		label: t('threedviewer', 'Annotation'),
		note: t('threedviewer', 'A splat has no real surface to pin a note to.'),
	},
	{
		key: 'compare',
		label: t('threedviewer', 'Comparison'),
		note: t('threedviewer', 'Comparing splats isn\'t available yet.'),
	},
	{
		key: 'crossSection',
		label: t('threedviewer', 'Cross-Section'),
		note: t('threedviewer', 'A splat has no real surface to cut through.'),
	},
	{
		key: 'printCheck',
		label: t('threedviewer', 'Print check'),
		note: t('threedviewer', 'A splat has no real surface, so there\'s nothing to check for printing.'),
	},
	{
		key: 'exploded',
		label: t('threedviewer', 'Exploded view'),
		note: t('threedviewer', 'A splat is a single capture, with no parts to pull apart.'),
	},
	{
		key: 'transform',
		label: t('threedviewer', 'Transform'),
		note: t('threedviewer', 'A splat is for looking at. Which way is up turns it the right way.'),
	},
	{
		key: 'export',
		label: t('threedviewer', 'Export'),
		note: t('threedviewer', 'Export saves meshes, and a splat has no surface to save.'),
	},
	{
		key: 'vr',
		label: t('threedviewer', 'VR'),
		note: t('threedviewer', 'VR isn\'t available for splats.'),
	},
])
