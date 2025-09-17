import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export default async function loadGltf(arrayBuffer, context) {
	const { THREE, renderer, applyWireframe, ensurePlaceholderRemoved, hasDraco, hasKtx2, hasMeshopt, wireframe } = context
	const loader = new GLTFLoader()
	if (hasDraco) {
		try {
			const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js')
			const dracoLoader = new DRACOLoader()
		dracoLoader.setDecoderPath('/apps/threedviewer/decoder/')
			loader.setDRACOLoader(dracoLoader)
		} catch (e) { console.warn('[threedviewer] DRACO loader unavailable', e) }
	}
	if (hasKtx2) {
		try {
			const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
			const ktx2Loader = new KTX2Loader()
			ktx2Loader.setTranscoderPath('/apps/threedviewer/decoder/')
			ktx2Loader.detectSupport(renderer)
			loader.setKTX2Loader(ktx2Loader)
		} catch (e) { console.warn('[threedviewer] KTX2 loader unavailable', e) }
	}
	if (hasMeshopt) {
		try {
			const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js')
			if (MeshoptDecoder) {
				loader.setMeshoptDecoder(MeshoptDecoder)
			}
		} catch (e) { console.warn('[threedviewer] Meshopt decoder unavailable', e) }
	}
	return await new Promise((resolve, reject) => {
		loader.parse(arrayBuffer, '', gltf => {
			ensurePlaceholderRemoved()
			const object3D = gltf.scene
			applyWireframe(wireframe)
			resolve({ object3D })
		}, reject)
	})
}
