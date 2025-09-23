/**
 * Application constants and configuration values
 */

/**
 * File size limits in bytes
 */
export const FILE_SIZE_LIMITS = {
	SMALL: 10 * 1024 * 1024, // 10MB
	MEDIUM: 50 * 1024 * 1024, // 50MB
	LARGE: 100 * 1024 * 1024, // 100MB
	MAXIMUM: 500 * 1024 * 1024, // 500MB
}

/**
 * Timeout values in milliseconds
 */
export const TIMEOUTS = {
	FILE_LOAD: 30000, // 30 seconds
	MTL_LOAD: 10000, // 10 seconds
	API_REQUEST: 15000, // 15 seconds
	RETRY_DELAY: 1000, // 1 second
	ERROR_DISPLAY: 5000, // 5 seconds
	GESTURE_HINT: 3000, // 3 seconds
}

/**
 * Retry configuration
 */
export const RETRY_CONFIG = {
	MAX_ATTEMPTS: 3,
	BASE_DELAY: 1000,
	MAX_DELAY: 10000,
	BACKOFF_MULTIPLIER: 2,
}

/**
 * Performance thresholds
 */
export const PERFORMANCE_THRESHOLDS = {
	TARGET_FPS: 30,
	MAX_FPS: 60,
	MEMORY_WARNING: 100 * 1024 * 1024, // 100MB
	MEMORY_CRITICAL: 200 * 1024 * 1024, // 200MB
	FRAME_TIME_WARNING: 33, // ~30 FPS
	FRAME_TIME_CRITICAL: 50, // ~20 FPS
}

/**
 * Animation settings
 */
export const ANIMATION_CONSTANTS = {
	AUTO_ROTATE_SPEED: 2.0,
	PRESET_DURATION: 1000,
	EASING_FUNCTION: 'easeInOutCubic',
	MIN_DURATION: 100,
	MAX_DURATION: 5000,
}

/**
 * UI constants
 */
export const UI_CONSTANTS = {
	TOOLBAR_HEIGHT: 60,
	MOBILE_BREAKPOINT: 768,
	TOUCH_SENSITIVITY: 1.0,
	PINCH_SENSITIVITY: 1.0,
	DOUBLE_TAP_DELAY: 300,
	DEBOUNCE_DELAY: 100,
}

/**
 * Grid and axes constants
 */
export const GRID_CONSTANTS = {
	DEFAULT_SIZE: 10,
	DEFAULT_DIVISIONS: 10,
	MIN_SIZE: 1,
	MAX_SIZE: 1000,
	MIN_DIVISIONS: 2,
	MAX_DIVISIONS: 100,
	COLOR: 0x00ff00,
	OPACITY: 1.0,
}

export const AXES_CONSTANTS = {
	DEFAULT_SIZE: 2,
	MIN_SIZE: 0.1,
	MAX_SIZE: 100,
	X_COLOR: 0xff0000,
	Y_COLOR: 0x00ff00,
	Z_COLOR: 0x0000ff,
}

/**
 * Camera constants
 */
export const CAMERA_CONSTANTS = {
	FOV: 75,
	NEAR: 0.1,
	FAR: 1000,
	MIN_DISTANCE: 1,
	MAX_DISTANCE: 1000,
	DEFAULT_POSITION: { x: 5, y: 5, z: 5 },
	DEFAULT_TARGET: { x: 0, y: 0, z: 0 },
}

/**
 * Material constants
 */
export const MATERIAL_CONSTANTS = {
	DEFAULT_COLOR: 0x888888,
	WIREFRAME_COLOR: 0x00ff00,
	HIGHLIGHT_COLOR: 0xff0000,
	SELECTED_COLOR: 0xffff00,
	DEFAULT_METALNESS: 0.1,
	DEFAULT_ROUGHNESS: 0.8,
	DEFAULT_OPACITY: 1.0,
}

/**
 * Event names
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
	THUMBNAIL: '/ocs/v2.php/apps/threedviewer/api/thumb',
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
 * Debug levels
 */
export const DEBUG_LEVELS = {
	NONE: 0,
	ERROR: 1,
	WARN: 2,
	INFO: 3,
	DEBUG: 4,
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
