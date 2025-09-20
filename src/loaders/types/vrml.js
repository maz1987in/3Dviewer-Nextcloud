// VRML loader

export default async function loadVRML(arrayBuffer, context) {
	const { THREE, scene, applyWireframe, ensurePlaceholderRemoved } = context
	
	try {
		// Convert ArrayBuffer to text for parsing
		const text = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer)
		
		if (!text || text.trim().length === 0) {
			throw new Error('Empty or invalid VRML file')
		}
		
		// Check if it looks like a VRML file
		if (!text.toLowerCase().includes('vrml') && !text.toLowerCase().includes('#vrml')) {
			throw new Error('File does not appear to be a valid VRML file')
		}
		
		// Load VRML loader dynamically
		const { VRMLLoader } = await import('three/examples/jsm/loaders/VRMLLoader.js')
		const loader = new VRMLLoader()
		
		return new Promise((resolve, reject) => {
			try {
				// Parse the VRML content
				loader.parse(text, (result) => {
					try {
						if (!result.scene) {
							throw new Error('No scene found in VRML file')
						}
						
						const vrmlScene = result.scene
						
						// Apply wireframe if needed
						applyWireframe(vrmlScene)
						
						// Remove any placeholder objects
						ensurePlaceholderRemoved()
						
						// Add the scene to the main scene
						scene.add(vrmlScene)
						
						// Calculate bounding box for camera positioning
						const box = new THREE.Box3().setFromObject(vrmlScene)
						const center = box.getCenter(new THREE.Vector3())
						const size = box.getSize(new THREE.Vector3())
						
						// Center the model
						vrmlScene.position.sub(center)
						
						console.log('[VRMLLoader] Successfully loaded VRML model')
						
						resolve({
							object3D: vrmlScene,
							boundingBox: box,
							center: center,
							size: size,
							animations: result.animations || []
						})
					} catch (error) {
						console.error('Error processing VRML scene:', error)
						reject(new Error(`Failed to process VRML scene: ${error.message}`))
					}
				})
			} catch (error) {
				console.error('Error loading VRML file:', error)
				reject(new Error(`Failed to load VRML file: ${error.message}`))
			}
		})
	} catch (error) {
		console.error('[VRMLLoader] Error loading VRML file:', error)
		throw new Error(`Failed to load VRML file: ${error.message}`)
	}
}
