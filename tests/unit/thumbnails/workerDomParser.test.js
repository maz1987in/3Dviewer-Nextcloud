/**
 * The background thumbnail worker's DOMParser.
 *
 * A worker has no DOMParser, and the 3MF, AMF, COLLADA, X3D and FreeCAD loaders parse
 * their XML with one, so these formats were left to the viewer. The worker now installs
 * @xmldom/xmldom with what those loaders use added (querySelector, element traversal,
 * attributes by name). These tests hold it to the browser's behaviour, with jsdom's
 * parser as the reference where the two can be compared, and run three's own loaders
 * on it. Parsing untrusted files, it must also fetch nothing and expand no entity.
 */

import { zipSync } from 'three/examples/jsm/libs/fflate.module.js'
import fs from 'node:fs'
import path from 'node:path'
import {
	createWorkerDomParser,
	installWorkerDomParser,
	MAX_XML_LENGTH,
	NAMED_ATTRIBUTES,
	WorkerDOMParser,
	XmlTooLargeError,
} from '../../../src/thumbnails/workerDomParser.js'

const parse = (text) => new WorkerDOMParser().parseFromString(text, 'application/xml')
const native = (text) => new DOMParser().parseFromString(text, 'application/xml')

/** A 3MF-like document: a default namespace, a prefixed one and nested meshes. */
const MODEL = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="urn:core" xmlns:m="urn:material">
<!-- a comment before the resources -->
<resources>
	<m:texture2d id="2" path="/3D/Texture/a.png"/>
	<object id="1" type="model"><mesh>
		<vertices><vertex x="0"/><vertex x="1"/><vertex x="2"/></vertices>
		<triangles><triangle v1="0" v2="1" v3="2"/></triangles>
	</mesh></object>
	<vertex x="outside"/>
</resources>
<build><item objectid="1"/></build>
</model>`

describe('installWorkerDomParser', () => {
	it('installs DOMParser on a scope that has none', () => {
		const scope = {}

		expect(installWorkerDomParser(scope)).toBe(true)
		expect(scope.DOMParser).toBe(WorkerDOMParser)
		expect(new scope.DOMParser().parseFromString('<a/>', 'application/xml').documentElement.nodeName).toBe('a')
	})

	it('leaves a scope its own DOMParser', () => {
		function NativeParser() {}
		const scope = { DOMParser: NativeParser }

		expect(installWorkerDomParser(scope)).toBe(false)
		expect(scope.DOMParser).toBe(NativeParser)
	})
})

describe('querySelector and querySelectorAll', () => {
	it('match type selectors by local name, in any namespace, in document order', () => {
		const doc = parse(MODEL)

		expect(doc.querySelector('model').getAttribute('unit')).toBe('millimeter')
		// The 3MF loader finds prefixed material elements by their local name
		expect(doc.querySelectorAll('texture2d').map(el => el.getAttribute('id'))).toEqual(['2'])
		expect(doc.querySelectorAll('vertex').map(el => el.getAttribute('x'))).toEqual(['0', '1', '2', 'outside'])
		expect(doc.querySelector('nothing')).toBeNull()
		expect(doc.querySelectorAll('nothing')).toEqual([])
	})

	it('search below the element only, and the descendant combinator looks above it too', () => {
		const doc = parse(MODEL)
		const mesh = doc.querySelector('mesh')

		expect(mesh.querySelector('mesh')).toBeNull()
		expect(mesh.querySelectorAll('vertices vertex').map(el => el.getAttribute('x'))).toEqual(['0', '1', '2'])
		// `resources` is above the mesh, as in a browser it still counts
		expect(mesh.querySelectorAll('resources vertex')).toHaveLength(3)
		expect(doc.querySelectorAll('vertices vertex')).toHaveLength(3)
		expect(doc.querySelectorAll('triangles vertex')).toEqual([])
	})

	it('match attribute selectors, as the COLLADA loader writes them', () => {
		const doc = parse('<COLLADA><node id="n1" sid="a"><rotate sid="r"/></node><node id="n2"/></COLLADA>')

		expect(doc.querySelector('[id="n2"]').getAttribute('id')).toBe('n2')
		expect(doc.querySelector('[sid=\'r\']').nodeName).toBe('rotate')
		expect(doc.querySelector('[sid="r"]').parentElement.getAttribute('id')).toBe('n1')
		expect(doc.querySelectorAll('[sid]')).toHaveLength(2)
		expect(doc.querySelectorAll('node[id=n1]')).toHaveLength(1)
		expect(doc.querySelectorAll('*')).toHaveLength(4)
		expect(doc.querySelector('[id="missing"]')).toBeNull()
	})

	it('agree with a browser parser on the selectors the loaders use', () => {
		const ours = parse(MODEL)
		const theirs = native(MODEL)

		// Not `texture2d`: jsdom matches a type selector against the prefixed name and
		// finds no <m:texture2d>, where Chrome, like this parser, matches the local name
		for (const selector of ['model', 'resources', 'object', 'vertices vertex', 'triangles triangle', 'item', '[id="1"]', 'metadata']) {
			expect(ours.querySelectorAll(selector).map(el => el.nodeName))
				.toEqual([...theirs.querySelectorAll(selector)].map(el => el.nodeName))
		}
	})

	it.each([
		'vertices > vertex',
		'vertex + vertex',
		'vertex ~ vertex',
		'.vertex',
		'#id',
		'vertex:first-child',
		'model, build',
		'[id="a\\"b"]',
		'[id^="a"]',
		'',
		'   ',
	])('throw a SyntaxError for %j rather than match it wrongly', (selector) => {
		const doc = parse(MODEL)

		expect(() => doc.querySelectorAll(selector)).toThrow(expect.objectContaining({ name: 'SyntaxError' }))
	})
})

describe('element traversal', () => {
	it('skips text and comments, as the AMF loader expects', () => {
		const doc = parse('<a>\n\t<!-- c -->\n\t<b/>\n\ttext\n\t<c/>\n</a>')
		const a = doc.documentElement

		expect(a.firstElementChild.nodeName).toBe('b')
		expect(a.firstElementChild.nextElementSibling.nodeName).toBe('c')
		expect(a.firstElementChild.nextElementSibling.nextElementSibling).toBeNull()
		expect(a.lastElementChild.nodeName).toBe('c')
		expect(a.lastElementChild.previousElementSibling.nodeName).toBe('b')
		expect(a.childElementCount).toBe(2)
		expect([...a.children].map(el => el.nodeName)).toEqual(['b', 'c'])
		expect(doc.firstElementChild).toBe(a)
		expect(a.firstElementChild.firstElementChild).toBeNull()
	})

	it('reads the attributes the AMF loader names on element.attributes, as a browser does', () => {
		const el = parse('<object id="7" type="model" length="x"/>').documentElement

		expect(el.attributes.id.textContent).toBe('7')
		expect(el.attributes.type.value).toBe('model')
		expect(el.attributes.type.nodeValue).toBe('model')
		// Missing reads as undefined, which the AMF loader tests for
		expect(el.attributes.materialid).toBeUndefined()
		expect(el.attributes.unit).toBeUndefined()
		expect(el.attributes.missing).toBeUndefined()
		// A name the map itself uses stays the map's, as in a browser
		expect(el.attributes.length).toBe(3)
		expect(el.attributes[0].name).toBe('id')
	})

	it('covers every attribute three\'s AMF loader reads by name', () => {
		const source = fs.readFileSync(path.join(__dirname, '../../../node_modules/three/examples/jsm/loaders/AMFLoader.js'), 'utf8')
		const read = [...new Set([...source.matchAll(/\.attributes\.([A-Za-z_]\w*)/g)].map(match => match[1]))]

		// A three upgrade that reads another name fails here rather than in a worker
		expect(read.filter(name => name !== 'length').sort()).toEqual([...NAMED_ATTRIBUTES].sort())
	})

	it('adds nothing to each parsed element, so memory does not grow with attributes', () => {
		const el = parse('<object id="7" type="model"/>').documentElement

		expect(Object.getOwnPropertyNames(el.attributes)).not.toContain('id')
	})
})

describe('size cap', () => {
	it('is 16 Mi characters by default', () => {
		expect(MAX_XML_LENGTH).toBe(16 * 1024 * 1024)
	})

	it('refuses text over the cap before parsing it, and reports the refusal', () => {
		const onTooLarge = jest.fn()
		const Parser = createWorkerDomParser({ maxLength: 20, onTooLarge })

		expect(new Parser().parseFromString('<a>0123456789</a>', 'application/xml').documentElement.nodeName).toBe('a')
		expect(() => new Parser().parseFromString('<a>0123456789abcdef</a>', 'application/xml')).toThrow(XmlTooLargeError)
		expect(onTooLarge).toHaveBeenCalledTimes(1)
		expect(onTooLarge.mock.calls[0][0]).toBeInstanceOf(XmlTooLargeError)
		expect(onTooLarge.mock.calls[0][0].name).toBe('XmlTooLargeError')
	})

	it('is applied by the installed parser', () => {
		const scope = {}
		const onTooLarge = jest.fn()
		installWorkerDomParser(scope, { maxLength: 5, onTooLarge })

		expect(() => new scope.DOMParser().parseFromString('<abc/>', 'application/xml')).toThrow(XmlTooLargeError)
		expect(onTooLarge).toHaveBeenCalledTimes(1)
	})
})

describe('malformed XML', () => {
	it.each([
		['a mismatched tag', '<a><b></a>'],
		['an undefined entity', '<a>&nope;</a>'],
		['no root element', 'not xml at all'],
		['nothing', ''],
		['content after the root', '<a/><b/>'],
	])('gives a <parsererror> document for %s, as a browser does', (_, text) => {
		const doc = parse(text)

		// Where the X3D, COLLADA and FreeCAD loaders look for it
		expect(doc.querySelector('parsererror')).not.toBeNull()
		expect(doc.getElementsByTagName('parsererror')).toHaveLength(1)
		expect(doc.getElementsByTagName('div')[0].textContent).not.toBe('')
		expect(native(text).getElementsByTagName('parsererror').length).toBeGreaterThan(0)
	})

	it('logs nothing to the console', () => {
		const error = jest.spyOn(console, 'error').mockImplementation(() => {})
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		try {
			parse('<a>&nope;</a>')
			parse('<a b=1/>')
			expect(error).not.toHaveBeenCalled()
			expect(warn).not.toHaveBeenCalled()
		} finally {
			error.mockRestore()
			warn.mockRestore()
		}
	})

	it('still rejects a MIME type that is not XML, as a browser does', () => {
		expect(() => new WorkerDOMParser().parseFromString('<a/>', 'application/x-nonsense')).toThrow(TypeError)
	})
})

describe('hostile XML', () => {
	let fetchSpy
	let openSpy

	beforeEach(() => {
		fetchSpy = jest.fn(() => Promise.reject(new Error('no fetch in this test')))
		global.fetch = fetchSpy
		openSpy = jest.spyOn(XMLHttpRequest.prototype, 'open')
	})

	afterEach(() => {
		delete global.fetch
		openSpy.mockRestore()
	})

	it('does not expand the entities of a billion-laughs document', () => {
		const levels = Array.from({ length: 9 }, (_, i) => `<!ENTITY lol${i + 1} "${`&lol${i || ''};`.repeat(10)}">`)
		const text = `<!DOCTYPE a [<!ENTITY lol "lol">${levels.join('')}]><a>&lol9;</a>`

		const started = Date.now()
		const doc = parse(text)

		expect(Date.now() - started).toBeLessThan(1000)
		expect(doc.documentElement.nodeName).toBe('parsererror')
		expect(doc.documentElement.textContent.length).toBeLessThan(1000)
	})

	it('loads no external entity, from the network or from disk', () => {
		for (const system of ['https://example.invalid/e.xml', 'file:///etc/passwd']) {
			const doc = parse(`<!DOCTYPE a [<!ENTITY ext SYSTEM "${system}">]><a>&ext;</a>`)

			expect(doc.documentElement.nodeName).toBe('parsererror')
			expect(doc.documentElement.textContent).not.toContain('root:')
		}
		expect(fetchSpy).not.toHaveBeenCalled()
		expect(openSpy).not.toHaveBeenCalled()
	})

	it('reads a document that names an external DTD without fetching it', () => {
		const doc = parse('<!DOCTYPE X3D PUBLIC "ISO//Web3D//DTD X3D 3.3//EN" "https://example.invalid/x3d-3.3.dtd"><X3D><Scene/></X3D>')

		expect(doc.querySelector('Scene')).not.toBeNull()
		expect(fetchSpy).not.toHaveBeenCalled()
		expect(openSpy).not.toHaveBeenCalled()
	})

	it('walks a deeply nested document without overflowing the stack', () => {
		const depth = 20000
		const doc = parse(`${'<g>'.repeat(depth)}<leaf/>${'</g>'.repeat(depth)}`)

		expect(doc.querySelectorAll('g leaf')).toHaveLength(1)
	})
})

describe("three's XML loaders on the worker's parser", () => {
	let original

	beforeEach(() => {
		original = global.DOMParser
		global.DOMParser = WorkerDOMParser
	})

	afterEach(() => {
		global.DOMParser = original
	})

	/** Every mesh below `object`, with its vertex count. */
	const meshes = (object) => {
		const found = []
		object.traverse((child) => {
			if (child.isMesh) {
				found.push(child.geometry.attributes.position.count)
			}
		})
		return found
	}

	it('AMFLoader reads an AMF triangle', async () => {
		const { AMFLoader } = await import('three/examples/jsm/loaders/AMFLoader.js')
		const amf = `<?xml version="1.0" encoding="UTF-8"?>
<amf unit="millimeter"><object id="0"><mesh>
<vertices><vertex><coordinates><x>0</x><y>0</y><z>0</z></coordinates></vertex><vertex><coordinates><x>1</x><y>0</y><z>0</z></coordinates></vertex><vertex><coordinates><x>0</x><y>1</y><z>0</z></coordinates></vertex></vertices>
<volume><triangle><v1>0</v1><v2>1</v2><v3>2</v3></triangle></volume>
</mesh></object></amf>`

		const group = new AMFLoader().parse(new TextEncoder().encode(amf).buffer)

		expect(meshes(group)).toEqual([3])
	})

	it('ThreeMFLoader reads a 3MF triangle', async () => {
		const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js')
		const bytes = (text) => new Uint8Array(Buffer.from(text, 'utf8'))
		const zip = zipSync({
			'[Content_Types].xml': bytes('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
			'_rels/.rels': bytes('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
			'3D/3dmodel.model': bytes(`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh>
<vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices>
<triangles><triangle v1="0" v2="1" v3="2"/></triangles>
</mesh></object></resources><build><item objectid="1"/></build></model>`),
		})

		const group = new ThreeMFLoader().parse(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength))

		expect(meshes(group)).toEqual([3])
	})

	it('ColladaLoader reads a COLLADA triangle', async () => {
		const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js')
		const dae = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><up_axis>Y_UP</up_axis></asset>
<library_geometries><geometry id="tri"><mesh>
<source id="pos"><float_array id="pos-a" count="9">0 0 0 1 0 0 0 1 0</float_array>
<technique_common><accessor source="#pos-a" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<vertices id="v"><input semantic="POSITION" source="#pos"/></vertices>
<triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="s"><node id="n"><matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</matrix><instance_geometry url="#tri"/></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene>
</COLLADA>`

		const { scene } = new ColladaLoader().parse(dae)

		expect(meshes(scene)).toEqual([3])
	})

	it('ColladaLoader reports malformed XML as it does in a browser', async () => {
		const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js')
		const error = jest.spyOn(console, 'error').mockImplementation(() => {})
		try {
			expect(new ColladaLoader().parse('<COLLADA><asset></COLLADA>')).toBeNull()
			expect(error).toHaveBeenCalledWith(expect.stringContaining('THREE.ColladaLoader'), expect.anything())
		} finally {
			error.mockRestore()
		}
	})
})
