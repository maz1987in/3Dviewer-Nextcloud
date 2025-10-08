import { ref, computed } from 'vue'
import * as THREE from 'three'
import { logError } from '../utils/error-handler.js'

// Unit conversion factors (1 Three.js unit = ? real units)
const UNIT_SCALES = {
	millimeters: { factor: 1, suffix: 'mm', label: 'Millimeters' },
	centimeters: { factor: 10, suffix: 'cm', label: 'Centimeters' },
	meters: { factor: 1000, suffix: 'm', label: 'Meters' },
	inches: { factor: 25.4, suffix: 'in', label: 'Inches' },
	feet: { factor: 304.8, suffix: 'ft', label: 'Feet' },
	units: { factor: 1, suffix: 'units', label: 'Generic Units' },
}

export function useMeasurement() {
	// Measurement state
	const isActive = ref(false)
	const points = ref([])
	const measurements = ref([])
	const currentMeasurement = ref(null)
	
	// Unit configuration
	const currentUnit = ref('millimeters') // Default to millimeters (common for 3D models)
	const modelScale = ref(1) // Scale factor: 1 Three.js unit = modelScale real units

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

			// Measurement system initialized
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
		// Measurement mode toggled
	}
	
	// Convert distance to real-world units
	const convertDistance = (threeJsDistance) => {
		const unitConfig = UNIT_SCALES[currentUnit.value] || UNIT_SCALES.units
		// Assume 1 Three.js unit = modelScale millimeters (default 1mm)
		// Then convert from millimeters to target unit by dividing by the factor
		const distanceInMM = threeJsDistance * modelScale.value
		const realDistance = distanceInMM / unitConfig.factor
		return {
			value: realDistance,
			formatted: `${realDistance.toFixed(2)} ${unitConfig.suffix}`,
			unit: currentUnit.value,
			suffix: unitConfig.suffix,
		}
	}
	
	// Set measurement unit
	const setUnit = (unit) => {
		if (UNIT_SCALES[unit]) {
			currentUnit.value = unit
			// Recalculate all existing measurements
			measurements.value = measurements.value.map(m => ({
				...m,
				...convertDistance(m.distance),
			}))
		}
	}
	
	// Set model scale (how many real units = 1 Three.js unit)
	const setModelScale = (scale) => {
		if (scale > 0) {
			modelScale.value = scale
			// Recalculate all existing measurements
			measurements.value = measurements.value.map(m => ({
				...m,
				...convertDistance(m.distance),
			}))
		}
	}
	
	// Get available units
	const getAvailableUnits = () => {
		return Object.entries(UNIT_SCALES).map(([key, config]) => ({
			value: key,
			label: config.label,
			suffix: config.suffix,
		}))
	}

	// Handle mouse click for point selection
	const handleClick = (event, camera) => {
		// Measurement click handler called

		if (!isActive.value) {
			return
		}

		if (!sceneRef.value) {
			return
		}

		try {
			// Calculate mouse position in normalized device coordinates
			const rect = event.target.getBoundingClientRect()
			mouse.value.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
			mouse.value.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

			// Mouse coordinates processed

			// Update raycaster
			raycaster.value.setFromCamera(mouse.value, camera)

			// Find intersections with the model (excluding measurement objects)
			const intersectableObjects = []
			sceneRef.value.traverse((child) => {
				if (child.isMesh && child.name !== 'measurementGroup' && child.visible) {
					intersectableObjects.push(child)
				}
			})

			// Intersectable objects found

			const intersects = raycaster.value.intersectObjects(intersectableObjects, true)

			// Intersections found

			if (intersects.length > 0) {
				const point = intersects[0].point
				addMeasurementPoint(point)
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

		// Point added

		// If we have 2 points, create a measurement
		if (points.value.length === 2) {
			createMeasurement()
		}
	}

	// Create visual indicator for a point
	const createPointIndicator = (point) => {
		if (!measurementGroup.value) return

		// Calculate appropriate size based on camera distance or model bounds
		// For now, use a larger fixed size that scales with the model
		const pointSize = 2.0 // Increased from 0.1 to 2.0 for better visibility

		// Create a small sphere at the point with higher detail
		const geometry = new THREE.SphereGeometry(pointSize, 16, 12)
		const material = new THREE.MeshBasicMaterial({
			color: 0xffff00, // Changed to bright yellow for better visibility
			transparent: true,
			opacity: 0.9,
			depthTest: false, // Always render on top
		})
		const sphere = new THREE.Mesh(geometry, material)
		sphere.position.copy(point)
		sphere.name = `measurementPoint_${points.value.length}`
		sphere.renderOrder = 999 // Render on top of other objects

		// Add a glowing outline ring for extra visibility
		const ringGeometry = new THREE.RingGeometry(pointSize * 1.2, pointSize * 1.5, 16)
		const ringMaterial = new THREE.MeshBasicMaterial({
			color: 0xff00ff, // Bright magenta ring
			transparent: true,
			opacity: 0.6,
			side: THREE.DoubleSide,
			depthTest: false,
		})
		const ring = new THREE.Mesh(ringGeometry, ringMaterial)
		ring.renderOrder = 998
		sphere.add(ring)

		measurementGroup.value.add(sphere)
		pointMeshes.value.push(sphere)
	}

	// Create measurement between two points
	const createMeasurement = () => {
		if (points.value.length < 2) return

		const point1 = points.value[points.value.length - 2]
		const point2 = points.value[points.value.length - 1]

		// Calculate distance in Three.js units
		const distance = point1.distanceTo(point2)
		
		// Convert to real-world units
		const converted = convertDistance(distance)

		// Create measurement object
		const measurement = {
			id: Date.now(),
			point1: point1.clone(),
			point2: point2.clone(),
			distance, // Raw Three.js distance
			...converted, // Add value, formatted, unit, suffix
			midpoint: new THREE.Vector3().addVectors(point1, point2).multiplyScalar(0.5),
		}

		measurements.value.push(measurement)
		currentMeasurement.value = measurement

		// Create visual line between points
		createMeasurementLine(measurement)

		// Create distance text
		createDistanceText(measurement)

		// Measurement created

		// Reset for next measurement
		points.value = []
	}

	// Create visual line between measurement points
	const createMeasurementLine = (measurement) => {
		if (!measurementGroup.value) return

		const geometry = new THREE.BufferGeometry().setFromPoints([
			measurement.point1,
			measurement.point2,
		])

		// Use a thicker, more visible line with tube geometry for WebGL
		// Note: linewidth doesn't work in WebGL, so we create a cylinder instead
		const direction = new THREE.Vector3().subVectors(measurement.point2, measurement.point1)
		const distance = direction.length()
		const cylinderGeometry = new THREE.CylinderGeometry(0.3, 0.3, distance, 8)
		const cylinderMaterial = new THREE.MeshBasicMaterial({
			color: 0x00ff00,
			transparent: true,
			opacity: 0.8,
			depthTest: false,
		})
		const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial)
		
		// Position and orient the cylinder
		cylinder.position.copy(measurement.point1).add(direction.multiplyScalar(0.5))
		cylinder.quaternion.setFromUnitVectors(
			new THREE.Vector3(0, 1, 0),
			direction.normalize()
		)
		cylinder.renderOrder = 997
		cylinder.name = `measurementLine_${measurement.id}`

		measurementGroup.value.add(cylinder)
		lineMeshes.value.push(cylinder)
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
				alphaTest: 0.1,
			})
			const textMesh = new THREE.Mesh(geometry, material)

			// Position text at midpoint
			textMesh.position.copy(measurement.midpoint)

			// Make text face camera (simplified - just point towards origin)
			textMesh.lookAt(0, 0, 0)

			// Add to measurement group
			measurementGroup.value.add(textMesh)
			textMeshes.value.push(textMesh)

			// Distance calculated
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

		// All measurements cleared
	}

	// Get measurement summary
	const getMeasurementSummary = () => {
		return {
			active: isActive.value,
			pointCount: points.value.length,
			measurementCount: measurements.value.length,
			currentUnit: currentUnit.value,
			modelScale: modelScale.value,
			measurements: measurements.value.map(m => ({
				id: m.id,
				distance: m.distance,
				formattedDistance: m.formatted || `${m.distance.toFixed(3)} units`,
				value: m.value,
				unit: m.unit,
			})),
		}
	}

	return {
		// State
		isActive,
		points,
		measurements,
		currentMeasurement,
		currentUnit,
		modelScale,

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
		getMeasurementSummary,
		convertDistance,
		setUnit,
		setModelScale,
		getAvailableUnits,
	}
}
