// Loader registry maps file extension to async load handler factory.
// Each loader module exports a default async function (arrayBuffer, context) returning { object3D }
// context: { THREE, scene, renderer, applyWireframe(enabled), ensurePlaceholderRemoved(), hasDraco, hasKtx2, wireframe }

const loaders = {
	gltf: () => import('./types/gltf.js'),
	glb: () => import('./types/gltf.js'),
	stl: () => import('./types/stl.js'),
	ply: () => import('./types/ply.js'),
	obj: () => import('./types/obj.js'),
	fbx: () => import('./types/fbx.js'),
	'3mf': () => import('./types/threeMF.js'),
	'3ds': () => import('./types/threeDS.js'),
	dae: () => import('./types/dae.js'),
	x3d: () => import('./types/x3d.js'),
	vrml: () => import('./types/vrml.js'),
	wrl: () => import('./types/vrml.js'), // VRML files can have .wrl extension
}

export async function loadModelByExtension(ext, arrayBuffer, context) {
	const key = (ext || '').toLowerCase()
	const importer = loaders[key]
	if (!importer) throw new Error(`Unsupported extension: ${ext}`)
	const mod = await importer()
	return mod.default(arrayBuffer, context)
}

export function isSupportedExtension(ext) {
	return !!loaders[(ext || '').toLowerCase()]
}
