import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

export default async function loadStl(arrayBuffer, context) {
	const { THREE, scene, applyWireframe, ensurePlaceholderRemoved, wireframe } = context
	
	try {
		// Validate input
		if (!arrayBuffer || arrayBuffer.byteLength === 0) {
			throw new Error('Empty or invalid STL file')
		}
		
		// Create STL loader
		const loader = new STLLoader()
		
		// Parse the STL geometry
		const geo = loader.parse(arrayBuffer)
		
		if (!geo || geo.attributes.position.count === 0) {
			throw new Error('No valid geometry found in STL file')
		}
		
		// Create material with better defaults
		const mat = new THREE.MeshStandardMaterial({ 
			color: 0x888888,
			metalness: 0.1,
			roughness: 0.8,
			side: THREE.DoubleSide // STL files often need double-sided rendering
		})
		
		// Remove placeholder objects
		ensurePlaceholderRemoved()
		
		// Create mesh
		const mesh = new THREE.Mesh(geo, mat)
		
		// Apply wireframe if needed
		applyWireframe(wireframe)
		
		// Add to scene
		scene.add(mesh)
		
		// Calculate bounding box for camera positioning
		const box = new THREE.Box3().setFromObject(mesh)
		const center = box.getCenter(new THREE.Vector3())
		const size = box.getSize(new THREE.Vector3())
		
		// Center the model
		mesh.position.sub(center)
		
		console.log('[STLLoader] Successfully loaded STL model with', geo.attributes.position.count, 'vertices')
		
		return { 
			object3D: mesh,
			boundingBox: box,
			center: center,
			size: size
		}
	} catch (error) {
		console.error('[STLLoader] Error loading STL file:', error)
		throw new Error(`Failed to load STL file: ${error.message}`)
	}
}
