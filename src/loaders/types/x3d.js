// X3D loader - Basic implementation since X3DLoader is not available in Three.js
// X3D is a complex format, so we'll provide a basic fallback that shows an error message

export default async function loadX3D(arrayBuffer, context) {
	const { THREE, scene, applyWireframe, ensurePlaceholderRemoved } = context

	try {
		// Convert ArrayBuffer to text for basic validation
		const text = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer)

		if (!text || text.trim().length === 0) {
			throw new Error('Empty or invalid X3D file')
		}

		// Check if it looks like an X3D file
		if (!text.toLowerCase().includes('x3d') && !text.toLowerCase().includes('<?xml')) {
			throw new Error('File does not appear to be a valid X3D file')
		}

		// Remove placeholder objects
		ensurePlaceholderRemoved()

		// Create a placeholder geometry to indicate X3D support is limited
		const geometry = new THREE.BoxGeometry(1, 1, 1)
		const material = new THREE.MeshStandardMaterial({
			color: 0xff6b6b,
			transparent: true,
			opacity: 0.7,
		})

		const placeholder = new THREE.Mesh(geometry, material)
		placeholder.position.set(0, 0, 0)

		// Add text label
		const canvas = document.createElement('canvas')
		const ctx = canvas.getContext('2d')
		canvas.width = 256
		canvas.height = 64

		ctx.fillStyle = '#ff6b6b'
		ctx.fillRect(0, 0, 256, 64)
		ctx.fillStyle = 'white'
		ctx.font = '16px Arial'
		ctx.textAlign = 'center'
		ctx.fillText('X3D Format', 128, 25)
		ctx.fillText('Limited Support', 128, 45)

		const texture = new THREE.CanvasTexture(canvas)
		const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true })
		const labelGeometry = new THREE.PlaneGeometry(2, 0.5)
		const label = new THREE.Mesh(labelGeometry, labelMaterial)
		label.position.set(0, 1.5, 0)

		const group = new THREE.Group()
		group.add(placeholder)
		group.add(label)

		// Apply wireframe if needed
		applyWireframe(group)

		// Add to scene
		scene.add(group)

		// Calculate bounding box
		const box = new THREE.Box3().setFromObject(group)
		const center = box.getCenter(new THREE.Vector3())
		const size = box.getSize(new THREE.Vector3())

		// Center the model
		group.position.sub(center)

		return {
			object3D: group,
			boundingBox: box,
			center,
			size,
			animations: [],
		}
	} catch (error) {
		throw new Error(`Failed to load X3D file: ${error.message}`)
	}
}
