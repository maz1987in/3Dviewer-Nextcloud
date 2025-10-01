/**
 * Register 3D model viewer handler with Nextcloud Viewer app
 */

import { translate, translatePlural } from '@nextcloud/l10n'

// Make translation functions globally available for all components
if (typeof window !== 'undefined') {
	window.t = translate
	window.n = translatePlural
}

// Supported MIME types for 3D models
const SUPPORTED_MIMES = [
	'model/gltf-binary',  // .glb
	'model/gltf+json',    // .gltf
	'model/obj',          // .obj
	'model/stl',          // .stl
	'application/sla',    // .stl alternative
	'model/vnd.collada+xml', // .dae
	'model/x.fbx',        // .fbx
	'model/3mf',          // .3mf
	'application/x-3ds',  // .3ds
	'model/x.ply',        // .ply
	'model/ply',          // .ply alternative
]

// Mode 1: Register simple viewer handler with Viewer API (modal preview)
// Note: Script may load multiple times (Files app + direct access)
// Viewer API handles duplicate registration internally
if (OCA.Viewer) {
	OCA.Viewer.registerHandler({
		id: 'threedviewer',
		group: '3d-models',
		mimes: SUPPORTED_MIMES,
		component: () => import(/* webpackChunkName: "threedviewer-viewer" */ './views/ViewerComponent.vue'),
		canCompare: false,
	})
}

// Mode 2: Mount advanced viewer app when #threedviewer div exists (standalone page)
const appRoot = document.getElementById('threedviewer')
if (appRoot) {
	const fileId = appRoot.dataset.fileId
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
					fileId,
					dir,
				},
			}),
		})
	}).catch(err => {
		console.error('Failed to mount advanced viewer:', err)
	})
}
