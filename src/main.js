/**
 * Register 3D model viewer handler with Nextcloud Viewer app
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate, translatePlural } from '@nextcloud/l10n'

// Import Nextcloud dialogs styles
import '@nextcloud/dialogs/style.css'
import { getPublicShareContext } from './composables/usePublicShare.js'
import { mountPublicViewer } from './utils/publicViewer.js'

// Design tokens and primitives for the viewer chrome. Themed values resolve to
// Nextcloud variables, so a themed instance follows its own palette.
import './css/design-system.css'

// Forced-colors (Windows High Contrast) accessibility overrides — scoped
// entirely to @media (forced-colors: active), no effect on default rendering.
import './css/forced-colors.css'

// Make translation functions globally available for all components
if (typeof window !== 'undefined') {
	window.t = translate
	window.n = translatePlural
}

// Test hook for tests/playwright/thumbnail-worker.spec.ts, like the window.__LOAD_COMPLETE
// flag the viewer sets. Only a test harness sets __THREEDVIEWER_TEST__, so production never
// loads this chunk from here. The whole module is exposed (renderInWorker,
// canRenderInBackground and the rest): naming the two again costs the entry chunk bytes.
if (window.__THREEDVIEWER_TEST__ === true) {
	import('./thumbnails/workerRenderer.js').then((thumbnails) => {
		window.__threedviewerThumbnails = thumbnails
	})
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
	'application/x-step', // .ifc — Industry Foundation Classes (also STEP-based)
	'application/ifc', // .ifc alternative MIME
	'model/step', // .step, .stp — STEP (ISO 10303)
	'application/step', // STEP alternative MIME
	'model/iges', // .iges, .igs — IGES
	'application/iges', // IGES alternative MIME
	'model/brep', // .brep, .brp — OpenCascade native B-Rep
	'application/x-brep', // BREP alternative MIME
	'application/x-fcstd', // .fcstd — FreeCAD document
	'application/x-xyz-pointcloud', // .xyz — point cloud as text
	'application/x-pcd', // .pcd — Point Cloud Library point cloud
	'application/vnd.las', // .las — LiDAR and survey point cloud
	'application/vnd.laszip', // .laz — compressed LiDAR and survey point cloud
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

// Mode 1b: Public share of a single 3D file.
// There is no file list to click and no #threedviewer container — files_sharing owns
// this template — so render the viewer in place of the default download page. Folder
// shares need nothing extra: the Viewer handler registered above already fires when a
// model is opened from the listing.
const publicShare = getPublicShareContext()
if (publicShare?.isSingleFile && publicShare.fileId) {
	const content = document.getElementById('content')
	if (content) {
		mountPublicViewer(content, publicShare)
	}
}

// Background thumbnails for the folders browsed in Files; the module checks the user
// and their settings. A public share page has no user to store thumbnails for.
if (!publicShare && location.pathname.includes('/apps/files')) {
	import('./thumbnails/filesPage.js').then(m => m.startFilesThumbnails())
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
