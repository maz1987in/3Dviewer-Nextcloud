/**
 * Progressive texture loading composable
 * Loads textures asynchronously after displaying model geometry
 */

import { ref, readonly, computed } from 'vue'
import { logger } from '../utils/logger.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'

export function useProgressiveTextures() {
	// State
	const loadingTextures = ref(false)
	const textureProgress = ref({ loaded: 0, total: 0 })
	const pendingTextures = ref([])
	const loadedTextures = ref(0)
	const failedTextures = ref([])

	/**
	 * Queue texture for progressive loading
	 * @param {THREE.Material} material - Target material
	 * @param {string} propertyName - Texture property name ('map', 'normalMap', etc.)
	 * @param {string} textureUrl - Texture URL or path
	 * @param {object} loader - Texture loader instance
	 */
	const queueTexture = (material, propertyName, textureUrl, loader) => {
		if (!material || !propertyName || !textureUrl || !loader) {
			logger.warn('useProgressiveTextures', 'Invalid parameters for queueTexture')
			return
		}

		pendingTextures.value.push({
			material,
			propertyName,
			textureUrl,
			loader,
			id: `${material.uuid}_${propertyName}`,
		})

		logger.info('useProgressiveTextures', 'Texture queued', {
			propertyName,
			textureUrl,
			queueSize: pendingTextures.value.length,
		})
	}

	/**
	 * Load a single texture asynchronously
	 * @param {object} textureJob - Texture job object
	 * @return {Promise<void>}
	 */
	const loadTextureAsync = async (textureJob) => {
		const { material, propertyName, textureUrl, loader } = textureJob

		return new Promise((resolve) => {
			try {
				loader.load(
					textureUrl,
					(texture) => {
						if (texture && material) {
							// Apply texture to material
							material[propertyName] = texture
							material.needsUpdate = true

							// Adjust material properties when texture is applied
							if (propertyName === 'map') {
								// Reduce roughness when diffuse map is applied
								if (material.roughness !== undefined && material.roughness > 0.5) {
									material.roughness = 0.5
								}
							}

							loadedTextures.value++
							textureProgress.value.loaded = loadedTextures.value

							logger.info('useProgressiveTextures', 'Texture loaded and applied', {
								propertyName,
								textureUrl,
								progress: `${loadedTextures.value}/${textureProgress.value.total}`,
							})
						}
						resolve()
					},
					undefined, // onProgress
					(error) => {
						// Track failed texture
						failedTextures.value.push({
							url: textureUrl,
							propertyName,
							materialName: material?.name || 'unnamed',
							error: error?.message || 'Unknown error',
							timestamp: Date.now(),
						})

						logger.warn('useProgressiveTextures', 'Texture loading failed', {
							textureUrl,
							error: error?.message,
						})
						loadedTextures.value++
						textureProgress.value.loaded = loadedTextures.value
						resolve() // Continue even if texture fails
					},
				)
			} catch (error) {
				// Track unexpected errors
				failedTextures.value.push({
					url: textureUrl,
					propertyName,
					materialName: material?.name || 'unnamed',
					error: error?.message || 'Unexpected error',
					timestamp: Date.now(),
				})

				logger.error('useProgressiveTextures', 'Error loading texture', error)
				loadedTextures.value++
				textureProgress.value.loaded = loadedTextures.value
				resolve()
			}
		})
	}

	/**
	 * Start progressive texture loading
	 */
	const startProgressiveLoading = async () => {
		if (pendingTextures.value.length === 0) {
			logger.info('useProgressiveTextures', 'No textures to load')
			return
		}

		loadingTextures.value = true
		loadedTextures.value = 0
		textureProgress.value = {
			loaded: 0,
			total: pendingTextures.value.length,
		}

		logger.info('useProgressiveTextures', 'Starting progressive texture loading', {
			totalTextures: pendingTextures.value.length,
		})

		const batchSize = VIEWER_CONFIG.progressiveLoading?.textureBatchSize || 3
		const delay = VIEWER_CONFIG.progressiveLoading?.textureDelay || 100

		// Load textures in batches
		for (let i = 0; i < pendingTextures.value.length; i += batchSize) {
			const batch = pendingTextures.value.slice(i, i + batchSize)

			// Load batch in parallel
			await Promise.all(batch.map((job) => loadTextureAsync(job)))

			// Small delay between batches to prevent overwhelming the system
			if (i + batchSize < pendingTextures.value.length) {
				await new Promise((resolve) => setTimeout(resolve, delay))
			}
		}

		logger.info('useProgressiveTextures', 'Progressive texture loading complete', {
			loaded: loadedTextures.value,
			total: textureProgress.value.total,
		})

		loadingTextures.value = false
	}

	/**
	 * Clear texture queue
	 */
	const clearQueue = () => {
		pendingTextures.value = []
		loadedTextures.value = 0
		textureProgress.value = { loaded: 0, total: 0 }
		loadingTextures.value = false
		failedTextures.value = []
		logger.info('useProgressiveTextures', 'Texture queue cleared')
	}

	/**
	 * Get summary of texture loading failures
	 * @return {object} Summary with counts and details
	 */
	const getFailureSummary = () => {
		const summary = {
			count: failedTextures.value.length,
			textures: failedTextures.value.map(f => ({
				name: f.url.split('/').pop(),
				type: f.propertyName,
				material: f.materialName,
			})),
			message: '',
		}

		if (summary.count === 0) {
			summary.message = 'All textures loaded successfully'
		} else if (summary.count === 1) {
			summary.message = `1 texture could not be loaded: ${summary.textures[0].name}`
		} else {
			summary.message = `${summary.count} textures could not be loaded`
		}

		return summary
	}

	// Computed properties
	const hasFailures = computed(() => failedTextures.value.length > 0)

	return {
		// State (readonly)
		loadingTextures: readonly(loadingTextures),
		textureProgress: readonly(textureProgress),
		pendingTextures: readonly(pendingTextures),
		loadedTextures: readonly(loadedTextures),
		failedTextures: readonly(failedTextures),
		hasFailures,

		// Methods
		queueTexture,
		startProgressiveLoading,
		loadTextureAsync,
		clearQueue,
		getFailureSummary,
	}
}
