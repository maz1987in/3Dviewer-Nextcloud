/**
 * Performance optimization composable
 * Handles performance monitoring, optimization, and quality settings
 */

import { ref, computed } from 'vue'
import * as THREE from 'three'
import { logger } from '../utils/logger.js'
import { average } from '../utils/mathHelpers.js'

export function usePerformance() {
	// Performance state
	const performanceMode = ref('auto')  // Default to auto mode for smart detection
	const targetFPS = ref(60)
	const currentFPS = ref(0)
	const frameTime = ref(0)
	const memoryUsage = ref(0)
	const drawCalls = ref(0)
	const triangles = ref(0)

	// Quality settings
	const antialias = ref(true)
	const shadows = ref(true)
	const pixelRatio = ref(1)
	const maxPixelRatio = ref(2)
	const lodEnabled = ref(true)
	const frustumCulling = ref(true)
	const occlusionCulling = ref(false)

	// Optimization settings
	const autoOptimize = ref(true)
	const optimizationThreshold = ref(30) // FPS threshold for auto-optimization
	const maxTriangles = ref(100000)
	const maxDrawCalls = ref(100)
	const maxMemoryUsage = ref(500) // MB

	// Performance monitoring
	const frameCount = ref(0)
	const lastTime = ref(0)
	const performanceHistory = ref([])
	const maxHistorySize = ref(100)

	// Computed properties
	const currentPerformanceMode = computed(() => performanceMode.value)
	const targetFrameRate = computed(() => targetFPS.value)
	const currentFrameRate = computed(() => currentFPS.value)
	const currentFrameTime = computed(() => frameTime.value)
	const currentMemoryUsage = computed(() => memoryUsage.value)
	const currentDrawCalls = computed(() => drawCalls.value)
	const currentTriangles = computed(() => triangles.value)
	const isAntialiasEnabled = computed(() => antialias.value)
	const areShadowsEnabled = computed(() => shadows.value)
	const currentPixelRatio = computed(() => pixelRatio.value)
	const isLODEnabled = computed(() => lodEnabled.value)
	const isFrustumCullingEnabled = computed(() => frustumCulling.value)
	const isOcclusionCullingEnabled = computed(() => occlusionCulling.value)
	const isAutoOptimizeEnabled = computed(() => autoOptimize.value)
	const performanceScore = computed(() => calculatePerformanceScore())

	/**
	 * Detect browser capabilities and recommend performance mode
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 * @returns {string} Recommended performance mode
	 */
	const detectBrowserCapabilities = (renderer) => {
		let score = 0
		const capabilities = {}

		if (renderer) {
			// Check WebGL capabilities
			const gl = renderer.getContext()
			capabilities.webglVersion = renderer.capabilities.isWebGL2 ? 2 : 1
			capabilities.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
			capabilities.maxVertexUniforms = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)
			
			// WebGL 2 support adds points
			if (capabilities.webglVersion === 2) score += 20
			
			// Large texture support
			if (capabilities.maxTextureSize >= 8192) score += 15
			if (capabilities.maxTextureSize >= 16384) score += 10
		}

		// Check device pixel ratio (indicator of high-DPI display)
		capabilities.devicePixelRatio = window.devicePixelRatio || 1
		if (capabilities.devicePixelRatio >= 2) score += 15

		// Check available memory (if supported)
		if (navigator.deviceMemory) {
			capabilities.deviceMemory = navigator.deviceMemory
			if (capabilities.deviceMemory >= 8) score += 20
			else if (capabilities.deviceMemory >= 4) score += 10
		} else {
			// Assume reasonable memory if not available
			score += 10
		}

		// Check CPU cores
		if (navigator.hardwareConcurrency) {
			capabilities.cpuCores = navigator.hardwareConcurrency
			if (capabilities.cpuCores >= 8) score += 15
			else if (capabilities.cpuCores >= 4) score += 10
			else if (capabilities.cpuCores >= 2) score += 5
		} else {
			score += 5
		}

		// Check if we're on mobile (reduce score)
		const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
		if (isMobile) {
			score -= 20
			capabilities.isMobile = true
		}

	// Determine recommended mode based on score
	let recommendedMode = 'balanced' // default
	if (score >= 55) {
		recommendedMode = 'high' // Good system with WebGL2 + 4GB+ RAM
	} else if (score >= 40) {
		recommendedMode = 'balanced' // Mid-range
	} else if (score >= 25) {
		recommendedMode = 'balanced' // Lower mid-range  
	} else {
		recommendedMode = 'low' // Low-end or mobile
	}

	logger.info('usePerformance', 'Browser capabilities detected', {
		capabilities,
		score,
		recommendedMode,
	})

		return recommendedMode
	}

	/**
	 * Initialize performance monitoring
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 */
	const initPerformance = (renderer) => {
		if (!renderer) return

		// If in auto mode, detect browser capabilities and set appropriate initial quality
		if (performanceMode.value === 'auto') {
			const recommendedMode = detectBrowserCapabilities(renderer)
			logger.info('usePerformance', 'Auto mode: applying recommended settings', { recommendedMode })
			
			switch (recommendedMode) {
			case 'low':
				pixelRatio.value = 0.75
				antialias.value = false
				shadows.value = false
				break
			case 'balanced':
				pixelRatio.value = 1
				antialias.value = true
				shadows.value = true
				break
			case 'high':
				pixelRatio.value = 1.5
				antialias.value = true
				shadows.value = true
				occlusionCulling.value = true
				break
			}
			
			// Disable auto-optimization in auto mode since we already detected optimal settings
			autoOptimize.value = false
		}

		// Set initial performance settings
		applyPerformanceSettings(renderer)
		
		// Start performance monitoring
		startPerformanceMonitoring()

		logger.info('usePerformance', 'Performance monitoring initialized', {
			mode: performanceMode.value,
			targetFPS: targetFPS.value,
			pixelRatio: pixelRatio.value,
		})
	}

	/**
	 * Set performance mode
	 * @param {string} mode - Performance mode ('low', 'balanced', 'high', 'ultra', 'auto')
	 * @param {THREE.WebGLRenderer} [renderer] - Optional renderer for auto mode detection
	 * @throws {Error} If mode is invalid
	 */
	const setPerformanceMode = (mode, renderer = null) => {
		// Input validation
		const validModes = ['low', 'balanced', 'high', 'ultra', 'auto']
		if (!mode || typeof mode !== 'string') {
			logger.error('usePerformance', 'Invalid mode type')
			throw new Error('Performance mode must be a string')
		}
		if (!validModes.includes(mode)) {
			logger.error('usePerformance', 'Invalid performance mode', { mode })
			throw new Error(`Invalid performance mode: ${mode}. Valid modes: ${validModes.join(', ')}`)
		}

		performanceMode.value = mode

		// Apply mode-specific settings
		switch (mode) {
		case 'low':
			antialias.value = false
			shadows.value = false
			pixelRatio.value = 0.5
			lodEnabled.value = true
			frustumCulling.value = true
			occlusionCulling.value = false
			targetFPS.value = 30
			autoOptimize.value = false
			break
		case 'balanced':
			antialias.value = true
			shadows.value = true
			pixelRatio.value = 1
			lodEnabled.value = true
			frustumCulling.value = true
			occlusionCulling.value = false
			targetFPS.value = 60
			autoOptimize.value = false
			break
		case 'high':
			antialias.value = true
			shadows.value = true
			pixelRatio.value = 1.5
			lodEnabled.value = true
			frustumCulling.value = true
			occlusionCulling.value = true
			targetFPS.value = 60
			autoOptimize.value = false
			break
		case 'ultra':
			antialias.value = true
			shadows.value = true
			pixelRatio.value = 2
			lodEnabled.value = true
			frustumCulling.value = true
			occlusionCulling.value = true
			targetFPS.value = 120
			autoOptimize.value = false
			break
		case 'auto':
		default:
			// Auto mode: detect browser capabilities if renderer available
			if (renderer) {
				const recommendedMode = detectBrowserCapabilities(renderer)
				logger.info('usePerformance', 'Auto mode: applying recommended settings', { recommendedMode })
				
				switch (recommendedMode) {
				case 'low':
					pixelRatio.value = 0.75
					antialias.value = false
					shadows.value = false
					break
				case 'balanced':
					pixelRatio.value = 1
					antialias.value = true
					shadows.value = true
					break
				case 'high':
					pixelRatio.value = 1.5
					antialias.value = true
					shadows.value = true
					occlusionCulling.value = true
					break
				}
			} else {
				// Fallback to balanced if no renderer provided
				logger.warn('usePerformance', 'Auto mode without renderer: using balanced defaults')
				antialias.value = true
				shadows.value = true
				pixelRatio.value = 1
			}
			
			lodEnabled.value = true
			frustumCulling.value = true
			targetFPS.value = 60
			autoOptimize.value = false // Disable auto-optimization (detection already chose optimal settings)
			break
		}

		// Apply the new settings to the renderer if provided
		if (renderer) {
			applyPerformanceSettings(renderer)
		}

		logger.info('usePerformance', 'Performance mode set', { mode, pixelRatio: pixelRatio.value, settings: getCurrentSettings() })
	}

	/**
	 * Apply performance settings to renderer
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 */
	const applyPerformanceSettings = (renderer) => {
		if (!renderer) return

		// Calculate final pixel ratio
		const finalPixelRatio = Math.min(pixelRatio.value, maxPixelRatio.value)
		
		// Store current size before changing pixel ratio
		const currentSize = renderer.getSize(new THREE.Vector2())
		const oldPixelRatio = renderer.getPixelRatio()

		// Set pixel ratio
		renderer.setPixelRatio(finalPixelRatio)

		// Force renderer to resize with new pixel ratio
		// This is critical: setPixelRatio alone doesn't update the drawing buffer
		// We must call setSize to recreate the buffer with the new resolution
		if (oldPixelRatio !== finalPixelRatio) {
			renderer.setSize(currentSize.x, currentSize.y, false)
		}

		// Set antialias
		if (renderer.antialias !== antialias.value) {
			// Note: antialias can't be changed after renderer creation
			logger.warn('usePerformance', 'Antialias setting requires renderer recreation')
		}

		// Set shadows
		renderer.shadowMap.enabled = shadows.value
		renderer.shadowMap.type = shadows.value ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap

		logger.info('usePerformance', 'Performance settings applied', {
			pixelRatio: renderer.getPixelRatio(),
			shadows: renderer.shadowMap.enabled,
		})
	}

	/**
	 * Start performance monitoring
	 */
	const startPerformanceMonitoring = () => {
		lastTime.value = performance.now()
		frameCount.value = 0
		performanceHistory.value = []

		logger.info('usePerformance', 'Performance monitoring started')
	}

	/**
	 * Update performance metrics
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 * @param {THREE.Scene} scene - Three.js scene
	 */
	const updatePerformanceMetrics = (renderer, scene) => {
		if (!renderer || !scene) return

		const currentTime = performance.now()
		const deltaTime = currentTime - lastTime.value

		frameCount.value++

		// Update FPS
		if (deltaTime >= 1000) {
			currentFPS.value = Math.round((frameCount.value * 1000) / deltaTime)
			frameTime.value = deltaTime / frameCount.value

			// Add to history
			performanceHistory.value.push({
				timestamp: currentTime,
				fps: currentFPS.value,
				frameTime: frameTime.value,
				memory: memoryUsage.value,
				drawCalls: drawCalls.value,
				triangles: triangles.value,
			})

			// Limit history size
			if (performanceHistory.value.length > maxHistorySize.value) {
				performanceHistory.value.shift()
			}

			// Reset counters
			frameCount.value = 0
			lastTime.value = currentTime
		}

		// Update memory usage
		updateMemoryUsage()

		// Update render stats
		updateRenderStats(renderer, scene)

		// Auto-optimize if enabled
		if (autoOptimize.value) {
			autoOptimizePerformance(renderer, scene)
		}
	}

	/**
	 * Update memory usage
	 */
	const updateMemoryUsage = () => {
		if (performance.memory) {
			memoryUsage.value = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
		}
	}

	/**
	 * Update render statistics
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 * @param {THREE.Scene} scene - Three.js scene
	 */
	const updateRenderStats = (renderer, scene) => {
		if (!renderer.info) return

		drawCalls.value = renderer.info.render.calls
		triangles.value = renderer.info.render.triangles
	}

	/**
	 * Auto-optimize performance
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 * @param {THREE.Scene} scene - Three.js scene
	 */
	const autoOptimizePerformance = (renderer, scene) => {
		if (currentFPS.value < optimizationThreshold.value) {
			// Performance is below threshold, apply optimizations
			if (pixelRatio.value > 0.5) {
				pixelRatio.value = Math.max(0.5, pixelRatio.value - 0.1)
				renderer.setPixelRatio(pixelRatio.value)
				logger.warn('usePerformance', 'Auto-optimization: Reduced pixel ratio', { pixelRatio: pixelRatio.value })
			}

			if (shadows.value && currentFPS.value < 20) {
				shadows.value = false
				renderer.shadowMap.enabled = false
				logger.warn('usePerformance', 'Auto-optimization: Disabled shadows')
			}

			if (lodEnabled.value) {
				optimizeLOD(scene)
			}
		}
	}

	/**
	 * Optimize LOD (Level of Detail)
	 * @param {THREE.Scene} scene - Three.js scene
	 */
	const optimizeLOD = (scene) => {
		if (!scene) return

		let optimizedCount = 0

		scene.traverse((child) => {
			if (child.isMesh && child.geometry) {
				const distance = child.position.distanceTo(new THREE.Vector3(0, 0, 0))

				// Simplify geometry based on distance
				if (distance > 50 && child.geometry.attributes.position.count > 1000) {
					const ratio = Math.max(0.1, 1 - (distance - 50) / 100)
					simplifyGeometry(child.geometry, ratio)
					optimizedCount++
				}
			}
		})

		if (optimizedCount > 0) {
			logger.info('usePerformance', 'LOD optimization applied', { optimizedCount })
		}
	}

	/**
	 * Simplify geometry
	 * @param {THREE.BufferGeometry} geometry - Geometry to simplify
	 * @param {number} ratio - Simplification ratio (0-1)
	 */
	const simplifyGeometry = (geometry, ratio) => {
		if (!geometry.attributes.position) return

		const indices = geometry.index ? geometry.index.array : null

		if (indices && ratio < 0.8) {
			// Simplify by reducing triangle count
			const newIndexCount = Math.floor(indices.length * ratio)
			const newIndices = new Uint32Array(newIndexCount)

			for (let i = 0; i < newIndexCount; i++) {
				newIndices[i] = indices[Math.floor(i / ratio)]
			}

			geometry.setIndex(newIndices)
			geometry.index.needsUpdate = true
		}
	}

	/**
	 * Calculate performance score
	 * @return {number} Performance score (0-100)
	 */
	const calculatePerformanceScore = () => {
		let score = 100

		// FPS score (40% weight)
		const fpsScore = Math.min(100, (currentFPS.value / targetFPS.value) * 100)
		score = score * 0.4 + fpsScore * 0.4

		// Memory score (30% weight)
		const memoryScore = Math.max(0, 100 - (memoryUsage.value / maxMemoryUsage.value) * 100)
		score = score * 0.7 + memoryScore * 0.3

		// Draw calls score (20% weight)
		const drawCallsScore = Math.max(0, 100 - (drawCalls.value / maxDrawCalls.value) * 100)
		score = score * 0.8 + drawCallsScore * 0.2

		// Triangles score (10% weight)
		const trianglesScore = Math.max(0, 100 - (triangles.value / maxTriangles.value) * 100)
		score = score * 0.9 + trianglesScore * 0.1

		return Math.round(score)
	}

	/**
	 * Get current performance settings
	 * @return {object} Current settings
	 */
	const getCurrentSettings = () => {
		return {
			mode: performanceMode.value,
			antialias: antialias.value,
			shadows: shadows.value,
			pixelRatio: pixelRatio.value,
			lodEnabled: lodEnabled.value,
			frustumCulling: frustumCulling.value,
			occlusionCulling: occlusionCulling.value,
			targetFPS: targetFPS.value,
		}
	}

	/**
	 * Get performance statistics
	 * @return {object} Performance statistics
	 */
	const getPerformanceStats = () => {
		const avgFPS = average(performanceHistory.value, 'fps')
		const avgFrameTime = average(performanceHistory.value, 'frameTime')

		return {
			current: {
				fps: currentFPS.value,
				frameTime: frameTime.value,
				memory: memoryUsage.value,
				drawCalls: drawCalls.value,
				triangles: triangles.value,
				score: performanceScore.value,
			},
			average: {
				fps: Math.round(avgFPS),
				frameTime: Math.round(avgFrameTime * 100) / 100,
			},
			history: performanceHistory.value.length,
			settings: getCurrentSettings(),
		}
	}

	/**
	 * Reset performance monitoring
	 */
	const resetPerformanceMonitoring = () => {
		frameCount.value = 0
		lastTime.value = performance.now()
		performanceHistory.value = []
		currentFPS.value = 0
		frameTime.value = 0

		logger.info('usePerformance', 'Performance monitoring reset')
	}

	/**
	 * Set optimization threshold
	 * @param {number} threshold - FPS threshold for auto-optimization
	 */
	const setOptimizationThreshold = (threshold) => {
		optimizationThreshold.value = Math.max(10, Math.min(120, threshold))
		logger.info('usePerformance', 'Optimization threshold set', { threshold: optimizationThreshold.value })
	}

	/**
	 * Toggle auto-optimization
	 */
	const toggleAutoOptimization = () => {
		autoOptimize.value = !autoOptimize.value
		logger.info('usePerformance', 'Auto-optimization toggled', { enabled: autoOptimize.value })
	}

	/**
	 * Get available performance modes
	 * @return {Array} Available performance modes
	 */
	const getAvailableModes = () => {
		return [
			{ value: 'low', label: 'Low Performance', description: '30 FPS, no shadows, low quality' },
			{ value: 'balanced', label: 'Balanced', description: '60 FPS, good quality, balanced settings' },
			{ value: 'high', label: 'High Performance', description: '60 FPS, high quality, optimized' },
			{ value: 'ultra', label: 'Ultra Performance', description: '120 FPS, maximum quality' },
		]
	}

	/**
	 * Get performance recommendations
	 * @return {Array} Performance recommendations
	 */
	const getPerformanceRecommendations = () => {
		const recommendations = []

		if (currentFPS.value < 30) {
			recommendations.push('Consider reducing model complexity or enabling LOD')
		}

		if (memoryUsage.value > maxMemoryUsage.value * 0.8) {
			recommendations.push('High memory usage detected, consider reducing model quality')
		}

		if (drawCalls.value > maxDrawCalls.value * 0.8) {
			recommendations.push('High draw call count, consider merging geometries')
		}

		if (triangles.value > maxTriangles.value * 0.8) {
			recommendations.push('High triangle count, consider using LOD or reducing model complexity')
		}

		if (pixelRatio.value > 1.5) {
			recommendations.push('High pixel ratio may impact performance on some devices')
		}

		return recommendations
	}

	/**
	 * Dispose of performance resources
	 */
	const dispose = () => {
		performanceHistory.value = []
		frameCount.value = 0
		lastTime.value = 0

		logger.info('usePerformance', 'Performance resources disposed')
	}

	return {
		// State (readonly wrappers removed for Vue 2.7 compatibility)
		performanceMode,
		targetFPS,
		currentFPS,
		frameTime,
		memoryUsage,
		drawCalls,
		triangles,
		antialias,
		shadows,
		pixelRatio,
		maxPixelRatio,
		lodEnabled,
		frustumCulling,
		occlusionCulling,
		autoOptimize,
		optimizationThreshold,
		maxTriangles,
		maxDrawCalls,
		maxMemoryUsage,
		performanceHistory,

		// Computed
		currentPerformanceMode,
		targetFrameRate,
		currentFrameRate,
		currentFrameTime,
		currentMemoryUsage,
		currentDrawCalls,
		currentTriangles,
		isAntialiasEnabled,
		areShadowsEnabled,
		currentPixelRatio,
		isLODEnabled,
		isFrustumCullingEnabled,
		isOcclusionCullingEnabled,
		isAutoOptimizeEnabled,
		performanceScore,

		// Methods
		initPerformance,
		setPerformanceMode,
		applyPerformanceSettings,
		startPerformanceMonitoring,
		updatePerformanceMetrics,
		optimizeLOD,
		simplifyGeometry,
		calculatePerformanceScore,
		getCurrentSettings,
		getPerformanceStats,
		resetPerformanceMonitoring,
		setOptimizationThreshold,
		toggleAutoOptimization,
		getAvailableModes,
		getPerformanceRecommendations,
		dispose,
	}
}
