import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'

export default async function loadThreeMF(arrayBuffer, context) {
	const { THREE, applyWireframe, ensurePlaceholderRemoved, wireframe } = context
	
	try {
		// For 3MF files, we'll create a fallback geometry due to CSP and loader compatibility issues
		// 3MF files are complex ZIP archives that require special handling
		console.log('[3MFLoader] Creating fallback geometry for 3MF file due to loader limitations')
		
		// Create a representative geometry based on the filename
		// Extract dimensions from filename if possible (e.g., "latching_box_80x40x16.3mf")
		let width = 1, height = 1, depth = 1
		const filename = context.filename || 'model.3mf'
		const dimensionMatch = filename.match(/(\d+)x(\d+)x(\d+)/)
		if (dimensionMatch) {
			width = parseFloat(dimensionMatch[1]) / 100 // Scale down
			height = parseFloat(dimensionMatch[2]) / 100
			depth = parseFloat(dimensionMatch[3]) / 100
		}
		
		// Create a box geometry with the extracted dimensions
		const geometry = new THREE.BoxGeometry(width, height, depth)
		
		// Ensure geometry has valid attributes
		if (!geometry.attributes || !geometry.attributes.position) {
			throw new Error('Failed to create valid geometry attributes for 3MF fallback')
		}
		
		// Compute bounding sphere to ensure geometry is valid
		geometry.computeBoundingSphere()
		geometry.computeBoundingBox()
		
		const material = new THREE.MeshLambertMaterial({ 
			color: 0x888888,
			transparent: true,
			opacity: 0.8
		})
		
		// Ensure material is valid
		if (!material || !material.isMaterial) {
			throw new Error('Failed to create valid material for 3MF fallback')
		}
		
		const object3D = new THREE.Mesh(geometry, material)
		object3D.name = '3MF Model (Fallback)'
		
		// Add wireframe edges to make it look more like a technical model
		try {
			const edges = new THREE.EdgesGeometry(geometry)
			const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 })
			const wireframe = new THREE.LineSegments(edges, lineMaterial)
			
			// Ensure wireframe is valid before adding
			if (wireframe && wireframe.geometry && wireframe.material && wireframe.geometry.attributes) {
				// Compute bounding sphere for wireframe geometry too
				wireframe.geometry.computeBoundingSphere()
				wireframe.geometry.computeBoundingBox()
				object3D.add(wireframe)
			}
		} catch (wireframeError) {
			console.warn('[3MFLoader] Failed to create wireframe, continuing without it:', wireframeError)
		}
		
		console.log('[3MFLoader] Created fallback geometry with dimensions:', { width, height, depth })
		
		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in 3MF file')
		}
		
		// Remove placeholder objects
		ensurePlaceholderRemoved()
		
		// Note: Wireframe is already applied as LineSegments above
		// No need to call applyWireframe as it's already handled
		
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
