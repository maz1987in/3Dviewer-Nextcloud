import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { BaseLoader } from '../BaseLoader.js'

class ThreeMfLoader extends BaseLoader {
	/**
	 * Constructor
	 */
	constructor() {
		super('ThreeMFLoader', ['3mf'])
		this.loader = new ThreeMFLoader()
	}

	/**
	 * Load 3MF model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { fileId, filename } = context

		try {
			// Validate that we have data
			if (!arrayBuffer || arrayBuffer.byteLength === 0) {
				throw new Error('3MF file is empty or invalid')
			}

			// Check if it's a valid ZIP file (3MF files are ZIP archives)
			const uint8Array = new Uint8Array(arrayBuffer)
			const isZip = uint8Array[0] === 0x50 && uint8Array[1] === 0x4B // "PK" ZIP signature
			
			if (!isZip) {
				this.logWarn('File does not appear to be a valid 3MF/ZIP archive', { filename })
				throw new Error('Invalid 3MF file format - not a ZIP archive')
			}

			// Parse the 3MF file
			const object = this.loader.parse(arrayBuffer)
			
			// Validate the parsed result
			if (!object || !object.children || object.children.length === 0) {
				throw new Error('3MF file contains no valid 3D models')
			}

			return this.processModel(object, { fileId, filename })
		} catch (error) {
			// Provide detailed error message
			let errorMessage = 'Failed to parse 3MF model'
			
			if (error.message.includes('3dmodel.model')) {
				errorMessage = '3MF file is corrupted or has invalid structure - missing 3D model data'
			} else if (error.message.includes('ZIP')) {
				errorMessage = 'Invalid 3MF file format - not a valid ZIP archive'
			} else if (error.message.includes('Cannot read properties of null')) {
				errorMessage = '3MF file has corrupted internal structure - the 3D model data is malformed or incomplete'
			} else if (error.message.includes('attributes')) {
				errorMessage = '3MF file has invalid XML structure - the file may be corrupted'
			} else if (error.message) {
				// Still provide the technical error but make it clear it's a parsing issue
				errorMessage = `Unable to parse 3MF file: ${error.message}`
			}
			
			this.logError(errorMessage, { 
				error: error.message, 
				filename,
				fileSize: arrayBuffer.byteLength 
			})
			
			throw new Error(errorMessage)
		}
	}
}

export { ThreeMfLoader }
