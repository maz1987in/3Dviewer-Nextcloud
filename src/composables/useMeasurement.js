import { ref, computed } from 'vue'
import * as THREE from 'three'
import { logError } from '../utils/error-handler.js'

export function useMeasurement() {
	// Measurement state
	const isActive = ref(false)
	const points = ref([])
	const measurements = ref([])
	const currentMeasurement = ref(null)
	
	// Raycasting setup
	const raycaster = ref(new THREE.Raycaster())
	const mouse = ref(new THREE.Vector2())
	
	// Scene reference
	const sceneRef = ref(null)
	
	// Visual elements
	const measurementGroup = ref(null)
	const pointMeshes = ref([])
	const lineMeshes = ref([])
	const textMeshes = ref([])
	
	// Computed properties
	const hasPoints = computed(() => points.value.length > 0)
	const canMeasure = computed(() => points.value.length >= 2)
	const measurementCount = computed(() => measurements.value.length)
	
	// Initialize measurement system
	const init = (scene) => {
		try {
			// Store scene reference
			sceneRef.value = scene
			
			// Create measurement group
			measurementGroup.value = new THREE.Group()
			measurementGroup.value.name = 'measurementGroup'
			scene.add(measurementGroup.value)
			
			console.log('🔍 DEBUG - Measurement system initialized')
		} catch (error) {
			logError('useMeasurement', 'Failed to initialize measurement system', error)
		}
	}
	
	// Toggle measurement mode
	const toggleMeasurement = () => {
		isActive.value = !isActive.value
		if (!isActive.value) {
			clearCurrentMeasurement()
		}
		console.log('🔍 DEBUG - Measurement mode toggled:', isActive.value)
	}
	
	// Handle mouse click for point selection
	const handleClick = (event, camera) => {
		console.log('🔍 DEBUG - Measurement click handler called:', { isActive: isActive.value, event: event.type })
		
		if (!isActive.value) {
			console.log('🔍 DEBUG - Measurement not active, ignoring click')
			return
		}
		
		if (!sceneRef.value) {
			console.log('🔍 DEBUG - Scene not available for measurement')
			return
		}
		
		try {
			// Calculate mouse position in normalized device coordinates
			const rect = event.target.getBoundingClientRect()
			mouse.value.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
			mouse.value.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
			
			console.log('🔍 DEBUG - Mouse coordinates:', { x: mouse.value.x, y: mouse.value.y })
			
			// Update raycaster
			raycaster.value.setFromCamera(mouse.value, camera)
			
			// Find intersections with the model (excluding measurement objects)
			const intersectableObjects = []
			sceneRef.value.traverse((child) => {
				if (child.isMesh && child.name !== 'measurementGroup' && child.visible) {
					intersectableObjects.push(child)
				}
			})
			
			console.log('🔍 DEBUG - Intersectable objects found:', intersectableObjects.length)
			
			const intersects = raycaster.value.intersectObjects(intersectableObjects, true)
			
			console.log('🔍 DEBUG - Intersections found:', intersects.length)
			
			if (intersects.length > 0) {
				const point = intersects[0].point
				console.log('🔍 DEBUG - Adding measurement point:', point)
				addMeasurementPoint(point)
			} else {
				console.log('🔍 DEBUG - No intersections found')
			}
		} catch (error) {
			logError('useMeasurement', 'Failed to handle click', error)
		}
	}
	
	// Add a measurement point
	const addMeasurementPoint = (point) => {
		points.value.push(point.clone())
		
		// Create visual indicator for the point
		createPointIndicator(point)
		
		console.log('🔍 DEBUG - Point added:', point, 'Total points:', points.value.length)
		
		// If we have 2 points, create a measurement
		if (points.value.length === 2) {
			createMeasurement()
		}
	}
	
	// Create visual indicator for a point
	const createPointIndicator = (point) => {
		if (!measurementGroup.value) return
		
		// Create a small sphere at the point
		const geometry = new THREE.SphereGeometry(0.1, 8, 6)
		const material = new THREE.MeshBasicMaterial({ 
			color: 0xff0000,
			transparent: true,
			opacity: 0.8
		})
		const sphere = new THREE.Mesh(geometry, material)
		sphere.position.copy(point)
		sphere.name = `measurementPoint_${points.value.length}`
		
		measurementGroup.value.add(sphere)
		pointMeshes.value.push(sphere)
	}
	
	// Create measurement between two points
	const createMeasurement = () => {
		if (points.value.length < 2) return
		
		const point1 = points.value[points.value.length - 2]
		const point2 = points.value[points.value.length - 1]
		
		// Calculate distance
		const distance = point1.distanceTo(point2)
		
		// Create measurement object
		const measurement = {
			id: Date.now(),
			point1: point1.clone(),
			point2: point2.clone(),
			distance: distance,
			midpoint: new THREE.Vector3().addVectors(point1, point2).multiplyScalar(0.5)
		}
		
		measurements.value.push(measurement)
		currentMeasurement.value = measurement
		
		// Create visual line between points
		createMeasurementLine(measurement)
		
		// Create distance text
		createDistanceText(measurement)
		
		console.log('🔍 DEBUG - Measurement created:', measurement)
		
		// Reset for next measurement
		points.value = []
	}
	
	// Create visual line between measurement points
	const createMeasurementLine = (measurement) => {
		if (!measurementGroup.value) return
		
		const geometry = new THREE.BufferGeometry().setFromPoints([
			measurement.point1,
			measurement.point2
		])
		
		const material = new THREE.LineBasicMaterial({ 
			color: 0x00ff00,
			linewidth: 2
		})
		
		const line = new THREE.Line(geometry, material)
		line.name = `measurementLine_${measurement.id}`
		
		measurementGroup.value.add(line)
		lineMeshes.value.push(line)
	}
	
	// Create distance text
	const createDistanceText = (measurement) => {
		try {
			// Create a simple plane with text texture
			const canvas = document.createElement('canvas')
			const context = canvas.getContext('2d')
			canvas.width = 256
			canvas.height = 64
			
			// Draw text on canvas
			context.fillStyle = 'rgba(0, 0, 0, 0.8)'
			context.fillRect(0, 0, canvas.width, canvas.height)
			context.fillStyle = '#00ff00'
			context.font = 'bold 24px Arial'
			context.textAlign = 'center'
			context.textBaseline = 'middle'
			context.fillText(`${measurement.distance.toFixed(2)} units`, canvas.width / 2, canvas.height / 2)
			
			// Create texture from canvas
			const texture = new THREE.CanvasTexture(canvas)
			texture.needsUpdate = true
			
			// Create plane geometry
			const geometry = new THREE.PlaneGeometry(2, 0.5)
			const material = new THREE.MeshBasicMaterial({ 
				map: texture, 
				transparent: true,
				alphaTest: 0.1
			})
			const textMesh = new THREE.Mesh(geometry, material)
			
			// Position text at midpoint
			textMesh.position.copy(measurement.midpoint)
			
			// Make text face camera (simplified - just point towards origin)
			textMesh.lookAt(0, 0, 0)
			
			// Add to measurement group
			measurementGroup.value.add(textMesh)
			textMeshes.value.push(textMesh)
			
			console.log(`🔍 DEBUG - Distance: ${measurement.distance.toFixed(3)} units`)
			console.log(`🔍 DEBUG - Point 1: (${measurement.point1.x.toFixed(3)}, ${measurement.point1.y.toFixed(3)}, ${measurement.point1.z.toFixed(3)})`)
			console.log(`🔍 DEBUG - Point 2: (${measurement.point2.x.toFixed(3)}, ${measurement.point2.y.toFixed(3)}, ${measurement.point2.z.toFixed(3)})`)
		} catch (error) {
			logError('useMeasurement', 'Failed to create distance text', error)
		}
	}
	
	// Clear current measurement
	const clearCurrentMeasurement = () => {
		points.value = []
		currentMeasurement.value = null
	}
	
	// Clear all measurements
	const clearAllMeasurements = () => {
		// Remove visual elements
		if (measurementGroup.value) {
			measurementGroup.value.clear()
		}
		
		// Reset state
		points.value = []
		measurements.value = []
		currentMeasurement.value = null
		pointMeshes.value = []
		lineMeshes.value = []
		textMeshes.value = []
		
		console.log('🔍 DEBUG - All measurements cleared')
	}
	
	// Get measurement summary
	const getMeasurementSummary = () => {
		return {
			active: isActive.value,
			pointCount: points.value.length,
			measurementCount: measurements.value.length,
			measurements: measurements.value.map(m => ({
				id: m.id,
				distance: m.distance,
				formattedDistance: `${m.distance.toFixed(3)} units`
			}))
		}
	}
	
	return {
		// State
		isActive,
		points,
		measurements,
		currentMeasurement,
		
		// Computed
		hasPoints,
		canMeasure,
		measurementCount,
		
		// Methods
		init,
		toggleMeasurement,
		handleClick,
		addMeasurementPoint,
		createMeasurement,
		clearCurrentMeasurement,
		clearAllMeasurements,
		getMeasurementSummary
	}
}