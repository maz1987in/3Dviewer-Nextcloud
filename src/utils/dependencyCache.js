/**
 * Dependency caching utility using IndexedDB
 * Caches MTL files, textures, and other model dependencies
 */

import { logger } from './logger.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'

// Database reference
let db = null
let isInitialized = false
let cacheEnabled = true

/**
 * Generate cache key from file ID and filename
 * @param {number} fileId - File ID
 * @param {string} filename - Filename
 * @return {string} Cache key
 */
export function generateCacheKey(fileId, filename) {
	return `dep_${fileId}_${filename.toLowerCase()}`
}

/**
 * Open IndexedDB connection
 * @return {Promise<IDBDatabase>} Database instance
 */
const openDB = () => {
	return new Promise((resolve, reject) => {
		if (!window.indexedDB) {
			reject(new Error('IndexedDB not supported'))
			return
		}

		const dbName = VIEWER_CONFIG.cache?.dbName || '3DViewerCache'
		const dbVersion = VIEWER_CONFIG.cache?.dbVersion || 1

		const request = indexedDB.open(dbName, dbVersion)

		request.onerror = () => {
			logger.error('DependencyCache', 'Failed to open database', request.error)
			reject(request.error)
		}

		request.onsuccess = () => {
			resolve(request.result)
		}

		request.onupgradeneeded = (event) => {
			const database = event.target.result

			// Create dependencies store if it doesn't exist
			if (!database.objectStoreNames.contains('dependencies')) {
				const store = database.createObjectStore('dependencies', { keyPath: 'cacheKey' })
				store.createIndex('timestamp', 'timestamp', { unique: false })
				store.createIndex('fileId', 'fileId', { unique: false })
				store.createIndex('filename', 'filename', { unique: false })
				store.createIndex('expiresAt', 'expiresAt', { unique: false })
				
				logger.info('DependencyCache', 'Database schema created')
			}
		}
	})
}

/**
 * Initialize cache system
 * @return {Promise<boolean>} Success status
 */
export async function initCache() {
	if (isInitialized) {
		return true
	}

	try {
		// Check if caching is enabled in config
		if (VIEWER_CONFIG.cache?.enabled === false) {
			logger.info('DependencyCache', 'Caching disabled in config')
			cacheEnabled = false
			return false
		}

		// Check IndexedDB support
		if (!window.indexedDB) {
			logger.warn('DependencyCache', 'IndexedDB not supported, caching disabled')
			cacheEnabled = false
			return false
		}

		db = await openDB()
		isInitialized = true
		
		logger.info('DependencyCache', 'Cache initialized successfully')
		
		// Auto-cleanup expired entries if enabled
		if (VIEWER_CONFIG.cache?.autoCleanup !== false) {
			await clearExpired()
		}
		
		return true
	} catch (error) {
		logger.error('DependencyCache', 'Failed to initialize cache', error)
		cacheEnabled = false
		return false
	}
}

/**
 * Get cached entry
 * @param {string} cacheKey - Cache key
 * @return {Promise<object|null>} Cached entry or null
 */
export async function getCached(cacheKey) {
	if (!cacheEnabled || !isInitialized) {
		return null
	}

	try {
		const database = db || await openDB()
		const tx = database.transaction(['dependencies'], 'readonly')
		const store = tx.objectStore('dependencies')
		const request = store.get(cacheKey)

		return new Promise((resolve, reject) => {
			request.onsuccess = () => {
				const entry = request.result

				if (!entry) {
					resolve(null)
					return
				}

				// Check if expired
				const now = Date.now()
				if (entry.expiresAt && entry.expiresAt < now) {
					logger.info('DependencyCache', 'Cache entry expired', { cacheKey })
					// Remove expired entry
					removeCached(cacheKey).catch(() => {})
					resolve(null)
					return
				}

				logger.info('DependencyCache', 'Cache hit', { cacheKey, size: entry.size })
				resolve({
					...entry,
					expired: false,
				})
			}

			request.onerror = () => {
				logger.warn('DependencyCache', 'Failed to get cached entry', request.error)
				resolve(null)
			}
		})
	} catch (error) {
		logger.warn('DependencyCache', 'Cache read error', error)
		return null
	}
}

/**
 * Store entry in cache
 * @param {string} cacheKey - Cache key
 * @param {object} data - Data to cache
 * @param {object} options - Cache options
 * @return {Promise<boolean>} Success status
 */
export async function setCached(cacheKey, data, options = {}) {
	if (!cacheEnabled || !isInitialized) {
		return false
	}

	try {
		const database = db || await openDB()
		const now = Date.now()
		const expirationDays = options.expirationDays || VIEWER_CONFIG.cache?.expirationDays || 7
		const expiresAt = now + (expirationDays * 24 * 60 * 60 * 1000)

		const entrySizeMB = data.size / (1024 * 1024)
		const maxFileSizeMB = VIEWER_CONFIG.cache?.maxFileSizeMB || 10

		// Skip if file is too large to prevent memory issues
		if (entrySizeMB > maxFileSizeMB) {
			logger.info('DependencyCache', 'File too large to cache, skipping', { 
				filename: data.filename, 
				sizeMB: entrySizeMB.toFixed(2),
				maxMB: maxFileSizeMB 
			})
			return false
		}

		const entry = {
			cacheKey,
			fileId: data.fileId,
			filename: data.filename,
			data: data.data,
			mimeType: data.mimeType,
			size: data.size,
			timestamp: now,
			expiresAt,
			etag: data.etag || null,
		}

		// Check cache size limit
		const currentSize = await getCacheSize()
		const maxSizeMB = VIEWER_CONFIG.cache?.maxSizeMB || 100

		if (currentSize + entrySizeMB > maxSizeMB) {
			logger.warn('DependencyCache', 'Cache size limit exceeded, evicting old entries')
			await evictOldEntries(entrySizeMB)
		}

		const tx = database.transaction(['dependencies'], 'readwrite')
		const store = tx.objectStore('dependencies')
		const request = store.put(entry)

		return new Promise((resolve) => {
			request.onsuccess = () => {
				logger.info('DependencyCache', 'Cache entry stored', { 
					cacheKey, 
					sizeMB: entrySizeMB.toFixed(2) 
				})
				resolve(true)
			}

			request.onerror = () => {
				logger.warn('DependencyCache', 'Failed to store cache entry', request.error)
				resolve(false)
			}
		})
	} catch (error) {
		logger.warn('DependencyCache', 'Cache write error', error)
		return false
	}
}

/**
 * Remove cached entry
 * @param {string} cacheKey - Cache key
 * @return {Promise<boolean>} Success status
 */
export async function removeCached(cacheKey) {
	if (!cacheEnabled || !isInitialized) {
		return false
	}

	try {
		const database = db || await openDB()
		const tx = database.transaction(['dependencies'], 'readwrite')
		const store = tx.objectStore('dependencies')
		const request = store.delete(cacheKey)

		return new Promise((resolve) => {
			request.onsuccess = () => {
				logger.info('DependencyCache', 'Cache entry removed', { cacheKey })
				resolve(true)
			}

			request.onerror = () => {
				logger.warn('DependencyCache', 'Failed to remove cache entry', request.error)
				resolve(false)
			}
		})
	} catch (error) {
		logger.warn('DependencyCache', 'Cache remove error', error)
		return false
	}
}

/**
 * Clear expired cache entries
 * @return {Promise<number>} Number of entries removed
 */
export async function clearExpired() {
	if (!cacheEnabled || !isInitialized) {
		return 0
	}

	try {
		const database = db || await openDB()
		const now = Date.now()
		const tx = database.transaction(['dependencies'], 'readwrite')
		const store = tx.objectStore('dependencies')
		const index = store.index('expiresAt')
		const request = index.openCursor()

		let removedCount = 0

		return new Promise((resolve) => {
			request.onsuccess = (event) => {
				const cursor = event.target.result
				if (cursor) {
					if (cursor.value.expiresAt < now) {
						cursor.delete()
						removedCount++
					}
					cursor.continue()
				} else {
					logger.info('DependencyCache', 'Expired entries cleared', { count: removedCount })
					resolve(removedCount)
				}
			}

			request.onerror = () => {
				logger.warn('DependencyCache', 'Failed to clear expired entries', request.error)
				resolve(0)
			}
		})
	} catch (error) {
		logger.warn('DependencyCache', 'Clear expired error', error)
		return 0
	}
}

/**
 * Clear all cache entries
 * @return {Promise<boolean>} Success status
 */
export async function clearAll() {
	if (!isInitialized) {
		return false
	}

	try {
		const database = db || await openDB()
		const tx = database.transaction(['dependencies'], 'readwrite')
		const store = tx.objectStore('dependencies')
		const request = store.clear()

		return new Promise((resolve) => {
			request.onsuccess = () => {
				logger.info('DependencyCache', 'All cache entries cleared')
				resolve(true)
			}

			request.onerror = () => {
				logger.warn('DependencyCache', 'Failed to clear cache', request.error)
				resolve(false)
			}
		})
	} catch (error) {
		logger.error('DependencyCache', 'Clear all error', error)
		return false
	}
}

/**
 * Get total cache size in MB
 * @return {Promise<number>} Cache size in MB
 */
export async function getCacheSize() {
	if (!cacheEnabled || !isInitialized) {
		return 0
	}

	try {
		const database = db || await openDB()
		const tx = database.transaction(['dependencies'], 'readonly')
		const store = tx.objectStore('dependencies')
		const request = store.getAll()

		return new Promise((resolve) => {
			request.onsuccess = () => {
				const total = request.result.reduce((sum, entry) => sum + (entry.size || 0), 0)
				resolve(total / (1024 * 1024))
			}

			request.onerror = () => {
				logger.warn('DependencyCache', 'Failed to get cache size', request.error)
				resolve(0)
			}
		})
	} catch (error) {
		logger.warn('DependencyCache', 'Get cache size error', error)
		return 0
	}
}

/**
 * Get cache statistics
 * @return {Promise<object>} Cache statistics
 */
export async function getCacheStats() {
	if (!cacheEnabled || !isInitialized) {
		return { enabled: false, count: 0, sizeMB: 0 }
	}

	try {
		const database = db || await openDB()
		const tx = database.transaction(['dependencies'], 'readonly')
		const store = tx.objectStore('dependencies')
		const request = store.getAll()

		return new Promise((resolve) => {
			request.onsuccess = () => {
				const entries = request.result
				const totalSize = entries.reduce((sum, entry) => sum + (entry.size || 0), 0)
				const now = Date.now()
				const expiredCount = entries.filter(e => e.expiresAt < now).length

				resolve({
					enabled: true,
					count: entries.length,
					sizeMB: totalSize / (1024 * 1024),
					expiredCount,
				})
			}

			request.onerror = () => {
				logger.warn('DependencyCache', 'Failed to get cache stats', request.error)
				resolve({ enabled: false, count: 0, sizeMB: 0 })
			}
		})
	} catch (error) {
		logger.warn('DependencyCache', 'Get cache stats error', error)
		return { enabled: false, count: 0, sizeMB: 0 }
	}
}

/**
 * Evict old entries to make room for new ones (LRU)
 * @param {number} requiredSizeMB - Required space in MB
 * @return {Promise<void>}
 */
async function evictOldEntries(requiredSizeMB) {
	try {
		const database = db || await openDB()
		const tx = database.transaction(['dependencies'], 'readwrite')
		const store = tx.objectStore('dependencies')
		const index = store.index('timestamp')
		const request = index.openCursor()

		let freedSpace = 0
		const entries = []

		return new Promise((resolve) => {
			// Collect all entries
			request.onsuccess = (event) => {
				const cursor = event.target.result
				if (cursor) {
					entries.push({
						key: cursor.value.cacheKey,
						timestamp: cursor.value.timestamp,
						size: cursor.value.size,
					})
					cursor.continue()
				} else {
					// Sort by timestamp (oldest first)
					entries.sort((a, b) => a.timestamp - b.timestamp)

					// Delete oldest entries until we have enough space
					const deleteTx = database.transaction(['dependencies'], 'readwrite')
					const deleteStore = deleteTx.objectStore('dependencies')
					
					for (const entry of entries) {
						if (freedSpace >= requiredSizeMB * 1024 * 1024) {
							break
						}
						deleteStore.delete(entry.key)
						freedSpace += entry.size
					}

					logger.info('DependencyCache', 'Evicted old entries', { 
						freedMB: (freedSpace / (1024 * 1024)).toFixed(2) 
					})
					resolve()
				}
			}
		})
	} catch (error) {
		logger.warn('DependencyCache', 'Eviction error', error)
	}
}

/**
 * Check if cache is available and enabled
 * @return {boolean} Cache availability
 */
export function isCacheAvailable() {
	return cacheEnabled && isInitialized
}

/**
 * Disable caching (for fallback scenarios)
 */
export function disableCache() {
	cacheEnabled = false
	logger.info('DependencyCache', 'Caching disabled')
}

