import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { BaseLoader } from '../BaseLoader.js'
import { unzip } from 'three/examples/jsm/libs/fflate.module.js'

class ThreeMfLoader extends BaseLoader {
	/**
	 * Constructor
	 */
	constructor() {
		super('ThreeMFLoader', ['3mf'])
		this.loader = new ThreeMFLoader()
	}

	/**
	 * Inspect 3MF ZIP structure
	 * @param {ArrayBuffer} arrayBuffer - 3MF file data
	 * @return {Promise<object>} ZIP structure info
	 */
	async inspectZipStructure(arrayBuffer) {
		return new Promise((resolve, reject) => {
			try {
				unzip(new Uint8Array(arrayBuffer), (err, unzipped) => {
					if (err) {
						reject(err)
						return
					}

					const files = Object.keys(unzipped).map(path => ({
						path,
						size: unzipped[path].length,
						isModel: path.endsWith('.model')
					}))

					resolve({
						files,
						hasStandardPath: files.some(f => f.path === '3D/3dmodel.model'),
						modelFiles: files.filter(f => f.isModel),
						allPaths: files.map(f => f.path)
					})
				})
			} catch (error) {
				reject(error)
			}
		})
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
			
			// 3MF format uses Z-up coordinate system (3D printing standard)
			// Rotate to Y-up (Three.js standard) by rotating -90° around X-axis
			object.rotation.x = -Math.PI / 2

			this.logInfo('3MF model loaded successfully', {
				children: object.children.length
			})

			return this.processModel(object, { fileId, filename })
		} catch (error) {
			// If standard parsing fails, inspect ZIP structure for better diagnostics
			try {
				this.logWarn('Standard 3MF parsing failed, inspecting ZIP structure', { 
					error: error.message,
					filename 
				})
				
				const structure = await this.inspectZipStructure(arrayBuffer)
				
				this.logInfo('3MF ZIP structure analysis', {
					fileCount: structure.files.length,
					hasStandardPath: structure.hasStandardPath,
					modelFileCount: structure.modelFiles.length,
					paths: structure.allPaths
				})
				
				// Provide helpful error message based on structure
				let errorMessage = 'Failed to parse 3MF model'
				let suggestions = []
				
				if (!structure.hasStandardPath && structure.modelFiles.length === 0) {
					errorMessage = '3MF file has non-standard structure with no recognizable .model files'
					suggestions = [
						'Re-export the model from your 3D software',
						'Ensure standard 3MF format is used during export',
						'Try converting to GLB or STL format instead'
					]
				} else if (structure.modelFiles.length > 0 && !structure.hasStandardPath) {
					const foundPath = structure.modelFiles[0].path
					errorMessage = `3MF file uses non-standard structure. Expected '3D/3dmodel.model' but found '${foundPath}'`
					suggestions = [
						'Re-export using standard 3MF format',
						'Use Blender, Fusion 360, or PrusaSlicer for export',
						'Convert to GLB format for better compatibility'
					]
				} else if (error.message.includes('3dmodel.model')) {
					errorMessage = '3MF file structure is invalid - missing required 3D model data'
					suggestions = [
						'Verify the file is not corrupted',
						'Re-export from the original 3D modeling software',
						'Try opening in another 3D viewer to verify file integrity'
					]
				} else if (error.message.includes('Cannot read properties of null')) {
					errorMessage = '3MF file has corrupted internal XML structure'
					suggestions = [
						'The 3D model data is malformed or incomplete',
						'Re-export the model from your 3D software',
						'Verify the export completed successfully'
					]
				} else {
					errorMessage = `Unable to parse 3MF file: ${error.message}`
					suggestions = [
						'Verify the file is a valid 3MF format',
						'Try re-exporting from your 3D software',
						'Consider using GLB or STL format instead'
					]
				}
				
				this.logError(errorMessage, { 
					error: error.message, 
					filename,
					fileSize: arrayBuffer.byteLength,
					zipFiles: structure.allPaths,
					suggestions
				})
				
				// Create detailed error for user
				const detailedError = new Error(errorMessage)
				detailedError.suggestions = suggestions
				detailedError.zipStructure = structure.allPaths
				throw detailedError
				
			} catch (inspectionError) {
				// If ZIP inspection also fails, provide basic error
				let errorMessage = 'Failed to parse 3MF model'
				
				if (error.message.includes('3dmodel.model')) {
					errorMessage = '3MF file is corrupted or has invalid structure - missing 3D model data'
				} else if (error.message.includes('ZIP')) {
					errorMessage = 'Invalid 3MF file format - not a valid ZIP archive'
				} else if (error.message.includes('Cannot read properties of null')) {
					errorMessage = '3MF file has corrupted internal structure - the 3D model data is malformed or incomplete'
				} else if (error.message) {
					errorMessage = `Unable to parse 3MF file: ${error.message}`
				}
				
				this.logError(errorMessage, { 
					error: error.message, 
					filename,
					fileSize: arrayBuffer.byteLength,
					inspectionFailed: true
				})
				
				throw new Error(errorMessage)
			}
		}
	}
}

export { ThreeMfLoader }
