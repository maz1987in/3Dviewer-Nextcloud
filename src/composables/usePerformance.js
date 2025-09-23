/**
 * Performance optimization composable
 * Handles performance monitoring, optimization, and quality settings
 */

import { ref, computed, readonly } from 'vue'
import * as THREE from 'three'
import { logError } from '../utils/error-handler.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'

export function usePerformance() {
	// Performance state
	const performanceMode = ref('balanced')
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
	 * Initialize performance monitoring
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 */
	const initPerformance = (renderer) => {
		if (!renderer) return

		// Set initial performance settings
		applyPerformanceSettings(renderer)

		// Start performance monitoring
		startPerformanceMonitoring()

		logError('usePerformance', 'Performance monitoring initialized', {
			mode: performanceMode.value,
			targetFPS: targetFPS.value,
		})
	}

	/**
	 * Set performance mode
	 * @param {string} mode - Performance mode ('low', 'balanced', 'high', 'ultra')
	 */
	const setPerformanceMode = (mode) => {
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
			break
		case 'balanced':
			antialias.value = true
			shadows.value = true
			pixelRatio.value = 1
			lodEnabled.value = true
			frustumCulling.value = true
			occlusionCulling.value = false
			targetFPS.value = 60
			break
		case 'high':
			antialias.value = true
			shadows.value = true
			pixelRatio.value = 1.5
			lodEnabled.value = true
			frustumCulling.value = true
			occlusionCulling.value = true
			targetFPS.value = 60
			break
		case 'ultra':
			antialias.value = true
			shadows.value = true
			pixelRatio.value = 2
			lodEnabled.value = true
			frustumCulling.value = true
			occlusionCulling.value = true
			targetFPS.value = 120
			break
		}

		logError('usePerformance', 'Performance mode set', { mode, settings: getCurrentSettings() })
	}

	/**
	 * Apply performance settings to renderer
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 */
	const applyPerformanceSettings = (renderer) => {
		if (!renderer) return

		// Set pixel ratio
		renderer.setPixelRatio(Math.min(pixelRatio.value, maxPixelRatio.value))

		// Set antialias
		if (renderer.antialias !== antialias.value) {
			// Note: antialias can't be changed after renderer creation
			logError('usePerformance', 'Antialias setting requires renderer recreation')
		}

		// Set shadows
		renderer.shadowMap.enabled = shadows.value
		renderer.shadowMap.type = shadows.value ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap

		logError('usePerformance', 'Performance settings applied', {
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

		logError('usePerformance', 'Performance monitoring started')
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
				logError('usePerformance', 'Auto-optimization: Reduced pixel ratio', { pixelRatio: pixelRatio.value })
			}

			if (shadows.value && currentFPS.value < 20) {
				shadows.value = false
				renderer.shadowMap.enabled = false
				logError('usePerformance', 'Auto-optimization: Disabled shadows')
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
			logError('usePerformance', 'LOD optimization applied', { optimizedCount })
		}
	}

	/**
	 * Simplify geometry
	 * @param {THREE.BufferGeometry} geometry - Geometry to simplify
	 * @param {number} ratio - Simplification ratio (0-1)
	 */
	const simplifyGeometry = (geometry, ratio) => {
		if (!geometry.attributes.position) return

		const positions = geometry.attributes.position.array
		const indices = geometry.index ? geometry.index.array : null

		if (indices && ratio < 0.8) {
			// Simplify by reducing triangle count
			const newIndexCount = Math.floor(indices.length * ratio)
			const newIndices = new Uint32Array(newIndexCount)

			for (let i = 0; i < newIndexCount; i++) {
				newIndices[i] = indices[Math.floor(i / ratio)]
			}

			geometry.setIndex(newIndices)
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
		const avgFPS = performanceHistory.value.length > 0
			? performanceHistory.value.reduce((sum, entry) => sum + entry.fps, 0) / performanceHistory.value.length
			: 0

		const avgFrameTime = performanceHistory.value.length > 0
			? performanceHistory.value.reduce((sum, entry) => sum + entry.frameTime, 0) / performanceHistory.value.length
			: 0

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

		logError('usePerformance', 'Performance monitoring reset')
	}

	/**
	 * Set optimization threshold
	 * @param {number} threshold - FPS threshold for auto-optimization
	 */
	const setOptimizationThreshold = (threshold) => {
		optimizationThreshold.value = Math.max(10, Math.min(120, threshold))
		logError('usePerformance', 'Optimization threshold set', { threshold: optimizationThreshold.value })
	}

	/**
	 * Toggle auto-optimization
	 */
	const toggleAutoOptimization = () => {
		autoOptimize.value = !autoOptimize.value
		logError('usePerformance', 'Auto-optimization toggled', { enabled: autoOptimize.value })
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

		logError('usePerformance', 'Performance resources disposed')
	}

	return {
		// State
		performanceMode: readonly(performanceMode),
		targetFPS: readonly(targetFPS),
		currentFPS: readonly(currentFPS),
		frameTime: readonly(frameTime),
		memoryUsage: readonly(memoryUsage),
		drawCalls: readonly(drawCalls),
		triangles: readonly(triangles),
		antialias: readonly(antialias),
		shadows: readonly(shadows),
		pixelRatio: readonly(pixelRatio),
		maxPixelRatio: readonly(maxPixelRatio),
		lodEnabled: readonly(lodEnabled),
		frustumCulling: readonly(frustumCulling),
		occlusionCulling: readonly(occlusionCulling),
		autoOptimize: readonly(autoOptimize),
		optimizationThreshold: readonly(optimizationThreshold),
		maxTriangles: readonly(maxTriangles),
		maxDrawCalls: readonly(maxDrawCalls),
		maxMemoryUsage: readonly(maxMemoryUsage),
		performanceHistory: readonly(performanceHistory),

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
