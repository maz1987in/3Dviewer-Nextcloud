import * as THREE from 'three'
import { unzip } from 'three/examples/jsm/libs/fflate.module.js'
import { BaseLoader } from '../BaseLoader.js'
import { getOcct, buildGroupFromOccResult } from '../occt-runtime.js'

// FreeCAD writes `.brp`; `.brep` is the same format under its longer name
const BREP_ENTRY = /\.(brep|brp)$/i

// PartDesign Body display modes, in the order FreeCAD's ViewProviderBody lists them
const BODY_MODE_TIP = '1'

/**
 * Containers that draw their members inside their own scene node, so hiding one hides
 * its whole subtree while each member keeps its own Visibility flag. Not
 * App::DocumentObjectGroup or a Draft layer: hiding those sets each member's flag, and a
 * member still flagged visible inside a hidden plain group is shown.
 */
const CONTAINER_TYPES = new Set(['PartDesign::Body', 'App::Part', 'Assembly::AssemblyObject'])

/**
 * @param {Element} parent - An element
 * @param {string} name - Tag name
 * @return {Element[]} Its child elements of that name, in order
 */
function childElements(parent, name) {
	const found = []
	for (let node = parent?.firstChild; node; node = node.nextSibling) {
		if (node.nodeType === 1 && node.nodeName === name) {
			found.push(node)
		}
	}
	return found
}

/**
 * The value of one property an object or view provider saves, as
 * `<Properties><Property name="…"><Tag value="…"/></Property></Properties>`.
 *
 * @param {Element} owner - An `<Object>` or `<ViewProvider>`
 * @param {string} name - Property name
 * @return {?Element} The element inside the property, or null when it is not saved
 */
function propertyValue(owner, name) {
	for (const properties of childElements(owner, 'Properties')) {
		for (const property of childElements(properties, 'Property')) {
			if (property.getAttribute('name') === name) {
				for (let node = property.firstChild; node; node = node.nextSibling) {
					if (node.nodeType === 1) {
						return node
					}
				}
				return null
			}
		}
	}
	return null
}

/**
 * @param {Uint8Array} bytes - An XML entry of the archive
 * @return {?Document} The parsed document, or null when there is no parser or it is malformed
 */
function parseXml(bytes) {
	if (!bytes || typeof DOMParser !== 'function') {
		return null
	}
	try {
		const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml')
		return doc.getElementsByTagName('parsererror').length > 0 ? null : doc
	} catch (error) {
		if (error?.name === 'XmlTooLargeError') {
			// The thumbnail worker's parser refuses a document this large; drawing every
			// entry instead would make a degraded thumbnail, so the load fails
			throw error
		}
		return null
	}
}

/**
 * The `.brp` entries of the objects FreeCAD shows.
 *
 * FreeCAD saves a shape for every feature, not only the result: a PartDesign Body with a
 * Pad and a Pocket stores the Pad's solid, the Pocket's result, the tool the Pocket cut
 * away (`AddSubShape`) and the Body's own copy of its tip; a Part workbench Cut stores its
 * base and tool. Drawn together they overlap, and a cutting tool sticks out of the part.
 * FreeCAD shows only what GuiDocument.xml marks visible, so only those are drawn: each
 * object's `Shape` property names its file in Document.xml.
 *
 * A Body or App::Part hides everything in it (its `Group`) without clearing the members'
 * own flags, so an object is drawn only when it and every container above it are shown:
 * the tip of a Body hidden after a Part Cut used it stays flagged visible, and would
 * otherwise stick out of the cut. A Body in its default "Through" display mode draws
 * nothing of its own, since its visible tip is drawn; in "Tip" mode it draws its own
 * shape and none of its members.
 *
 * @param {Record<string, Uint8Array>} entries - The archive, by entry name
 * @return {?Set<string>} Entry names to draw, possibly none; null when the archive has
 *   no GuiDocument.xml (FreeCADCmd saves none) or either document cannot be read
 */
export function visibleShapeEntries(entries) {
	const doc = parseXml(entries['Document.xml'])
	const gui = parseXml(entries['GuiDocument.xml'])
	if (!doc || !gui) {
		return null
	}

	const types = new Map()
	for (const list of doc.getElementsByTagName('Objects')) {
		for (const object of childElements(list, 'Object')) {
			types.set(object.getAttribute('name'), object.getAttribute('type'))
		}
	}

	const viewProviders = new Map()
	for (const data of gui.getElementsByTagName('ViewProviderData')) {
		for (const viewProvider of childElements(data, 'ViewProvider')) {
			viewProviders.set(viewProvider.getAttribute('name'), viewProvider)
		}
	}
	// Shown unless FreeCAD saved it hidden, as a view provider is by default
	const isFlaggedShown = (name) => {
		const visibility = viewProviders.has(name) ? propertyValue(viewProviders.get(name), 'Visibility') : null
		return visibility?.getAttribute('value') !== 'false'
	}
	const isTipModeBody = (name) => {
		if (types.get(name) !== 'PartDesign::Body') {
			return false
		}
		const mode = viewProviders.has(name) ? propertyValue(viewProviders.get(name), 'DisplayModeBody') : null
		return mode?.getAttribute('value') === BODY_MODE_TIP
	}

	const objects = []
	for (const data of doc.getElementsByTagName('ObjectData')) {
		objects.push(...childElements(data, 'Object'))
	}

	// Each member's container, from the Group links of each Body and App::Part
	const containerOf = new Map()
	for (const object of objects) {
		const name = object.getAttribute('name')
		if (!CONTAINER_TYPES.has(types.get(name))) {
			continue
		}
		const links = propertyValue(object, 'Group')
		for (const link of links ? childElements(links, 'Link') : []) {
			const member = link.getAttribute('value')
			if (member && member !== name && !containerOf.has(member)) {
				containerOf.set(member, name)
			}
		}
	}

	// Drawn when it and every container above it are shown, and no Body above it draws
	// itself in Tip mode instead. The walk stops at a container seen before, should a
	// crafted document link containers in a circle.
	const isDrawn = (name) => {
		if (!isFlaggedShown(name)) {
			return false
		}
		const seen = new Set([name])
		for (let container = containerOf.get(name); container !== undefined; container = containerOf.get(container)) {
			if (seen.has(container) || !isFlaggedShown(container) || isTipModeBody(container)) {
				return false
			}
			seen.add(container)
		}
		return true
	}

	const shown = new Set()
	for (const object of objects) {
		const name = object.getAttribute('name')
		const part = propertyValue(object, 'Shape')
		const file = part?.nodeName === 'Part' ? part.getAttribute('file') : null
		if (!file || !isDrawn(name)) {
			continue
		}
		if (types.get(name) === 'PartDesign::Body' && !isTipModeBody(name)) {
			continue
		}
		shown.add(file)
	}
	return shown
}

/**
 * FCSTD loader — FreeCAD native document format.
 *
 * An FCSTD file is a ZIP archive containing one `Document.xml` (assembly
 * metadata) and one or more B-Rep files (the actual geometry). FreeCAD
 * saves those as `*.brp` (e.g. `PartShape.brp`); some exporters write
 * `*.brep`. We extract every entry with either extension and parse each
 * one with the shared OCCT runtime, combining the results into a single
 * Three.js group.
 *
 * FreeCAD also stores the shape of every intermediate feature, so only
 * the objects `GuiDocument.xml` marks visible are drawn (see
 * visibleShapeEntries). When that cannot be read, or leaves nothing to
 * draw, every entry is drawn as before. Placement is not read from
 * `Document.xml`: the B-Rep entries already contain geometry in world
 * space (FreeCAD writes transformed copies when saving).
 *
 * Compressed entries (most FCSTD bodies are deflate-compressed) are
 * handled transparently by fflate's `unzip`.
 */
class FcstdLoader extends BaseLoader {

	constructor() {
		super('FCSTDLoader', ['fcstd'])
	}

	async loadModel(arrayBuffer, context) {
		const entries = await this.unzipEntries(arrayBuffer)
		const brepNames = Object.keys(entries).filter(name => BREP_ENTRY.test(name))

		if (brepNames.length === 0) {
			throw new Error('FCSTD archive contains no .brep or .brp geometry entries')
		}

		const shown = visibleShapeEntries(entries)
		const visibleNames = shown ? brepNames.filter(name => shown.has(name)) : []

		const occt = await getOcct()
		const root = new THREE.Group()
		root.name = 'FCSTD'

		let totalMeshes = 0
		const draw = (names) => {
			for (const name of names) {
				totalMeshes += this.addBody(occt, entries, name, root)
			}
		}
		draw(visibleNames.length > 0 ? visibleNames : brepNames)
		if (root.children.length === 0 && visibleNames.length > 0) {
			// Nothing visible could be tessellated (only sketches are shown, say)
			draw(brepNames.filter(name => !shown.has(name)))
		}

		if (root.children.length === 0) {
			throw new Error('FCSTD: no bodies could be tessellated')
		}

		this.logInfo('FCSTD model loaded successfully', {
			bodies: root.children.length,
			entries: brepNames.length,
			visible: shown ? visibleNames.length : null,
			totalMeshes,
		})

		return this.processModel(root, context)
	}

	/**
	 * Tessellate one B-Rep entry and add it to `root`. A body that fails or has no
	 * triangles is logged and left out, so one bad body does not take out the document.
	 *
	 * @param {object} occt - The OCCT runtime
	 * @param {Record<string, Uint8Array>} entries - The archive
	 * @param {string} name - Entry to read
	 * @param {THREE.Group} root - Where to add it
	 * @return {number} Meshes added
	 */
	addBody(occt, entries, name, root) {
		try {
			const result = occt.ReadBrepFile(entries[name], null)
			if (!result?.success || !Array.isArray(result.meshes) || result.meshes.length === 0) {
				this.logWarning('FCSTD: skipped body with no tessellation', { name })
				return 0
			}
			const group = buildGroupFromOccResult(result, this.loaderName)
			group.name = name.replace(BREP_ENTRY, '')
			root.add(group)
			return result.meshes.length
		} catch (e) {
			this.logWarning('FCSTD: body parse failed', { name, error: e.message })
			return 0
		}
	}

	/**
	 * fflate's `unzip` is callback-based; wrap in a Promise for await.
	 *
	 * @param {ArrayBuffer} arrayBuffer - the .fcstd zip
	 * @return {Promise<Record<string, Uint8Array>>} name → decompressed bytes
	 */
	async unzipEntries(arrayBuffer) {
		const bytes = new Uint8Array(arrayBuffer)
		return new Promise((resolve, reject) => {
			unzip(bytes, (err, unzipped) => {
				if (err) reject(err)
				else resolve(unzipped)
			})
		})
	}

}

export default FcstdLoader
