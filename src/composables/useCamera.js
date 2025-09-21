/**
 * Camera and controls management composable
 * Handles camera setup, controls, animations, and view management
 */

import { ref, computed, readonly, watch } from 'vue'
import * as THREE from 'three'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { logError } from '../utils/error-handler.js'

export function useCamera() {
  // Camera and controls state
  const camera = ref(null)
  const controls = ref(null)
  const initialCameraPos = ref(null)
  const baselineCameraPos = ref(null)
  const baselineTarget = ref(null)
  const initialTarget = ref(new THREE.Vector3(0, 0, 0))
  const manuallyPositioned = ref(false)
  
  // Custom camera controls state
  const isMouseDown = ref(false)
  const mouseX = ref(0)
  const mouseY = ref(0)
  const rotationX = ref(0)
  const rotationY = ref(0)
  const distance = ref(23.35)
  const modelCenter = ref(new THREE.Vector3(0, 0, 0))
  
	// Auto-rotate state
	const autoRotateEnabled = ref(false)
	const autoRotateSpeed = ref(0.5)
  
  // Debug: Track when manuallyPositioned changes
  watch(manuallyPositioned, (newVal, oldVal) => {
    console.log('🔍 DEBUG - manuallyPositioned changed:', {
      from: oldVal,
      to: newVal,
      cameraPosition: camera.value ? `${camera.value.position.x.toFixed(2)}, ${camera.value.position.y.toFixed(2)}, ${camera.value.position.z.toFixed(2)}` : 'null',
      stack: new Error().stack?.split('\n').slice(1, 4).join('\n')
    })
  })
  
  // Animation state
  const isAnimating = ref(false)
  
  // Mobile state
  const isMobile = ref(false)
  
  // Animation presets
  const animationPresets = ref([
    {
      name: 'front',
      label: 'Front View',
      position: { x: 0, y: 0, z: 5 },
      target: { x: 0, y: 0, z: 0 }
    },
    {
      name: 'back',
      label: 'Back View',
      position: { x: 0, y: 0, z: -5 },
      target: { x: 0, y: 0, z: 0 }
    },
    {
      name: 'left',
      label: 'Left View',
      position: { x: -5, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 }
    },
    {
      name: 'right',
      label: 'Right View',
      position: { x: 5, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 }
    },
    {
      name: 'top',
      label: 'Top View',
      position: { x: 0, y: 5, z: 0 },
      target: { x: 0, y: 0, z: 0 }
    },
    {
      name: 'orbit',
      label: 'Orbit View',
      position: { x: 4, y: 2, z: 4 },
      target: { x: 0, y: 0, z: 0 }
    }
  ])

  /**
   * Initialize camera with appropriate settings
   * @param {number} width - Viewport width
   * @param {number} height - Viewport height
   * @param {boolean} mobile - Whether this is a mobile device
   */
  const initCamera = (width, height, mobile = false) => {
    try {
      isMobile.value = mobile
      const fov = mobile ? 75 : VIEWER_CONFIG.camera.fov
      
      camera.value = new THREE.PerspectiveCamera(fov, width / height, VIEWER_CONFIG.camera.near, VIEWER_CONFIG.camera.far)
      camera.value.position.set(2, 2, 2)
      
      console.log('🔍 DEBUG - Camera created:', {
        fov,
        width,
        height,
        near: VIEWER_CONFIG.camera.near,
        far: VIEWER_CONFIG.camera.far,
        position: { x: camera.value.position.x, y: camera.value.position.y, z: camera.value.position.z }
      })
      
      initialCameraPos.value = camera.value.position.clone()
      
      logError('useCamera', 'Camera initialized', { fov, width, height, mobile })
    } catch (error) {
      logError('useCamera', 'Failed to initialize camera', error)
      throw error
    }
  }

  /**
   * Setup OrbitControls for camera interaction
   * @param {THREE.WebGLRenderer} renderer - WebGL renderer
   */
  const setupControls = async (renderer) => {
    try {
      const mod = await import('three/examples/jsm/controls/OrbitControls.js')
      const OrbitControls = mod.OrbitControls || mod.default
      
      controls.value = new OrbitControls(camera.value, renderer.domElement)
      
      // DISABLE controls initially to prevent interference with camera positioning
      controls.value.enabled = false
      
      // Basic controls setup
      controls.value.enableDamping = true
      controls.value.dampingFactor = 0.05
      controls.value.screenSpacePanning = false
      
      // Prevent models from going out of view
      controls.value.minDistance = VIEWER_CONFIG.camera.minDistance
      controls.value.maxDistance = VIEWER_CONFIG.camera.maxDistance
      controls.value.maxPolarAngle = VIEWER_CONFIG.camera.maxPolarAngle
      controls.value.minPolarAngle = VIEWER_CONFIG.camera.minPolarAngle
      
      controls.value.update()
      
      // Monitor camera target to prevent off-center viewing
      controls.value.addEventListener('change', onControlsChange)
      controls.value.addEventListener('end', onControlsEnd)
      
      // Disable user interaction until camera is fully stable
      controls.value.addEventListener('start', () => {
        console.log('🔍 DEBUG - User interaction blocked - camera not ready yet')
        // Don't reset the flag - keep manual positioning active
      })
      
      // Setup mobile-specific controls
      if (isMobile.value) {
        setupMobileControls()
      }
      
      logError('useCamera', 'Controls initialized successfully')
    } catch (error) {
      logError('useCamera', 'Failed to setup controls', error)
      throw error
    }
  }

  /**
   * Setup mobile-specific controls
   */
  const setupMobileControls = () => {
    if (!isMobile.value || !controls.value) return
    
    controls.value.enableDamping = true
    controls.value.dampingFactor = 0.1
    controls.value.screenSpacePanning = true
    controls.value.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    }
    
    logError('useCamera', 'Mobile controls configured')
  }

  /**
   * Handle controls change event
   */
  const onControlsChange = () => {
    if (!controls.value || !camera.value || manuallyPositioned.value) return
    
    // Check if camera target is off-center and reset if needed
    const target = controls.value.target
    const threshold = VIEWER_CONFIG.camera.targetResetThreshold
    
    if (Math.abs(target.x) > threshold || Math.abs(target.z) > threshold) {
      logError('useCamera', 'Camera target drifted off-center, resetting to origin', { 
        target: { x: target.x, y: target.y, z: target.z },
        threshold 
      })
      
      controls.value.target.set(0, 0, 0)
      controls.value.update()
      camera.value.lookAt(0, 0, 0)
    }
  }

  /**
   * Handle controls end event
   */
  const onControlsEnd = () => {
    if (controls.value && !manuallyPositioned.value) {
      controls.value.update()
    }
  }

  /**
   * Fit camera to an object
   * @param {THREE.Object3D} obj - Object to fit camera to
   */
  const fitCameraToObject = (obj) => {
    console.log('🔍 DEBUG - fitCameraToObject called:', {
      camera: camera.value ? 'exists' : 'null',
      controls: controls.value ? 'exists' : 'null',
      obj: obj ? 'exists' : 'null'
    })
    
    if (!camera.value || !controls.value || !obj) return
    
    try {
      const box = new THREE.Box3().setFromObject(obj)
      if (box.isEmpty()) return
      
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      
      // Get the world position of the object and add the center offset
      const worldPosition = new THREE.Vector3()
      obj.getWorldPosition(worldPosition)
      const worldCenter = center.clone().add(worldPosition)
      
      // Update model center for camera controls
      modelCenter.value.copy(worldCenter)
      
      const fov = camera.value.fov * (Math.PI / 180)
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.4
      
      console.log('🔍 DEBUG - Camera calculation:')
      console.log('  - FOV (radians):', fov)
      console.log('  - Max dimension:', maxDim)
      console.log('  - Tan(fov/2):', Math.tan(fov / 2))
      console.log('  - Initial cameraZ:', cameraZ)
      
      // Validate cameraZ to prevent NaN
      if (!isFinite(cameraZ) || cameraZ <= 0) {
        console.log('  - cameraZ is invalid, using fallback:', maxDim * 2)
        cameraZ = maxDim * 2 // Fallback to 2x the max dimension
      }
      
      // Only center the model if it's not already centered (within a small tolerance)
      const tolerance = 0.1
      const isAlreadyCentered = Math.abs(center.x) < tolerance && 
                               Math.abs(center.y) < tolerance && 
                               Math.abs(center.z) < tolerance
      
      if (!isAlreadyCentered) {
        obj.position.sub(center)
      }
      
      // Set camera position to look at origin with better distance
      let cameraDistance = Math.max(cameraZ * 2, 20)
      
      // Validate cameraDistance to prevent NaN
      if (!isFinite(cameraDistance) || cameraDistance <= 0) {
        cameraDistance = 50 // Fallback distance
      }
      
      // Validate camera before setting position
      if (!camera.value) {
        console.log('  - ERROR: Camera is null/undefined!')
        return
      }
      
      console.log('  - Setting camera position to:', cameraDistance, cameraDistance * 0.5, cameraDistance)
      
      // Update controls target to world center
      controls.value.target.copy(worldCenter)
      
      // Update controls first
      controls.value.update()
      
      // Set camera position relative to world center
      camera.value.position.set(
        worldCenter.x + cameraDistance, 
        worldCenter.y + cameraDistance * 0.5, 
        worldCenter.z + cameraDistance
      )
      camera.value.lookAt(worldCenter)
      
      // Calculate initial rotation values based on camera position
      const direction = new THREE.Vector3()
      direction.subVectors(camera.value.position, worldCenter).normalize()
      
      // Calculate rotationY (horizontal rotation)
      rotationY.value = Math.atan2(direction.x, direction.z)
      
      // Calculate rotationX (vertical rotation) 
      const horizontalDistance = Math.sqrt(direction.x * direction.x + direction.z * direction.z)
      rotationX.value = Math.atan2(direction.y, horizontalDistance)
      
      // Update distance to match actual distance
      distance.value = camera.value.position.distanceTo(worldCenter)
      
      console.log('🔍 DEBUG - Initial rotation calculated:')
      console.log('  - rotationX:', rotationX.value)
      console.log('  - rotationY:', rotationY.value)
      console.log('  - distance:', distance.value)
      
      // Ensure the camera position is valid before proceeding
      if (!isFinite(camera.value.position.x) || !isFinite(camera.value.position.y) || !isFinite(camera.value.position.z)) {
        console.log('🔍 DEBUG - Camera position is invalid, resetting to safe values')
        camera.value.position.set(23.35, 11.68, 23.35)
      }
      
      // Set the controls' internal position state to match
      if (controls.value.object) {
        controls.value.object.position.copy(camera.value.position)
      }
      
      // Also update the controls' internal state
      if (controls.value.object && controls.value.object !== camera.value) {
        controls.value.object.position.copy(camera.value.position)
        controls.value.object.lookAt(0, 0, 0)
      }
      
      // Mark that we've manually positioned the camera
      manuallyPositioned.value = true
      
        // Set a timeout to allow manual positioning to stabilize
        setTimeout(() => {
          // Only allow manual positioning to be reset if camera is still valid
          if (camera.value && 
              isFinite(camera.value.position.x) && 
              isFinite(camera.value.position.y) && 
              isFinite(camera.value.position.z)) {
            console.log('🔍 DEBUG - Manual positioning stabilized, ready for user interaction')
            
            // Keep controls disabled permanently due to NaN issue
            setTimeout(() => {
              if (camera.value && 
                  isFinite(camera.value.position.x) && 
                  isFinite(camera.value.position.y) && 
                  isFinite(camera.value.position.z)) {
                console.log('🔍 DEBUG - Camera is stable, but OrbitControls causes NaN - keeping disabled')
                manuallyPositioned.value = false
                
                // Keep controls disabled permanently due to NaN issue
                if (controls.value) {
                  controls.value.enabled = false
                  console.log('🔍 DEBUG - Controls kept disabled due to NaN issue with OrbitControls')
                }
              }
            }, 2000) // Wait another 2 seconds before enabling interaction
          }
        }, 1000) // Wait 1 second for stabilization
      
      // Verify the position was set correctly
      console.log('  - Camera position after setting:', camera.value.position.x, camera.value.position.y, camera.value.position.z)
      
      console.log('🔍 DEBUG - Camera fitted to object:')
      console.log('  - Local center:', center.x, center.y, center.z)
      console.log('  - World position:', worldPosition.x, worldPosition.y, worldPosition.z)
      console.log('  - World center:', worldCenter.x, worldCenter.y, worldCenter.z)
      console.log('  - Size:', size.x, size.y, size.z)
      console.log('  - Camera distance:', cameraDistance)
      console.log('  - Camera position:', camera.value.position.x, camera.value.position.y, camera.value.position.z)
      console.log('  - Camera target:', controls.value.target.x, controls.value.target.y, controls.value.target.z)
      console.log('  - Camera FOV:', camera.value.fov)
      console.log('  - Camera near/far:', camera.value.near, camera.value.far)
      
      logError('useCamera', 'Camera fitted to object', { 
        center: { x: center.x, y: center.y, z: center.z },
        size: { x: size.x, y: size.y, z: size.z },
        cameraDistance 
      })
    } catch (error) {
      logError('useCamera', 'Failed to fit camera to object', error)
    }
  }

  /**
   * Fit camera to view both models (comparison mode)
   * @param {THREE.Object3D} model1 - First model
   * @param {THREE.Object3D} model2 - Second model
   */
  const fitBothModelsToView = (model1, model2) => {
    if (!camera.value || !controls.value || !model1 || !model2) return
    
    try {
      const box1 = new THREE.Box3().setFromObject(model1)
      const box2 = new THREE.Box3().setFromObject(model2)
      const combinedBox = box1.union(box2)
      
      const center = combinedBox.getCenter(new THREE.Vector3())
      const size = combinedBox.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      
      // Center both models at origin
      const tolerance = 0.1
      const isAlreadyCentered = Math.abs(center.x) < tolerance && 
                               Math.abs(center.y) < tolerance && 
                               Math.abs(center.z) < tolerance
      
      if (!isAlreadyCentered) {
        model1.position.sub(center)
        model2.position.sub(center)
      }
      
      // Position camera to look at origin with better distance
      const distance = maxDim * 1.5
      const cameraDistance = Math.max(distance * 1.5, 30)
      camera.value.position.set(cameraDistance, cameraDistance * 0.3, cameraDistance * 0.7)
      camera.value.lookAt(0, 0, 0)
      
      // Update controls target to origin
      controls.value.target.set(0, 0, 0)
      controls.value.update()
      
      // Force the camera to look at origin immediately
      camera.value.lookAt(0, 0, 0)
      
      logError('useCamera', 'Camera fitted to both models', { 
        center: { x: center.x, y: center.y, z: center.z },
        size: { x: size.x, y: size.y, z: size.z },
        cameraDistance 
      })
    } catch (error) {
      logError('useCamera', 'Failed to fit camera to both models', error)
    }
  }

  /**
   * Reset camera to initial position
   */
  const resetView = () => {
    if (!camera.value || !controls.value) return
    
    try {
      if (baselineCameraPos.value && baselineTarget.value) {
        camera.value.position.copy(baselineCameraPos.value)
        controls.value.target.copy(baselineTarget.value)
      } else if (initialCameraPos.value) {
        camera.value.position.copy(initialCameraPos.value)
        controls.value.target.copy(initialTarget.value)
      }
      
      controls.value.update()
      logError('useCamera', 'View reset to baseline/initial position')
    } catch (error) {
      logError('useCamera', 'Failed to reset view', error)
    }
  }

  /**
   * Fit camera to view with padding
   * @param {THREE.Object3D} obj - Object to fit to
   * @param {number} padding - Padding factor
   */
  const fitToView = (obj, padding = 1.2) => {
    if (!camera.value || !controls.value || !obj) return
    
    try {
      const box = new THREE.Box3().setFromObject(obj)
      if (box.isEmpty()) return
      
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const fov = camera.value.fov * (Math.PI / 180)
      const distance = Math.abs(maxDim / Math.sin(fov / 2)) * padding
      
      const direction = camera.value.position.clone().sub(controls.value.target).normalize()
      camera.value.position.copy(controls.value.target).add(direction.multiplyScalar(distance))
      controls.value.update()
      
      logError('useCamera', 'Camera fitted to view', { distance, padding })
    } catch (error) {
      logError('useCamera', 'Failed to fit to view', error)
    }
  }


  /**
   * Animate camera to preset position
   * @param {string} presetName - Name of the preset
   * @param {number} duration - Animation duration in ms
   */
  const animateToPreset = (presetName, duration = 1000) => {
    if (!controls.value) return
    
    const preset = animationPresets.value.find(p => p.name === presetName)
    if (!preset) return
    
    isAnimating.value = true
    const startTime = Date.now()
    
    const startPosition = camera.value.position.clone()
    const startTarget = controls.value.target.clone()
    const endPosition = new THREE.Vector3(preset.position.x, preset.position.y, preset.position.z)
    const endTarget = new THREE.Vector3(preset.target.x, preset.target.y, preset.target.z)
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Easing function (ease-in-out)
      const easeProgress = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2
      
      // Interpolate position and target
      camera.value.position.lerpVectors(startPosition, endPosition, easeProgress)
      controls.value.target.lerpVectors(startTarget, endTarget, easeProgress)
      controls.value.update()
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        isAnimating.value = false
        logError('useCamera', 'Preset animation completed', { preset: presetName })
      }
    }
    
    animate()
  }

  /**
   * Smooth zoom to target distance
   * @param {number} targetDistance - Target zoom distance
   * @param {number} duration - Animation duration in ms
   */
  const smoothZoom = (targetDistance, duration = 500) => {
    if (!controls.value) return
    
    const startDistance = camera.value.position.distanceTo(controls.value.target)
    const startTime = Date.now()
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Easing function (ease-out)
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      
      const currentDistance = startDistance + (targetDistance - startDistance) * easeProgress
      const direction = camera.value.position.clone().sub(controls.value.target).normalize()
      camera.value.position.copy(controls.value.target).add(direction.multiplyScalar(currentDistance))
      controls.value.update()
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    
    animate()
  }

  /**
   * Update camera on window resize
   * @param {number} width - New viewport width
   * @param {number} height - New viewport height
   */
  const onWindowResize = (width, height) => {
    if (!camera.value) return
    
    camera.value.aspect = width / height
    camera.value.updateProjectionMatrix()
    logError('useCamera', 'Camera updated for resize', { width, height })
  }

  /**
   * Update controls
   */
  const updateControls = () => {
    if (controls.value && !manuallyPositioned.value && controls.value.enabled) {
      // Only update controls if they are enabled, camera position is valid (not NaN) and we haven't manually positioned it
      if (camera.value && 
          isFinite(camera.value.position.x) && 
          isFinite(camera.value.position.y) && 
          isFinite(camera.value.position.z)) {
        console.log('🔍 DEBUG - About to call controls.update():', {
          cameraPositionBefore: `${camera.value.position.x}, ${camera.value.position.y}, ${camera.value.position.z}`,
          manuallyPositioned: manuallyPositioned.value,
          controlsEnabled: controls.value.enabled
        })
        
        controls.value.update()
        
        console.log('🔍 DEBUG - After controls.update():', {
          cameraPositionAfter: `${camera.value.position.x}, ${camera.value.position.y}, ${camera.value.position.z}`,
          isFinite: isFinite(camera.value.position.x) && isFinite(camera.value.position.y) && isFinite(camera.value.position.z)
        })
      }
    } else if (manuallyPositioned.value) {
      // Debug: Log when we're skipping controls update due to manual positioning
      if (Math.random() < 0.01) { // Log 1% of the time
        console.log('🔍 DEBUG - Skipping controls update (manually positioned):', {
          manuallyPositioned: manuallyPositioned.value,
          cameraPosition: camera.value ? `${camera.value.position.x.toFixed(2)}, ${camera.value.position.y.toFixed(2)}, ${camera.value.position.z.toFixed(2)}` : 'null'
        })
      }
    } else {
      // Debug: Log when manuallyPositioned is false unexpectedly
      if (Math.random() < 0.1) { // Log 10% of the time
        console.log('🔍 DEBUG - Controls update skipped (disabled or manually positioned):', {
          manuallyPositioned: manuallyPositioned.value,
          controlsEnabled: controls.value ? controls.value.enabled : 'null',
          cameraPosition: camera.value ? `${camera.value.position.x.toFixed(2)}, ${camera.value.position.y.toFixed(2)}, ${camera.value.position.z.toFixed(2)}` : 'null'
        })
      }
    }
  }

  /**
   * Setup custom camera controls (mouse events)
   * @param {HTMLElement} domElement - DOM element to attach events to
   */
  const setupCustomControls = (domElement, measurementHandler = null) => {
    if (!domElement || !camera.value) return

    const onMouseDown = (event) => {
      isMouseDown.value = true
      mouseX.value = event.clientX
      mouseY.value = event.clientY
    }

    const onMouseMove = (event) => {
      if (!isMouseDown.value || !camera.value) return

      const deltaX = event.clientX - mouseX.value
      const deltaY = event.clientY - mouseY.value

      rotationY.value -= deltaX * 0.005  // Invert horizontal rotation, more sensitive
      rotationX.value += deltaY * 0.005  // Keep vertical rotation normal (not inverted)

      // Clamp rotationX to prevent flipping
      rotationX.value = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationX.value))

      // Update camera position based on rotation around model center
      const x = modelCenter.value.x + Math.sin(rotationY.value) * Math.cos(rotationX.value) * distance.value
      const y = modelCenter.value.y + Math.sin(rotationX.value) * distance.value
      const z = modelCenter.value.z + Math.cos(rotationY.value) * Math.cos(rotationX.value) * distance.value

      camera.value.position.set(x, y, z)
      camera.value.lookAt(modelCenter.value)

      mouseX.value = event.clientX
      mouseY.value = event.clientY
    }

    const onMouseUp = () => {
      isMouseDown.value = false
    }

    const onWheel = (event) => {
      if (!camera.value) return

      // Prevent default browser zoom behavior
      event.preventDefault()
      event.stopPropagation()

      console.log('🔍 DEBUG - Wheel event:', { deltaY: event.deltaY, distance: distance.value })

      distance.value += event.deltaY * 0.05  // Much more sensitive zoom
      distance.value = Math.max(2, Math.min(200, distance.value))  // Wider zoom range

      console.log('🔍 DEBUG - New distance:', distance.value)

      // Update camera position based on current rotation and new distance around model center
      const x = modelCenter.value.x + Math.sin(rotationY.value) * Math.cos(rotationX.value) * distance.value
      const y = modelCenter.value.y + Math.sin(rotationX.value) * distance.value
      const z = modelCenter.value.z + Math.cos(rotationY.value) * Math.cos(rotationX.value) * distance.value

      camera.value.position.set(x, y, z)
      camera.value.lookAt(modelCenter.value)

      console.log('🔍 DEBUG - Camera position after zoom:', camera.value.position.x, camera.value.position.y, camera.value.position.z)
    }

    const onClick = (event) => {
      // Only handle clicks if measurement handler is provided and not dragging
      if (measurementHandler && !isMouseDown.value) {
        // Get scene from the measurement handler's context
        measurementHandler(event, camera.value)
      }
    }

    // Add event listeners
    domElement.addEventListener('mousedown', onMouseDown)
    domElement.addEventListener('mousemove', onMouseMove)
    domElement.addEventListener('mouseup', onMouseUp)
    domElement.addEventListener('wheel', onWheel)
    domElement.addEventListener('click', onClick)

    // Return cleanup function
    return () => {
      domElement.removeEventListener('mousedown', onMouseDown)
      domElement.removeEventListener('mousemove', onMouseMove)
      domElement.removeEventListener('mouseup', onMouseUp)
      domElement.removeEventListener('wheel', onWheel)
      domElement.removeEventListener('click', onClick)
    }
  }

  /**
   * Render the scene
   * @param {THREE.WebGLRenderer} renderer - WebGL renderer
   * @param {THREE.Scene} scene - Three.js scene
   */
  const render = (renderer, scene) => {
    if (renderer && scene && camera.value) {
      try {
        // Auto-rotate functionality
        if (autoRotateEnabled.value && !isMouseDown.value) {
          rotationY.value += autoRotateSpeed.value * 0.01
          
          // Update camera position based on current rotation around model center
          const x = modelCenter.value.x + Math.sin(rotationY.value) * Math.cos(rotationX.value) * distance.value
          const y = modelCenter.value.y + Math.sin(rotationX.value) * distance.value
          const z = modelCenter.value.z + Math.cos(rotationY.value) * Math.cos(rotationX.value) * distance.value
          
          camera.value.position.set(x, y, z)
          camera.value.lookAt(modelCenter.value)
        }
        
        // Debug: Check if camera position becomes NaN and fix it
        if (!isFinite(camera.value.position.x) || !isFinite(camera.value.position.y) || !isFinite(camera.value.position.z)) {
          console.log('🔍 DEBUG - Camera position is NaN! Fixing...', {
            position: `${camera.value.position.x}, ${camera.value.position.y}, ${camera.value.position.z}`,
            manuallyPositioned: manuallyPositioned.value,
            controlsEnabled: controls.value ? controls.value.enabled : 'null'
          })
          
          // Fix the camera position
          camera.value.position.set(23.35, 11.68, 23.35)
          camera.value.lookAt(0, 0, 0)
          
          // Update controls if they exist and disable them temporarily
          if (controls.value && controls.value.object) {
            controls.value.object.position.copy(camera.value.position)
            controls.value.target.set(0, 0, 0)
            controls.value.enabled = false // Disable controls if they cause NaN
            console.log('🔍 DEBUG - Controls disabled due to NaN issue')
          }
        }
        
        renderer.render(scene, camera.value)
        // Debug: Log render calls occasionally
        if (Math.random() < 0.01) { // Log 1% of render calls
          console.log('🔍 DEBUG - Render called:', {
            renderer: renderer ? 'exists' : 'null',
            scene: scene ? 'exists' : 'null',
            camera: camera.value ? 'exists' : 'null',
            cameraPosition: camera.value ? `${camera.value.position.x.toFixed(2)}, ${camera.value.position.y.toFixed(2)}, ${camera.value.position.z.toFixed(2)}` : 'null',
            sceneChildren: scene ? scene.children.length : 0
          })
        }
      } catch (error) {
        console.error('🔍 DEBUG - Render error:', error)
      }
    } else {
      console.log('🔍 DEBUG - Render skipped:', {
        renderer: renderer ? 'exists' : 'null',
        scene: scene ? 'exists' : 'null',
        camera: camera.value ? 'exists' : 'null'
      })
    }
  }

  /**
   * Toggle auto-rotate
   */
  const toggleAutoRotate = () => {
    autoRotateEnabled.value = !autoRotateEnabled.value
    console.log('🔍 DEBUG - Auto-rotate toggled:', autoRotateEnabled.value)
  }

  /**
   * Set auto-rotate speed
   * @param {number} speed - Rotation speed (default: 2.0)
   */
  const setAutoRotateSpeed = (speed) => {
    autoRotateSpeed.value = speed
    console.log('🔍 DEBUG - Auto-rotate speed set to:', speed)
  }

  /**
   * Dispose of camera and controls
   */
  const dispose = () => {
    if (controls.value) {
      controls.value.dispose()
      controls.value = null
    }
    
    camera.value = null
    initialCameraPos.value = null
    baselineCameraPos.value = null
    baselineTarget.value = null
    
    logError('useCamera', 'Camera and controls disposed')
  }

  return {
    // State
    camera: readonly(camera),
    controls: readonly(controls),
    isAnimating: readonly(isAnimating),
    autoRotate: readonly(autoRotateEnabled),
    autoRotateSpeed: readonly(autoRotateSpeed),
    isMobile: readonly(isMobile),
    animationPresets: readonly(animationPresets),
    
    // Methods
    initCamera,
    setupControls,
    setupCustomControls,
    setupMobileControls,
    fitCameraToObject,
    fitBothModelsToView,
    resetView,
    fitToView,
    toggleAutoRotate,
    setAutoRotateSpeed,
    animateToPreset,
    smoothZoom,
    onWindowResize,
    updateControls,
    render,
    dispose
  }
}
