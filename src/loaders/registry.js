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
	console.log('[loader registry] loading extension:', ext)
	const importer = loaders[ext]
	if (importer) {
		try {
			const mod = await importer()
			console.log('[loader registry] imported module:', mod)
			console.log('[loader registry] module keys:', Object.keys(mod))
			for (const key in mod) {
				console.log(`[loader registry] module['${key}']:`, mod[key])
			}

			const LoaderClass = mod.default || Object.values(mod).find(e => typeof e === 'function' && e.prototype?.loadModel)
			console.log('[loader registry] found loader class:', LoaderClass)

			if (LoaderClass && typeof LoaderClass === 'function' && LoaderClass.prototype.loadModel) {
				const loaderInstance = new LoaderClass()
				return loaderInstance.loadModel(arrayBuffer, context)
			}
		} catch (e) {
			console.error('[loader registry] error loading model', e)
			return Promise.reject(e)
		}
	}
	return Promise.reject(new Error(`No loader found for extension ${ext}`))
}

export function isSupportedExtension(ext) {
	return !!loaders[(ext || '').toLowerCase()]
}
