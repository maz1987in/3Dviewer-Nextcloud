/**
 * The embed page another site frames (EmbedPageController). The page is the same for
 * every address; this asks the server whether the share in it may be shown, then shows
 * the model with the light viewer, or says the model is no longer shared, or, when the
 * server could not be asked, that it could not be loaded.
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t, translatePlural } from '@nextcloud/l10n'
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

/**
 * @param {HTMLElement} container - Where the model would have been
 * @param {string} text - What to say instead
 */
function say(container, text) {
	const message = document.createElement('p')
	message.className = 'threedviewer-embed-message'
	message.setAttribute('role', 'status')
	message.textContent = text
	container.replaceChildren(message)
}

if (content) {
	(token ? loadEmbedTarget(token) : Promise.resolve(null)).then((target) => {
		if (!target) {
			say(content, t('threedviewer', 'This model is no longer shared'))
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
	}, () => say(content, t('threedviewer', 'Couldn\'t load the model. Try again later.')))
}
