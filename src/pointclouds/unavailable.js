/**
 * The tools that are off for a scan, and why, in the order the tools panel shows them.
 * The panel lists these beside the scan's controls (PointCloudControls), and each gated
 * control is described by its line, `tdv-unavailable-{key}`.
 */
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'

export const POINT_CLOUD_UNAVAILABLE = Object.freeze([
	{
		key: 'printCheck',
		label: t('threedviewer', 'Print check'),
		note: t('threedviewer', 'A scan is a cloud of points with no closed surface, so there\'s nothing to check for printing.'),
	},
	{
		key: 'shading',
		label: t('threedviewer', 'Shading and wireframe'),
		note: t('threedviewer', 'Colour by takes the place of shading for a scan.'),
	},
	{
		key: 'exploded',
		label: t('threedviewer', 'Exploded view'),
		note: t('threedviewer', 'A scan is a single cloud of points, with no parts to pull apart.'),
	},
	{
		key: 'compare',
		label: t('threedviewer', 'Comparison'),
		note: t('threedviewer', 'Comparing scans isn\'t available yet.'),
	},
	{
		key: 'export',
		label: t('threedviewer', 'Export'),
		note: t('threedviewer', 'Export saves meshes, and a scan is points.'),
	},
])
