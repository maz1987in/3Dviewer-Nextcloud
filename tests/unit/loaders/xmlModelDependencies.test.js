/**
 * COLLADA and X3D name their textures in the document, so they can be resolved the
 * way glTF is — by declaration — rather than by listing the folder and taking every
 * image in it. Listing needs a session, which is why these formats render untextured
 * on a public share.
 */
import { parseXmlModelDependencies } from '../../../src/loaders/multiFileHelpers.js'

describe('parseXmlModelDependencies', () => {
	it('reads a COLLADA 1.4 init_from path', () => {
		const dae = `<?xml version="1.0"?><COLLADA><library_images>
			<image id="wood"><init_from>textures/wood.png</init_from></image>
		</library_images></COLLADA>`

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual(['textures/wood.png'])
	})

	it('reads the COLLADA 1.5 ref form', () => {
		const dae = `<COLLADA><library_images>
			<image><init_from><ref>wood.png</ref></init_from></image>
		</library_images></COLLADA>`

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual(['wood.png'])
	})

	it('does not take the image id in an effect\'s <surface><init_from> for a file', () => {
		// Blender, SketchUp and OpenCOLLADA write COLLADA 1.4 like this: the surface names
		// the <image> by id, and only the image names the file
		const dae = `<COLLADA>
			<library_images><image id="checker_png" name="checker_png"><init_from>checker.png</init_from></image></library_images>
			<library_effects><effect id="Material-effect"><profile_COMMON>
				<newparam sid="checker_png-surface"><surface type="2D"><init_from>checker_png</init_from></surface></newparam>
				<newparam sid="checker_png-sampler"><sampler2D><source>checker_png-surface</source></sampler2D></newparam>
				<technique sid="common"><lambert><diffuse><texture texture="checker_png-sampler" texcoord="UVMap"/></diffuse></lambert></technique>
			</profile_COMMON></effect></library_effects>
		</COLLADA>`

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual(['checker.png'])
	})

	it('finds each image\'s file when only some images have one', () => {
		const dae = `<COLLADA><image id="a"></image><image id="b"><init_from>b.png</init_from></image><image id="c"/><image id="d"></image><image id="e"><init_from><ref>e.png</ref></init_from><init_from>e2.png</init_from></image></COLLADA>`

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual(['b.png', 'e.png', 'e2.png'])
	})

	it('reads only real <image> elements, whatever their attributes', () => {
		const dae = `<COLLADA>
			<image id="empty"/>
			<imager><init_from>not-an-image.png</init_from></imager>
			<instance_image url="#a"/>
			<image id="a" name='x > y' height="2"><init_from>a.png</init_from></image>
			<IMAGE id="b"><INIT_FROM> b.png </INIT_FROM></IMAGE>
		</COLLADA>`

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual(['a.png', 'b.png'])
	})

	it.each([
		['<init_from without >', '<init_from '.repeat(200000)],
		['<image without >', '<image '.repeat(300000)],
		['<image> blocks with <init_from but no >', `${'<image>'}${'<init_from '.repeat(200000)}</image>`],
		['a million empty <image> blocks', '<image></image>'.repeat(1000000)],
	])('scans a crafted document in linear time: %s', (_, dae) => {
		const started = Date.now()

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual([])
		// The regular expression this replaced took over a second on 200 KB of the first
		expect(Date.now() - started).toBeLessThan(1000)
	})

	it('reads an X3D ImageTexture url', () => {
		const x3d = `<X3D><Scene><Shape><Appearance>
			<ImageTexture url='"textures/wood.png"'/>
		</Appearance></Shape></Scene></X3D>`

		expect(parseXmlModelDependencies(x3d, 'x3d')).toEqual(['textures/wood.png'])
	})

	it('keeps every entry of an X3D fallback list, in order', () => {
		// url is an MFString: alternatives tried in order, any of which may be the
		// one that actually sits beside the model.
		const x3d = `<X3D><ImageTexture url='"a.png" "b.png"'/></X3D>`

		expect(parseXmlModelDependencies(x3d, 'x3d')).toEqual(['a.png', 'b.png'])
	})

	it('declares only the url of an X3D ImageTexture, the texture node the loader reads', () => {
		const x3d = `<X3D><Scene>
			<Anchor url='"#Top"' description="back to top"><Shape/></Anchor>
			<Inline url='"room.x3d"'/>
			<Sound><AudioClip url='"hum.wav"'/></Sound>
			<Script url='"logic.js"'/>
			<MovieTexture url='"clip.mp4"'/>
			<ImageTexture3D url='"volume.nrrd"'/>
			<Shape><Appearance><ImageTexture DEF="Wood" url='"wood.png"'/></Appearance></Shape>
		</Scene></X3D>`

		expect(parseXmlModelDependencies(x3d, 'x3d')).toEqual(['wood.png'])
	})

	it('decodes an entity-encoded X3D url and keeps a quoted name whole', () => {
		const x3d = `<X3D>
			<ImageTexture url="&quot;textures/wood grain.png&quot; &quot;wood.png&quot;"/>
			<ImageTexture url="bare.png"/>
			<ImageTexture solid="true" url='"a&amp;b.png"' repeatS="false"/>
		</X3D>`

		expect(parseXmlModelDependencies(x3d, 'x3d')).toEqual(['textures/wood grain.png', 'wood.png', 'bare.png', 'a&b.png'])
	})

	it('decodes entities in a COLLADA image path', () => {
		const dae = '<COLLADA><library_images><image id="a"><init_from>salt&amp;pepper.png</init_from></image></library_images></COLLADA>'

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual(['salt&pepper.png'])
	})

	it('reads url as an attribute, not as text inside another attribute\'s value', () => {
		const x3d = `<X3D><ImageTexture description='url="decoy.png"' url='"real.png"'/><ImageTexture title="url='also-decoy.png'"/></X3D>`

		expect(parseXmlModelDependencies(x3d, 'x3d')).toEqual(['real.png'])
	})

	it.each([
		['unclosed <ImageTexture starts', '<ImageTexture '.repeat(200000)],
		['one huge unterminated quoted value', `<ImageTexture url="${'<ImageTexture '.repeat(200000)}`],
		['unterminated values in one closed tag', `<ImageTexture ${'a="'.repeat(300000)}>`],
	])('scans a crafted X3D document in linear time: %s', (_, x3d) => {
		const started = Date.now()

		expect(parseXmlModelDependencies(x3d, 'x3d')).toEqual([])
		expect(Date.now() - started).toBeLessThan(500)
	})

	it('drops embedded and remote references', () => {
		const dae = `<COLLADA><library_images>
			<image><init_from>data:image/png;base64,AAAA</init_from></image>
			<image><init_from>https://example.invalid/remote.png</init_from></image>
			<image><init_from>http://example.invalid/remote.png</init_from></image>
			<image><init_from>ftp://example.invalid/remote.png</init_from></image>
			<image><init_from>blob:https://cloud.example.com/1234</init_from></image>
			<image><init_from>local.png</init_from></image>
		</library_images></COLLADA>`

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual(['local.png'])
	})

	it('declares a COLLADA image named by an absolute path by its bare name', () => {
		// SketchUp and 3ds Max write the path on the author's machine
		const dae = `<COLLADA><library_images>
			<image id="a"><init_from>C:\\Users\\anna\\Desktop\\textures\\wood.jpg</init_from></image>
			<image id="b"><init_from>C:/textures/metal.jpg</init_from></image>
			<image id="c"><init_from>file:///C:/My%20Textures/wood%20grain.jpg</init_from></image>
			<image id="d"><init_from>/home/anna/textures/stone.jpg</init_from></image>
			<image id="e"><init_from>\\\\server\\share\\brick.jpg</init_from></image>
			<image id="f"><init_from><ref>file://server/share/tile.jpg</ref></init_from></image>
		</library_images></COLLADA>`

		expect(parseXmlModelDependencies(dae, 'dae'))
			.toEqual(['wood.jpg', 'metal.jpg', 'wood grain.jpg', 'stone.jpg', 'brick.jpg', 'tile.jpg'])
	})

	it('declares an X3D url named by an absolute path by its bare name', () => {
		const x3d = `<X3D><Scene>
			<ImageTexture url='"file:///C:/x/checker%20board.png" "C:\\x\\checker.png"'/>
			<ImageTexture url="&quot;/home/anna/stone.png&quot; &quot;https://example.invalid/stone.png&quot;"/>
		</Scene></X3D>`

		expect(parseXmlModelDependencies(x3d, 'x3d')).toEqual(['checker board.png', 'checker.png', 'stone.png'])
	})

	it('decodes a file: URL\'s name once, not twice', () => {
		// %2520 is an encoded %20: the file is called "100%20.png"
		const dae = '<COLLADA><library_images><image><init_from>file:///C:/x/100%2520.png</init_from></image></library_images></COLLADA>'

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual(['100%20.png'])
	})

	it('refuses an absolute path whose name is no file name', () => {
		const dae = `<COLLADA><library_images>
			<image><init_from>C:\\textures\\</init_from></image>
			<image><init_from>/home/anna/..</init_from></image>
			<image><init_from>file:///C:/x/%2E%2E</init_from></image>
			<image><init_from>file:///C:/x/a%2Fwood.png</init_from></image>
		</library_images></COLLADA>`

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual([])
	})

	it('treats a reference that decodes to a scheme or a leading slash as the server does', () => {
		// The server decodes before it normalises, so the client has to as well
		const dae = `<COLLADA><library_images>
			<image><init_from>https%3A//example.invalid/remote.png</init_from></image>
			<image><init_from>%2Fhome%2Fanna%2Fwood.png</init_from></image>
		</library_images></COLLADA>`

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual(['wood.png'])
	})

	it('keeps relative paths as they were', () => {
		const dae = `<COLLADA><library_images>
			<image><init_from>textures/wood%20grain.png</init_from></image>
			<image><init_from>../shared/metal.png</init_from></image>
		</library_images></COLLADA>`

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual(['textures/wood grain.png', '../shared/metal.png'])
	})

	it('deduplicates a texture shared by several materials', () => {
		const dae = `<COLLADA><library_images>
			<image id="a"><init_from>wood.png</init_from></image>
			<image id="b"><init_from>wood.png</init_from></image>
		</library_images></COLLADA>`

		expect(parseXmlModelDependencies(dae, 'dae')).toEqual(['wood.png'])
	})

	it('returns nothing for a document that declares no textures', () => {
		expect(parseXmlModelDependencies('<COLLADA></COLLADA>', 'dae')).toEqual([])
	})

	it('survives content that is not XML at all', () => {
		expect(parseXmlModelDependencies('\0\x01binary junk', 'dae')).toEqual([])
	})
})
