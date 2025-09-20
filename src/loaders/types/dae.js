// DAE (Collada) loader
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'

export default async function loadDAE(arrayBuffer, context) {
	const { THREE, scene, applyWireframe, ensurePlaceholderRemoved } = context
	
	// Convert ArrayBuffer to text for XML parsing
	const text = new TextDecoder('utf-8').decode(arrayBuffer)
	
	return new Promise((resolve, reject) => {
		const loader = new ColladaLoader()
		
		try {
			// Parse the DAE content
			const collada = loader.parse(text)
			
			// Get the scene from the parsed DAE
			const daeScene = collada.scene
			
			if (!daeScene) {
				throw new Error('No scene found in DAE file')
			}
			
			// Apply wireframe if needed
			applyWireframe(daeScene)
			
			// Remove any placeholder objects
			ensurePlaceholderRemoved()
			
			// Add the scene to the main scene
			scene.add(daeScene)
			
			// Calculate bounding box for camera positioning
			const box = new THREE.Box3().setFromObject(daeScene)
			const center = box.getCenter(new THREE.Vector3())
			const size = box.getSize(new THREE.Vector3())
			
			// Center the model
			daeScene.position.sub(center)
			
			resolve({
				object3D: daeScene,
				boundingBox: box,
				center: center,
				size: size,
				animations: collada.animations || []
			})
		} catch (error) {
			console.error('Error loading DAE file:', error)
			reject(new Error(`Failed to load DAE file: ${error.message}`))
		}
	})
}
