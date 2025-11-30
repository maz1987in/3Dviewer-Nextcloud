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
		frustumSize: 10, // Controls the viewing volume size
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
	colorCenterLine: 0x00ff00,
	colorGrid: 0x00ff00,
	opacity: 1.0,
	transparent: false,
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
	enableShadows: true, // Master toggle for shadows
	enableAntialiasing: true, // Toggle for MSAA
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
	mode: 'auto', // 'auto', 'light', 'dark'
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
 * Demo scene settings
 */
export const DEMO_SCENE_CONFIG = {
	enabled: true,
	autoRotate: true,
	objects: [
		{ type: 'torusKnot', color: 0x4287f5, position: [0, 1, 0] },
		{ type: 'sphere', color: 0xff6b6b, position: [-1.5, 0.5, 0] },
		{ type: 'box', color: 0x4ecdc4, position: [1.5, 0.5, 0] },
		{ type: 'cone', color: 0xffe66d, position: [0, 0, -1.5] },
	],
}

/**
 * Cache settings
 */
export const CACHE_SETTINGS = {
	enabled: true,
	expirationDays: 7,
	maxSizeMB: 100, // Maximum total cache size
	maxFileSizeMB: 10, // Maximum individual file size to cache
	autoCleanup: true,
	dbName: '3DViewerCache',
	dbVersion: 1,
}

/**
 * Progressive loading settings
 */
export const PROGRESSIVE_LOADING_SETTINGS = {
	enabled: true,
	textureBatchSize: 3, // Load 3 textures at a time
	textureDelay: 100, // 100ms delay between batches
	showProgress: true, // Show texture loading indicator
}

export const COMPRESSION_SETTINGS = {
	ktx2Enabled: true, // Enable KTX2 texture compression support
	dracoEnabled: true, // Enable DRACO geometry compression support
	// Decoder paths are handled by AssetController
	// DRACO: /apps/threedviewer/draco/
	// Basis (KTX2): /apps/threedviewer/basis/
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
 *
 * This is the SINGLE SOURCE OF TRUTH for all supported 3D model formats.
 * All other format lists (loaders, PHP backend, help text) are derived from this.
 *
 * @typedef {object} FormatMetadata
 * @property {string} name - Display name (uppercase)
 * @property {string} description - Human-readable description
 * @property {string} mimeType - Primary MIME type for backend
 * @property {string[]} features - Capabilities/features of this format
 * @property {boolean} multiFile - Whether format supports external dependencies (MTL, textures, etc.)
 * @property {number} displayOrder - Sort order for UI display
 * @property {string} icon - Path to format-specific icon SVG
 */
export const SUPPORTED_FORMATS = {
	glb: {
		name: 'GLB',
		description: 'Binary glTF format',
		mimeType: 'model/gltf-binary',
		features: ['materials', 'animations', 'compression'],
		multiFile: false,
		displayOrder: 1,
		icon: '/apps/threedviewer/img/filetypes/glb.svg',
	},
	gltf: {
		name: 'GLTF',
		description: 'JSON-based glTF format',
		mimeType: 'model/gltf+json',
		features: ['materials', 'animations', 'compression'],
		multiFile: true,
		displayOrder: 2,
		icon: '/apps/threedviewer/img/filetypes/gltf.svg',
	},
	obj: {
		name: 'OBJ',
		description: 'Wavefront OBJ format',
		mimeType: 'model/obj',
		features: ['materials', 'mtl-support'],
		multiFile: true,
		displayOrder: 3,
		icon: '/apps/threedviewer/img/filetypes/obj.svg',
	},
	stl: {
		name: 'STL',
		description: 'Stereolithography format',
		mimeType: 'model/stl',
		features: ['geometry-only'],
		multiFile: false,
		displayOrder: 5,
		icon: '/apps/threedviewer/img/filetypes/stl.svg',
	},
	ply: {
		name: 'PLY',
		description: 'Polygon File Format',
		mimeType: 'model/ply',
		features: ['point-clouds', 'colors'],
		multiFile: false,
		displayOrder: 8,
		icon: '/apps/threedviewer/img/filetypes/ply.svg',
	},
	fbx: {
		name: 'FBX',
		description: 'Autodesk FBX format',
		mimeType: 'application/octet-stream',
		features: ['materials', 'animations', 'bones'],
		multiFile: true,
		displayOrder: 4,
		icon: '/apps/threedviewer/img/filetypes/fbx.svg',
	},
	'3mf': {
		name: '3MF',
		description: '3D Manufacturing Format',
		mimeType: 'model/3mf',
		features: ['materials', 'colors'],
		multiFile: false,
		displayOrder: 9,
		icon: '/apps/threedviewer/img/filetypes/3mf.svg',
	},
	'3ds': {
		name: '3DS',
		description: '3D Studio format',
		mimeType: 'application/octet-stream',
		features: ['materials', 'animations'],
		multiFile: true,
		displayOrder: 7,
		icon: '/apps/threedviewer/img/filetypes/3ds.svg',
	},
	dae: {
		name: 'DAE',
		description: 'Collada format',
		mimeType: 'model/vnd.collada+xml',
		features: ['materials', 'animations', 'bones'],
		multiFile: true,
		displayOrder: 6,
		icon: '/apps/threedviewer/img/filetypes/dae.svg',
	},
	x3d: {
		name: 'X3D',
		description: 'Extensible 3D format',
		mimeType: 'model/x3d+xml',
		features: ['materials', 'animations'],
		multiFile: false,
		displayOrder: 10,
		icon: '/apps/threedviewer/img/filetypes/x3d.svg',
	},
	vrml: {
		name: 'VRML',
		description: 'Virtual Reality Modeling Language',
		mimeType: 'model/vrml',
		features: ['materials', 'animations'],
		multiFile: false,
		displayOrder: 11,
		icon: '/apps/threedviewer/img/filetypes/vrml.svg',
	},
	wrl: {
		name: 'WRL',
		description: 'VRML World (alternative extension)',
		mimeType: 'model/vrml',
		features: ['materials', 'animations'],
		multiFile: false,
		displayOrder: 12,
		icon: '/apps/threedviewer/img/filetypes/wrl.svg',
	},
}

/**
 * Array of all supported model file extensions
 * Derived from SUPPORTED_FORMATS
 */
export const MODEL_EXTENSIONS = Object.keys(SUPPORTED_FORMATS)

/**
 * Array of formats that support multi-file loading (with dependencies)
 * Derived from SUPPORTED_FORMATS
 */
export const MULTI_FILE_FORMATS = Object.entries(SUPPORTED_FORMATS)
	.filter(([_, meta]) => meta.multiFile)
	.map(([ext]) => ext)

/**
 * Comma-separated list of format names for display in UI
 * Example: "GLB, GLTF, OBJ, FBX, STL, DAE, 3DS, PLY, 3MF, X3D, VRML, WRL"
 * Sorted by displayOrder
 */
export const FORMATS_DISPLAY_LIST = Object.entries(SUPPORTED_FORMATS)
	.sort(([, a], [, b]) => a.displayOrder - b.displayOrder)
	.map(([_, meta]) => meta.name)
	.join(', ')

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
 * Circular controller settings
 */
export const CONTROLLER_SETTINGS = {
	defaultVisible: true,
	defaultPosition: { x: 20, y: 80 }, // offset from top-left
	size: {
		desktop: 180, // Reduced from 250
		mobile: 140, // Reduced from 180
	},
	cubeSize: {
		desktop: 80, // Reduced from 100
		mobile: 60, // Reduced from 70
	},
	arrowNudgeAmount: 0.1, // radians
	zoomStep: 0.1,
	panSpeed: {
		base: 1.0, // Base pan speed multiplier (increased for faster panning)
		min: 0.5, // Minimum pan speed (for close views)
		max: 15.0, // Maximum pan speed (for far views)
		cameraDistanceFactor: 0.015, // Factor to multiply camera distance by for pan speed (increased for more responsiveness)
	},
	animationDuration: 800, // ms for snap-to-view
	persistPosition: true,
	persistVisibility: true,
}

/**
 * Lighting configuration
 */
export const LIGHTING_SETTINGS = {
	ambient: {
		color: 0x404040,
		intensity: 2.0,
	},
	directional: {
		color: 0xffffff,
		intensity: 1.0,
		position: { x: 10, y: 10, z: 5 },
		castShadow: true,
		shadowMapSize: 2048,
		shadowCameraNear: 0.5,
		shadowCameraFar: 50,
		shadowCameraLeft: -10,
		shadowCameraRight: 10,
		shadowCameraTop: 10,
		shadowCameraBottom: -10,
	},
	point: {
		enabled: true,
		color: 0xffffff,
		intensity: 0.5,
		distance: 100,
		position: { x: -10, y: 10, z: -10 },
	},
	hemisphere: {
		enabled: false,
		skyColor: 0x87CEEB,
		groundColor: 0x362D1D,
		intensity: 0.3,
	},
}

/**
 * Measurement settings
 * Unit conversion factors (1 Three.js unit = ? real units)
 */
export const MEASUREMENT_SETTINGS = {
	defaultUnit: 'millimeters',
	unitScales: {
		millimeters: { factor: 1, suffix: 'mm', label: 'Millimeters' },
		centimeters: { factor: 10, suffix: 'cm', label: 'Centimeters' },
		meters: { factor: 1000, suffix: 'm', label: 'Meters' },
		inches: { factor: 25.4, suffix: 'in', label: 'Inches' },
		feet: { factor: 304.8, suffix: 'ft', label: 'Feet' },
		units: { factor: 1, suffix: 'units', label: 'Generic Units' },
	},
	markerSize: 0.05,
	lineWidth: 2,
	textSize: 0.1,
}

/**
 * Interaction settings
 * Timing, thresholds, and sensitivity values for user interactions
 */
export const INTERACTION_SETTINGS = {
	doubleClickDelay: 300, // ms
	dragThreshold: 5, // pixels
	cubeDragSensitivity: 0.005,
	rotationSensitivity: 0.02,
	panSensitivity: 0.3,
	panSpeed: 1.0, // OrbitControls pan speed
	zoomSensitivity: 0.1,
	zoomSpeed: 1.0, // OrbitControls zoom speed
	zoomInterval: 100, // ms for continuous zoom
	dampingFactor: 0.05, // OrbitControls damping factor
	enableDamping: true, // Enable smooth movement by default
	movementInterval: 16, // ms for continuous movement (~60fps)
}

/**
 * UI timing settings
 * Delays, throttles, and duration values for UI elements
 */
export const UI_TIMING = {
	fpsEmitThrottle: 500, // ms between FPS updates
	overlayPositionDelay: 200, // ms delay for overlay positioning
	overlayInitialDelay: 100, // ms initial delay for overlay positioning
	debounceDelay: 100, // ms for debounced actions
	gestureHintDuration: 3000, // ms to show gesture hints
	errorDisplayDuration: 5000, // ms to display errors
	toastDefaultTimeout: 5000, // ms for toast notifications
}

/**
 * Grid dynamic sizing configuration
 * Determines grid size and divisions based on model dimensions
 */
export const GRID_DYNAMIC_SIZING = {
	smallModelThreshold: 5,
	smallGridSize: 10,
	smallGridDivisions: 10,
	mediumModelThreshold: 20,
	mediumGridSize: 20,
	mediumGridDivisions: 20,
	largeModelThreshold: 100,
	largeGridSize: 100,
	largeGridDivisions: 25,
	veryLargeModelThreshold: 500,
	veryLargeGridSize: 500,
	veryLargeGridDivisions: 50,
	groundOffset: -0.1, // Offset below model bottom
}

/**
 * Performance detection settings
 * Thresholds and scoring for automatic performance mode detection
 */
export const PERFORMANCE_DETECTION = {
	browserCapabilityScores: {
		webgl2Bonus: 20,
		largeTextureBonus: 15,
		veryLargeTextureBonus: 10,
		highDPIBonus: 15,
		memory8GBBonus: 20,
		memory4GBBonus: 10,
		cpu8CoreBonus: 15,
		cpu4CoreBonus: 10,
		cpu2CoreBonus: 5,
		mobilePenalty: -20,
	},
	modeThresholds: {
		highMode: 55,
		balancedMode: 40,
		lowMode: 25,
	},
	qualityLevels: {
		low: { pixelRatio: 0.75, shadows: false, antialias: false },
		balanced: { pixelRatio: 1.0, shadows: true, antialias: true },
		high: { pixelRatio: 1.5, shadows: true, antialias: true },
		ultra: { pixelRatio: 2.0, shadows: true, antialias: true },
	},
}

/**
 * Texture and canvas settings
 */
export const TEXTURE_SETTINGS = {
	cubeTextureSize: 256,
	maxTextureSize: 4096,
	anisotropy: 4,
	generateMipmaps: true,
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
	demoScene: DEMO_SCENE_CONFIG,
	cache: CACHE_SETTINGS,
	progressiveLoading: PROGRESSIVE_LOADING_SETTINGS,
	compression: COMPRESSION_SETTINGS,
	fileSizeCategories: FILE_SIZE_CATEGORIES,
	supportedFormats: SUPPORTED_FORMATS,
	controller: CONTROLLER_SETTINGS,
	limits: {
		maxFileSize: 500 * 1024 * 1024, // 500 MB
		maxRetries: 3,
		retryDelayMs: 1000,
		loaderTimeoutMs: 30000,
	},
	// New consolidated sections
	lighting: LIGHTING_SETTINGS,
	measurement: MEASUREMENT_SETTINGS,
	interaction: INTERACTION_SETTINGS,
	uiTiming: UI_TIMING,
	gridDynamicSizing: GRID_DYNAMIC_SIZING,
	performanceDetection: PERFORMANCE_DETECTION,
	texture: TEXTURE_SETTINGS,
	// Derived from SUPPORTED_FORMATS - no need to maintain separately
	supportedExtensions: MODEL_EXTENSIONS,
	multiFileFormats: MULTI_FILE_FORMATS,
}
