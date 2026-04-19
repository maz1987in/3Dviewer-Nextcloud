/**
 * Register 3D model viewer handler with Nextcloud Viewer app
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate, translatePlural } from '@nextcloud/l10n'

// Import Nextcloud dialogs styles
import '@nextcloud/dialogs/style.css'

// Forced-colors (Windows High Contrast) accessibility overrides — scoped
// entirely to @media (forced-colors: active), no effect on default rendering.
import './css/forced-colors.css'

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
	'application/sla', // .stl alternative MIME
	'model/vnd.collada+xml', // .dae
	'model/x.fbx', // .fbx
	'model/3mf', // .3mf
	'application/x-3ds', // .3ds
	'model/ply', // .ply
	'model/x.ply', // .ply alternative MIME
	'model/x3d+xml', // .x3d
	'model/vrml', // .vrml, .wrl
	'text/x-gcode', // .gcode, .gco, .nc, .acode, .g
	'application/x-gcode', // .gx, .g3drem, .makerbot, .thing
	'model/off', // .off — Geomview OFF (plain-text mesh)
	'application/x-amf', // .amf — Additive Manufacturing Format
	'model/amf', // .amf alternative MIME
	'model/3dm', // .3dm — Rhinoceros
	'application/dotbim+json', // .bim — dotbim (JSON-based BIM)
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
	|| (globalThis?.OCA?.Viewer?.handlers?.[VIEWER_HANDLER_ID])

if (globalThis?.OCA?.Viewer && !isHandlerAlreadyRegistered) {
	// Set flag IMMEDIATELY to prevent race conditions
	window[VIEWER_REGISTRATION_KEY] = true
	globalThis[VIEWER_REGISTRATION_KEY] = true

	try {
		OCA.Viewer.registerHandler({
			id: VIEWER_HANDLER_ID,
			group: '3d-models',
			mimes: SUPPORTED_MIMES,
			component: () => import(/* webpackChunkName: "threedviewer-viewer" */ './views/ViewerWrapper.js'),
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
	]).then(([{ createApp, h }, { default: App }]) => {
		const app = createApp({
			render: () => h(App, {
				fileId: fileId || null,
				filename: filename || null,
				dir: dir || null,
			}),
		})

		// Add global translation functions
		app.config.globalProperties.t = translate
		app.config.globalProperties.n = translatePlural

		const instance = app.mount('#threedviewer')
		// Expose app instance for debugging and to avoid unused variable lint error
		window.__THREEDVIEWER_APP = instance
	}).catch(err => {
		console.error('Failed to mount advanced viewer:', err)
	})
}
