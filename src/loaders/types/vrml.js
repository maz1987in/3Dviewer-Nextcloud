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
	 * Parse VRML, falling back to preprocessing if the lexer rejects the text.
	 *
	 * three's VRMLLoader.parse() is synchronous: it returns the scene or throws. It
	 * takes no callback, so waiting for one only ever ran into a timeout.
	 *
	 * @param {string} text - VRML text
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Parse result
	 */
	async tryParseVrml(text, context) {
		let scene
		try {
			scene = this.loader.parse(text, '')
		} catch (error) {
			// If we get lexing errors, try with preprocessing as a fallback
			if (error.message.includes('Lexing errors') || error.message.includes('Lexing')) {
				// Try again with minimal preprocessing
				const preprocessedText = this.preprocessVrmlText(text, true) // minimal mode
				try {
					return await this.tryParseVrmlWithPreprocessing(preprocessedText, context)
				} catch (preprocessError) {
					// If preprocessing also fails, provide helpful error message
					let errorMessage = `Failed to load VRML file: ${error.message}`
					errorMessage += '. The VRML file contains syntax errors that cannot be automatically fixed. The file might need to be exported in a different format (e.g., glTF, OBJ, or DAE) or a different VRML version.'
					throw new Error(errorMessage, { cause: preprocessError })
				}
			}

			// Provide more helpful error messages for other errors
			let errorMessage = `Failed to load VRML file: ${error.message}`

			if (error.message.includes('Parsing')) {
				errorMessage += '. The VRML file structure may be invalid or corrupted.'
			}

			throw new Error(errorMessage, { cause: error })
		}

		try {
			if (!scene) {
				throw new Error('VRML parser returned null result')
			}

			this.logInfo('VRML model loaded successfully', {
				animations: scene.animations?.length || 0,
			})

			// Process the result
			const processedResult = this.processModel(scene, context)

			// Add animations if available
			if (scene.animations && scene.animations.length > 0) {
				processedResult.animations = scene.animations
			}

			return processedResult
		} catch (error) {
			throw new Error(`Failed to process VRML scene: ${error.message}`, { cause: error })
		}
	}

	/**
	 * Try parsing VRML with preprocessing applied
	 * @param {string} text - Preprocessed VRML text
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Parse result
	 */
	async tryParseVrmlWithPreprocessing(text, context) {
		// Synchronous like the first attempt; a throw here rejects as it is
		const scene = this.loader.parse(text, '')

		try {
			if (!scene) {
				throw new Error('VRML parser returned invalid result after preprocessing')
			}

			const processedResult = this.processModel(scene, context)

			if (scene.animations && scene.animations.length > 0) {
				processedResult.animations = scene.animations
			}

			return processedResult
		} catch (error) {
			throw new Error(`Failed to process VRML scene after preprocessing: ${error.message}`, { cause: error })
		}
	}

	/**
	 * Preprocess VRML text to fix common issues that cause lexing errors
	 * @param {string} text - Original VRML text
	 * @param {boolean} minimal - If true, only apply minimal safe fixes
	 * @return {string} Preprocessed VRML text
	 */
	preprocessVrmlText(text, minimal = false) {
		// Helper: remove control characters without using RegExp literals
		const removeControlChars = (s) => {
			let out = ''
			for (let i = 0; i < s.length; i++) {
				const code = s.charCodeAt(i)
				// Skip ASCII control chars: 0x00-0x1F and 0x7F
				if ((code >= 0x00 && code <= 0x1F) || code === 0x7F) {
					continue
				}
				out += s[i]
			}
			return out
		}
		// Apply minimal safe fixes first
		// Remove BOM if present (always safe)
		if (text.charCodeAt(0) === 0xFEFF) {
			text = text.slice(1)
		}

		// Normalize line endings (always safe)
		text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

		// Remove null bytes (always safe)
		text = removeControlChars(text)

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
			text = removeControlChars(text)
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
		text = removeControlChars(text)

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
