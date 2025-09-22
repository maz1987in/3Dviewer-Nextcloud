/**
 * Model loading and file handling composable
 * Handles model loading, file processing, and error management
 */

import { ref, computed, readonly } from 'vue'
import { loadModelByExtension, isSupportedExtension } from '../loaders/registry.js'
import { logError, createErrorState } from '../utils/error-handler.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { LOADING_STAGES, ERROR_TYPES } from '../constants/index.js'

export function useModelLoading() {
  // Loading state
  const loading = ref(false)
  const progress = ref({ loaded: 0, total: 0, message: null })
  const retryCount = ref(0)
  const maxRetries = ref(VIEWER_CONFIG.limits.maxRetries)
  
  // Error state
  const error = ref(null)
  const errorState = ref(null)
  
  // Model state
  const modelRoot = ref(null)
  const currentFileId = ref(null)
  const abortController = ref(null)
  
  // Decoder availability
  const hasDraco = ref(false)
  const hasKtx2 = ref(false)
  const hasMeshopt = ref(false)

  // Computed properties
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== null)
  const canRetry = computed(() => retryCount.value < maxRetries.value && hasError.value)
  const progressPercentage = computed(() => {
    if (progress.value.total === 0) return 0
    return Math.round((progress.value.loaded / progress.value.total) * 100)
  })

  /**
   * Initialize decoder availability
   */
  const initDecoders = async () => {
    try {
      // Check DRACO availability
      try {
        await import('three/examples/jsm/loaders/DRACOLoader.js')
        hasDraco.value = true
      } catch (e) {
        hasDraco.value = false
      }

      // Check KTX2 availability
      try {
        await import('three/examples/jsm/loaders/KTX2Loader.js')
        hasKtx2.value = true
      } catch (e) {
        hasKtx2.value = false
      }

      // Check Meshopt availability
      try {
        await import('three/examples/jsm/libs/meshopt_decoder.module.js')
        hasMeshopt.value = true
      } catch (e) {
        hasMeshopt.value = false
        // Log WebAssembly CSP errors as warnings, not errors
        if (e.message && e.message.includes('WebAssembly')) {
          logError('useModelLoading', 'Meshopt decoder blocked by CSP policy', e, 'warn')
        }
      }

      logError('useModelLoading', 'Decoders initialized', {
        draco: hasDraco.value,
        ktx2: hasKtx2.value,
        meshopt: hasMeshopt.value
      })
    } catch (error) {
      logError('useModelLoading', 'Failed to initialize decoders', error)
    }
  }

  /**
   * Load a model from ArrayBuffer
   * @param {ArrayBuffer} arrayBuffer - File data
   * @param {string} extension - File extension
   * @param {Object} context - Loading context
   * @returns {Promise<Object>} Load result
   */
  const loadModel = async (arrayBuffer, extension, context) => {
    if (!isSupportedExtension(extension)) {
      throw new Error(`Unsupported file extension: ${extension}`)
    }

    loading.value = true
    error.value = null
    errorState.value = null
    progress.value = { loaded: 0, total: arrayBuffer.byteLength, message: 'Loading...' }

    try {
      // Create abort controller for this load
      abortController.value = new AbortController()

      // Prepare loading context
      const loadingContext = {
        ...context,
        abortController: abortController.value,
        fileExtension: extension,
        updateProgress: updateProgress,
        hasDraco: hasDraco.value,
        hasKtx2: hasKtx2.value,
        hasMeshopt: hasMeshopt.value
      }

      // Load the model
      const result = await loadModelByExtension(extension, arrayBuffer, loadingContext)

      if (result && result.object3D) {
        modelRoot.value = result.object3D
        currentFileId.value = context.fileId || null
        
        // Clear loading state
        loading.value = false
        progress.value = { loaded: arrayBuffer.byteLength, total: arrayBuffer.byteLength, message: 'Complete' }
        
        logError('useModelLoading', 'Model loaded successfully', {
          fileId: currentFileId.value,
          extension,
          children: result.object3D.children.length
        })

        return result
      } else {
        throw new Error('No valid 3D object returned from loader')
      }
    } catch (error) {
      handleLoadError(error, extension)
      throw error
    }
  }

  /**
   * Load model from file
   * @param {File} file - File object
   * @param {Object} context - Loading context
   * @returns {Promise<Object>} Load result
   */
  const loadModelFromFile = async (file, context) => {
    try {
      const arrayBuffer = await readFileAsArrayBuffer(file)
      const extension = file.name.split('.').pop().toLowerCase()
      
      return await loadModel(arrayBuffer, extension, context)
    } catch (error) {
      handleLoadError(error, file.name)
      throw error
    }
  }

  /**
   * Load model from URL
   * @param {string} url - File URL
   * @param {string} extension - File extension
   * @param {Object} context - Loading context
   * @returns {Promise<Object>} Load result
   */
  const loadModelFromUrl = async (url, extension, context) => {
    try {
      const response = await fetch(url, {
        signal: abortController.value?.signal,
        headers: {
          'Accept': 'application/octet-stream',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin'
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      return await loadModel(arrayBuffer, extension, context)
    } catch (error) {
      handleLoadError(error, url)
      throw error
    }
  }

  /**
   * Read file as ArrayBuffer
   * @param {File} file - File object
   * @returns {Promise<ArrayBuffer>} File data
   */
  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        resolve(e.target.result)
      }
      
      reader.onerror = (e) => {
        reject(new Error('Failed to read file'))
      }
      
      reader.readAsArrayBuffer(file)
    })
  }

  /**
   * Update loading progress
   * @param {number} loaded - Bytes loaded
   * @param {number} total - Total bytes
   * @param {string} stage - Loading stage
   */
  const updateProgress = (loaded, total, stage = null) => {
    progress.value = { loaded, total, message: stage }
    
    if (stage) {
      logError('useModelLoading', 'Progress update', { 
        loaded, 
        total, 
        stage, 
        percentage: Math.round((loaded / total) * 100) 
      })
    }
  }

  /**
   * Handle loading errors
   * @param {Error} error - Error object
   * @param {string} filename - File name
   */
  const handleLoadError = (error, filename) => {
    loading.value = false
    error.value = error
    errorState.value = createErrorState(error, (key) => key) // Simple translation function
    
    logError('useModelLoading', 'Model loading failed', error, 'error', {
      filename,
      retryCount: retryCount.value,
      maxRetries: maxRetries.value
    })
  }

  /**
   * Retry loading the current model
   * @param {Function} loadFunction - Function to retry
   * @returns {Promise<Object>} Load result
   */
  const retryLoad = async (loadFunction) => {
    if (retryCount.value >= maxRetries.value) {
      throw new Error('Maximum retry attempts reached')
    }

    retryCount.value++
    error.value = null
    errorState.value = null
    
    logError('useModelLoading', 'Retrying model load', { 
      attempt: retryCount.value, 
      maxRetries: maxRetries.value 
    })

    try {
      return await loadFunction()
    } catch (error) {
      handleLoadError(error, 'retry')
      throw error
    }
  }

  /**
   * Cancel ongoing load
   */
  const cancelLoad = () => {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }
    
    loading.value = false
    logError('useModelLoading', 'Load cancelled')
    // Test harness hook
    if (typeof window !== 'undefined') {
      window.__ABORTED = true
    }
  }

  /**
   * Clear error state
   */
  const clearError = () => {
    error.value = null
    errorState.value = null
    retryCount.value = 0
  }

  /**
   * Clear model
   */
  const clearModel = () => {
    if (modelRoot.value) {
      // Dispose of the model
      modelRoot.value.traverse((child) => {
        if (child.geometry) {
          child.geometry.dispose()
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
      
      modelRoot.value = null
    }
    
    currentFileId.value = null
    clearError()
    
    logError('useModelLoading', 'Model cleared')
  }

  /**
   * Get file size category
   * @param {number} size - File size in bytes
   * @returns {string} Size category
   */
  const getFileSizeCategory = (size) => {
    if (size < 1 * 1024 * 1024) return 'very_small'
    if (size < 10 * 1024 * 1024) return 'small'
    if (size < 100 * 1024 * 1024) return 'medium'
    if (size < 500 * 1024 * 1024) return 'large'
    return 'very_large'
  }

  /**
   * Format file size
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size
   */
  const formatFileSize = (bytes) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`
  }

  /**
   * Get loading stage text
   * @param {string} stage - Loading stage
   * @returns {string} Human-readable stage text
   */
  const getStageText = (stage) => {
    const stageTexts = {
      [LOADING_STAGES.INITIALIZING]: 'Initializing...',
      [LOADING_STAGES.DOWNLOADING]: 'Downloading...',
      [LOADING_STAGES.DOWNLOADED]: 'Downloaded',
      [LOADING_STAGES.PARSING]: 'Parsing...',
      [LOADING_STAGES.PROCESSING]: 'Processing...',
      [LOADING_STAGES.COMPLETE]: 'Complete',
      [LOADING_STAGES.RETRYING]: 'Retrying...',
      [LOADING_STAGES.ERROR]: 'Error',
      [LOADING_STAGES.CANCELED]: 'Canceled'
    }
    
    return stageTexts[stage] || stage
  }

  return {
    // State
    loading: readonly(loading),
    progress: readonly(progress),
    error: readonly(error),
    errorState: readonly(errorState),
    modelRoot: readonly(modelRoot),
    currentFileId: readonly(currentFileId),
    retryCount: readonly(retryCount),
    maxRetries: readonly(maxRetries),
    hasDraco: readonly(hasDraco),
    hasKtx2: readonly(hasKtx2),
    hasMeshopt: readonly(hasMeshopt),
    
    // Computed
    isLoading,
    hasError,
    canRetry,
    progressPercentage,
    
    // Methods
    initDecoders,
    loadModel,
    loadModelFromFile,
    loadModelFromUrl,
    readFileAsArrayBuffer,
    updateProgress,
    handleLoadError,
    retryLoad,
    cancelLoad,
    clearError,
    clearModel,
    getFileSizeCategory,
    formatFileSize,
    getStageText
  }
}
