/**
 * The card a link to a 3D model becomes in Talk, Text, Collectives, Deck, Mail and the other
 * places that render link previews: the model's thumbnail, its name, its format and size, and
 * a button that opens it in the viewer.
 *
 * It is plain DOM on purpose. The page that shows it is someone else's (Talk, a Text
 * document) and runs whichever Vue that app was built with, so this brings no framework, and
 * it must never reach for three.js or the viewer: it loads on every page that can show a
 * link preview, to draw one box.
 *
 * Everything the card shows came from the server, which only fills it in for a reader who
 * may open the file (ModelReferenceProvider). It still treats it as data: names and
 * descriptions are set as text, and a link or an image address is used only if it is an
 * http(s) address.
 *
 * The two phrases on the card arrive from the server, in the reader's language, inside the
 * rich object. Translating here would load the whole l10n library (34 KB) into a script that
 * is otherwise 3 KB, on every page that can show a preview, to look up two strings the
 * server has already looked up for the same reader.
 */

/** The rich object type the server sends (ModelReferenceProvider::RICH_OBJECT_TYPE). */
export const WIDGET_ID = 'threedviewer_model'

/**
 * Material Design's "cube-outline", drawn where a model has no thumbnail yet. Copied from
 * vue-material-design-icons rather than imported: the component costs more than the path,
 * and tests/unit/modelCard.test.js reads the package back so the copy cannot drift.
 */
export const CUBE_ICON_PATH = 'M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L6.04,7.5L12,10.85L17.96,7.5L12,4.15M5,15.91L11,19.29V12.58L5,9.21V15.91M19,15.91V9.21L13,12.58V19.29L19,15.91Z'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** What the card says if the server sent no wording of its own. */
const DEFAULT_LABELS = {
	open: 'Open in 3D Viewer',
	view: 'Opens at a shared view',
}

/**
 * @param {*} value - an address from the server
 * @return {string|null} the address if it is an http(s) one, else null
 */
function webAddress(value) {
	if (typeof value !== 'string' || value === '') {
		return null
	}
	try {
		const url = new URL(value, window.location.href)
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
	} catch {
		return null
	}
}

/**
 * @param {*} value - wording from the server
 * @return {string|null} the wording if it is some text, else null
 */
function text(value) {
	return typeof value === 'string' && value !== '' ? value : null
}

/**
 * What the server sent, checked.
 *
 * @param {*} richObject - ModelReferenceProvider's rich object
 * @return {{name: string, details: string, link: string, thumbnail: string|null, hasView: boolean, labels: {open: string, view: string}}|null}
 *   null when there is nothing to show: no name, or no link a button could open
 */
export function readModel(richObject) {
	if (!richObject || typeof richObject !== 'object') {
		return null
	}
	const link = webAddress(richObject.link)
	if (typeof richObject.name !== 'string' || richObject.name === '' || link === null) {
		return null
	}
	const details = typeof richObject.description === 'string'
		? richObject.description
		: (typeof richObject.format === 'string' ? richObject.format : '')

	return {
		name: richObject.name,
		details,
		link,
		thumbnail: webAddress(richObject.thumbnail),
		hasView: richObject.hasView === true,
		labels: {
			open: text(richObject.labels?.open) ?? DEFAULT_LABELS.open,
			view: text(richObject.labels?.view) ?? DEFAULT_LABELS.view,
		},
	}
}

/** @return {SVGElement} the cube, for a model with no thumbnail */
function cubeIcon() {
	const svg = document.createElementNS(SVG_NS, 'svg')
	svg.setAttribute('class', 'threedviewer-reference-placeholder')
	svg.setAttribute('viewBox', '0 0 24 24')
	svg.setAttribute('width', '48')
	svg.setAttribute('height', '48')
	svg.setAttribute('fill', 'currentColor')
	svg.setAttribute('aria-hidden', 'true')
	svg.setAttribute('focusable', 'false')
	const path = document.createElementNS(SVG_NS, 'path')
	path.setAttribute('d', CUBE_ICON_PATH)
	svg.appendChild(path)
	return svg
}

/**
 * @param {string} tag - element name
 * @param {string} className - its class
 * @param {string} [text] - its text
 * @return {HTMLElement}
 */
function element(tag, className, text) {
	const node = document.createElement(tag)
	node.className = className
	if (text !== undefined) {
		node.textContent = text
	}
	return node
}

/**
 * @param {string} thumbnail - the thumbnail's address, or null
 * @return {HTMLElement} the picture's frame: the thumbnail, or the cube if there is none or it fails to load
 */
function previewFor(thumbnail) {
	const frame = element('div', 'threedviewer-reference-preview')
	const showPlaceholder = () => frame.replaceChildren(cubeIcon())
	if (thumbnail === null) {
		showPlaceholder()
		return frame
	}
	const image = document.createElement('img')
	// Decorative: the name beside it says what it is
	image.alt = ''
	image.loading = 'lazy'
	image.decoding = 'async'
	image.addEventListener('error', showPlaceholder, { once: true })
	image.src = thumbnail
	frame.appendChild(image)
	return frame
}

/**
 * A reference widget's render callback (`registerWidget`): draw the card into `el`.
 *
 * @param {HTMLElement} el - the element Nextcloud gives the widget
 * @param {{richObject: object}} properties - the rich object the server resolved
 */
export function renderModelCard(el, { richObject } = {}) {
	const model = readModel(richObject)
	if (model === null) {
		el.replaceChildren()
		return
	}

	const card = element('div', 'threedviewer-reference')

	const body = element('div', 'threedviewer-reference-body')
	const name = element('a', 'threedviewer-reference-name', model.name)
	name.href = model.link
	name.target = '_blank'
	name.rel = 'noopener noreferrer'
	body.appendChild(name)
	if (model.details !== '') {
		body.appendChild(element('p', 'threedviewer-reference-details', model.details))
	}
	if (model.hasView) {
		body.appendChild(element('p', 'threedviewer-reference-details', model.labels.view))
	}
	const open = element('a', 'tdv-btn tdv-btn--primary threedviewer-reference-open', model.labels.open)
	open.href = model.link
	open.target = '_blank'
	open.rel = 'noopener noreferrer'
	body.appendChild(open)

	card.append(previewFor(model.thumbnail), body)
	el.replaceChildren(card)
}

/**
 * A reference widget's cleanup callback (`registerWidget`).
 *
 * @param {HTMLElement} el - the element the card was drawn into
 */
export function destroyModelCard(el) {
	el.replaceChildren()
}
