// Registers a file action in the Files app to open supported 3D model files in the ThreeDViewer app
// This relies on the legacy files app global OCA.Files API.
// Minimal approach: redirect to the dedicated app route with fileId param.

(function() {
	if (!(window.OCA && OCA.Files && OCA.Files.fileActions)) {
		return; // Files app not present
	}

	const APP_ID = 'threedviewer'
	const supportedExt = ['glb','gltf','obj','stl','ply','fbx']

	function isSupported(fileName) {
		const ext = fileName.split('.').pop().toLowerCase()
		return supportedExt.includes(ext)
	}

	// Action callback
	function openInViewer(fileName, context) {
		// context.fileId might be available; fallback: context.$file.attr('data-id') style (legacy) if missing
		const fileId = context && (context.fileid || context.id || context.fileId)
		if (!fileId) {
			console.warn('[threedviewer] No fileId in context for', fileName, context)
			return false
		}
		window.location.href = OC.generateUrl(`/apps/${APP_ID}/?fileId=${fileId}`)
		return true
	}

	// Register action (list & sidebar)
	OCA.Files.fileActions.registerAction({
		name: 'View3DModel',
		displayName: t(APP_ID, 'View 3D'),
		mime: 'application/octet-stream', // broad; we gate by ext in permissions
		permissions: OC.PERMISSION_READ,
		iconClass: 'icon-view',
		order: 15,
		actionHandler: openInViewer,
	})

	// Filter so it shows only for supported extensions
	const originalCurrentFile = OCA.Files.fileActions._defaultActions["application/octet-stream"]?.View3DModel
	if (originalCurrentFile) {
		const wrapped = function(fileName, context) {
			if (!isSupported(fileName)) return false
			return originalCurrentFile(fileName, context)
		}
		OCA.Files.fileActions._defaultActions["application/octet-stream"].View3DModel = wrapped
	}
})();
