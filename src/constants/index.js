/**
 * Application constants and configuration values
 *
 * NOTE: For configurable settings (performance thresholds, camera settings, lighting, etc.),
 * see src/config/viewer-config.js which is the single source of truth for all viewer configuration.
 *
 * This file contains ONLY app-level constants:
 * - Event names
 * - Error types and codes
 * - Loading stages
 * - MIME types
 * - API endpoints
 * - HTTP status codes
 * - Keyboard shortcuts
 * - Enums (themes, modes, categories, presets)
 */

/**
 * Event names
 * @see src/config/viewer-config.js for configurable settings
 */
export const EVENTS = {
	MODEL_LOADED: 'model-loaded',
	MODEL_ABORTED: 'model-aborted',
	MODEL_ERROR: 'model-error',
	LOAD_START: 'load-start',
	LOAD_PROGRESS: 'load-progress',
	LOAD_COMPLETE: 'load-complete',
	RESET_DONE: 'reset-done',
	CAMERA_CHANGE: 'camera-change',
	GRID_TOGGLE: 'grid-toggle',
	AXES_TOGGLE: 'axes-toggle',
	WIREFRAME_TOGGLE: 'wireframe-toggle',
	BACKGROUND_CHANGE: 'background-change',
}

/**
 * Error types for consistent error categorization
 */
export const ERROR_TYPES = {
	NETWORK: 'network',
	FORMAT: 'format',
	PARSING: 'parsing',
	MEMORY: 'memory',
	PERMISSION: 'permission',
	VALIDATION: 'validation',
	UNKNOWN: 'unknown',
}

/**
 * Error codes
 */
export const ERROR_CODES = {
	NETWORK_ERROR: 'NETWORK_ERROR',
	FORMAT_ERROR: 'FORMAT_ERROR',
	PARSING_ERROR: 'PARSING_ERROR',
	MEMORY_ERROR: 'MEMORY_ERROR',
	PERMISSION_ERROR: 'PERMISSION_ERROR',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	TIMEOUT_ERROR: 'TIMEOUT_ERROR',
	UNKNOWN_ERROR: 'UNKNOWN_ERROR',
}

/**
 * Loading stages
 */
export const LOADING_STAGES = {
	INITIALIZING: 'initializing',
	DOWNLOADING: 'downloading',
	DOWNLOADED: 'downloaded',
	PARSING: 'parsing',
	PROCESSING: 'processing',
	COMPLETE: 'complete',
	ERROR: 'error',
	RETRYING: 'retrying',
}

/**
 * Supported file extensions
 */
export const SUPPORTED_EXTENSIONS = [
	'glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl',
]

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
 * API endpoints
 */
export const API_ENDPOINTS = {
	FILES: '/ocs/v2.php/apps/threedviewer/api/files',
	FILE: '/ocs/v2.php/apps/threedviewer/api/file',
	MTL: '/ocs/v2.php/apps/threedviewer/api/file',
	PUBLIC_FILE: '/ocs/v2.php/apps/threedviewer/api/public/file',
}

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
	OK: 200,
	UNAUTHORIZED: 401,
	NOT_FOUND: 404,
	UNSUPPORTED_MEDIA_TYPE: 415,
	INTERNAL_SERVER_ERROR: 500,
}

/**
 * Keyboard shortcuts
 */
export const KEYBOARD_SHORTCUTS = {
	RESET_VIEW: 'KeyR',
	TOGGLE_GRID: 'KeyG',
	TOGGLE_AXES: 'KeyA',
	TOGGLE_WIREFRAME: 'KeyW',
	FIT_TO_VIEW: 'KeyF',
	ESCAPE: 'Escape',
}

/**
 * Touch gestures
 */
export const TOUCH_GESTURES = {
	ROTATE: 'rotate',
	ZOOM: 'zoom',
	PAN: 'pan',
	DOUBLE_TAP: 'double-tap',
	PINCH: 'pinch',
}

/**
 * Theme names
 */
export const THEMES = {
	LIGHT: 'light',
	DARK: 'dark',
	AUTO: 'auto',
}

/**
 * Performance modes
 */
export const PERFORMANCE_MODES = {
	LOW: 'low',
	MEDIUM: 'medium',
	HIGH: 'high',
	AUTO: 'auto',
}

/**
 * File size categories
 */
export const FILE_SIZE_CATEGORIES = {
	SMALL: 'small',
	MEDIUM: 'medium',
	LARGE: 'large',
	VERY_LARGE: 'very-large',
}

/**
 * Animation presets
 */
export const ANIMATION_PRESETS = {
	FRONT: 'front',
	BACK: 'back',
	LEFT: 'left',
	RIGHT: 'right',
	TOP: 'top',
	BOTTOM: 'bottom',
}

/**
 * Memory units
 */
export const MEMORY_UNITS = {
	BYTES: 'B',
	KILOBYTES: 'KB',
	MEGABYTES: 'MB',
	GIGABYTES: 'GB',
}

/**
 * Get constant value with fallback
 * @param {object} constants - Constants object
 * @param {string} key - Key to look up
 * @param {*} defaultValue - Default value if not found
 * @return {*} Constant value
 */
export function getConstant(constants, key, defaultValue = null) {
	return constants[key] !== undefined ? constants[key] : defaultValue
}

/**
 * Check if value is a valid constant
 * @param {object} constants - Constants object
 * @param {*} value - Value to check
 * @return {boolean} Whether value is valid
 */
export function isValidConstant(constants, value) {
	return Object.values(constants).includes(value)
}

/**
 * Get all constant keys
 * @param {object} constants - Constants object
 * @return {string[]} Array of keys
 */
export function getConstantKeys(constants) {
	return Object.keys(constants)
}

/**
 * Get all constant values
 * @param {object} constants - Constants object
 * @return {*[]} Array of values
 */
export function getConstantValues(constants) {
	return Object.values(constants)
}
