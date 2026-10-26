/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A DOMParser for the background thumbnail worker, which has none. The 3MF, AMF, COLLADA,
 * X3D and FreeCAD loaders parse their XML with `new DOMParser()`; this one is installed on
 * the worker's scope before such a loader runs. Only the worker imports this module, so
 * the viewer on the page keeps the browser's own parser.
 *
 * It is @xmldom/xmldom, with what the loaders use and xmldom lacks added to its own
 * prototypes:
 *
 * - `querySelector` / `querySelectorAll`, for type selectors (`model`, `*`), attribute
 *   selectors (`[id="x"]`, `[sid]`) and the descendant combinator (`vertices vertex`).
 *   A type selector matches the local name in any namespace, as a browser's does in an
 *   XML document. Any other selector throws a SyntaxError rather than match wrongly.
 * - `firstElementChild`, `lastElementChild`, `childElementCount`, `nextElementSibling`,
 *   `previousElementSibling`, and `children` where xmldom has none.
 * - Attributes by name on `element.attributes`, for the names three's AMF loader reads
 *   (`attributes.id`, `.type`, `.unit`, `.materialid`). xmldom's NamedNodeMap has no
 *   named properties; these are getters on its prototype, which cost nothing per element,
 *   where a getter per attribute of every element took 40% of a document's memory.
 *
 * Malformed XML gives a document whose root is `<parsererror>`, as browsers do, rather
 * than an exception, so each loader reports it the way it does on the page. Unlike a
 * browser, it also treats xmldom's recoverable errors as fatal: an undefined entity, for
 * one, is a well-formedness error a browser would not recover from either.
 *
 * Safety: xmldom never fetches anything, so neither an external DTD nor an external
 * entity is loaded, and it does not expand entities a document declares, so a
 * billion-laughs document stops at its first entity reference instead of growing. What
 * a document does cost is memory in proportion to its size: about 31 bytes of heap per
 * character of mesh-like XML (many small elements). A worker that runs out of memory
 * crashes, which reads as a broken browser and is never skipped, so text longer than
 * MAX_XML_LENGTH is refused before parsing with an XmlTooLargeError, an ordinary load
 * error that skips the file for its version.
 */

import {
	CharacterData,
	Document,
	DocumentFragment,
	DOMImplementation,
	Element,
	NamedNodeMap,
	DOMParser as XmldomParser,
} from '@xmldom/xmldom'

/**
 * Longest XML text the worker parses, in characters (16 Mi). Measured with this parser
 * under Node: mesh-like XML, a 3MF's vertices and triangles, holds about 31 bytes of heap
 * per character once parsed (48 with a getter per attribute, as this module first had),
 * so a document at the cap holds about 500 MB, which leaves a worker room for the
 * geometry it builds. A 29.6 MB document held 1.37 GB. Text-heavy XML (COLLADA float
 * arrays) costs about one byte per character, so the cap is generous there. 16 Mi
 * characters is roughly a 250,000-triangle 3MF; anything larger is left to the viewer.
 * Each document is checked on its own, after a 3MF's model is inflated from its archive.
 */
export const MAX_XML_LENGTH = 16 * 1024 * 1024

/**
 * Thrown for XML longer than the worker parses. Not an environment error: the file is
 * too big for a background thumbnail on any visit, so it is skipped for its version, and
 * the viewer still makes its thumbnail when it is opened.
 */
export class XmlTooLargeError extends Error {

	/**
	 * @param {number} length - Characters in the document
	 * @param {number} limit - The most allowed
	 */
	constructor(length, limit) {
		super(`XML document too large for a background thumbnail: ${length} characters, limit ${limit}`)
		this.name = 'XmlTooLargeError'
	}

}

/**
 * The attributes three's AMF loader reads by name, as `node.attributes.id`. Checked
 * against the loader's source by tests/unit/thumbnails/workerDomParser.test.js.
 */
export const NAMED_ATTRIBUTES = Object.freeze(['id', 'materialid', 'type', 'unit'])

/** Node types, which a worker has no `Node` global for. */
const ELEMENT_NODE = 1

/** The namespace Firefox gives its parse error documents. */
const PARSER_ERROR_NS = 'http://www.mozilla.org/newlayout/xml/parsererror.xml'

/** Longest stretch of a parse error kept in the error document. */
const MAX_ERROR_LENGTH = 500

/**
 * @param {string} message - What is wrong with the selector
 * @return {Error} The SyntaxError a browser throws for a selector it cannot parse
 */
function selectorError(message) {
	return typeof DOMException === 'function'
		? new DOMException(message, 'SyntaxError')
		: new SyntaxError(message)
}

const IDENT = /^-?[A-Za-z_\u00A0-\uFFFF][-\w\u00A0-\uFFFF]*/
const SPACE = /^[ \t\r\n\f]*/

/**
 * @typedef {object} Compound
 * @property {?string} tag - Local name to match, or null for any element
 * @property {{name: string, value: ?string}[]} attributes - Attributes it must have,
 *   with the value each must equal, or null for any value
 */

/** Parsed selectors, by their text: the 3MF loader asks for the same few per mesh. */
const parsedSelectors = new Map()

/**
 * Parse the selectors this module supports: compounds of an optional type selector and
 * any attribute selectors, joined by whitespace.
 *
 * @param {string} selector - As a loader wrote it
 * @return {Compound[]} The compounds, outermost first
 * @throws {Error} A SyntaxError for anything else
 */
function parseSelector(selector) {
	const cached = parsedSelectors.get(selector)
	if (cached) {
		return cached
	}
	const unsupported = () => selectorError(`Unsupported selector in the thumbnail worker: '${selector}'`)
	let rest = String(selector).replace(SPACE, '')
	const compounds = []
	while (rest !== '') {
		const compound = { tag: null, attributes: [] }
		let matched = false
		if (rest[0] === '*') {
			rest = rest.slice(1)
			matched = true
		} else {
			const ident = IDENT.exec(rest)
			if (ident) {
				compound.tag = ident[0]
				rest = rest.slice(ident[0].length)
				matched = true
			}
		}
		while (rest[0] === '[') {
			const attribute = /^\[[ \t\r\n\f]*(-?[A-Za-z_][-\w]*)[ \t\r\n\f]*(?:=[ \t\r\n\f]*(?:"([^"\\]*)"|'([^'\\]*)'|(-?[A-Za-z_][-\w]*))[ \t\r\n\f]*)?\]/.exec(rest)
			if (!attribute) {
				throw unsupported()
			}
			const [, name, double, single, bare] = attribute
			compound.attributes.push({ name, value: double ?? single ?? bare ?? null })
			rest = rest.slice(attribute[0].length)
			matched = true
		}
		if (!matched) {
			throw unsupported()
		}
		compounds.push(compound)
		const space = SPACE.exec(rest)[0]
		rest = rest.slice(space.length)
		if (rest !== '' && space === '') {
			// Anything but whitespace after a compound: another combinator, a class, an
			// id, a pseudo-class or a list, none of which a loader uses
			throw unsupported()
		}
	}
	if (compounds.length === 0) {
		throw unsupported()
	}
	parsedSelectors.set(selector, compounds)
	return compounds
}

/**
 * @param {Element} element - Candidate
 * @param {Compound} compound - What it must be
 * @return {boolean} True when it matches
 */
function matchesCompound(element, compound) {
	if (compound.tag !== null && (element.localName ?? element.nodeName) !== compound.tag) {
		return false
	}
	return compound.attributes.every(({ name, value }) => (value === null
		? element.hasAttribute(name)
		: element.hasAttribute(name) && element.getAttribute(name) === value))
}

/**
 * Whether an element matches the whole selector. Ancestors are looked for anywhere above
 * it, not only within the scope queried, as in a browser.
 *
 * @param {Element} element - Candidate
 * @param {Compound[]} compounds - The parsed selector
 * @return {boolean} True when it matches
 */
function matchesSelector(element, compounds) {
	let index = compounds.length - 1
	if (!matchesCompound(element, compounds[index])) {
		return false
	}
	let ancestor = element.parentNode
	for (index--; index >= 0; index--) {
		while (ancestor && ancestor.nodeType === ELEMENT_NODE && !matchesCompound(ancestor, compounds[index])) {
			ancestor = ancestor.parentNode
		}
		if (!ancestor || ancestor.nodeType !== ELEMENT_NODE) {
			return false
		}
		ancestor = ancestor.parentNode
	}
	return true
}

/**
 * Visit every element below `root`, in document order, until `visit` returns false.
 * Iterative, so a deeply nested document cannot overflow the stack.
 *
 * @param {object} root - Document, fragment or element
 * @param {(element: Element) => (boolean|void)} visit - Return false to stop
 */
function eachDescendantElement(root, visit) {
	let node = root.firstChild
	while (node) {
		if (node.nodeType === ELEMENT_NODE && visit(node) === false) {
			return
		}
		if (node.firstChild) {
			node = node.firstChild
			continue
		}
		while (node !== root && !node.nextSibling) {
			node = node.parentNode
		}
		if (node === root) {
			return
		}
		node = node.nextSibling
	}
}

/**
 * @param {string} selector - Selector to match
 * @return {?Element} The first element below `this` that matches, in document order
 */
function querySelector(selector) {
	const compounds = parseSelector(selector)
	let found = null
	eachDescendantElement(this, (element) => {
		if (matchesSelector(element, compounds)) {
			found = element
			return false
		}
	})
	return found
}

/**
 * @param {string} selector - Selector to match
 * @return {Element[]} Every element below `this` that matches, in document order. A
 *   static list, as a browser's is
 */
function querySelectorAll(selector) {
	const compounds = parseSelector(selector)
	const found = []
	eachDescendantElement(this, (element) => {
		if (matchesSelector(element, compounds)) {
			found.push(element)
		}
	})
	return found
}

/**
 * @param {?object} node - Where to start
 * @param {'nextSibling'|'previousSibling'} step - Which way to go
 * @return {?Element} The first element from `node` on, that way
 */
function elementFrom(node, step) {
	while (node && node.nodeType !== ELEMENT_NODE) {
		node = node[step]
	}
	return node ?? null
}

/** Getters of the DOM's ParentNode mixin, for documents, fragments and elements. */
const PARENT_NODE = {
	firstElementChild() {
		return elementFrom(this.firstChild, 'nextSibling')
	},
	lastElementChild() {
		return elementFrom(this.lastChild, 'previousSibling')
	},
	childElementCount() {
		let count = 0
		for (let node = this.firstChild; node; node = node.nextSibling) {
			if (node.nodeType === ELEMENT_NODE) {
				count++
			}
		}
		return count
	},
	children() {
		const children = []
		for (let node = this.firstChild; node; node = node.nextSibling) {
			if (node.nodeType === ELEMENT_NODE) {
				children.push(node)
			}
		}
		return children
	},
}

/** Getters of the DOM's NonDocumentTypeChildNode mixin, for elements and character data. */
const CHILD_NODE = {
	nextElementSibling() {
		return elementFrom(this.nextSibling, 'nextSibling')
	},
	previousElementSibling() {
		return elementFrom(this.previousSibling, 'previousSibling')
	},
}

/**
 * Add each getter a prototype does not already have.
 *
 * @param {object} prototype - An xmldom prototype
 * @param {Record<string, () => unknown>} getters - Name to getter
 */
function addGetters(prototype, getters) {
	for (const [name, get] of Object.entries(getters)) {
		if (!(name in prototype)) {
			Object.defineProperty(prototype, name, { get, configurable: true })
		}
	}
}

let patched = false

/**
 * Give xmldom's nodes the DOM API the loaders use. Once is enough: it changes xmldom's
 * own prototypes, which only this worker's loaders ever see.
 */
function patchXmldom() {
	if (patched) {
		return
	}
	patched = true
	for (const prototype of [Document.prototype, DocumentFragment.prototype, Element.prototype]) {
		addGetters(prototype, PARENT_NODE)
		for (const [name, method] of Object.entries({ querySelector, querySelectorAll })) {
			if (!(name in prototype)) {
				Object.defineProperty(prototype, name, { value: method, configurable: true, writable: true })
			}
		}
	}
	for (const prototype of [Element.prototype, CharacterData.prototype]) {
		addGetters(prototype, CHILD_NODE)
	}
	// As in a browser, a missing attribute reads as undefined, and the map's own members
	// (`length`, `item`) are never hidden
	addGetters(NamedNodeMap.prototype, Object.fromEntries(NAMED_ATTRIBUTES.map(name => [
		name,
		function() {
			return this.getNamedItem(name) ?? undefined
		},
	])))
}

/**
 * The document a browser hands back for XML it cannot parse: a `<parsererror>` root
 * with the message in a `<div>`, where the COLLADA loader looks for it first.
 *
 * @param {string} message - What was wrong
 * @return {Document} The error document
 */
function parserErrorDocument(message) {
	const doc = new DOMImplementation().createDocument(PARSER_ERROR_NS, 'parsererror', null)
	const div = doc.createElementNS(PARSER_ERROR_NS, 'div')
	div.appendChild(doc.createTextNode(String(message).slice(0, MAX_ERROR_LENGTH)))
	doc.documentElement.appendChild(div)
	return doc
}

/**
 * Make a DOMParser class for the worker: `parseFromString(text, mimeType)` as on the
 * page, for the XML MIME types.
 *
 * @param {object} [options] - How it behaves
 * @param {number} [options.maxLength] - Longest text it parses, in characters
 * @param {(error: XmlTooLargeError) => void} [options.onTooLarge] - Told about each
 *   document refused for its size, before the error is thrown. A loader may catch the
 *   error and rethrow its own, so the worker learns of the refusal here
 * @return {new () => {parseFromString: (text: string, mimeType: string) => object}} The class
 */
export function createWorkerDomParser({ maxLength = MAX_XML_LENGTH, onTooLarge = () => {} } = {}) {
	return class WorkerDOMParser {

		/**
		 * @param {string} text - The document
		 * @param {string} mimeType - `application/xml`, `text/xml` and the like
		 * @return {Document} The document, or a `<parsererror>` document when it is malformed
		 * @throws {XmlTooLargeError} When the text is longer than `maxLength`
		 */
		parseFromString(text, mimeType) {
			const source = String(text)
			if (source.length > maxLength) {
				const error = new XmlTooLargeError(source.length, maxLength)
				onTooLarge(error)
				throw error
			}
			patchXmldom()
			const parser = new XmldomParser({
				locator: false,
				// Stop at the first error, as a browser does; warnings are what a browser
				// recovers from too
				onError: (level, message) => {
					if (level !== 'warning') {
						throw new Error(message)
					}
				},
			})
			try {
				return parser.parseFromString(source, mimeType)
			} catch (error) {
				if (error instanceof TypeError) {
					// An unsupported MIME type, which a browser rejects the same way
					throw error
				}
				return parserErrorDocument(error?.message ?? error)
			}
		}

	}
}

/** The worker's DOMParser with the default limit. */
export const WorkerDOMParser = createWorkerDomParser()

/**
 * Make `DOMParser` available to the loaders running in a worker, unless the scope has
 * its own.
 *
 * @param {object} scope - The worker's global scope (`self`)
 * @param {object} [options] - See createWorkerDomParser
 * @return {boolean} True when this parser was installed, false when the scope had one
 */
export function installWorkerDomParser(scope, options) {
	if (typeof scope.DOMParser === 'function') {
		return false
	}
	patchXmldom()
	scope.DOMParser = options ? createWorkerDomParser(options) : WorkerDOMParser
	return true
}
