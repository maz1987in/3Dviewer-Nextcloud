import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * GLTF/GLB loader class
 */
class GltfLoader extends BaseLoader {
  constructor() {
    super('GLTFLoader', ['glb', 'gltf'])
    this.loader = null
  }

  /**
   * Load GLTF/GLB model
   * @param {ArrayBuffer} arrayBuffer - File data
   * @param {Object} context - Loading context
   * @returns {Promise<Object>} Load result
   */
  async loadModel(arrayBuffer, context) {
    const { THREE, renderer, hasDraco, hasKtx2, hasMeshopt } = context
    
    // Create loader
    this.loader = new GLTFLoader()
    
    // Configure decoders
    await this.configureDecoders(renderer, hasDraco, hasKtx2, hasMeshopt)
    
    // Parse the model
    const gltf = await this.parseModel(arrayBuffer)
    
    // Process the result
    return this.processModel(gltf.scene, context)
  }

  /**
   * Configure decoders for compressed formats
   * @param {THREE.WebGLRenderer} renderer - WebGL renderer
   * @param {boolean} hasDraco - Whether DRACO is available
   * @param {boolean} hasKtx2 - Whether KTX2 is available
   * @param {boolean} hasMeshopt - Whether Meshopt is available
   */
  async configureDecoders(renderer, hasDraco, hasKtx2, hasMeshopt) {
    // Configure DRACO loader
    if (hasDraco) {
      try {
        const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js')
        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath('/apps/threedviewer/decoder/')
        this.loader.setDRACOLoader(dracoLoader)
        this.logInfo('DRACO loader configured')
      } catch (error) {
        this.logWarning('DRACO loader unavailable', { error: error.message })
      }
    }

    // Configure KTX2 loader
    if (hasKtx2) {
      try {
        const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
        const ktx2Loader = new KTX2Loader()
        ktx2Loader.setTranscoderPath('/apps/threedviewer/decoder/')
        ktx2Loader.detectSupport(renderer)
        this.loader.setKTX2Loader(ktx2Loader)
        this.logInfo('KTX2 loader configured')
      } catch (error) {
        this.logWarning('KTX2 loader unavailable', { error: error.message })
      }
    }

    // Configure Meshopt decoder
    if (hasMeshopt) {
      try {
        const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js')
        if (MeshoptDecoder) {
          this.loader.setMeshoptDecoder(MeshoptDecoder)
          this.logInfo('Meshopt decoder configured')
        }
      } catch (error) {
        this.logWarning('Meshopt decoder unavailable', { error: error.message })
      }
    }
  }

  /**
   * Parse the GLTF model
   * @param {ArrayBuffer} arrayBuffer - File data
   * @returns {Promise<Object>} Parsed GLTF
   */
  async parseModel(arrayBuffer) {
    return new Promise((resolve, reject) => {
      this.loader.parse(arrayBuffer, '', (gltf) => {
        this.logInfo('GLTF model parsed successfully', {
          scenes: gltf.scenes?.length || 0,
          animations: gltf.animations?.length || 0,
          materials: gltf.materials?.length || 0
        })
        resolve(gltf)
      }, (error) => {
        this.logError('Failed to parse GLTF model', error)
        reject(error)
      })
    })
  }
}

// Create loader instance
const gltfLoader = new GltfLoader()

/**
 * Load GLTF/GLB model (legacy function for compatibility)
 * @param {ArrayBuffer} arrayBuffer - File data
 * @param {Object} context - Loading context
 * @returns {Promise<Object>} Load result
 */
export default async function loadGltf(arrayBuffer, context) {
  return gltfLoader.load(arrayBuffer, context)
}
