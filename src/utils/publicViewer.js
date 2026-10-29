/**
 * Mount the light viewer (ViewerComponent) in place of a page's content, for a public
 * link to one model: the share page, and the embed page another site frames.
 */
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate, translatePlural } from '@nextcloud/l10n'

/**
 * @param {HTMLElement} container - The element whose content the viewer replaces
 * @param {{fileId: number, filename: string, mime: string}} share - The shared model
 */
export function mountPublicViewer(container, share) {
	const mount = document.createElement('div')
	mount.id = 'threedviewer-public'
	mount.style.width = '100%'
	mount.style.height = '100%'
	container.replaceChildren(mount)

	Promise.all([
		import('vue'),
		import('../views/ViewerComponent.vue'),
	]).then(([{ createApp, h }, { default: ViewerComponent }]) => {
		const app = createApp({
			render: () => h(ViewerComponent, {
				// davPath is only consulted by the multi-file loader, which falls
				// back to the id-based public routes on a share page.
				davPath: '',
				filename: share.filename || '',
				basename: share.filename || '',
				mime: share.mime || '',
				fileid: share.fileId,
				active: true,
			}),
		})
		app.config.globalProperties.t = translate
		app.config.globalProperties.n = translatePlural
		app.mount('#threedviewer-public')
	}).catch(err => {
		console.error('[ThreeDViewer] Failed to mount public share viewer:', err)
	})
}
