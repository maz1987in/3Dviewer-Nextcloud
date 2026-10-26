import { test, expect } from '@playwright/test'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/*
 * The background thumbnail worker, run for real: the built bundle, a module Worker, an
 * OffscreenCanvas and WebGL under SwiftShader. Every model format the viewer opens is
 * rendered through renderInWorker() — from tests/fixtures where there is one, from a
 * sample built below where there is not — and the PNG is read back pixel by pixel.
 * The XML formats (3MF, AMF, COLLADA, X3D) run on the worker's own DOMParser, which is
 * checked against hostile XML as well.
 *
 * Needs `npm run build` first. The server mounts the project root where Nextcloud serves
 * an app — custom_apps/ for an App Store install, apps/ for a bundled one — so a URL that
 * only resolves from the web root shows up here as a 404.
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

const APP_ROOTS = ['/custom_apps/threedviewer/', '/apps/threedviewer/']
const FIXTURES = 'tests/fixtures/'
// occt-import-js ships its own test models; nothing in tests/fixtures covers OCCT formats
const OCCT_SAMPLES = 'node_modules/occt-import-js/test/testfiles/'
// Built in beforeAll and served from memory
const GENERATED = '__generated__/'
const generated = new Map<string, Buffer>()
// Paths the server answered with a file, as requested
const served: string[] = []
// Every path the server was asked for, answered or not
const requested: string[] = []

/**
 * The smallest IFC web-ifc will tessellate: one proxy element holding a 2 × 1 × 3 m
 * extruded rectangle, with the project, units and context it needs.
 */
const BOX_IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('box.ifc','2026-10-26T00:00:00',(''),(''),'threedviewer-test','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Project',$,$,$,$,(#7),#4);
#2=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#3=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#4=IFCUNITASSIGNMENT((#2,#3));
#5=IFCCARTESIANPOINT((0.,0.,0.));
#6=IFCAXIS2PLACEMENT3D(#5,$,$);
#7=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#6,$);
#8=IFCLOCALPLACEMENT($,#6);
#9=IFCCARTESIANPOINT((0.,0.));
#10=IFCAXIS2PLACEMENT2D(#9,$);
#11=IFCRECTANGLEPROFILEDEF(.AREA.,$,#10,2.,1.);
#12=IFCDIRECTION((0.,0.,1.));
#13=IFCEXTRUDEDAREASOLID(#11,#6,#12,3.);
#14=IFCSHAPEREPRESENTATION(#7,'Body','SweptSolid',(#13));
#15=IFCPRODUCTDEFINITIONSHAPE($,$,(#14));
#16=IFCBUILDINGELEMENTPROXY('1kTvXnbbzCWw8lcMd1dR4o',$,'Box',$,$,#8,#15,$,$);
ENDSEC;
END-ISO-10303-21;
`

/**
 * Samples no fixture covers, made from what node_modules has.
 *
 * The FCStd: occt-import-js's cube.FCStd stores its body as PartShape.brp, as FreeCAD
 * does, and is rendered as it is. The same body under a `.brep` name, which some
 * exporters write, is built here so that path stays covered too.
 */
async function buildGeneratedSamples() {
  // @ts-ignore plain ES module without types
  const { unzipSync, zipSync } = await import('three/examples/jsm/libs/fflate.module.js')
  const cube = unzipSync(fs.readFileSync(path.join(PROJECT_ROOT, OCCT_SAMPLES, 'cube-fcstd/cube.FCStd')))
  generated.set('cube.FCStd', Buffer.from(zipSync({
    'Document.xml': cube['Document.xml'],
    'PartShape.brep': cube['PartShape.brp'],
  })))
  generated.set('box.ifc', Buffer.from(BOX_IFC))
  generated.set('triangle.glb', gltfToGlb(fs.readFileSync(path.join(PROJECT_ROOT, FIXTURES, 'triangle.gltf'), 'utf8')))
  generated.set('outside.gltf', Buffer.from(JSON.stringify(gltfNamingOutsideFiles())))
  generated.set('triangle.3ds', triangle3ds())
  generated.set('textured.3ds', textured3ds())
  generated.set('quad.3ds', textured3ds(false))
  for (const [name, text] of Object.entries(TEXT_SAMPLES)) {
    generated.set(name, Buffer.from(text))
  }
  generated.set('triangle.vrml', Buffer.from(TEXT_SAMPLES['triangle.wrl']))
  const threeMf = (model: string, extra: Record<string, Uint8Array> = {}) => Buffer.from(zipSync({
    '[Content_Types].xml': new TextEncoder().encode(TEXT_SAMPLES['3mf-content-types.xml']),
    '_rels/.rels': new TextEncoder().encode(TEXT_SAMPLES['3mf-rels.xml']),
    '3D/3dmodel.model': new TextEncoder().encode(model),
    ...extra,
  }))
  generated.set('triangle.3mf', threeMf(TEXT_SAMPLES['3mf-model.xml']))
  // The texture travels inside the archive, and the loader hands it over as a blob: URL
  // of its own making, which the worker allows
  generated.set('textured.3mf', threeMf(texturedQuad3mf(true), {
    '3D/_rels/3dmodel.model.rels': new TextEncoder().encode(TEXT_SAMPLES['3mf-model-rels.xml']),
    '3D/Texture/checker.png': new Uint8Array(fs.readFileSync(path.join(PROJECT_ROOT, FIXTURES, 'checker.png'))),
  }))
  generated.set('quad.3mf', threeMf(texturedQuad3mf(false)))
  generated.set('textured.x3d', Buffer.from(texturedQuadX3d(true)))
  generated.set('quad.x3d', Buffer.from(texturedQuadX3d(false)))
  generated.set('textured.dae', Buffer.from(texturedQuadDae('checker.png')))
  generated.set('quad.dae', Buffer.from(texturedQuadDae(null)))
  generated.set('remote-texture.dae', Buffer.from(texturedQuadDae('https://example.invalid/checker.png')))
  for (const [name, text] of Object.entries(HOSTILE_XML)) {
    generated.set(name, Buffer.from(text))
  }
}

/**
 * A unit quad as a 3MF model, mapped with /3D/Texture/checker.png from its own archive,
 * which the model's relationships (3mf-model-rels.xml) name.
 *
 * @param withMap - False for the same quad without the texture
 */
function texturedQuad3mf(withMap: boolean): string {
  const material = withMap
    ? `<m:texture2d id="2" path="/3D/Texture/checker.png" contenttype="image/png"/>
<m:texture2dgroup id="3" texid="2"><m:tex2coord u="0" v="0"/><m:tex2coord u="1" v="0"/><m:tex2coord u="1" v="1"/><m:tex2coord u="0" v="1"/></m:texture2dgroup>`
    : ''
  const props = (a: number, b: number, c: number) => (withMap ? ` p1="${a}" p2="${b}" p3="${c}"` : '')
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"><resources>${material}
<object id="1" type="model"${withMap ? ' pid="3" pindex="0"' : ''}><mesh>
<vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="1" y="1" z="0"/><vertex x="0" y="1" z="0"/></vertices>
<triangles><triangle v1="0" v2="1" v3="2"${props(0, 1, 2)}/><triangle v1="0" v2="2" v3="3"${props(0, 2, 3)}/></triangles>
</mesh></object></resources><build><item objectid="1"/></build></model>
`
}

/**
 * A unit quad as X3D, mapped with checker.png.
 *
 * @param withMap - False for the same quad without the texture
 */
function texturedQuadX3d(withMap: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<X3D profile="Interchange" version="3.3"><Scene><Shape>
<Appearance><Material diffuseColor="0.8 0.8 0.8"/>${withMap ? '<ImageTexture url=\'"checker.png"\'/>' : ''}</Appearance>
<IndexedFaceSet coordIndex="0 1 2 3 -1" texCoordIndex="0 1 2 3 -1" solid="false"><Coordinate point="0 0 0 1 0 0 1 1 0 0 1 0"/><TextureCoordinate point="0 0 1 0 1 1 0 1"/></IndexedFaceSet>
</Shape></Scene></X3D>
`
}

/**
 * A unit quad as COLLADA, mapped with the image at `texture`.
 *
 * @param texture - What <init_from> names, or null for the quad with a plain colour
 */
function texturedQuadDae(texture: string | null): string {
  const images = texture ? `<library_images><image id="img"><init_from>${texture}</init_from></image></library_images>` : ''
  const diffuse = texture ? '<texture texture="samp" texcoord="UV"/>' : '<color>0.8 0.8 0.8 1</color>'
  const params = texture
    ? '<newparam sid="surf"><surface type="2D"><init_from>img</init_from></surface></newparam><newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam>'
    : ''
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><up_axis>Y_UP</up_axis></asset>
${images}
<library_effects><effect id="fx"><profile_COMMON>${params}<technique sid="common"><lambert><diffuse>${diffuse}</diffuse></lambert></technique></profile_COMMON></effect></library_effects>
<library_materials><material id="mat"><instance_effect url="#fx"/></material></library_materials>
<library_geometries><geometry id="quad"><mesh>
<source id="pos"><float_array id="pos-a" count="12">0 0 0 1 0 0 1 1 0 0 1 0</float_array><technique_common><accessor source="#pos-a" count="4" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<source id="uv"><float_array id="uv-a" count="8">0 0 1 0 1 1 0 1</float_array><technique_common><accessor source="#uv-a" count="4" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>
<vertices id="v"><input semantic="POSITION" source="#pos"/></vertices>
<triangles count="2" material="m"><input semantic="VERTEX" source="#v" offset="0"/><input semantic="TEXCOORD" source="#uv" offset="0" set="0"/><p>0 1 2 0 2 3</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="s"><node id="n"><instance_geometry url="#quad"><bind_material><technique_common><instance_material symbol="m" target="#mat"><bind_vertex_input semantic="UV" input_semantic="TEXCOORD" input_set="0"/></instance_material></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene>
</COLLADA>
`
}

/**
 * The X3D triangle of TEXT_SAMPLES with a document type declaration before its root.
 *
 * @param doctype - The declaration
 */
function x3dWithDoctype(doctype: string): string {
  return TEXT_SAMPLES['triangle.x3d'].replace('<X3D ', `${doctype}\n<X3D `)
}

/**
 * The triangle, with a texture at another host and a second buffer above the model's
 * folder: references a model in a shared folder can make, and that must not turn into
 * requests from the browser of whoever happens to browse it.
 */
function gltfNamingOutsideFiles() {
  const json = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, FIXTURES, 'triangle.gltf'), 'utf8'))
  json.buffers.push({ uri: '../../other.bin', byteLength: 24 })
  json.bufferViews.push({ buffer: 1, byteOffset: 0, byteLength: 24, target: 34962 })
  json.accessors.push({ bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' })
  json.meshes[0].primitives[0].attributes.TEXCOORD_0 = 1
  json.meshes[0].primitives[0].material = 0
  json.images = [{ uri: 'https://example.invalid/x.png' }]
  json.textures = [{ source: 0 }]
  json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }]
  return json
}

/**
 * Pack a glTF whose one buffer is a data: URI into a GLB.
 *
 * @param text - The glTF JSON
 */
function gltfToGlb(text: string): Buffer {
  const json = JSON.parse(text)
  const bin = Buffer.from(json.buffers[0].uri.split(',')[1], 'base64')
  json.buffers = [{ byteLength: bin.length }]
  const pad = (buffer: Buffer, fill: number) => Buffer.concat([buffer, Buffer.alloc((4 - buffer.length % 4) % 4, fill)])
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20)
  const binChunk = pad(bin, 0)
  const chunk = (type: number, data: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32LE(data.length, 0)
    head.writeUInt32LE(type, 4)
    return Buffer.concat([head, data])
  }
  const body = Buffer.concat([chunk(0x4E4F534A, jsonChunk), chunk(0x004E4942, binChunk)])
  const header = Buffer.alloc(12)
  header.write('glTF', 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + body.length, 8)
  return Buffer.concat([header, body])
}

/** A one-triangle 3DS: main → editor → object "tri" → trimesh with vertices and a face. */
function triangle3ds(): Buffer {
  const chunk = (id: number, ...parts: Buffer[]) => {
    const data = Buffer.concat(parts)
    const head = Buffer.alloc(6)
    head.writeUInt16LE(id, 0)
    head.writeUInt32LE(6 + data.length, 2)
    return Buffer.concat([head, data])
  }
  const vertices = Buffer.alloc(2 + 9 * 4)
  vertices.writeUInt16LE(3, 0);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => vertices.writeFloatLE(v, 2 + i * 4))
  const faces = Buffer.alloc(2 + 8)
  faces.writeUInt16LE(1, 0);
  [0, 1, 2, 0].forEach((v, i) => faces.writeUInt16LE(v, 2 + i * 2))
  const version = Buffer.alloc(4)
  version.writeUInt32LE(3, 0)
  return chunk(0x4D4D,
    chunk(0x0002, version),
    chunk(0x3D3D,
      chunk(0x4000, Buffer.from('tri\0', 'latin1'),
        chunk(0x4100, chunk(0x4110, vertices), chunk(0x4120, faces)))))
}

/**
 * A unit quad mapped with checker.png through a 3DS material, so the texture goes
 * through three's TextureLoader, as it does for FBX, 3DM and VRML.
 *
 * @param withMap - False for the same quad and material without the texture
 */
function textured3ds(withMap = true): Buffer {
  const chunk = (id: number, ...parts: Buffer[]) => {
    const data = Buffer.concat(parts)
    const head = Buffer.alloc(6)
    head.writeUInt16LE(id, 0)
    head.writeUInt32LE(6 + data.length, 2)
    return Buffer.concat([head, data])
  }
  const words = (...values: number[]) => {
    const buffer = Buffer.alloc(values.length * 2)
    values.forEach((v, i) => buffer.writeUInt16LE(v, i * 2))
    return buffer
  }
  const floats = (...values: number[]) => {
    const buffer = Buffer.alloc(values.length * 4)
    values.forEach((v, i) => buffer.writeFloatLE(v, i * 4))
    return buffer
  }
  const name = (text: string) => Buffer.from(`${text}\0`, 'latin1')
  const material = withMap
    ? chunk(0xAFFF, chunk(0xA000, name('checker')), chunk(0xA200, chunk(0xA300, name('checker.png'))))
    : chunk(0xAFFF, chunk(0xA000, name('checker')))
  const mesh = chunk(0x4100,
    chunk(0x4110, words(4), floats(0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0)),
    chunk(0x4140, words(4), floats(0, 0, 1, 0, 1, 1, 0, 1)),
    chunk(0x4120, words(2, 0, 1, 2, 0, 0, 2, 3, 0),
      chunk(0x4130, name('checker'), words(2, 0, 1))))
  return chunk(0x4D4D, chunk(0x3D3D, material, chunk(0x4000, name('quad'), mesh)))
}

/** One triangle (or, for G-code, one square of extrusion) per text format. */
const TEXT_SAMPLES: Record<string, string> = {
  'triangle.wrl': `#VRML V2.0 utf8
Shape {
  appearance Appearance { material Material { diffuseColor 0.8 0.4 0.2 } }
  geometry IndexedFaceSet { solid FALSE coord Coordinate { point [ 0 0 0, 1 0 0, 0 1 0 ] } coordIndex [ 0, 1, 2, -1 ] }
}
`,
  'square.gcode': `G21
G90
M82
G1 Z0.2 F1200
G1 X0 Y0 E0 F1800
G1 X10 Y0 E1
G1 X10 Y10 E2
G1 X0 Y10 E3
G1 X0 Y0 E4
`,
  'triangle.fbx': `; FBX 7.4.0 project file
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7400
}
Objects:  {
	Geometry: 1000, "Geometry::tri", "Mesh" {
		Vertices: *9 {
			a: 0,0,0,1,0,0,0,1,0
		}
		PolygonVertexIndex: *3 {
			a: 0,1,-3
		}
	}
	Model: 2000, "Model::tri", "Mesh" {
	}
}
Connections:  {
	C: "OO",1000,2000
	C: "OO",2000,0
}
`,
  'triangle.x3d': `<?xml version="1.0" encoding="UTF-8"?>
<X3D profile="Interchange" version="3.3"><Scene><Shape>
<Appearance><Material diffuseColor="0.8 0.4 0.2"/></Appearance>
<IndexedFaceSet coordIndex="0 1 2 -1" solid="false"><Coordinate point="0 0 0 1 0 0 0 1 0"/></IndexedFaceSet>
</Shape></Scene></X3D>
`,
  'triangle.dae': `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><up_axis>Y_UP</up_axis></asset>
<library_geometries><geometry id="tri"><mesh>
<source id="pos"><float_array id="pos-a" count="9">0 0 0 1 0 0 0 1 0</float_array>
<technique_common><accessor source="#pos-a" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<vertices id="v"><input semantic="POSITION" source="#pos"/></vertices>
<triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="s"><node id="n"><instance_geometry url="#tri"/></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene>
</COLLADA>
`,
  'triangle.amf': `<?xml version="1.0" encoding="UTF-8"?>
<amf unit="millimeter"><object id="0"><mesh>
<vertices><vertex><coordinates><x>0</x><y>0</y><z>0</z></coordinates></vertex><vertex><coordinates><x>1</x><y>0</y><z>0</z></coordinates></vertex><vertex><coordinates><x>0</x><y>1</y><z>0</z></coordinates></vertex></vertices>
<volume><triangle><v1>0</v1><v2>1</v2><v3>2</v3></triangle></volume>
</mesh></object></amf>
`,
  '3mf-content-types.xml': `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>
`,
  '3mf-rels.xml': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>
`,
  '3mf-model-rels.xml': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/Texture/checker.png" Id="rel1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dtexture"/></Relationships>
`,
  '3mf-model.xml': `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh>
<vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices>
<triangles><triangle v1="0" v2="1" v3="2"/></triangles>
</mesh></object></resources><build><item objectid="1"/></build></model>
`,
}

/** Ten levels of ten: a billion `lol`s, if a parser expanded the entities it declares. */
const BILLION_LAUGHS_DTD = `<!DOCTYPE X3D [
<!ENTITY lol "lol">
${Array.from({ length: 9 }, (_, i) => `<!ENTITY lol${i + 1} "${`&lol${i || ''};`.repeat(10)}">`).join('\n')}
]>`

/**
 * XML a model in a shared folder could carry against the worker's parser. None of it may
 * make a request, and none may run past the time limit.
 */
const HOSTILE_XML: Record<string, string> = {
  // Entities that would expand to a gigabyte of text
  'billion-laughs.x3d': x3dWithDoctype(BILLION_LAUGHS_DTD)
    .replace('<Material diffuseColor="0.8 0.4 0.2"/>', '<Material DEF="&lol9;" diffuseColor="0.8 0.4 0.2"/>'),
  'billion-laughs.dae': TEXT_SAMPLES['triangle.dae']
    .replace('<COLLADA ', `${BILLION_LAUGHS_DTD.replace('X3D', 'COLLADA')}\n<COLLADA `)
    .replace('<up_axis>Y_UP</up_axis>', '<up_axis>Y_UP</up_axis><contributor><author>&lol9;</author></contributor>'),
  // An entity whose text is at another host, and one read from the local disk
  'external-entity.x3d': x3dWithDoctype('<!DOCTYPE X3D [<!ENTITY ext SYSTEM "https://example.invalid/entity.xml">]>')
    .replace('<Scene>', '<Scene><WorldInfo title="&ext;"/>'),
  'file-entity.dae': TEXT_SAMPLES['triangle.dae']
    .replace('<COLLADA ', '<!DOCTYPE COLLADA [<!ENTITY ext SYSTEM "file:///etc/passwd">]>\n<COLLADA ')
    .replace('<up_axis>Y_UP</up_axis>', '<up_axis>Y_UP</up_axis><contributor><author>&ext;</author></contributor>'),
  // The DTD every X3D exporter names, which a validating parser would download
  'external-dtd.x3d': x3dWithDoctype('<!DOCTYPE X3D PUBLIC "ISO//Web3D//DTD X3D 3.3//EN" "https://example.invalid/x3d-3.3.dtd">'),
}

const CONTENT_TYPES: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.css': 'text/css',
}

interface Sample {
  /** Test title */
  name: string
  /** Extension handed to the loader */
  extension: string
  /** Model file first, then its companions; paths relative to the project root */
  files: string[]
}

const SAMPLES: Sample[] = [
  { name: 'stl', extension: 'stl', files: [`${FIXTURES}triangle.stl`] },
  { name: 'obj + mtl', extension: 'obj', files: [`${FIXTURES}triangle.obj`, `${FIXTURES}triangle.mtl`] },
  { name: 'ply', extension: 'ply', files: [`${FIXTURES}triangle.ply`] },
  { name: 'gltf', extension: 'gltf', files: [`${FIXTURES}triangle.gltf`] },
  { name: 'off', extension: 'off', files: [`${FIXTURES}tetrahedron.off`] },
  { name: 'bim', extension: 'bim', files: [`${FIXTURES}quad.bim`] },
  { name: '3dm', extension: '3dm', files: [`${FIXTURES}shapes.3dm`] },
  {
    name: 'textured obj',
    extension: 'obj',
    files: [`${FIXTURES}textured.obj`, `${FIXTURES}textured.mtl`, `${FIXTURES}checker.png`],
  },
  { name: 'step', extension: 'step', files: [`${OCCT_SAMPLES}cube-fcstd/cube.step`] },
  { name: 'stp', extension: 'stp', files: [`${OCCT_SAMPLES}cube-10x10mm/Cube 10x10.stp`] },
  { name: 'iges', extension: 'igs', files: [`${OCCT_SAMPLES}cube-10x10mm/Cube 10x10.igs`] },
  { name: 'brep', extension: 'brep', files: [`${OCCT_SAMPLES}cax-if-brep/as1_pe_203.brep`] },
  { name: 'fcstd', extension: 'fcstd', files: [`${OCCT_SAMPLES}cube-fcstd/cube.FCStd`] },
  { name: 'fcstd (.brep entries)', extension: 'fcstd', files: [`${GENERATED}cube.FCStd`] },
  { name: 'ifc', extension: 'ifc', files: [`${GENERATED}box.ifc`] },
  // No fixture for these either; each is the smallest file of its kind, made below
  { name: 'glb', extension: 'glb', files: [`${GENERATED}triangle.glb`] },
  { name: '3ds', extension: '3ds', files: [`${GENERATED}triangle.3ds`] },
  { name: 'fbx', extension: 'fbx', files: [`${GENERATED}triangle.fbx`] },
  { name: 'gcode', extension: 'gcode', files: [`${GENERATED}square.gcode`] },
  { name: 'wrl', extension: 'wrl', files: [`${GENERATED}triangle.wrl`] },
  { name: 'vrml', extension: 'vrml', files: [`${GENERATED}triangle.vrml`] },
  // The XML formats, parsed with the worker's own DOMParser
  { name: 'x3d', extension: 'x3d', files: [`${GENERATED}triangle.x3d`] },
  { name: 'dae', extension: 'dae', files: [`${GENERATED}triangle.dae`] },
  { name: 'amf', extension: 'amf', files: [`${GENERATED}triangle.amf`] },
  { name: '3mf', extension: '3mf', files: [`${GENERATED}triangle.3mf`] },
]

function startStaticServer(): Promise<{ origin: string, close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqPath = decodeURIComponent((req.url || '/').split('?')[0])
      requested.push(reqPath)
      const appRoot = APP_ROOTS.find(root => reqPath.startsWith(root))
      if (!appRoot) {
        res.writeHead(404); res.end('Not found'); return
      }
      const rest = reqPath.slice(appRoot.length)
      if (rest === '' || rest === 'index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(buildHtmlWrapper(appRoot))
        return
      }
      if (rest.startsWith(GENERATED) && generated.has(rest.slice(GENERATED.length))) {
        served.push(reqPath)
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        res.end(generated.get(rest.slice(GENERATED.length)))
        return
      }
      const filePath = path.join(PROJECT_ROOT, rest)
      if (!filePath.startsWith(PROJECT_ROOT + path.sep)) {
        res.writeHead(403); res.end('Forbidden'); return
      }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return }
        served.push(reqPath)
        const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': type })
        res.end(data)
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        resolve({
          origin: `http://127.0.0.1:${addr.port}`,
          close: () => new Promise(r => server.close(() => r())),
        })
      } else {
        reject(new Error('No address'))
      }
    })
  })
}

/**
 * The page Nextcloud would serve, reduced to what the entry chunk reads: the app's web
 * root, OC.filePath for dynamic chunks, and the test flag, all set before the bundle.
 *
 * @param appRoot - Where the app is mounted, with a trailing slash
 */
function buildHtmlWrapper(appRoot: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Thumbnail worker</title></head>
<body>
<script>
  window.__THREEDVIEWER_TEST__ = true
  window.t = (_app, s) => s
  window.n = (_app, s) => s
  window._oc_webroot = ''
  window._oc_appswebroots = { threedviewer: ${JSON.stringify(appRoot.slice(0, -1))} }
  window.OC = {
    config: { version: 'test' },
    coreApps: [],
    filePath: (_app, type, file) => ${JSON.stringify(appRoot)} + (type ? type + '/' : '') + file,
  }
  window.OCA = {}
</script>
<script type="module" src="${appRoot}js/threedviewer-main.mjs"></script>
</body></html>`
}

interface RenderOutcome {
  ok: boolean
  error?: string
  errorName?: string
  type?: string
  width?: number
  height?: number
  /** Pixels with any coverage */
  covered?: number
  /** Alpha of pixel (0,0) */
  cornerAlpha?: number
  /** Distinct colours among covered pixels, coarsely quantised */
  colours?: number
}

/**
 * Render one sample in the worker and read the PNG back.
 *
 * @param page - Playwright page with the harness loaded
 * @param appRoot - Where the app is mounted
 * @param sample - What to render
 * @param timeoutMs - The render's time limit
 */
async function renderSample(page, appRoot: string, sample: Sample, timeoutMs = 30000): Promise<RenderOutcome> {
  const urls = sample.files.map(file => appRoot + file.split('/').map(encodeURIComponent).join('/'))
  return await page.evaluate(async ({ urls, extension, timeoutMs }) => {
    // @ts-ignore test hook
    const api = window.__threedviewerThumbnails
    const files = await Promise.all(urls.map(async (url) => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`${url}: HTTP ${response.status}`)
      }
      return new File([await response.arrayBuffer()], decodeURIComponent(url.split('/').pop()))
    }))
    const [model, ...additionalFiles] = files
    try {
      const blob = await api.renderInWorker(
        { extension, buffer: await model.arrayBuffer(), additionalFiles },
        { timeoutMs },
      )
      const bitmap = await createImageBitmap(blob)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      context.drawImage(bitmap, 0, 0)
      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
      let covered = 0
      const colours = new Set()
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          covered++
          colours.add(`${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`)
        }
      }
      return {
        ok: true,
        type: blob.type,
        width: bitmap.width,
        height: bitmap.height,
        covered,
        cornerAlpha: data[3],
        colours: colours.size,
      }
    } catch (error) {
      return { ok: false, error: String(error?.message || error), errorName: error?.name }
    }
  }, { urls, extension: sample.extension, timeoutMs })
}

/*
 * Errors the page and its workers log during the current test. Several tests make a
 * render fail on purpose, so these are kept quiet and attached only to a failing test.
 */
let browserErrors: string[] = []

async function openHarness(page, origin: string, appRoot: string) {
  page.on('pageerror', err => browserErrors.push(`[pageerror] ${err?.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      browserErrors.push(`[console.error] ${msg.text()}`)
    }
  })
  await page.goto(origin + appRoot)
  // @ts-ignore test hook
  await page.waitForFunction(() => !!window.__threedviewerThumbnails, null, { timeout: 15000 })
}

test.describe('thumbnail worker', () => {
  let server: { origin: string, close: () => Promise<void> }

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(PROJECT_ROOT, 'js', 'threedviewer-main.mjs'))) {
      throw new Error('Run `npm run build` first: js/threedviewer-main.mjs is missing')
    }
    await buildGeneratedSamples()
    server = await startStaticServer()
  })

  test.afterAll(async () => {
    await server?.close()
  })

  test.beforeEach(() => {
    browserErrors = []
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && browserErrors.length > 0) {
      await testInfo.attach('browser errors', { body: browserErrors.join('\n'), contentType: 'text/plain' })
    }
  })

  test.describe('every model format renders in the worker', () => {
    const appRoot = APP_ROOTS[0]

    for (const sample of SAMPLES) {
      test(sample.name, async ({ page }) => {
        test.setTimeout(60000)
        await openHarness(page, server.origin, appRoot)

        // @ts-ignore test hook
        expect(await page.evaluate(ext => window.__threedviewerThumbnails.canRenderInBackground(ext), sample.extension))
          .toBe(true)

        const outcome = await renderSample(page, appRoot, sample)

        expect(outcome.error).toBeUndefined()
        expect(outcome).toMatchObject({ ok: true, type: 'image/png', width: 512, height: 512 })
        expect(outcome.covered).toBeGreaterThan(0)
        // Transparent background: the corner is outside any framed model
        expect(outcome.cornerAlpha).toBe(0)
      })
    }

    test('textured obj keeps its texture', async ({ page }) => {
      await openHarness(page, server.origin, appRoot)
      const textured = SAMPLES.find(s => s.name === 'textured obj')
      const untextured = { ...textured, files: textured.files.filter(f => !f.endsWith('.png')) }

      const withMap = await renderSample(page, appRoot, textured)
      const withoutMap = await renderSample(page, appRoot, untextured)

      // The OBJ loader decodes its maps through an <img>, which a worker lacks, and
      // decodes a bitmap there instead; if that broke, the two would come out alike
      expect(withMap.ok && withoutMap.ok).toBe(true)
      expect(withMap.colours).toBeGreaterThan(withoutMap.colours)
    })
  })

  test('textured 3ds keeps its texture', async ({ page }) => {
    const appRoot = APP_ROOTS[0]
    await openHarness(page, server.origin, appRoot)
    const model = { name: 'textured 3ds', extension: '3ds', files: [`${GENERATED}textured.3ds`] }

    const withMap = await renderSample(page, appRoot, { ...model, files: [...model.files, `${FIXTURES}checker.png`] })
    const withoutMap = await renderSample(page, appRoot, { name: 'untextured 3ds', extension: '3ds', files: [`${GENERATED}quad.3ds`] })
    const mapNotHanded = await renderSample(page, appRoot, model)

    // three's TextureLoader decodes through an <img>, which a worker lacks; the
    // worker swaps in a bitmap decoder so the texture survives
    expect(withMap.error).toBeUndefined()
    expect(withoutMap.error).toBeUndefined()
    expect(withMap.colours).toBeGreaterThan(withoutMap.colours)
    // A texture the job was not handed is not fetched by its name, and fails the job
    expect(mapNotHanded).toMatchObject({ ok: false, error: "Refused to load checker.png: not one of the model's files" })
  })

  test('gltf (draco): the decoder loads from the app root', async ({ page }) => {
    const appRoot = APP_ROOTS[0]
    await openHarness(page, server.origin, appRoot)
    served.length = 0

    const outcome = await renderSample(page, appRoot, {
      name: 'gltf (draco)',
      extension: 'gltf',
      files: [`${FIXTURES}triangle-draco.gltf`],
    })

    // Fetched by the worker itself, so this also shows the app root reached it
    expect(served).toContain(`${appRoot}draco/draco_decoder.wasm`)
    // The fixture declares no scene and carries a 4-byte payload, so no loader makes a
    // model of it, on the page or in a worker; it can only show the decoder is reachable
    expect(outcome.error).toBe('Invalid 3D object loaded')
  })

  test('a model naming files it was not handed makes no request for them, and fails to load', async ({ page }) => {
    const appRoot = APP_ROOTS[0]
    const fromBrowser: string[] = []
    page.on('request', request => fromBrowser.push(request.url()))
    // Anything bound for another host is stopped here, and kept
    const elsewhere: string[] = []
    await page.context().route(url => url.origin !== server.origin, (route) => {
      elsewhere.push(route.request().url())
      return route.abort()
    })
    await openHarness(page, server.origin, appRoot)
    fromBrowser.length = 0
    requested.length = 0

    const outcome = await renderSample(page, appRoot, {
      name: 'gltf naming outside files',
      extension: 'gltf',
      files: [`${GENERATED}outside.gltf`],
    })

    // What may be asked for: the sample the page fetched for the test, the worker
    // script and its chunks, and the decoders
    const allowed = new RegExp(`^${appRoot}(${GENERATED}outside\\.gltf|js/.+|(draco|basis|rhino3dm|occt|web-ifc)/.+)$`)
    expect.soft(elsewhere).toEqual([])
    expect.soft(requested.filter(reqPath => !allowed.test(reqPath))).toEqual([])
    expect.soft(fromBrowser.filter(url => !allowed.test(url.slice(server.origin.length)))).toEqual([])
    // A refusal, which skips the file and stays out of the breaker; not an environment
    // error, which would retry it
    expect(outcome).toMatchObject({ ok: false, errorName: 'ThumbnailRefusedError' })
    expect(outcome.error).toMatch(/^Refused to load .*: not one of the model's files$/)

    // The same logs do see what a worker asks for, and a decoder is still allowed: a 3DM
    // renders only once rhino3dm has been fetched from the app root
    const control = await renderSample(page, appRoot, SAMPLES.find(s => s.name === '3dm'))
    expect(control.error).toBeUndefined()
    expect(requested).toContain(`${appRoot}rhino3dm/rhino3dm.wasm`)
    expect(fromBrowser).toContain(`${server.origin}${appRoot}rhino3dm/rhino3dm.wasm`)
  })

  test('loads from apps/ as well as custom_apps/', async ({ page }) => {
    const appRoot = APP_ROOTS[1]
    await openHarness(page, server.origin, appRoot)

    // 3dm fetches rhino3dm from the app root, so this covers decoder paths too
    for (const sample of SAMPLES.filter(s => s.name === 'stl' || s.name === '3dm')) {
      const outcome = await renderSample(page, appRoot, sample)
      expect(outcome.error).toBeUndefined()
      expect(outcome.covered).toBeGreaterThan(0)
    }
  })

  test('3mf, x3d and dae keep their textures', async ({ page }) => {
    const appRoot = APP_ROOTS[0]
    await openHarness(page, server.origin, appRoot)
    const checker = `${FIXTURES}checker.png`

    for (const [extension, textured, plain] of [
      // The 3MF carries its texture; the others are handed it, as the queue would
      ['3mf', [`${GENERATED}textured.3mf`], [`${GENERATED}quad.3mf`]],
      ['x3d', [`${GENERATED}textured.x3d`, checker], [`${GENERATED}quad.x3d`]],
      ['dae', [`${GENERATED}textured.dae`, checker], [`${GENERATED}quad.dae`]],
    ]) {
      const withMap = await renderSample(page, appRoot, { name: `textured ${extension}`, extension, files: textured })
      const withoutMap = await renderSample(page, appRoot, { name: `plain ${extension}`, extension, files: plain })

      expect(withMap.error, extension).toBeUndefined()
      expect(withoutMap.error, extension).toBeUndefined()
      expect(withMap.colours, extension).toBeGreaterThan(withoutMap.colours)
    }
  })

  test('a dae texture goes through the URL guard, and one not handed fails the job', async ({ page }) => {
    const appRoot = APP_ROOTS[0]
    const elsewhere: string[] = []
    await page.context().route(url => url.origin !== server.origin, (route) => {
      elsewhere.push(route.request().url())
      return route.abort()
    })
    await openHarness(page, server.origin, appRoot)
    requested.length = 0

    const notHanded = await renderSample(page, appRoot, { name: 'dae', extension: 'dae', files: [`${GENERATED}textured.dae`] })
    const remote = await renderSample(page, appRoot, { name: 'dae', extension: 'dae', files: [`${GENERATED}remote-texture.dae`] })

    // COLLADA loads its images through three's TextureLoader, which the worker decodes
    // with the guard in the way: neither is fetched, and both fail as refusals
    expect(notHanded).toMatchObject({ ok: false, errorName: 'ThumbnailRefusedError', error: "Refused to load checker.png: not one of the model's files" })
    expect(remote).toMatchObject({ ok: false, errorName: 'ThumbnailRefusedError' })
    expect(remote.error).toContain('https://example.invalid/checker.png')
    expect(elsewhere).toEqual([])
    expect(requested.filter(reqPath => reqPath.endsWith('checker.png'))).toEqual([])
  })

  test('an x3d texture that was not handed is not requested', async ({ page }) => {
    const appRoot = APP_ROOTS[0]
    await openHarness(page, server.origin, appRoot)
    requested.length = 0

    const outcome = await renderSample(page, appRoot, { name: 'x3d', extension: 'x3d', files: [`${GENERATED}textured.x3d`] })

    // The X3D loader maps only the images it was handed. The queue never gets this far
    // without one the model names: a declared companion it could not fetch skips the file
    expect(outcome.error).toBeUndefined()
    expect(requested.filter(reqPath => reqPath.endsWith('checker.png'))).toEqual([])
  })

  test('hostile XML neither makes a request nor runs to the time limit', async ({ page }) => {
    const appRoot = APP_ROOTS[0]
    const elsewhere: string[] = []
    await page.context().route(url => url.origin !== server.origin, (route) => {
      elsewhere.push(route.request().url())
      return route.abort()
    })
    await openHarness(page, server.origin, appRoot)
    requested.length = 0

    for (const name of ['billion-laughs.x3d', 'billion-laughs.dae', 'external-entity.x3d', 'file-entity.dae']) {
      const started = Date.now()
      const outcome = await renderSample(page, appRoot, { name, extension: name.split('.').pop(), files: [`${GENERATED}${name}`] })

      // The parser expands no entity a document declares and loads none from elsewhere,
      // so each one is a parse error, reported at once rather than at the limit
      expect(outcome.ok, name).toBe(false)
      expect(outcome.errorName, name).not.toBe('ThumbnailTimeoutError')
      expect(Date.now() - started, name).toBeLessThan(10000)
    }
    // A document type naming an external DTD is fine, as long as nothing fetches it
    const withDtd = await renderSample(page, appRoot, { name: 'x3d', extension: 'x3d', files: [`${GENERATED}external-dtd.x3d`] })
    expect(withDtd.error).toBeUndefined()
    expect(withDtd.covered).toBeGreaterThan(0)
    expect(elsewhere).toEqual([])
    expect(requested.filter(reqPath => !reqPath.startsWith(`${appRoot}js/`) && !reqPath.startsWith(`${appRoot}${GENERATED}`))).toEqual([])
  })

  test('a render past its time limit is stopped', async ({ page }) => {
    await openHarness(page, server.origin, APP_ROOTS[0])
    const step = SAMPLES.find(s => s.name === 'step')

    // No worker gets as far as a result in 1 ms; the job must end at the limit regardless
    const outcome = await renderSample(page, APP_ROOTS[0], step, 1)

    expect(outcome).toMatchObject({ ok: false, errorName: 'ThumbnailTimeoutError' })
  })

  test('the capability probe finds WebGL 2 in the worker', async ({ page }) => {
    await openHarness(page, server.origin, APP_ROOTS[0])

    // @ts-ignore test hook
    const capable = await page.evaluate(() => window.__threedviewerThumbnails.probeWorkerRendering({ timeoutMs: 30000 }))

    expect(capable).toBe(true)
  })

  test('the ambiguous G-code extensions are left to the viewer', async ({ page }) => {
    await openHarness(page, server.origin, APP_ROOTS[0])

    const gate = await page.evaluate(() => {
      // @ts-ignore test hook
      const api = window.__threedviewerThumbnails
      return ['nc', 'g', 'gcode'].map(ext => [ext, api.isThumbnailFormat(ext), api.canRenderInBackground(ext)])
    })

    expect(gate).toEqual([['nc', true, false], ['g', true, false], ['gcode', true, true]])
  })
})
