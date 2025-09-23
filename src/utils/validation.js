/**
 * Validation utilities for input validation and data checking
 */

/**
 * Supported file extensions
 */
export const SUPPORTED_EXTENSIONS = [
	'glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl',
]

/**
 * Maximum file size limits (in bytes)
 */
export const FILE_SIZE_LIMITS = {
	SMALL: 10 * 1024 * 1024, // 10MB
	MEDIUM: 50 * 1024 * 1024, // 50MB
	LARGE: 100 * 1024 * 1024, // 100MB
	MAXIMUM: 500 * 1024 * 1024, // 500MB
}

/**
 * MIME type mappings
 */
export const MIME_TYPES = {
	glb: 'model/gltf-binary',
	gltf: 'model/gltf+json',
	obj: 'model/obj',
	stl: 'model/stl',
	ply: 'model/ply',
	mtl: 'text/plain',
	fbx: 'application/octet-stream',
	'3mf': 'model/3mf',
	'3ds': 'application/octet-stream',
	dae: 'model/vnd.collada+xml',
	x3d: 'model/x3d+xml',
	vrml: 'model/vrml',
	wrl: 'model/vrml',
}

/**
 * Validate ArrayBuffer input
 * @param {ArrayBuffer} buffer - Buffer to validate
 * @param {string} context - Context for error messages
 * @throws {Error} If buffer is invalid
 */
export function validateArrayBuffer(buffer, context = 'ArrayBuffer') {
	if (!buffer) {
		throw new Error(`${context} is required`)
	}

	if (!(buffer instanceof ArrayBuffer)) {
		throw new Error(`${context} must be an ArrayBuffer`)
	}

	if (buffer.byteLength === 0) {
		throw new Error(`${context} is empty`)
	}

	if (buffer.byteLength > FILE_SIZE_LIMITS.MAXIMUM) {
		throw new Error(`${context} is too large (${formatBytes(buffer.byteLength)}). Maximum size is ${formatBytes(FILE_SIZE_LIMITS.MAXIMUM)}`)
	}
}

/**
 * Validate file size
 * @param {number} size - File size in bytes
 * @param {number} maxSize - Maximum allowed size
 * @param {string} context - Context for error messages
 * @throws {Error} If size is invalid
 */
export function validateFileSize(size, maxSize = FILE_SIZE_LIMITS.MAXIMUM, context = 'File') {
	if (typeof size !== 'number' || size < 0) {
		throw new Error(`${context} size must be a positive number`)
	}

	if (size === 0) {
		throw new Error(`${context} is empty`)
	}

	if (size > maxSize) {
		throw new Error(`${context} is too large (${formatBytes(size)}). Maximum size is ${formatBytes(maxSize)}`)
	}
}

/**
 * Validate file extension
 * @param {string} extension - File extension
 * @param {string[]} supported - Array of supported extensions
 * @param {string} context - Context for error messages
 * @throws {Error} If extension is not supported
 */
export function validateFileExtension(extension, supported = SUPPORTED_EXTENSIONS, context = 'File') {
	if (!extension || typeof extension !== 'string') {
		throw new Error(`${context} extension is required`)
	}

	const normalizedExt = extension.toLowerCase().replace(/^\./, '')

	if (!supported.includes(normalizedExt)) {
		throw new Error(`${context} extension '${extension}' is not supported. Supported formats: ${supported.join(', ')}`)
	}

	return normalizedExt
}

/**
 * Validate file ID
 * @param {*} fileId - File ID to validate
 * @param {string} context - Context for error messages
 * @throws {Error} If file ID is invalid
 */
export function validateFileId(fileId, context = 'File ID') {
	if (fileId === null || fileId === undefined) {
		throw new Error(`${context} is required`)
	}

	const id = Number(fileId)

	if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
		throw new Error(`${context} must be a positive integer`)
	}

	return id
}

/**
 * Validate MTL file name
 * @param {string} mtlName - MTL file name
 * @param {string} context - Context for error messages
 * @throws {Error} If MTL name is invalid
 */
export function validateMtlName(mtlName, context = 'MTL file name') {
	if (!mtlName || typeof mtlName !== 'string') {
		throw new Error(`${context} is required`)
	}

	if (mtlName.trim().length === 0) {
		throw new Error(`${context} cannot be empty`)
	}

	if (mtlName.length > 255) {
		throw new Error(`${context} is too long (maximum 255 characters)`)
	}

	// Check for invalid characters
	if (/[<>:"/\\|?*]/.test(mtlName)) {
		throw new Error(`${context} contains invalid characters`)
	}

	return mtlName.trim()
}

/**
 * Validate Three.js object
 * @param {*} object - Object to validate
 * @param {string} expectedType - Expected Three.js type
 * @param {string} context - Context for error messages
 * @throws {Error} If object is invalid
 */
export function validateThreeObject(object, expectedType, context = 'Three.js object') {
	if (!object) {
		throw new Error(`${context} is required`)
	}

	if (typeof object.is !== 'function' || !object.is(expectedType)) {
		throw new Error(`${context} must be a ${expectedType}`)
	}
}

/**
 * Validate camera object
 * @param {THREE.Camera} camera - Camera to validate
 * @param {string} context - Context for error messages
 * @throws {Error} If camera is invalid
 */
export function validateCamera(camera, context = 'Camera') {
	validateThreeObject(camera, 'Camera', context)

	if (!camera.position || !camera.rotation) {
		throw new Error(`${context} is missing required properties`)
	}
}

/**
 * Validate scene object
 * @param {THREE.Scene} scene - Scene to validate
 * @param {string} context - Context for error messages
 * @throws {Error} If scene is invalid
 */
export function validateScene(scene, context = 'Scene') {
	validateThreeObject(scene, 'Scene', context)

	if (!Array.isArray(scene.children)) {
		throw new Error(`${context} is missing children array`)
	}
}

/**
 * Validate renderer object
 * @param {THREE.WebGLRenderer} renderer - Renderer to validate
 * @param {string} context - Context for error messages
 * @throws {Error} If renderer is invalid
 */
export function validateRenderer(renderer, context = 'Renderer') {
	validateThreeObject(renderer, 'WebGLRenderer', context)

	if (!renderer.domElement) {
		throw new Error(`${context} is missing DOM element`)
	}
}

/**
 * Validate file path
 * @param {string} path - File path to validate
 * @param {string} context - Context for error messages
 * @throws {Error} If path is invalid
 */
export function validateFilePath(path, context = 'File path') {
	if (!path || typeof path !== 'string') {
		throw new Error(`${context} is required`)
	}

	if (path.trim().length === 0) {
		throw new Error(`${context} cannot be empty`)
	}

	// Check for path traversal attempts
	if (path.includes('..') || path.includes('//')) {
		throw new Error(`${context} contains invalid path segments`)
	}

	return path.trim()
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @param {string} context - Context for error messages
 * @throws {Error} If URL is invalid
 */
export function validateUrl(url, context = 'URL') {
	if (!url || typeof url !== 'string') {
		throw new Error(`${context} is required`)
	}

	try {
		new URL(url)
	} catch (error) {
		throw new Error(`${context} is not a valid URL: ${url}`)
	}

	return url
}

/**
 * Validate numeric range
 * @param {number} value - Value to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} context - Context for error messages
 * @throws {Error} If value is out of range
 */
export function validateRange(value, min, max, context = 'Value') {
	if (typeof value !== 'number' || isNaN(value)) {
		throw new Error(`${context} must be a number`)
	}

	if (value < min || value > max) {
		throw new Error(`${context} must be between ${min} and ${max}`)
	}
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Number of bytes
 * @return {string} Formatted string
 */
export function formatBytes(bytes) {
	if (bytes === 0) return '0 B'

	const k = 1024
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
	const i = Math.floor(Math.log(bytes) / Math.log(k))

	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/**
 * Get file size category
 * @param {number} size - File size in bytes
 * @return {string} Size category
 */
export function getFileSizeCategory(size) {
	if (size <= FILE_SIZE_LIMITS.SMALL) return 'small'
	if (size <= FILE_SIZE_LIMITS.MEDIUM) return 'medium'
	if (size <= FILE_SIZE_LIMITS.LARGE) return 'large'
	return 'very-large'
}

/**
 * Check if file size is acceptable for loading
 * @param {number} size - File size in bytes
 * @param {string} category - Size category
 * @return {boolean} Whether size is acceptable
 */
export function isFileSizeAcceptable(size, category = 'medium') {
	const limits = {
		small: FILE_SIZE_LIMITS.SMALL,
		medium: FILE_SIZE_LIMITS.MEDIUM,
		large: FILE_SIZE_LIMITS.LARGE,
		'very-large': FILE_SIZE_LIMITS.MAXIMUM,
	}

	return size <= (limits[category] || FILE_SIZE_LIMITS.MEDIUM)
}
