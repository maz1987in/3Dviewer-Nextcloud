/**
 * Register 3D model viewer handler with Nextcloud Viewer app
 */

import { translate, translatePlural } from '@nextcloud/l10n'

// Import Nextcloud dialogs styles
import '@nextcloud/dialogs/style.css'

// Make translation functions globally available for all components
if (typeof window !== 'undefined') {
	window.t = translate
	window.n = translatePlural
}

// Supported MIME types for 3D models
const SUPPORTED_MIMES = [
	'model/gltf-binary', // .glb
	'model/gltf+json', // .gltf
	'model/obj', // .obj
	'model/stl', // .stl
	'application/sla', // .stl alternative
	'model/vnd.collada+xml', // .dae
	'model/x.fbx', // .fbx
	'model/3mf', // .3mf
	'application/x-3ds', // .3ds
	'model/x.ply', // .ply
	'model/ply', // .ply alternative
	'text/x-gcode', // .gcode, .gco, .nc
]

// Mode 1: Register simple viewer handler with Viewer API (modal preview)
// Note: Script may load multiple times (Files app + direct access)
// Check if handler is already registered to prevent duplicate registration warnings
const VIEWER_HANDLER_ID = 'threedviewer'
const VIEWER_REGISTRATION_KEY = '__threedviewer_viewer_handler_registered'

// Check if already registered using multiple methods
const isHandlerAlreadyRegistered
	= window[VIEWER_REGISTRATION_KEY] === true
	|| globalThis[VIEWER_REGISTRATION_KEY] === true
	|| (OCA?.Viewer?.handlers?.[VIEWER_HANDLER_ID])

if (OCA?.Viewer && !isHandlerAlreadyRegistered) {
	// Set flag IMMEDIATELY to prevent race conditions
	window[VIEWER_REGISTRATION_KEY] = true
	globalThis[VIEWER_REGISTRATION_KEY] = true

	try {
		OCA.Viewer.registerHandler({
			id: VIEWER_HANDLER_ID,
			group: '3d-models',
			mimes: SUPPORTED_MIMES,
			component: () => import(/* webpackChunkName: "threedviewer-viewer" */ './views/ViewerComponent.vue'),
			canCompare: false,
		})
		// Viewer handler registered successfully
	} catch (error) {
		// Silently catch duplicate registration errors
		if (error?.message?.includes('already registered')
		    || error?.message?.includes('duplicate')
		    || error?.message?.includes('same name')) {
			// Viewer handler already registered, skipping
		} else {
			console.error('[ThreeDViewer] Failed to register viewer handler:', error)
			// Reset flag if registration failed for unknown reason
			delete window[VIEWER_REGISTRATION_KEY]
			delete globalThis[VIEWER_REGISTRATION_KEY]
		}
	}
}

// Mode 2: Mount advanced viewer app when #threedviewer div exists (standalone page)
const appRoot = document.getElementById('threedviewer')
if (appRoot) {
	const fileId = appRoot.dataset.fileId
	const filename = appRoot.dataset.filename
	const dir = appRoot.dataset.dir

	// Dynamically import Vue and App component
	Promise.all([
		import('vue'),
		import('./App.vue'),
	]).then(([{ default: Vue }, { default: App }]) => {
		// Add global mixin for translation functions
		Vue.mixin({
			methods: {
				t: translate,
				n: translatePlural,
			},
		})

		new Vue({
			el: '#threedviewer',
			render: h => h(App, {
				props: {
					fileId: fileId || null,
					filename: filename || null,
					dir: dir || null,
				},
			}),
		})
	}).catch(err => {
		console.error('Failed to mount advanced viewer:', err)
	})
}
