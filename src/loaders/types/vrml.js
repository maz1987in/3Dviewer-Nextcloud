import { BaseLoader } from '../BaseLoader.js'
import { decodeTextFromBuffer } from '../../utils/fileHelpers.js'

/**
 * VRML loader class
 */
class VrmlLoader extends BaseLoader {

	constructor() {
		super('VRMLLoader', ['vrml', 'wrl'])
		this.loader = null
	}

	/**
	 * Load VRML model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		// Convert ArrayBuffer to text for parsing
		const text = decodeTextFromBuffer(arrayBuffer)

		// Check if it looks like a VRML file
		if (!text.toLowerCase().includes('vrml') && !text.toLowerCase().includes('#vrml')) {
			throw new Error('File does not appear to be a valid VRML file')
		}

		// Load VRML loader dynamically
		const { VRMLLoader } = await import('three/examples/jsm/loaders/VRMLLoader.js')
		this.loader = new VRMLLoader()

		// Try parsing first without preprocessing
		// Only apply preprocessing if initial parse fails
		return this.tryParseVrml(text, context)
	}

	/**
	 * Try to parse VRML with fallback to preprocessing if needed
	 * @param {string} text - VRML text
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Parse result
	 */
	tryParseVrml(text, context) {
		return new Promise((resolve, reject) => {
			// Use a flag to track if we've already resolved/rejected
			let resolved = false

			// Set a timeout to catch cases where parse never calls the callback
			const timeout = setTimeout(() => {
				if (!resolved) {
					resolved = true
					reject(new Error('VRML parsing timed out - the file may be corrupted or unsupported'))
				}
			}, 30000) // 30 second timeout

			// Wrap parse in a try-catch to handle synchronous errors
			let parseError = null
			try {
				// Parse the VRML content
				// The parse method may throw synchronously or call the callback asynchronously
				this.loader.parse(text, (result) => {
					if (resolved) return // Already handled
					clearTimeout(timeout)
					resolved = true

					// If there was a synchronous error, reject immediately
					if (parseError) {
						reject(parseError)
						return
					}

					try {
						if (!result) {
							throw new Error('VRML parser returned null result')
						}

						if (!result.scene) {
							throw new Error('No scene found in VRML file')
						}

						const vrmlScene = result.scene

						this.logInfo('VRML model loaded successfully', {
							animations: result.animations?.length || 0,
						})

						// Process the result
						const processedResult = this.processModel(vrmlScene, context)

						// Add animations if available
						if (result.animations && result.animations.length > 0) {
							processedResult.animations = result.animations
						}

						resolve(processedResult)
					} catch (error) {
						reject(new Error(`Failed to process VRML scene: ${error.message}`))
					}
				})
			} catch (error) {
				// Catch synchronous errors from parse
				parseError = error
				if (resolved) return // Already handled
				clearTimeout(timeout)
				resolved = true

				// If we get lexing errors, try with preprocessing as a fallback
				if (error.message.includes('Lexing errors') || error.message.includes('Lexing')) {
					// Try again with minimal preprocessing
					const preprocessedText = this.preprocessVrmlText(text, true) // minimal mode
					this.tryParseVrmlWithPreprocessing(preprocessedText, context)
						.then(resolve)
						.catch((preprocessError) => {
							// If preprocessing also fails, provide helpful error message
							let errorMessage = `Failed to load VRML file: ${error.message}`
							errorMessage += '. The VRML file contains syntax errors that cannot be automatically fixed. The file might need to be exported in a different format (e.g., glTF, OBJ, or DAE) or a different VRML version.'
							reject(new Error(errorMessage))
						})
					return
				}

				// Provide more helpful error messages for other errors
				let errorMessage = `Failed to load VRML file: ${error.message}`

				if (error.message.includes('Parsing')) {
					errorMessage += '. The VRML file structure may be invalid or corrupted.'
				}

				reject(new Error(errorMessage))
			}
		})
	}

	/**
	 * Try parsing VRML with preprocessing applied
	 * @param {string} text - Preprocessed VRML text
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Parse result
	 */
	tryParseVrmlWithPreprocessing(text, context) {
		return new Promise((resolve, reject) => {
			let resolved = false
			const timeout = setTimeout(() => {
				if (!resolved) {
					resolved = true
					reject(new Error('VRML parsing timed out after preprocessing'))
				}
			}, 30000)

			let parseError = null
			try {
				this.loader.parse(text, (result) => {
					if (resolved) return
					clearTimeout(timeout)
					resolved = true

					if (parseError) {
						reject(parseError)
						return
					}

					try {
						if (!result || !result.scene) {
							throw new Error('VRML parser returned invalid result after preprocessing')
						}

						const vrmlScene = result.scene
						const processedResult = this.processModel(vrmlScene, context)

						if (result.animations && result.animations.length > 0) {
							processedResult.animations = result.animations
						}

						resolve(processedResult)
					} catch (error) {
						reject(new Error(`Failed to process VRML scene after preprocessing: ${error.message}`))
					}
				})
			} catch (error) {
				parseError = error
				if (resolved) return
				clearTimeout(timeout)
				resolved = true
				reject(error)
			}
		})
	}

	/**
	 * Preprocess VRML text to fix common issues that cause lexing errors
	 * @param {string} text - Original VRML text
	 * @param {boolean} minimal - If true, only apply minimal safe fixes
	 * @return {string} Preprocessed VRML text
	 */
	preprocessVrmlText(text, minimal = false) {
		// Apply minimal safe fixes first
		// Remove BOM if present (always safe)
		if (text.charCodeAt(0) === 0xFEFF) {
			text = text.slice(1)
		}

		// Normalize line endings (always safe)
		text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

		// Remove null bytes (always safe)
		text = text.replace(/\0/g, '')

		// Fix common encoding issues - replace common problematic characters
		// Some files have smart quotes or other Unicode characters that cause issues
		text = text.replace(/[\u2018\u2019]/g, "'") // Smart single quotes
		text = text.replace(/[\u201C\u201D]/g, '"') // Smart double quotes
		text = text.replace(/\u2013/g, '-') // En dash
		text = text.replace(/\u2014/g, '--') // Em dash

		// If minimal mode, only apply the safest fixes
		if (minimal) {
			// Only fix trailing commas (very common and safe)
			text = text.replace(/,(\s*[}\]])/g, '$1')
			// Remove control characters (safe)
			text = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
			return text
		}

		// Full preprocessing (more aggressive fixes)
		// 1. Fix trailing commas before closing brackets/braces
		text = text.replace(/,(\s*[}\]])/g, '$1')

		// 2. Fix invalid number formats (e.g., numbers with multiple dots)
		text = text.replace(/(\d+\.\d+)\.(\d+)/g, '$1')

		// 3. Fix invalid escape sequences in strings
		text = text.replace(/\\([^\\"nrtbf])/g, (match, char) => char)

		// 4. Remove control characters
		text = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')

		// 5. Fix whitespace (conservative - only normalize multiple spaces)
		// Don't modify operators as that can break valid VRML
		text = text.replace(/[ \t]+/g, (match) => {
			// Preserve if it's all tabs (likely indentation)
			if (match.match(/^\t+$/)) return match
			// Otherwise normalize to single space
			return ' '
		})

		return text
	}

}

// Export the class as default so the registry can instantiate it
export default VrmlLoader
