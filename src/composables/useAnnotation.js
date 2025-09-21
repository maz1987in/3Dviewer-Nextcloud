/**
 * Annotation system composable
 * Handles 3D annotation creation, management, and interaction
 */

import { ref, computed } from 'vue'
import * as THREE from 'three'
import { logError } from '../utils/error-handler.js'

export function useAnnotation() {
  // Annotation state
  const isActive = ref(false)
  const annotations = ref([])
  const currentAnnotation = ref(null)
  const annotationGroup = ref(null)
  const textMeshes = ref([])
  const pointMeshes = ref([])
  const sceneRef = ref(null)
  
  // Raycaster for 3D interaction
  const raycaster = ref(new THREE.Raycaster())
  const mouse = ref(new THREE.Vector2())
  
  // Computed properties
  const hasAnnotations = computed(() => annotations.value.length > 0)
  const annotationCount = computed(() => annotations.value.length)
  
  // Initialize annotation system
  const init = (scene) => {
    try {
      // Store scene reference
      sceneRef.value = scene
      
      // Create annotation group
      annotationGroup.value = new THREE.Group()
      annotationGroup.value.name = 'annotationGroup'
      scene.add(annotationGroup.value)
      
      console.log('🔍 DEBUG - Annotation system initialized')
    } catch (error) {
      logError('useAnnotation', 'Failed to initialize annotation system', error)
    }
  }
  
  // Toggle annotation mode
  const toggleAnnotation = () => {
    isActive.value = !isActive.value
    console.log('🔍 DEBUG - Annotation mode toggled:', isActive.value)
  }
  
  // Handle click events for annotation placement
  const handleClick = (event, camera) => {
    console.log('🔍 DEBUG - Annotation click handler called:', { isActive: isActive.value, event: event.type })
    
    if (!isActive.value) {
      console.log('🔍 DEBUG - Annotation not active, ignoring click')
      return
    }
    
    if (!sceneRef.value) {
      console.log('🔍 DEBUG - Scene not available for annotation')
      return
    }
    
    try {
      // Get mouse coordinates
      const rect = event.target.getBoundingClientRect()
      mouse.value.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.value.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      
      console.log('🔍 DEBUG - Mouse coordinates:', { x: mouse.value.x, y: mouse.value.y })
      
      // Update raycaster
      raycaster.value.setFromCamera(mouse.value, camera)
      
      // Find intersectable objects (exclude annotation elements)
      const intersectableObjects = []
      sceneRef.value.traverse((child) => {
        if (child.isMesh && child.name !== 'annotationPoint' && child.name !== 'annotationText') {
          intersectableObjects.push(child)
        }
      })
      
      console.log('🔍 DEBUG - Intersectable objects found:', intersectableObjects.length)
      
      // Perform raycasting
      const intersects = raycaster.value.intersectObjects(intersectableObjects, false)
      
      console.log('🔍 DEBUG - Intersections found:', intersects.length)
      
      if (intersects.length > 0) {
        const point = intersects[0].point.clone()
        console.log('🔍 DEBUG - Adding annotation point:', point)
        addAnnotationPoint(point)
      }
    } catch (error) {
      logError('useAnnotation', 'Failed to handle annotation click', error)
    }
  }
  
  // Add annotation point
  const addAnnotationPoint = (point) => {
    try {
      // Create annotation object
      const annotation = {
        id: Date.now(),
        point: point.clone(),
        text: `Annotation ${annotations.value.length + 1}`,
        timestamp: new Date().toISOString(),
        pointMesh: null,
        textMesh: null
      }
      
      annotations.value.push(annotation)
      currentAnnotation.value = annotation
      
      // Create visual elements and store references
      annotation.pointMesh = createAnnotationPoint(annotation)
      annotation.textMesh = createAnnotationText(annotation)
      
      console.log('🔍 DEBUG - Annotation added:', annotation)
    } catch (error) {
      logError('useAnnotation', 'Failed to add annotation point', error)
    }
  }
  
  // Create visual point for annotation
  const createAnnotationPoint = (annotation) => {
    if (!annotationGroup.value) return null
    
    const geometry = new THREE.SphereGeometry(0.1, 16, 16)
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 })
    const sphere = new THREE.Mesh(geometry, material)
    
    sphere.position.copy(annotation.point)
    sphere.name = 'annotationPoint'
    
    annotationGroup.value.add(sphere)
    pointMeshes.value.push(sphere)
    
    return sphere
  }
  
  // Create text for annotation
  const createAnnotationText = (annotation) => {
    try {
      // Create a simple plane with text texture
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      canvas.width = 256
      canvas.height = 64
      
      // Draw text on canvas
      context.fillStyle = 'rgba(0, 0, 0, 0.8)'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#ff0000'
      context.font = 'bold 20px Arial'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(annotation.text, canvas.width / 2, canvas.height / 2)
      
      // Create texture from canvas
      const texture = new THREE.CanvasTexture(canvas)
      texture.needsUpdate = true
      
      // Create plane geometry
      const geometry = new THREE.PlaneGeometry(1.5, 0.4)
      const material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true,
        alphaTest: 0.1
      })
      const textMesh = new THREE.Mesh(geometry, material)
      
      // Position text above the point
      textMesh.position.copy(annotation.point)
      textMesh.position.y += 0.5
      textMesh.name = 'annotationText'
      
      // Make text face camera (simplified - just point towards origin)
      textMesh.lookAt(0, 0, 0)
      
      // Add to annotation group
      annotationGroup.value.add(textMesh)
      textMeshes.value.push(textMesh)
      
      console.log('🔍 DEBUG - Annotation text created:', annotation.text)
      return textMesh
    } catch (error) {
      logError('useAnnotation', 'Failed to create annotation text', error)
      return null
    }
  }
  
  // Update annotation text
  const updateAnnotationText = (annotationId, newText) => {
    const annotation = annotations.value.find(a => a.id === annotationId)
    if (annotation) {
      annotation.text = newText
      
      // Update visual text
      const textMesh = textMeshes.value.find(mesh => 
        mesh.position.distanceTo(annotation.point) < 0.1
      )
      
      if (textMesh) {
        // Recreate the text texture
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        canvas.width = 256
        canvas.height = 64
        
        context.fillStyle = 'rgba(0, 0, 0, 0.8)'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#ff0000'
        context.font = 'bold 20px Arial'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(newText, canvas.width / 2, canvas.height / 2)
        
        const texture = new THREE.CanvasTexture(canvas)
        texture.needsUpdate = true
        textMesh.material.map = texture
        textMesh.material.needsUpdate = true
      }
    }
  }
  
  // Delete annotation
  const deleteAnnotation = (annotationId) => {
    const index = annotations.value.findIndex(a => a.id === annotationId)
    if (index !== -1) {
      const annotation = annotations.value[index]
      
      console.log('🔍 DEBUG - Deleting annotation:', annotationId, 'at position:', annotation.point)
      
      // Remove visual elements using stored references
      if (annotation.pointMesh && annotationGroup.value) {
        annotationGroup.value.remove(annotation.pointMesh)
        const pointIndex = pointMeshes.value.indexOf(annotation.pointMesh)
        if (pointIndex !== -1) {
          pointMeshes.value.splice(pointIndex, 1)
        }
        console.log('🔍 DEBUG - Removed point mesh')
      }
      
      if (annotation.textMesh && annotationGroup.value) {
        annotationGroup.value.remove(annotation.textMesh)
        const textIndex = textMeshes.value.indexOf(annotation.textMesh)
        if (textIndex !== -1) {
          textMeshes.value.splice(textIndex, 1)
        }
        console.log('🔍 DEBUG - Removed text mesh')
      }
      
      // Remove from annotations array
      annotations.value.splice(index, 1)
      
      console.log('🔍 DEBUG - Annotation deleted:', annotationId)
    }
  }
  
  // Clear all annotations
  const clearAllAnnotations = () => {
    try {
      console.log('🔍 DEBUG - Starting clear all annotations')
      console.log('🔍 DEBUG - Point meshes count:', pointMeshes.value.length)
      console.log('🔍 DEBUG - Text meshes count:', textMeshes.value.length)
      console.log('🔍 DEBUG - Annotation group children count:', annotationGroup.value?.children.length || 0)
      
      // Force remove all children from annotation group
      if (annotationGroup.value) {
        // Remove all children by iterating backwards to avoid index issues
        while (annotationGroup.value.children.length > 0) {
          const child = annotationGroup.value.children[0]
          annotationGroup.value.remove(child)
          console.log('🔍 DEBUG - Removed child:', child.name || 'unnamed')
        }
      }
      
      // Clear the annotation group completely
      if (annotationGroup.value) {
        annotationGroup.value.clear()
      }
      
      // Reset state arrays
      annotations.value = []
      currentAnnotation.value = null
      pointMeshes.value = []
      textMeshes.value = []
      
      console.log('🔍 DEBUG - All annotations cleared')
      console.log('🔍 DEBUG - Final annotation group children count:', annotationGroup.value?.children.length || 0)
    } catch (error) {
      logError('useAnnotation', 'Failed to clear all annotations', error)
    }
  }
  
  // Get annotation summary
  const getAnnotationSummary = () => {
    return {
      active: isActive.value,
      annotationCount: annotations.value.length,
      annotations: annotations.value.map(a => ({
        id: a.id,
        text: a.text,
        point: { x: a.point.x, y: a.point.y, z: a.point.z },
        timestamp: a.timestamp
      }))
    }
  }
  
  return {
    // State
    isActive,
    annotations,
    currentAnnotation,
    
    // Computed
    hasAnnotations,
    annotationCount,
    
    // Methods
    init,
    toggleAnnotation,
    handleClick,
    addAnnotationPoint,
    updateAnnotationText,
    deleteAnnotation,
    clearAllAnnotations,
    getAnnotationSummary
  }
}