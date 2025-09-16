// Registers a file action in the Files app to open supported 3D model files in the ThreeDViewer app
// This relies on the legacy files app global OCA.Files API.
// Minimal approach: redirect to the dedicated app route with fileId param.

(function() {
	if (!(window.OCA && OCA.Files && OCA.Files.fileActions)) {
		return; // Files app not present
	}

	const APP_ID = 'threedviewer'
	const supportedExt = ['glb','gltf','obj','stl','ply','fbx','3mf','3ds']
	const ICON_CLASS = 'icon-3d-model'

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
		iconClass: ICON_CLASS,
		order: 15,
		actionHandler: openInViewer,
	})

	// Filter so it shows only for supported extensions
	const originalCurrentFile = OCA.Files.fileActions._defaultActions["application/octet-stream"]?.View3DModel
	if (originalCurrentFile) {
		const wrapped = function(fileName, context) {
			if (!isSupported(fileName)) return false
			// Attempt to set icon on the row if possible
			try {
				const $tr = context && (context.$file || context.file) // jQuery-like wrapper or element
				if ($tr && typeof $tr.find === 'function') {
					const $icon = $tr.find('.filename .thumbnail, .filename .icon')
					if ($icon && $icon.length) {
						$icon.removeClass().addClass(ICON_CLASS)
					}
				}
			} catch(e) { /* ignore icon errors */ }
			return originalCurrentFile(fileName, context)
		}
		OCA.Files.fileActions._defaultActions["application/octet-stream"].View3DModel = wrapped
	}

	// Passive scan after load to tag existing rows (initial render) and attach placeholder thumbnails
	try {
		const process = () => {
			document.querySelectorAll('tr[data-file]').forEach(tr => {
				const nameCell = tr.querySelector('.filename')
				if (!nameCell) return
				const fname = nameCell.getAttribute('data-original-filename') || nameCell.textContent.trim()
				if (fname && isSupported(fname)) {
					const icon = nameCell.querySelector('.thumbnail, .icon')
					if (icon) {
						icon.className = ICON_CLASS
						// If there's an <img> intended for a preview, set its src to our placeholder thumbnail endpoint
						const fileId = tr.getAttribute('data-id') || tr.getAttribute('data-fileid')
						const img = icon.tagName === 'IMG' ? icon : icon.querySelector('img')
						if (fileId && img && !img.dataset.threedThumbApplied) {
							img.src = OC.generateUrl(`/apps/${APP_ID}/thumb/${fileId}`)
							img.dataset.threedThumbApplied = '1'
						}
					}
				}
			})
		}
		// Initial and delayed pass
		process()
		setTimeout(process, 1500)
	} catch(e) {}
})();
