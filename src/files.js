// Registers a file action in the Files app to open supported 3D model files in the ThreeDViewer app
// Uses Nextcloud Viewer API pattern for proper integration

import '../css/threedviewer-filesIntegration.css'

(function() {
		console.log('[threedviewer] Files integration script loading...')
		console.log('[threedviewer] Current URL:', window.location.href)
		console.log('[threedviewer] Is Files app context:', window.location.pathname.includes('/apps/files/'))
	
	// Wait for Files app to be ready
	let retryCount = 0
	const maxRetries = 100 // 10 seconds max
	let initialized = false
	
	function waitForFilesApp() {
		// Debug what's available
		if (retryCount === 0) {
			console.log('[threedviewer] Debug - window.OCA:', !!window.OCA)
			console.log('[threedviewer] Debug - OCA.Files:', !!(window.OCA && OCA.Files))
			console.log('[threedviewer] Debug - OCA.Files.fileActions:', !!(window.OCA && OCA.Files && OCA.Files.fileActions))
			if (window.OCA) {
				console.log('[threedviewer] Debug - OCA keys:', Object.keys(OCA))
				if (OCA.Files) {
					console.log('[threedviewer] Debug - OCA.Files keys:', Object.keys(OCA.Files))
					// Check if fileActions might be in a different location
					if (OCA.Files.fileActions) {
						console.log('[threedviewer] Debug - fileActions found!')
					} else {
						console.log('[threedviewer] Debug - fileActions not found, checking alternatives...')
						// Check if there's a different way to access file actions
						if (OCA.FilesApp) {
							console.log('[threedviewer] Debug - OCA.FilesApp found:', Object.keys(OCA.FilesApp))
						}
						if (OCA.Files && OCA.Files.App) {
							console.log('[threedviewer] Debug - OCA.Files.App found:', Object.keys(OCA.Files.App))
						}
					}
				}
			}
		}
		
		// Check for Files app with more comprehensive detection
		const hasFilesApp = window.OCA && 
			OCA.Files && 
			OCA.Files.fileActions && 
			typeof OCA.Files.fileActions.registerAction === 'function'
		
		// Also check for alternative Files app loading patterns
		const hasAlternativeFilesApp = window.OCA && 
			OCA.Files && 
			typeof OCA.Files.registerFileAction === 'function'
		
		// Check for Viewer API as alternative approach
		const hasViewerAPI = window.OCA && 
			OCA.Viewer && 
			typeof OCA.Viewer.registerHandler === 'function'
		
		// Check if fileActions might be loaded later or in a different way
		const hasFilesAppWithoutFileActions = window.OCA && 
			OCA.Files && 
			!OCA.Files.fileActions
		
		// Try to manually initialize fileActions if it doesn't exist
		if (hasFilesAppWithoutFileActions && retryCount > 10) {
			console.log('[threedviewer] Attempting to manually initialize fileActions...')
			try {
				// Check if we can access fileActions through a different path
				if (OCA.Files.App && OCA.Files.App.fileActions) {
					console.log('[threedviewer] Found fileActions in OCA.Files.App!')
					OCA.Files.fileActions = OCA.Files.App.fileActions
				} else if (OCA.FilesApp && OCA.FilesApp.fileActions) {
					console.log('[threedviewer] Found fileActions in OCA.FilesApp!')
					OCA.Files.fileActions = OCA.FilesApp.fileActions
				}
			} catch (e) {
				console.log('[threedviewer] Could not manually initialize fileActions:', e)
			}
		}
		
		if ((hasFilesApp || hasAlternativeFilesApp || hasViewerAPI) && !initialized) {
			console.log('[threedviewer] Files app or Viewer API detected, initializing...')
			initFilesIntegration()
		} else if (retryCount < maxRetries) {
			retryCount++
			if (retryCount % 10 === 0) { // Log every 10th retry to reduce spam
				console.log('[threedviewer] Files app not ready, retrying... (' + retryCount + '/' + maxRetries + ')')
				// Debug what's available during retries
				if (window.OCA && OCA.Files) {
					console.log('[threedviewer] Debug - OCA.Files keys during retry:', Object.keys(OCA.Files))
					if (OCA.Files.fileActions) {
						console.log('[threedviewer] Debug - fileActions now available!')
					}
				}
			}
			setTimeout(waitForFilesApp, 100)
		} else if (!initialized) {
			console.warn('[threedviewer] Files app not available after maximum retries, giving up')
			// Don't try fallback if Files app is clearly not available
			console.log('[threedviewer] Files app not detected, skipping initialization')
		}
	}
	
	function initFilesIntegration() {
		if (initialized) {
			console.log('[threedviewer] Already initialized, skipping...')
			return
		}
		
		// Check if Files app or Viewer API is available before initializing
		const hasFileActions = window.OCA && OCA.Files && OCA.Files.fileActions && typeof OCA.Files.fileActions.registerAction === 'function'
		const hasViewerAPI = window.OCA && OCA.Viewer && typeof OCA.Viewer.registerHandler === 'function'
		
		if (!hasFileActions && !hasViewerAPI) {
			console.warn('[threedviewer] Neither Files app fileActions nor Viewer API available, cannot initialize integration')
			return
		}
		
		initialized = true
		console.log('[threedviewer] Initializing Files integration...')
		
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
			window.open(OC.generateUrl(`/apps/${APP_ID}/?fileId=${fileId}`), '_blank', 'noopener,noreferrer')
			return true
		}

		// Register action (list & sidebar) - use 'all' mime with enabled guard
		if (hasFileActions) {
			OCA.Files.fileActions.registerAction({
				name: 'View3DModel',
				displayName: t(APP_ID, 'View 3D'),
				mime: 'all',
				permissions: OC.PERMISSION_READ,
				iconClass: ICON_CLASS,
				order: 15,
				enabled: function(fileName /*, context */) {
					return isSupported(fileName)
				},
				actionHandler: openInViewer,
			})
			console.log('[threedviewer] Registered file action with fileActions API')
		} else {
			console.log('[threedviewer] fileActions API not available, skipping file action registration')
		}

		// Set as default action for single-click
		if (hasFileActions) {
			try {
				const mimes = ['all', 'application/octet-stream', 'text/plain', 'model/ply', 'model/stl', 'model/gltf+json', 'model/gltf-binary']
				mimes.forEach((mime) => {
					if (typeof OCA.Files.fileActions.setDefault === 'function') {
						OCA.Files.fileActions.setDefault(mime, 'View3DModel')
						console.log('[threedviewer] Set default action for', mime)
					}
					if (typeof OCA.Files.fileActions.registerDefault === 'function') {
						OCA.Files.fileActions.registerDefault(mime, 'View3DModel')
						console.log('[threedviewer] Registered default action for', mime)
					}
				})
			} catch (e) {
				console.warn('[threedviewer] Unable to register default file action', e)
			}
		}

		// Add hybrid approach: Viewer API + click interceptor as fallback
		console.log('[threedviewer] Using hybrid approach: Viewer API + click interceptor fallback')
		
		// Add click interceptor as fallback for when Viewer API doesn't work
		try {
			document.addEventListener('click', function(e) {
				// Only intercept if it's a 3D file and Viewer API didn't handle it
				const row = e.target.closest('tr[data-file]') || 
					e.target.closest('tr[data-id]') || 
					e.target.closest('tr[data-fileid]') ||
					e.target.closest('tr.file-row') ||
					e.target.closest('tr[data-path]') ||
					e.target.closest('.files-list__row')
				
				if (!row) return
				
				// Get filename
				const nameCell = row.querySelector('.filename') || 
					row.querySelector('.name') || 
					row.querySelector('[data-original-filename]') ||
					row.querySelector('td:first-child')
				
				if (!nameCell) return
				
				const fname = row.getAttribute('data-cy-files-list-row-name') ||
					nameCell.getAttribute('data-original-filename') || 
					nameCell.getAttribute('data-filename') ||
					nameCell.textContent.trim()
				
				if (fname && isSupported(fname)) {
					// Check if this is already being handled by Viewer API
					// If so, don't interfere
					if (e.defaultPrevented) return
					
					console.log('[threedviewer] Click interceptor fallback for 3D file:', fname)
					e.preventDefault()
					e.stopPropagation()
					e.stopImmediatePropagation()
					
					const fileId = row.getAttribute('data-cy-files-list-row-fileid') ||
						row.getAttribute('data-id') || 
						row.getAttribute('data-fileid') ||
						row.getAttribute('data-file-id')
					
					if (fileId) {
						// Open in new tab
						const viewerUrl = OC.generateUrl(`/apps/${APP_ID}/?fileId=${fileId}`)
						console.log('[threedviewer] Opening 3D viewer in new tab:', viewerUrl)
						window.open(viewerUrl, '_blank', 'noopener,noreferrer')
					}
					return false
				}
			}, true) // Use capture phase
			console.log('[threedviewer] Added click interceptor fallback')
		} catch (e) {
			console.warn('[threedviewer] Unable to add click interceptor fallback', e)
		}

		// Register with Nextcloud Viewer for modal display
		if (hasViewerAPI) {
			console.log('[threedviewer] Registering 3D file handler with Viewer API')
			try {
				// Use the dedicated viewer API integration
				import('./viewer-api.js').then(module => {
					module.initViewerAPI()
				}).catch(error => {
					console.error('[threedviewer] Failed to load viewer API module:', error)
					// Fallback to basic registration
					registerBasicViewerHandler()
				})
			} catch (e) {
				console.warn('[threedviewer] Failed to register with Viewer API:', e)
				console.log('[threedviewer] Falling back to standalone app mode')
			}
		} else {
			console.log('[threedviewer] Viewer API not available, using standalone app mode')
		}
		
		// Fallback basic registration function
		function registerBasicViewerHandler() {
			try {
				OCA.Viewer.registerHandler({
					id: 'threedviewer-basic',
					group: '3d',
					mimes: ['all'],
					canView: (mime, file, attr) => {
						const name = (file && (file.name || file.basename)) || (attr && attr.filename) || ''
						return isSupported(name)
					},
					component: {
						template: '<div style="padding: 20px; text-align: center;"><h3>3D Model Viewer</h3><p>Loading...</p></div>',
						mounted() {
							const fileInfo = this.$attrs.fileinfo || this.$attrs.file || this.$attrs
							const fileId = fileInfo?.fileid || fileInfo?.id || fileInfo?.fileId
							const fileName = fileInfo?.name || fileInfo?.filename || fileInfo?.basename || ''
							
							if (fileId && isSupported(fileName)) {
								// Open in new tab
								const viewerUrl = OC.generateUrl(`/apps/${APP_ID}/?fileId=${fileId}`)
								console.log('[threedviewer] Opening in new tab:', viewerUrl)
								window.open(viewerUrl, '_blank', 'noopener,noreferrer')
							} else {
								this.$el.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Unsupported file type</div>'
							}
						}
					}
				})
				console.log('[threedviewer] Registered basic viewer handler')
			} catch (e) {
				console.error('[threedviewer] Failed to register basic viewer handler:', e)
			}
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
	}

	// Start waiting for Files app
	waitForFilesApp()
	
	// Monitor for Files app loading with MutationObserver
	if (window.MutationObserver) {
		const observer = new MutationObserver(function(mutations) {
			if (initialized) return
			
			// Check if Files app became available
			if (window.OCA && OCA.Files && OCA.Files.fileActions && typeof OCA.Files.fileActions.registerAction === 'function') {
				console.log('[threedviewer] Files app detected via MutationObserver, initializing...')
				observer.disconnect()
				initFilesIntegration()
			}
		})
		
		// Observe changes to the document
		observer.observe(document, { 
			childList: true, 
			subtree: true, 
			attributes: true 
		})
		
		// Disconnect after 15 seconds to avoid memory leaks
		setTimeout(() => {
			if (!initialized) {
				observer.disconnect()
			}
		}, 15000)
	}
	
	// Also listen for Files app loading events
	document.addEventListener('DOMContentLoaded', function() {
		if (initialized) return
		console.log('[threedviewer] DOM loaded, checking for Files app...')
		if (window.OCA && OCA.Files && OCA.Files.fileActions) {
			console.log('[threedviewer] Files app found on DOM ready, initializing...')
			initFilesIntegration()
		}
	})
	
	// Listen for custom Files app events
	document.addEventListener('OCA.Files.App.ready', function() {
		if (initialized) return
		console.log('[threedviewer] Files app ready event received, initializing...')
		initFilesIntegration()
	})
	
	// Listen for window load event as final fallback
	window.addEventListener('load', function() {
		if (initialized) return
		console.log('[threedviewer] Window loaded, final check for Files app...')
		if (window.OCA && OCA.Files && OCA.Files.fileActions) {
			console.log('[threedviewer] Files app found on window load, initializing...')
			initFilesIntegration()
		}
	})
})();
