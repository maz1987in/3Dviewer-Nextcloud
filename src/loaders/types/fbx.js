import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

export default async function loadFbx(arrayBuffer, context) {
	const { THREE, applyWireframe, ensurePlaceholderRemoved, wireframe } = context
	
	try {
		// Create FBX loader
		const loader = new FBXLoader()
		
		// Parse the FBX file directly from arrayBuffer
		const object3D = loader.parse(arrayBuffer)
		
		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in FBX file')
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
		
		
		return { 
			object3D,
			boundingBox: box,
			center: center,
			size: size
		}
	} catch (error) {
		throw new Error(`Failed to load FBX file: ${error.message}`)
	}
}
