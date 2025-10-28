/**
 * File helper utilities
 * Provides common file finding and manipulation functions
 */

/**
 * Find a file in an array by name (case-insensitive by default)
 * @param {Array<File>} files - Array of files to search
 * @param {string} searchName - Name to search for
 * @param {object} options - Search options
 * @param {boolean} options.caseSensitive - Whether to use case-sensitive matching (default: false)
 * @param {boolean} options.useBasename - Whether to compare only basename (default: true)
 * @return {File|undefined} Found file or undefined
 */
export function findFileByName(files, searchName, options = {}) {
	const { caseSensitive = false, useBasename = true } = options

	if (!Array.isArray(files) || !searchName) {
		return undefined
	}

	return files.find(file => {
		const fileName = useBasename ? file.name.split('/').pop() : file.name

		if (caseSensitive) {
			return fileName === searchName
		} else {
			return fileName.toLowerCase() === searchName.toLowerCase()
		}
	})
}

/**
 * Find files matching a pattern
 * @param {Array<File>} files - Array of files to search
 * @param {string|RegExp} pattern - Pattern to match (string for simple matching, RegExp for complex)
 * @param {object} options - Search options
 * @param {boolean} options.caseSensitive - Whether to use case-sensitive matching (default: false)
 * @param {boolean} options.useBasename - Whether to match only basename (default: true)
 * @return {Array<File>} Array of matching files
 */
export function findFilesByPattern(files, pattern, options = {}) {
	const { caseSensitive = false, useBasename = true } = options

	if (!Array.isArray(files)) {
		return []
	}

	// Convert string pattern to RegExp if needed
	const regex = pattern instanceof RegExp
		? pattern
		: new RegExp(pattern, caseSensitive ? '' : 'i')

	return files.filter(file => {
		const fileName = useBasename ? file.name.split('/').pop() : file.name
		return regex.test(fileName)
	})
}

/**
 * Get file extension (lowercase)
 * @param {string} filename - Filename or path
 * @return {string} Extension without dot (e.g., 'jpg')
 */
export function getFileExtension(filename) {
	if (!filename) return ''
	const parts = filename.split('.')
	return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

/**
 * Get filename without extension
 * @param {string} filename - Filename or path
 * @param {boolean} includeDirectory - Whether to include directory path (default: false)
 * @return {string} Filename without extension
 */
export function getFilenameWithoutExtension(filename, includeDirectory = false) {
	if (!filename) return ''

	const basename = includeDirectory ? filename : filename.split('/').pop()
	const lastDotIndex = basename.lastIndexOf('.')

	return lastDotIndex > 0 ? basename.substring(0, lastDotIndex) : basename
}

/**
 * Check if a file has a specific extension
 * @param {string} filename - Filename or path
 * @param {string|Array<string>} extensions - Extension(s) to check (with or without dot)
 * @return {boolean} True if file has the extension
 */
export function hasExtension(filename, extensions) {
	const fileExt = getFileExtension(filename)
	const extsArray = Array.isArray(extensions) ? extensions : [extensions]

	return extsArray.some(ext => {
		const cleanExt = ext.startsWith('.') ? ext.slice(1).toLowerCase() : ext.toLowerCase()
		return fileExt === cleanExt
	})
}

/**
 * Convert a file to text
 * @param {File} file - File object
 * @param {string} encoding - Text encoding (default: 'utf-8')
 * @return {Promise<string>} File content as text
 */
export async function fileToText(file, encoding = 'utf-8') {
	try {
		const arrayBuffer = await file.arrayBuffer()
		const decoder = new TextDecoder(encoding, { fatal: false })
		return decoder.decode(arrayBuffer)
	} catch (error) {
		throw new Error(`Failed to convert file to text: ${error.message}`)
	}
}

/**
 * Decode ArrayBuffer to text
 * @param {ArrayBuffer} arrayBuffer - ArrayBuffer to decode
 * @param {string} encoding - Text encoding (default: 'utf-8')
 * @return {string} Decoded text
 */
export function decodeTextFromBuffer(arrayBuffer, encoding = 'utf-8') {
	const decoder = new TextDecoder(encoding, { fatal: false })
	return decoder.decode(arrayBuffer)
}

/**
 * Get all filenames from file array
 * @param {Array<File>} files - Array of files
 * @param {boolean} basenamOnly - Return only basename (default: true)
 * @param basenameOnly
 * @return {Array<string>} Array of filenames
 */
export function getFilenames(files, basenameOnly = true) {
	if (!Array.isArray(files)) return []

	return files.map(file =>
		basenameOnly ? file.name.split('/').pop() : file.name,
	)
}
