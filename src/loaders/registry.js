// Loader registry maps file extension to async load handler factory.
// Each loader module exports a default async function (arrayBuffer, context) returning { object3D }
// context: { THREE, scene, renderer, applyWireframe(enabled), ensurePlaceholderRemoved(), hasDraco, hasKtx2, wireframe }

import { logger } from '../utils/logger.js'

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
	gcode: () => import('./types/gcode.js'),
	gco: () => import('./types/gcode.js'), // Alternative G-code extension
	nc: () => import('./types/gcode.js'), // CNC G-code extension
	acode: () => import('./types/gcode.js'), // AnkerMake G-code extension
	gx: () => import('./types/gcode.js'), // FlashForge G-code
	g: () => import('./types/gcode.js'), // Generic G-code
	g3drem: () => import('./types/gcode.js'), // Dremel G-code
	makerbot: () => import('./types/gcode.js'), // Makerbot G-code
	thing: () => import('./types/gcode.js'), // Makerbot Thing format
}

export async function loadModelByExtension(ext, arrayBuffer, context) {
	logger.info('LoaderRegistry', 'loading extension:', ext)
	const importer = loaders[ext]
	if (importer) {
		try {
			const mod = await importer()
			const LoaderClass = mod.default || Object.values(mod).find(e => typeof e === 'function' && e.prototype?.loadModel)

			if (LoaderClass && typeof LoaderClass === 'function' && LoaderClass.prototype.loadModel) {
				const loaderInstance = new LoaderClass()
				return loaderInstance.loadModel(arrayBuffer, context)
			}
		} catch (e) {
			logger.error('LoaderRegistry', 'error loading model', e)
			return Promise.reject(e)
		}
	}
	return Promise.reject(new Error(`No loader found for extension ${ext}`))
}

export function isSupportedExtension(ext) {
	return !!loaders[(ext || '').toLowerCase()]
}
