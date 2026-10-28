/**
 * Copy text to the clipboard.
 *
 * The clipboard API needs a secure context, which Nextcloud over HTTPS or on localhost is.
 * Anywhere else, an offscreen textarea and `execCommand('copy')`: deprecated, but the
 * only route there.
 *
 * @param {string} text
 * @return {Promise<void>} rejects when the copy fails
 */
export async function copyText(text) {
	if (navigator.clipboard && window.isSecureContext) {
		await navigator.clipboard.writeText(text)
		return
	}
	const area = document.createElement('textarea')
	area.value = text
	area.style.position = 'fixed'
	area.style.opacity = '0'
	document.body.appendChild(area)
	try {
		area.focus()
		area.select()
		if (!document.execCommand('copy')) {
			throw new Error('Copy command was refused')
		}
	} finally {
		document.body.removeChild(area)
	}
}
