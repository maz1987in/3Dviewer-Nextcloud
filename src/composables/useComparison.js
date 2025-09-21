/**
 * Comparison mode composable
 * Handles model comparison functionality, file selection, and dual model management
 */

import { ref, computed, readonly } from 'vue'
import * as THREE from 'three'
import { loadModelByExtension, isSupportedExtension } from '../loaders/registry.js'
import { logError } from '../utils/error-handler.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'

export function useComparison() {
  // Comparison state
  const comparisonMode = ref(false)
  const comparisonModel = ref(null)
  const comparisonIndicator = ref(null)
  const comparisonFiles = ref([])
  const selectedComparisonFile = ref(null)
  
  // File loading state
  const loadingComparison = ref(false)
  const comparisonError = ref(null)

  // Computed properties
  const isComparisonMode = computed(() => comparisonMode.value)
  const hasComparisonModel = computed(() => comparisonModel.value !== null)
  const canCompare = computed(() => comparisonFiles.value.length > 0)
  const isComparisonLoading = computed(() => loadingComparison.value)

  /**
   * Toggle comparison mode
   */
  const toggleComparisonMode = () => {
    comparisonMode.value = !comparisonMode.value
    
    if (comparisonMode.value) {
      setupComparisonMode()
    } else {
      clearComparison()
    }
    
    logError('useComparison', 'Comparison mode toggled', { enabled: comparisonMode.value })
  }

  /**
   * Setup comparison mode
   */
  const setupComparisonMode = () => {
    // This would typically open a file picker or modal
    // The actual implementation depends on the UI framework
    logError('useComparison', 'Comparison mode setup')
  }

  /**
   * Load comparison files from Nextcloud
   * @param {Function} modal - Modal function for file selection
   * @returns {Promise<Array>} List of available files
   */
  const loadNextcloudFiles = async (modal) => {
    try {
      let files = []
      
      // Try to get files from current context first
      if (window.OCA && window.OCA.Files && window.OCA.Files.fileList) {
        const fileList = window.OCA.Files.fileList
        if (fileList.files) {
          files = fileList.files.filter(file => 
            isSupportedExtension(file.name.split('.').pop().toLowerCase())
          )
        }
      }
      
      // If no files found, try API methods
      if (files.length === 0) {
        // Try 3D viewer OCS API
        try {
          const response = await fetch('/ocs/v2.php/apps/threedviewer/api/files', {
            headers: {
              'Accept': 'application/json',
              'OCS-APIRequest': 'true',
              'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
          })
          
          if (response.ok) {
            const data = await response.json()
            if (data.ocs && data.ocs.data && data.ocs.data.files) {
              files = data.ocs.data.files
            }
          }
        } catch (e) {
          logError('useComparison', 'OCS API failed', e)
        }
      }
      
      // If still no files, create dummy files for testing
      if (files.length === 0) {
        files = [
          { id: 'dummy1', name: 'Sample Model 1.glb', size: 1024000, path: '/dummy/path1' },
          { id: 'dummy2', name: 'Sample Model 2.obj', size: 2048000, path: '/dummy/path2' },
          { id: 'dummy3', name: 'Sample Model 3.stl', size: 512000, path: '/dummy/path3' }
        ]
        logError('useComparison', 'No files found via API, created dummy files for testing')
      }
      
      comparisonFiles.value = files
      logError('useComparison', 'Comparison files loaded', { count: files.length })
      
      return files
    } catch (error) {
      logError('useComparison', 'Failed to load comparison files', error)
      throw error
    }
  }

  /**
   * Load comparison model from Nextcloud
   * @param {Object} file - File object
   * @param {Object} context - Loading context
   * @returns {Promise<Object>} Load result
   */
  const loadComparisonModelFromNextcloud = async (file, context) => {
    try {
      loadingComparison.value = true
      comparisonError.value = null
      
      logError('useComparison', 'Loading comparison model from Nextcloud', file)
      console.log('🔍 DEBUG - Loading comparison model:', file.name, 'Context:', context)
      
      // Skip dummy files
      if (String(file.id).startsWith('dummy')) {
        throw new Error('Dummy file selected - no actual file to load')
      }
      
      // Try multiple API endpoints
      const apiEndpoints = [
        `/apps/threedviewer/api/file/${file.id}`,
        `/ocs/v2.php/apps/threedviewer/api/file/${file.id}`,
        `/index.php/apps/files/ajax/download.php?dir=${encodeURIComponent(file.path.split('/').slice(0, -1).join('/'))}&files=${encodeURIComponent(file.name)}`,
        `/remote.php/dav/files/admin${file.path}`
      ]
      
      let response = null
      let usedEndpoint = ''
      
      for (const endpoint of apiEndpoints) {
        try {
          const headers = {
            'Accept': 'application/octet-stream',
            'X-Requested-With': 'XMLHttpRequest'
          }
          
          if (endpoint.includes('/ocs/')) {
            headers['OCS-APIRequest'] = 'true'
          }
          
          response = await fetch(endpoint, {
            headers,
            credentials: 'same-origin',
            signal: context.abortController?.signal
          })
          
          if (response.ok) {
            usedEndpoint = endpoint
            break
          }
        } catch (e) {
          logError('useComparison', `API endpoint failed: ${endpoint}`, e)
        }
      }
      
      if (!response || !response.ok) {
        throw new Error(`Failed to load file from all endpoints. Last status: ${response?.status}`)
      }
      
      const arrayBuffer = await response.arrayBuffer()
      const extension = file.name.split('.').pop().toLowerCase()
      
      logError('useComparison', 'Successfully loaded file from', usedEndpoint)
      logError('useComparison', 'Detected file extension', extension)
      
      // Load the model using the appropriate loader
      const result = await loadModelByExtension(extension, arrayBuffer, {
        ...context,
        fileId: file.id,
        filename: file.name,
        THREE: context.THREE,
        scene: context.scene,
        applyWireframe: context.applyWireframe,
        ensurePlaceholderRemoved: context.ensurePlaceholderRemoved,
        wireframe: context.wireframe
      })
      
      if (result && result.object3D) {
        comparisonModel.value = result.object3D
        console.log('🔍 DEBUG - Comparison model loaded, position before indicator:', {
          x: result.object3D.position.x,
          y: result.object3D.position.y,
          z: result.object3D.position.z
        })
        
        // Add comparison indicator with proper error handling
        if (context && context.scene) {
          addComparisonIndicator(result.object3D, file.name, context.scene)
        } else {
          console.warn('🔍 DEBUG - Context or scene not available for comparison indicator')
        }
        
        console.log('🔍 DEBUG - Comparison model position after indicator:', {
          x: result.object3D.position.x,
          y: result.object3D.position.y,
          z: result.object3D.position.z
        })
        
        logError('useComparison', 'Comparison model loaded successfully')
        return result
      } else {
        throw new Error('No valid 3D object returned from loader')
      }
    } catch (error) {
      comparisonError.value = error
      logError('useComparison', 'Error loading comparison model from Nextcloud', error)
      throw error
    } finally {
      loadingComparison.value = false
    }
  }

  /**
   * Load comparison model from file
   * @param {File} file - File object
   * @param {Object} context - Loading context
   * @returns {Promise<Object>} Load result
   */
  const loadComparisonModel = async (file, context) => {
    try {
      loadingComparison.value = true
      comparisonError.value = null
      
      const arrayBuffer = await readFileAsArrayBuffer(file)
      const extension = file.name.split('.').pop().toLowerCase()
      
      // Load the model using the appropriate loader
      const result = await loadModelByExtension(extension, arrayBuffer, {
        ...context,
        fileId: 'comparison',
        THREE: context.THREE,
        scene: context.scene,
        applyWireframe: context.applyWireframe,
        ensurePlaceholderRemoved: context.ensurePlaceholderRemoved,
        wireframe: context.wireframe
      })
      
      if (result && result.object3D) {
        comparisonModel.value = result.object3D
        
        // Add comparison indicator with proper error handling
        if (context && context.scene) {
          addComparisonIndicator(result.object3D, file.name, context.scene)
        } else {
          console.warn('🔍 DEBUG - Context or scene not available for comparison indicator')
        }
        
        logError('useComparison', 'Comparison model loaded successfully')
        return result
      } else {
        throw new Error('No valid 3D object returned from loader')
      }
    } catch (error) {
      comparisonError.value = error
      logError('useComparison', 'Error loading comparison model', error)
      throw error
    } finally {
      loadingComparison.value = false
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
   * Add comparison indicator to model
   * @param {THREE.Object3D} model - Model object
   * @param {string} filename - File name
   * @param {THREE.Scene} scene - Scene object
   */
  const addComparisonIndicator = (model, filename, scene) => {
    try {
      if (!model || !scene) {
        console.warn('🔍 DEBUG - addComparisonIndicator: Missing model or scene', { 
          model: model ? 'exists' : 'null', 
          scene: scene ? 'exists' : 'null' 
        })
        return
      }
      
      // Create a small indicator above the model
      const geometry = new THREE.SphereGeometry(0.1, 8, 6)
      const material = new THREE.MeshBasicMaterial({ 
        color: VIEWER_CONFIG.comparison.defaultComparisonColor,
        transparent: true,
        opacity: 0.8
      })
      
      const indicator = new THREE.Mesh(geometry, material)
      
      // Position indicator above the model
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      
      // Position indicator relative to model's center
      indicator.position.set(0, size.y / 2 + 0.2, 0)
      
      model.add(indicator)
      comparisonIndicator.value = indicator
      
      logError('useComparison', 'Comparison indicator added', { 
        filename, 
        modelPosition: model.position,
        indicatorPosition: indicator.position 
      })
    } catch (error) {
      console.error('🔍 DEBUG - addComparisonIndicator error:', error)
      logError('useComparison', 'Failed to add comparison indicator', error)
    }
  }

  /**
   * Fit both models to view
   * @param {THREE.Object3D} model1 - First model
   * @param {THREE.Object3D} model2 - Second model
   * @param {Function} fitFunction - Function to fit camera to both models
   */
  const fitBothModelsToView = (model1, model2, fitFunction) => {
    console.log('🔍 DEBUG - fitBothModelsToView called:', { 
      model1: model1 ? 'exists' : 'null', 
      model2: model2 ? 'exists' : 'null', 
      fitFunction: fitFunction ? 'exists' : 'null' 
    })
    
    if (!model1 || !model2 || !fitFunction) {
      console.log('🔍 DEBUG - fitBothModelsToView early return - missing parameters')
      return
    }
    
    try {
      // Ensure models are valid before proceeding
      if (!model1 || !model2) {
        console.log('🔍 DEBUG - Invalid models provided to fitBothModelsToView')
        return
      }
      
      // Get bounding boxes for both models
      const box1 = new THREE.Box3().setFromObject(model1)
      const box2 = new THREE.Box3().setFromObject(model2)
      
      // Check if bounding boxes are valid
      if (box1.isEmpty() || box2.isEmpty()) {
        console.log('🔍 DEBUG - One or both models have empty bounding boxes')
        return
      }
      
      // Calculate sizes
      const size1 = box1.getSize(new THREE.Vector3())
      const size2 = box2.getSize(new THREE.Vector3())
      
      // Calculate the offset needed to position models side by side
      // Use a larger multiplier to ensure clear separation
      const offset = Math.max(size1.x, size1.z, size2.x, size2.z) * 1.2
      
      // Position models side by side
      // Keep original model at its current position
      // Move comparison model to the right
      const originalX = model2.position.x
      model2.position.x = offset
      model2.position.y = model2.position.y  // Keep original Y position
      model2.position.z = model2.position.z  // Keep original Z position
      
      // Force update the matrix to ensure position changes take effect
      model2.updateMatrixWorld(true)
      
      console.log('🔍 DEBUG - Model positioning applied:', {
        offset,
        model1Pos: { x: model1.position.x, y: model1.position.y, z: model1.position.z },
        model2Pos: { x: model2.position.x, y: model2.position.y, z: model2.position.z }
      })
      
      // Verify the positioning worked
      const model1WorldPos = model1.getWorldPosition(new THREE.Vector3())
      const model2WorldPos = model2.getWorldPosition(new THREE.Vector3())
      console.log('🔍 DEBUG - Verification after positioning:', {
        model1WorldPos: { x: model1WorldPos.x, y: model1WorldPos.y, z: model1WorldPos.z },
        model2WorldPos: { x: model2WorldPos.x, y: model2WorldPos.y, z: model2WorldPos.z },
        model1Visible: model1.visible,
        model2Visible: model2.visible,
        separation: Math.abs(model2WorldPos.x - model1WorldPos.x)
      })
      
      // Keep both models at the same ground level (Y=0)
      // Don't adjust Y positions - let them stay at their natural positions
      // This prevents the models from moving up/down
      
      // Use the provided fit function to fit camera to both models
      fitFunction(model1, model2)
      
      logError('useComparison', 'Both models fitted to view', { 
        offset, 
        model1Pos: { x: model1.position.x, y: model1.position.y, z: model1.position.z }, 
        model2Pos: { x: model2.position.x, y: model2.position.y, z: model2.position.z },
        model1Visible: model1.visible,
        model2Visible: model2.visible
      })
    } catch (error) {
      logError('useComparison', 'Failed to fit both models to view', error)
    }
  }

  /**
   * Toggle original model visibility
   * @param {THREE.Object3D} model - Model to toggle
   */
  const toggleOriginalModel = (model) => {
    if (model) {
      model.visible = !model.visible
      logError('useComparison', 'Original model visibility toggled', { visible: model.visible })
    }
  }

  /**
   * Toggle comparison model visibility
   */
  const toggleComparisonModel = () => {
    if (comparisonModel.value) {
      comparisonModel.value.visible = !comparisonModel.value.visible
      logError('useComparison', 'Comparison model visibility toggled', { 
        visible: comparisonModel.value.visible 
      })
    }
  }

  /**
   * Clear comparison
   */
  const clearComparison = () => {
    if (comparisonModel.value) {
      // Dispose of the comparison model
      comparisonModel.value.traverse((child) => {
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
      
      comparisonModel.value = null
    }
    
    if (comparisonIndicator.value) {
      comparisonIndicator.value = null
    }
    
    comparisonError.value = null
    selectedComparisonFile.value = null
    
    logError('useComparison', 'Comparison cleared')
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

  return {
    // State
    comparisonMode: readonly(comparisonMode),
    comparisonModel: readonly(comparisonModel),
    comparisonIndicator: readonly(comparisonIndicator),
    comparisonFiles: readonly(comparisonFiles),
    selectedComparisonFile: readonly(selectedComparisonFile),
    loadingComparison: readonly(loadingComparison),
    comparisonError: readonly(comparisonError),
    
    // Computed
    isComparisonMode,
    hasComparisonModel,
    canCompare,
    isComparisonLoading,
    
    // Methods
    toggleComparisonMode,
    setupComparisonMode,
    loadNextcloudFiles,
    loadComparisonModelFromNextcloud,
    loadComparisonModel,
    addComparisonIndicator,
    fitBothModelsToView,
    toggleOriginalModel,
    toggleComparisonModel,
    clearComparison,
    formatFileSize
  }
}
