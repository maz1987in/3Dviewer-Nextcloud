/**
 * Register file action for 3D model files
 * This tells Nextcloud Files app to open these files in the Viewer instead of downloading
 */

import { registerFileAction, FileAction, Permission, DefaultType } from '@nextcloud/files'

// Supported MIME types
const SUPPORTED_MIMES = [
	'model/gltf-binary',
	'model/gltf+json',
	'model/obj',
	'model/stl',
	'application/sla',
	'model/vnd.collada+xml',
	'model/x.fbx',
	'model/3mf',
	'application/x-3ds',
	'model/x.ply',
	'model/ply',
]

// Register file action to open 3D files in Viewer
registerFileAction(new FileAction({
	id: 'threedviewer-view',
	displayName: () => 'View in 3D',
	iconSvgInline: () => '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V7l-10-5z"/></svg>',
	default: DefaultType.HIDDEN, // Make this the default action

	enabled(nodes) {
		// Enable for single 3D model files
		return nodes.length === 1
			&& nodes[0].mime
			&& SUPPORTED_MIMES.includes(nodes[0].mime)
			&& (nodes[0].permissions & Permission.READ) !== 0
	},

	async exec(node) {
		// Open in Viewer app
		if (window.OCA?.Viewer) {
			window.OCA.Viewer.open({
				fileInfo: node,
				list: [node],
			})
			return null
		}
		return false
	},

	order: -1, // Higher priority than default actions
}))

console.info('[ThreeDViewer] File action registered for 3D models')
