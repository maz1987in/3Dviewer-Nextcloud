import { BaseLoader } from '../BaseLoader.js'

/**
 * X3D loader class - Basic implementation since X3DLoader is not available in Three.js
 * X3D is a complex format, so we provide a basic fallback that shows a placeholder
 */
class X3dLoader extends BaseLoader {

	constructor() {
		super('X3DLoader', ['x3d'])
	}

	/**
	 * Load X3D model (placeholder implementation)
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { THREE } = context

		// Convert ArrayBuffer to text for basic validation
		const text = this.decodeText(arrayBuffer)

		// Check if it looks like an X3D file
		if (!text.toLowerCase().includes('x3d') && !text.toLowerCase().includes('<?xml')) {
			throw new Error('File does not appear to be a valid X3D file')
		}

		// Create a placeholder geometry to indicate X3D support is limited
		const geometry = new THREE.BoxGeometry(1, 1, 1)
		const material = this.createBasicMaterial({
			color: 0xff6b6b,
			transparent: true,
			opacity: 0.7,
		})

		const placeholder = this.createMesh(geometry, material)

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
		const label = this.createMesh(labelGeometry, labelMaterial)
		label.position.set(0, 1.5, 0)

		const group = this.createGroup([placeholder, label])

		this.logInfo('X3D placeholder created (limited support)', {
			note: 'X3D format has limited support in Three.js',
		})

		// Process the result
		return this.processModel(group, context)
	}

	/**
	 * Decode ArrayBuffer to text
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @return {string} Decoded text
	 */
	decodeText(arrayBuffer) {
		const textDecoder = new TextDecoder('utf-8', { fatal: false })
		const text = textDecoder.decode(arrayBuffer)

		if (!text || text.trim().length === 0) {
			throw new Error('Empty or invalid X3D file')
		}

		return text
	}

}

// Export the class as default so the registry can instantiate it
export default X3dLoader
