/* global Vue */
import { generateUrl } from '@nextcloud/router'
// Nextcloud Viewer API integration for 3D models
// This replaces the click-based approach with proper API integration

import ViewerModal from '../../components/ViewerModal.vue'

const APP_ID = 'threedviewer'
const supportedExt = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds']

function isSupported(fileName) {
	const ext = fileName.split('.').pop().toLowerCase()
	return supportedExt.includes(ext)
}

// Create a Vue component for the Viewer API
function createViewerComponent() {
	return {
		template: '<div id="threedviewer-viewer-container" style="width: 100%; height: 100vh;"></div>',
		mounted() {
			// Get file information from props or attributes
			const fileInfo = this.$attrs.fileinfo || this.$attrs.file || this.$attrs
			const fileId = fileInfo?.fileid || fileInfo?.id || fileInfo?.fileId
			const fileName = fileInfo?.name || fileInfo?.filename || fileInfo?.basename || ''

			// Viewer API component mounted

			if (!fileId) {
				this.$el.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">No file ID available</div>'
				return
			}

			if (!isSupported(fileName)) {
				this.$el.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Unsupported file type</div>'
				return
			}

			// Create and mount the ViewerModal component
			this.mountViewerModal(fileId, fileInfo)
		},
		methods: {
			async mountViewerModal(fileId, fileInfo) {
				try {
					// Import the ViewerModal component
					const ViewerModalComponent = ViewerModal

					// Create a new Vue instance for the modal
					const modalInstance = new Vue({
						render: h => h(ViewerModalComponent, {
							props: {
								fileId,
								file: fileInfo,
								attr: fileInfo,
							},
							on: {
								'model-loaded': (meta) => {
									// Model loaded in Viewer API
									// Emit event to parent if needed
									this.$emit('model-loaded', meta)
								},
								error: (error) => {
									// Emit event to parent if needed
									this.$emit('error', error)
								},
							},
						}),
					})

					// Mount the modal to our container
					modalInstance.$mount()
					this.$el.appendChild(modalInstance.$el)

					// Store reference for cleanup
					this.modalInstance = modalInstance

				} catch (error) {
					this.$el.innerHTML = `
						<div style="padding: 20px; text-align: center; color: red;">
							<h3>Failed to load 3D viewer</h3>
							<p>Error: ${error.message}</p>
						</div>
					`
				}
			},
		},
		beforeDestroy() {
			// Cleanup modal instance
			if (this.modalInstance) {
				this.modalInstance.$destroy()
				this.modalInstance = null
			}
		},
	}
}

// Register with Nextcloud Viewer API
export function registerViewerHandler() {
	if (!window.OCA || !OCA.Viewer || typeof OCA.Viewer.registerHandler !== 'function') {
		return false
	}

	try {
		OCA.Viewer.registerHandler({
			id: 'threedviewer-handler',
			group: '3d',
			mimes: [
				'model/gltf-binary',
				'model/gltf+json',
				'model/ply',
				'model/stl',
				'model/obj',
				'model/fbx',
				'model/3mf',
				'model/3ds',
				'model/vrml',
				'model/x3d',
				'model/collada+xml',
				// Additional mime types actually produced by our mimetypemapping.json or common variants
				'model/vnd.collada+xml', // dae mapping in appinfo/mimetypemapping.json
				'model/x3d+xml', // x3d mapping in appinfo/mimetypemapping.json
				'application/octet-stream', // used for fbx / 3ds by current mapping (extension gate in canView)
			],
			canView: (mime, file, attr) => {
				// Get file information
				const name = (file && (file.name || file.basename)) || (attr && attr.filename) || ''
				const fileMime = mime || (file && file.mimetype) || (attr && attr.mimetype) || ''

				// Check if file is supported by extension
				const isSupportedByExt = isSupported(name)

				// Check by MIME type (more comprehensive list)
				const supportedMimes = [
					'model/gltf-binary',
					'model/gltf+json',
					'model/ply',
					'model/stl',
					'model/obj',
					'model/fbx',
					'model/3mf',
					'model/3ds',
					'model/vrml',
					'model/x3d',
					'model/collada+xml',
				]
				const isSupportedByMime = supportedMimes.includes(fileMime)

				// If mime is generic octet-stream, only allow if extension is a known generic-mapped 3D format (fbx/3ds/3mf)
				if (fileMime === 'application/octet-stream') {
					const ext = (name.split('.').pop() || '').toLowerCase()
					if (!['fbx', '3ds', '3mf'].includes(ext)) {
						return false
					}
				}
				return isSupportedByExt || isSupportedByMime
			},
			component: createViewerComponent(),
		})

		return true

	} catch (error) {
		return false
	}
}

// Alternative registration method for different Viewer API versions
export function registerViewerHandlerLegacy() {
	if (!window.OCA || !OCA.Viewer || typeof OCA.Viewer.registerHandler !== 'function') {
		return false
	}

	try {
		OCA.Viewer.registerHandler({
			id: 'threedviewer-legacy',
			group: '3d',
			mimes: ['all'],
			canView: (mime, file, attr) => {
				const name = (file && (file.name || file.basename)) || (attr && attr.filename) || ''
				const fileMime = mime || (file && file.mimetype) || (attr && attr.mimetype) || ''

				const isSupportedByExt = isSupported(name)
				const supportedMimes = [
					'model/gltf-binary',
					'model/gltf+json',
					'model/ply',
					'model/stl',
					'model/obj',
					'model/fbx',
					'model/3mf',
					'model/3ds',
					'model/vrml',
					'model/x3d',
					'model/collada+xml',
					'model/vnd.collada+xml',
					'model/x3d+xml',
				]
				const isSupportedByMime = supportedMimes.includes(fileMime)

				// Determine extension from available file info
				const filename = name || (file && (file.name || file.basename)) || ''
				const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : ''

				// Guard generic mime: only treat application/octet-stream as viewable if extension is explicitly supported (fbx/3ds)
				if (fileMime === 'application/octet-stream' && !['fbx', '3ds'].includes(ext)) {
					return false
				}

				const canView = isSupportedByExt || isSupportedByMime

				return canView
			},
			component: {
				template: '<div id="threedviewer-legacy-container"></div>',
				mounted() {
					const fileInfo = this.$attrs.fileinfo || this.$attrs.file || this.$attrs
					const fileId = fileInfo?.fileid || fileInfo?.id || fileInfo?.fileId
					const fileName = fileInfo?.name || fileInfo?.filename || fileInfo?.basename || ''
					const fileDir = fileInfo?.dir || fileInfo?.path || '/'

					if (fileId && isSupported(fileName)) {
						// Try to use the modal component first
						try {
							import('../../components/ViewerModal.vue').then(ViewerModal => {
								const ModalComponent = Vue.extend(ViewerModal.default)
								const modalInstance = new ModalComponent({
									propsData: {
										fileId,
										file: fileInfo,
										attr: fileInfo,
									},
								})

								modalInstance.$mount()
								this.$el.appendChild(modalInstance.$el)

							}).catch(() => {
								// Fallback to new tab
								const viewerUrl = generateUrl(`/apps/${APP_ID}/?fileId=${fileId}&filename=${encodeURIComponent(fileName)}&dir=${encodeURIComponent(fileDir)}`)
								window.open(viewerUrl, '_blank', 'noopener,noreferrer')
							})
						} catch (error) {
							// Fallback to new tab
							const viewerUrl = generateUrl(`/apps/${APP_ID}/?fileId=${fileId}&filename=${encodeURIComponent(fileName)}&dir=${encodeURIComponent(fileDir)}`)
							window.open(viewerUrl, '_blank', 'noopener,noreferrer')
						}
					} else {
						this.$el.innerHTML = '<div style="padding: 20px; text-align: center;">Unsupported file type</div>'
					}
				},
			},
		})

		return true

	} catch (error) {
		return false
	}
}

// Auto-register when module loads
export function initViewerAPI() {

	// Try immediate registration first
	if (registerViewerHandler()) {
		return
	}

	// Wait for DOM to be ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			setTimeout(() => {
				if (!registerViewerHandler()) {
					// Trying legacy registration
					registerViewerHandlerLegacy()
				}
			}, 500)
		})
	} else {
		setTimeout(() => {
			if (!registerViewerHandler()) {
				// Trying legacy registration
				registerViewerHandlerLegacy()
			}
		}, 500)
	}

	// Also try registration on window load as final fallback
	window.addEventListener('load', () => {
		setTimeout(() => {
			if (!registerViewerHandler()) {
				registerViewerHandlerLegacy()
			}
		}, 1000)
	})
}
