/**
 * Viewer configuration and settings
 */

/**
 * Default material settings
 */
export const MATERIAL_DEFAULTS = {
	standard: {
		color: 0x888888,
		metalness: 0.1,
		roughness: 0.8,
		side: 'FrontSide',
	},
	basic: {
		color: 0x666666,
		transparent: true,
		opacity: 0.6,
	},
	wireframe: {
		color: 0x00ff00,
		wireframe: true,
		transparent: true,
		opacity: 0.8,
	},
}

/**
 * Geometry settings
 */
export const GEOMETRY_SETTINGS = {
	box: {
		width: 1,
		height: 1,
		depth: 1,
	},
	sphere: {
		radius: 1,
		widthSegments: 32,
		heightSegments: 16,
	},
	plane: {
		width: 1,
		height: 1,
	},
}

/**
 * Camera settings
 */
export const CAMERA_SETTINGS = {
	fov: 75,
	near: 0.1,
	far: 1000,
	// Orthographic camera settings
	orthographic: {
		zoom: 1,
		frustumSize: 10,  // Controls the viewing volume size
	},
	defaultProjection: 'perspective', // 'perspective' or 'orthographic'
	position: {
		x: 5,
		y: 5,
		z: 5,
	},
	lookAt: {
		x: 0,
		y: 0,
		z: 0,
	},
}

/**
 * Grid settings
 */
export const GRID_SETTINGS = {
	defaultSize: 10,
	defaultDivisions: 10,
	color: 0x00ff00,
	opacity: 1.0,
	visible: true,
}

/**
 * Axes settings
 */
export const AXES_SETTINGS = {
	size: 2,
	visible: true,
}

/**
 * Performance settings
 */
export const PERFORMANCE_SETTINGS = {
	maxFrameRate: 60,
	targetFrameRate: 30,
	memoryWarningThreshold: 100 * 1024 * 1024, // 100MB
	maxRetries: 3,
	retryDelay: 1000,
	timeout: 30000, // 30 seconds
}

/**
 * Animation settings
 */
export const ANIMATION_SETTINGS = {
	autoRotate: {
		enabled: false,
		speed: 2.0,
	},
	presets: [
		{
			name: 'front',
			position: { x: 0, y: 0, z: 5 },
			target: { x: 0, y: 0, z: 0 },
		},
		{
			name: 'back',
			position: { x: 0, y: 0, z: -5 },
			target: { x: 0, y: 0, z: 0 },
		},
		{
			name: 'left',
			position: { x: -5, y: 0, z: 0 },
			target: { x: 0, y: 0, z: 0 },
		},
		{
			name: 'right',
			position: { x: 5, y: 0, z: 0 },
			target: { x: 0, y: 0, z: 0 },
		},
		{
			name: 'top',
			position: { x: 0, y: 5, z: 0 },
			target: { x: 0, y: 0, z: 0 },
		},
		{
			name: 'bottom',
			position: { x: 0, y: -5, z: 0 },
			target: { x: 0, y: 0, z: 0 },
		},
	],
}

/**
 * Mobile settings
 */
export const MOBILE_SETTINGS = {
	touchSensitivity: 1.0,
	pinchSensitivity: 1.0,
	doubleTapDelay: 300,
	gestureHints: {
		show: true,
		duration: 3000,
	},
}

/**
 * Loading settings
 */
export const LOADING_SETTINGS = {
	showProgress: true,
	showSkeleton: true,
	skeletonCubes: 8,
	progressUpdateInterval: 100,
	estimatedTimeThreshold: 1000,
}

/**
 * Error handling settings
 */
export const ERROR_SETTINGS = {
	showDetails: true,
	showSuggestions: true,
	maxRetries: 3,
	retryDelay: 1000,
	errorDisplayDuration: 5000,
}

/**
 * Theme settings
 */
export const THEME_SETTINGS = {
	light: {
		background: '#ffffff',
		gridColor: '#00ff00',
		axesColor: '#ff0000',
		toolbarBg: '#f0f0f0',
		toolbarText: '#333333',
	},
	dark: {
		background: '#1a1a1a',
		gridColor: '#00ff00',
		axesColor: '#ff0000',
		toolbarBg: '#2a2a2a',
		toolbarText: '#ffffff',
	},
}

/**
 * Comparison settings
 */
export const COMPARISON_SETTINGS = {
	defaultComparisonColor: 0x007acc,
	indicatorSize: 0.1,
	indicatorOpacity: 0.8,
	sideBySideOffset: 2.0,
	overlayOpacity: 0.5,
}

/**
 * Cache settings
 */
export const CACHE_SETTINGS = {
	enabled: true,
	expirationDays: 7,
	maxSizeMB: 100,  // Maximum total cache size
	maxFileSizeMB: 10,  // Maximum individual file size to cache
	autoCleanup: true,
	dbName: '3DViewerCache',
	dbVersion: 1,
}

/**
 * File size categories and limits
 */
export const FILE_SIZE_CATEGORIES = {
	small: {
		maxSize: 10 * 1024 * 1024, // 10MB
		description: 'Small files load quickly',
	},
	medium: {
		maxSize: 50 * 1024 * 1024, // 50MB
		description: 'Medium files may take a moment to load',
	},
	large: {
		maxSize: 100 * 1024 * 1024, // 100MB
		description: 'Large files may take longer to load',
	},
	'very-large': {
		maxSize: 500 * 1024 * 1024, // 500MB
		description: 'Very large files may take several minutes to load',
	},
}

/**
 * Supported file formats with metadata
 */
export const SUPPORTED_FORMATS = {
	glb: {
		name: 'GLB',
		description: 'Binary glTF format',
		mimeType: 'model/gltf-binary',
		features: ['materials', 'animations', 'compression'],
	},
	gltf: {
		name: 'GLTF',
		description: 'JSON-based glTF format',
		mimeType: 'model/gltf+json',
		features: ['materials', 'animations', 'compression'],
	},
	obj: {
		name: 'OBJ',
		description: 'Wavefront OBJ format',
		mimeType: 'model/obj',
		features: ['materials', 'mtl-support'],
	},
	stl: {
		name: 'STL',
		description: 'Stereolithography format',
		mimeType: 'model/stl',
		features: ['geometry-only'],
	},
	ply: {
		name: 'PLY',
		description: 'Polygon File Format',
		mimeType: 'model/ply',
		features: ['point-clouds', 'colors'],
	},
	fbx: {
		name: 'FBX',
		description: 'Autodesk FBX format',
		mimeType: 'application/octet-stream',
		features: ['materials', 'animations', 'bones'],
	},
	'3mf': {
		name: '3MF',
		description: '3D Manufacturing Format',
		mimeType: 'model/3mf',
		features: ['materials', 'colors'],
	},
	'3ds': {
		name: '3DS',
		description: '3D Studio format',
		mimeType: 'application/octet-stream',
		features: ['materials', 'animations'],
	},
	dae: {
		name: 'DAE',
		description: 'Collada format',
		mimeType: 'model/vnd.collada+xml',
		features: ['materials', 'animations', 'bones'],
	},
	x3d: {
		name: 'X3D',
		description: 'Extensible 3D format',
		mimeType: 'model/x3d+xml',
		features: ['materials', 'animations'],
	},
	vrml: {
		name: 'VRML',
		description: 'Virtual Reality Modeling Language',
		mimeType: 'model/vrml',
		features: ['materials', 'animations'],
	},
}

/**
 * Get configuration value with fallback
 * @param {object} config - Configuration object
 * @param {string} path - Dot-separated path to value
 * @param {*} defaultValue - Default value if not found
 * @return {*} Configuration value
 */
export function getConfigValue(config, path, defaultValue = null) {
	const keys = path.split('.')
	let current = config

	for (const key of keys) {
		if (current && typeof current === 'object' && key in current) {
			current = current[key]
		} else {
			return defaultValue
		}
	}

	return current
}

/**
 * Merge configuration objects
 * @param {object} base - Base configuration
 * @param {object} override - Override configuration
 * @return {object} Merged configuration
 */
export function mergeConfig(base, override) {
	const result = { ...base }

	for (const key in override) {
		if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
			result[key] = mergeConfig(base[key] || {}, override[key])
		} else {
			result[key] = override[key]
		}
	}

	return result
}

/**
 * Get environment-specific configuration
 * @param {string} environment - Environment name (development, production)
 * @return {object} Environment-specific configuration
 */
export function getEnvironmentConfig(environment = 'production') {
	const baseConfig = {
		material: MATERIAL_DEFAULTS,
		geometry: GEOMETRY_SETTINGS,
		camera: CAMERA_SETTINGS,
		grid: GRID_SETTINGS,
		axes: AXES_SETTINGS,
		performance: PERFORMANCE_SETTINGS,
		animation: ANIMATION_SETTINGS,
		mobile: MOBILE_SETTINGS,
		loading: LOADING_SETTINGS,
		error: ERROR_SETTINGS,
		theme: THEME_SETTINGS,
	}

	const environmentConfigs = {
		development: {
			performance: {
				...PERFORMANCE_SETTINGS,
				maxFrameRate: 30,
				targetFrameRate: 15,
			},
			error: {
				...ERROR_SETTINGS,
				showDetails: true,
				showSuggestions: true,
			},
		},
		production: {
			performance: {
				...PERFORMANCE_SETTINGS,
				maxFrameRate: 60,
				targetFrameRate: 30,
			},
			error: {
				...ERROR_SETTINGS,
				showDetails: false,
				showSuggestions: true,
			},
		},
	}

	return mergeConfig(baseConfig, environmentConfigs[environment] || {})
}

/**
 * Main viewer configuration object
 */
export const VIEWER_CONFIG = {
	materials: MATERIAL_DEFAULTS,
	geometry: GEOMETRY_SETTINGS,
	camera: CAMERA_SETTINGS,
	grid: GRID_SETTINGS,
	axes: AXES_SETTINGS,
	performance: PERFORMANCE_SETTINGS,
	animation: ANIMATION_SETTINGS,
	mobile: MOBILE_SETTINGS,
	loading: LOADING_SETTINGS,
	error: ERROR_SETTINGS,
	theme: THEME_SETTINGS,
	comparison: COMPARISON_SETTINGS,
	cache: CACHE_SETTINGS,
	fileSizeCategories: FILE_SIZE_CATEGORIES,
	supportedFormats: SUPPORTED_FORMATS,
	limits: {
		maxFileSize: 500 * 1024 * 1024, // 500 MB
		maxRetries: 3,
		retryDelayMs: 1000,
		loaderTimeoutMs: 30000,
	},
	supportedExtensions: [
		'glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', '3ds', 'dae', 'x3d', 'vrml', 'wrl',
	],
}
