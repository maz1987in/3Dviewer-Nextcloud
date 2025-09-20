import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'

export default async function loadObj(arrayBuffer, context) {
	const { THREE, scene, applyWireframe, ensurePlaceholderRemoved, wireframe, fileId } = context
	
	try {
		// Decode the OBJ file content
		const textDecoder = new TextDecoder('utf-8', { fatal: false })
		const objText = textDecoder.decode(arrayBuffer)
		
		if (!objText || objText.trim().length === 0) {
			throw new Error('Empty or invalid OBJ file content')
		}
		
		// Look for MTL file reference
		let mtlName = null
		for (const line of objText.split(/\r?\n/)) {
			const trimmedLine = line.trim()
			if (trimmedLine.toLowerCase().startsWith('mtllib ')) { 
				mtlName = trimmedLine.split(/\s+/)[1]?.trim()
				break 
			}
		}
		
		// Create OBJ loader
		const loader = new OBJLoader()
		
		// Try to load MTL materials if referenced
		if (mtlName) {
			try {
				const mtlUrl = `/apps/threedviewer/api/file/${fileId}/mtl/${encodeURIComponent(mtlName)}`
				
				const mtlRes = await fetch(mtlUrl, { 
					headers: { 'Accept': 'text/plain' },
					signal: AbortSignal.timeout(10000) // 10 second timeout
				})
				
				if (mtlRes.ok) {
					const mtlText = await mtlRes.text()
					if (mtlText && mtlText.trim().length > 0) {
						const mtlLoader = new MTLLoader()
						const materials = mtlLoader.parse(mtlText, '')
						materials.preload()
						loader.setMaterials(materials)
						console.log('[OBJLoader] Successfully loaded MTL materials:', mtlName)
					}
				} else {
					console.warn('[OBJLoader] MTL file not found or error loading:', mtlName, mtlRes.status)
				}
			} catch (e) { 
				console.warn('[OBJLoader] Failed to load MTL materials:', mtlName, e.message)
				// Continue without materials
			}
		}
		
		// Remove placeholder objects
		ensurePlaceholderRemoved()
		
		// Parse the OBJ content
		const object3D = loader.parse(objText)
		
		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in OBJ file')
		}
		
		// Apply wireframe if needed
		applyWireframe(wireframe)
		
		// Add to scene
		scene.add(object3D)
		
		// Calculate bounding box for camera positioning
		const box = new THREE.Box3().setFromObject(object3D)
		const center = box.getCenter(new THREE.Vector3())
		const size = box.getSize(new THREE.Vector3())
		
		// Center the model
		object3D.position.sub(center)
		
		console.log('[OBJLoader] Successfully loaded OBJ model with', object3D.children.length, 'children')
		
		return { 
			object3D,
			boundingBox: box,
			center: center,
			size: size
		}
	} catch (error) {
		console.error('[OBJLoader] Error loading OBJ file:', error)
		throw new Error(`Failed to load OBJ file: ${error.message}`)
	}
}
