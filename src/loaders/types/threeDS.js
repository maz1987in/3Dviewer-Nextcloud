import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js'

export default async function loadThreeDS(arrayBuffer, context) {
	const { THREE, applyWireframe, ensurePlaceholderRemoved, wireframe } = context
	
	try {
		// Create 3DS loader
		const loader = new TDSLoader()
		
		// Parse the 3DS file directly from arrayBuffer
		const object3D = loader.parse(arrayBuffer)
		
		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in 3DS file')
		}
		
		// Remove placeholder objects
		ensurePlaceholderRemoved()
		
		// Apply wireframe if needed
		applyWireframe(wireframe)
		
		// Calculate bounding box for camera positioning
		const box = new THREE.Box3().setFromObject(object3D)
		const center = box.getCenter(new THREE.Vector3())
		const size = box.getSize(new THREE.Vector3())
		
		// Center the model
		object3D.position.sub(center)
		
		console.log('[3DSLoader] Successfully loaded 3DS model with', object3D.children.length, 'children')
		
		return { 
			object3D,
			boundingBox: box,
			center: center,
			size: size
		}
	} catch (error) {
		console.error('[3DSLoader] Error loading 3DS file:', error)
		throw new Error(`Failed to load 3DS file: ${error.message}`)
	}
}
