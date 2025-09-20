import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'

export default async function loadThreeMF(arrayBuffer, context) {
	const { THREE, applyWireframe, ensurePlaceholderRemoved, wireframe } = context
	
	try {
		// Create 3MF loader
		const loader = new ThreeMFLoader()
		
		// Parse the 3MF file directly from arrayBuffer
		// 3MF files are actually ZIP archives, so we need to handle them differently
		const object3D = loader.parse(arrayBuffer)
		
		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in 3MF file')
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
		
		console.log('[3MFLoader] Successfully loaded 3MF model with', object3D.children.length, 'children')
		
		return { 
			object3D,
			boundingBox: box,
			center: center,
			size: size
		}
	} catch (error) {
		console.error('[3MFLoader] Error loading 3MF file:', error)
		throw new Error(`Failed to load 3MF file: ${error.message}`)
	}
}
