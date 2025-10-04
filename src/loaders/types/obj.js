import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * OBJ loader class with MTL material support
 */
class ObjLoader extends BaseLoader {

	constructor() {
		super('OBJLoader', ['obj'])
		this.objLoader = null
		this.mtlLoader = null
	}

	/**
	 * Load OBJ model with optional MTL materials
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { fileId } = context

		// Decode the OBJ file content
		const objText = this.decodeText(arrayBuffer)

		// Look for MTL file reference
		const mtlName = this.findMtlReference(objText)

		// Create loaders
		this.objLoader = new OBJLoader()

		// Load MTL materials if referenced
		if (mtlName && fileId) {
			await this.loadMtlMaterials(mtlName, fileId)
		}

		// Parse the OBJ content
		const object3D = this.objLoader.parse(objText)

		if (!object3D || object3D.children.length === 0) {
			throw new Error('No valid geometry found in OBJ file')
		}

		this.logInfo('OBJ model parsed successfully', {
			children: object3D.children.length,
			hasMaterials: !!mtlName,
		})

		// Process the result
		return this.processModel(object3D, context)
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
			throw new Error('Empty or invalid OBJ file content')
		}

		return text
	}

	/**
	 * Find MTL file reference in OBJ text
	 * @param {string} objText - OBJ file content
	 * @return {string|null} MTL file name
	 */
	findMtlReference(objText) {
		for (const line of objText.split(/\r?\n/)) {
			const trimmedLine = line.trim()
			if (trimmedLine.toLowerCase().startsWith('mtllib ')) {
				const mtlName = trimmedLine.split(/\s+/)[1]?.trim()
				if (mtlName) {
					this.logInfo('Found MTL reference', { mtlName })
					return mtlName
				}
			}
		}
		return null
	}

	/**
	 * Load MTL materials
	 * @param {string} mtlName - MTL file name
	 * @param {number} fileId - File ID for API request
	 */
	async loadMtlMaterials(mtlName, fileId) {
		try {
			const mtlUrl = `/apps/threedviewer/api/file/${fileId}/mtl/${encodeURIComponent(mtlName)}`

			const response = await fetch(mtlUrl, {
				headers: { Accept: 'text/plain' },
				signal: this.abortController?.signal || AbortSignal.timeout(10000),
			})

			if (response.ok) {
				const mtlText = await response.text()
				if (mtlText && mtlText.trim().length > 0) {
					this.mtlLoader = new MTLLoader()
					const materials = this.mtlLoader.parse(mtlText, '')
					materials.preload()
					this.objLoader.setMaterials(materials)
					this.logInfo('MTL materials loaded successfully', { mtlName })
				}
			} else {
				this.logWarning('MTL file not found or error loading', {
					mtlName,
					status: response.status,
				})
			}
		} catch (error) {
			this.logWarning('Failed to load MTL materials', {
				mtlName,
				error: error.message,
			})
		}
	}

}

// Export the class as default so the registry can instantiate it
export default ObjLoader
