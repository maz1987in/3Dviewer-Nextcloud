/**
 * Base loader class providing common functionality for all 3D model loaders
 */

import * as THREE from 'three'
import { 
  createStandardMaterial, 
  calculateBoundingBox, 
  centerObject, 
  applyWireframe,
  disposeObject 
} from '../utils/three-utils.js'
import { 
  handleLoaderError, 
  createErrorState, 
  withErrorBoundary 
} from '../utils/error-handler.js'
import { 
  validateArrayBuffer, 
  validateFileExtension 
} from '../utils/validation.js'
import { 
  ERROR_TYPES, 
  LOADING_STAGES 
} from '../constants/index.js'

/**
 * Base loader class with common functionality
 */
export class BaseLoader {
  constructor(loaderName, supportedExtensions = []) {
    this.loaderName = loaderName
    this.supportedExtensions = supportedExtensions
    this.isLoading = false
    this.abortController = null
  }

  /**
   * Load a 3D model from ArrayBuffer
   * @param {ArrayBuffer} arrayBuffer - File data
   * @param {Object} context - Loading context
   * @returns {Promise<Object>} Load result
   */
  async load(arrayBuffer, context) {
    return withErrorBoundary(async () => {
      this.isLoading = true
      this.abortController = new AbortController()
      
      try {
        // Validate input
        this.validateInput(arrayBuffer, context)
        
        // Update progress
        this.updateProgress(context, 0, 100, LOADING_STAGES.PARSING)
        
        // Load the model
        const result = await this.loadModel(arrayBuffer, context)
        
        // Update progress
        this.updateProgress(context, 100, 100, LOADING_STAGES.COMPLETE)
        
        return result
      } finally {
        this.isLoading = false
        this.abortController = null
      }
    }, this.loaderName)
  }

  /**
   * Validate input parameters
   * @param {ArrayBuffer} arrayBuffer - File data
   * @param {Object} context - Loading context
   * @throws {Error} If validation fails
   */
  validateInput(arrayBuffer, context) {
    validateArrayBuffer(arrayBuffer, `${this.loaderName} file`)
    
    if (context.extension) {
      validateFileExtension(context.extension, this.supportedExtensions, `${this.loaderName} file`)
    }
  }

  /**
   * Load the actual model (to be implemented by subclasses)
   * @param {ArrayBuffer} arrayBuffer - File data
   * @param {Object} context - Loading context
   * @returns {Promise<Object>} Load result
   */
  async loadModel(arrayBuffer, context) {
    throw new Error(`${this.loaderName} must implement loadModel method`)
  }

  /**
   * Create a standard material for the model
   * @param {Object} options - Material options
   * @returns {THREE.Material} Material
   */
  createMaterial(options = {}) {
    return createStandardMaterial({
      color: 0x888888,
      metalness: 0.1,
      roughness: 0.8,
      ...options
    })
  }

  /**
   * Create a basic material for simple objects
   * @param {Object} options - Material options
   * @returns {THREE.Material} Material
   */
  createBasicMaterial(options = {}) {
    return new THREE.MeshBasicMaterial({
      color: 0x666666,
      transparent: true,
      opacity: 0.6,
      ...options
    })
  }

  /**
   * Process the loaded model
   * @param {THREE.Object3D} object3D - Loaded object
   * @param {Object} context - Loading context
   * @returns {Object} Processed result
   */
  processModel(object3D, context) {
    // Validate object
    if (!object3D || !object3D.isObject3D) {
      throw new Error('Invalid 3D object loaded')
    }

    // Remove placeholder objects
    this.ensurePlaceholderRemoved(context)

    // Apply wireframe if needed
    if (context.wireframe) {
      applyWireframe(object3D, true)
    }

    // Calculate bounding box
    const { box, center, size } = calculateBoundingBox(object3D)

    // Center the model
    centerObject(object3D)

    // Add to scene if provided
    if (context.scene) {
      context.scene.add(object3D)
    }

    return {
      object3D,
      boundingBox: box,
      center,
      size,
      isEmpty: box.isEmpty()
    }
  }

  /**
   * Ensure placeholder objects are removed
   * @param {Object} context - Loading context
   */
  ensurePlaceholderRemoved(context) {
    if (context.ensurePlaceholderRemoved && typeof context.ensurePlaceholderRemoved === 'function') {
      context.ensurePlaceholderRemoved()
    }
  }

  /**
   * Update loading progress
   * @param {Object} context - Loading context
   * @param {number} loaded - Bytes loaded
   * @param {number} total - Total bytes
   * @param {string} stage - Loading stage
   */
  updateProgress(context, loaded, total, stage) {
    if (context.updateProgress && typeof context.updateProgress === 'function') {
      context.updateProgress(loaded, total, stage)
    }
  }

  /**
   * Log information message
   * @param {string} message - Message to log
   * @param {Object} data - Additional data
   */
  logInfo(message, data = {}) {
    console.log(`[${this.loaderName}] ${message}`, data)
  }

  /**
   * Log warning message
   * @param {string} message - Message to log
   * @param {Object} data - Additional data
   */
  logWarning(message, data = {}) {
    console.warn(`[${this.loaderName}] ${message}`, data)
  }

  /**
   * Log error message
   * @param {string} message - Message to log
   * @param {Error} error - Error object
   */
  logError(message, error) {
    console.error(`[${this.loaderName}] ${message}`, error)
  }

  /**
   * Create a mesh with geometry and material
   * @param {THREE.BufferGeometry} geometry - Geometry
   * @param {THREE.Material} material - Material
   * @param {Object} options - Additional options
   * @returns {THREE.Mesh} Mesh
   */
  createMesh(geometry, material, options = {}) {
    const mesh = new THREE.Mesh(geometry, material)
    
    if (options.position) {
      mesh.position.copy(options.position)
    }
    if (options.rotation) {
      mesh.rotation.copy(options.rotation)
    }
    if (options.scale) {
      mesh.scale.copy(options.scale)
    }
    
    return mesh
  }

  /**
   * Create a group to hold multiple objects
   * @param {THREE.Object3D[]} objects - Objects to group
   * @returns {THREE.Group} Group
   */
  createGroup(objects = []) {
    const group = new THREE.Group()
    objects.forEach(obj => group.add(obj))
    return group
  }

  /**
   * Dispose of resources to prevent memory leaks
   * @param {THREE.Object3D} object3D - Object to dispose
   */
  dispose(object3D) {
    if (object3D) {
      disposeObject(object3D)
    }
  }

  /**
   * Cancel ongoing loading operation
   */
  cancel() {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.isLoading = false
  }

  /**
   * Check if loader is currently loading
   * @returns {boolean} Loading state
   */
  getLoadingState() {
    return this.isLoading
  }

  /**
   * Get supported file extensions
   * @returns {string[]} Supported extensions
   */
  getSupportedExtensions() {
    return [...this.supportedExtensions]
  }

  /**
   * Check if extension is supported
   * @param {string} extension - File extension
   * @returns {boolean} Whether extension is supported
   */
  isSupported(extension) {
    return this.supportedExtensions.includes(extension.toLowerCase())
  }

  /**
   * Create error state for UI display
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   * @returns {Object} Error state
   */
  createErrorState(error, context = {}) {
    return createErrorState(error, {
      loaderName: this.loaderName,
      ...context
    })
  }

  /**
   * Handle loading errors
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   * @returns {Error} Processed error
   */
  handleError(error, context = {}) {
    return handleLoaderError(this.loaderName, error, context)
  }
}

/**
 * Factory function to create loader instances
 * @param {string} loaderName - Name of the loader
 * @param {string[]} supportedExtensions - Supported file extensions
 * @returns {BaseLoader} Loader instance
 */
export function createLoader(loaderName, supportedExtensions) {
  return new BaseLoader(loaderName, supportedExtensions)
}

/**
 * Mixin for loaders that need to handle materials
 */
export const MaterialLoaderMixin = {
  /**
   * Load material from URL
   * @param {string} url - Material URL
   * @param {Object} options - Loading options
   * @returns {Promise<THREE.Material>} Loaded material
   */
  async loadMaterial(url, options = {}) {
    try {
      const response = await fetch(url, {
        signal: this.abortController?.signal,
        ...options
      })
      
      if (!response.ok) {
        throw new Error(`Failed to load material: ${response.status}`)
      }
      
      const text = await response.text()
      return this.parseMaterial(text, options)
    } catch (error) {
      this.logWarning('Failed to load material', { url, error: error.message })
      return null
    }
  },

  /**
   * Parse material text (to be implemented by subclasses)
   * @param {string} text - Material text
   * @param {Object} options - Parsing options
   * @returns {THREE.Material} Parsed material
   */
  parseMaterial(text, options) {
    throw new Error('parseMaterial must be implemented by subclasses')
  }
}

/**
 * Mixin for loaders that need to handle textures
 */
export const TextureLoaderMixin = {
  /**
   * Load texture from URL
   * @param {string} url - Texture URL
   * @param {Object} options - Loading options
   * @returns {Promise<THREE.Texture>} Loaded texture
   */
  async loadTexture(url, options = {}) {
    try {
      const loader = new THREE.TextureLoader()
      return new Promise((resolve, reject) => {
        const texture = loader.load(
          url,
          resolve,
          undefined,
          reject
        )
        
        if (this.abortController) {
          this.abortController.signal.addEventListener('abort', () => {
            texture.dispose()
            reject(new Error('Loading aborted'))
          })
        }
      })
    } catch (error) {
      this.logWarning('Failed to load texture', { url, error: error.message })
      return null
    }
  }
}
