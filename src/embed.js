/**
 * The embed page another site frames (EmbedPageController). The page is the same for
 * every address; this asks the server whether the share in it may be shown, then shows
 * the model with the light viewer, or says the model is no longer shared.
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t, translatePlural } from '@nextcloud/l10n'
import '@nextcloud/dialogs/style.css'
import './css/design-system.css'
import './css/forced-colors.css'
import './css/embed.css'
import { setPublicShareContext } from './composables/usePublicShare.js'
import { embedTokenFromPath, loadEmbedTarget } from './utils/embedTarget.js'
import { mountPublicViewer } from './utils/publicViewer.js'

window.t = t
window.n = translatePlural

const content = document.getElementById('content')
const token = embedTokenFromPath(window.location.pathname)

if (content) {
	(token ? loadEmbedTarget(token) : Promise.resolve(null)).then((target) => {
		if (!target) {
			const gone = document.createElement('p')
			gone.className = 'threedviewer-embed-gone'
			gone.setAttribute('role', 'status')
			gone.textContent = t('threedviewer', 'This model is no longer shared')
			content.replaceChildren(gone)
			return
		}
		const share = {
			token,
			fileId: target.fileId,
			isSingleFile: true,
			filename: target.filename,
			mime: target.mime,
			embed: { shareUrl: target.shareUrl, downloadUrl: target.downloadUrl ?? null },
		}
		setPublicShareContext(share)
		mountPublicViewer(content, share)
	})
}
