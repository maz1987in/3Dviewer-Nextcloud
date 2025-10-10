import { ref, computed } from 'vue'
import * as THREE from 'three'
import { logError } from '../utils/error-handler.js'
import { 
	calculateModelScale, 
	createTextTexture, 
	createMarkerSphere, 
	createTextMesh,
	raycastIntersection 
} from '../utils/modelScaleUtils.js'

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
	const visualScale = ref(1) // Visual scale for markers based on model size

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
		// Input validation
		if (!scene) {
			logError('useMeasurement', 'Scene is required for initialization', new Error('Scene is required'))
			throw new Error('Scene is required to initialize measurement system')
		}
		if (!(scene instanceof THREE.Scene)) {
			logError('useMeasurement', 'Invalid scene object', new Error('Invalid scene'))
			throw new Error('Scene must be an instance of THREE.Scene')
		}

		try {
			// Store scene reference
			sceneRef.value = scene

			// Create measurement group
			measurementGroup.value = new THREE.Group()
			measurementGroup.value.name = 'measurementGroup'
			scene.add(measurementGroup.value)

			// Calculate initial visual scale
			updateVisualScale()
		} catch (error) {
			logError('useMeasurement', 'Failed to initialize measurement system', error)
			throw error
		}
	}

	// Calculate and update visual scale based on model bounding box
	const updateVisualScale = () => {
		if (!sceneRef.value) return
		visualScale.value = calculateModelScale(sceneRef.value)
	}

	// Toggle measurement mode
	const toggleMeasurement = () => {
		isActive.value = !isActive.value
		if (!isActive.value) {
			clearCurrentMeasurement()
		}
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
		if (!unit) {
			logger.error('useMeasurement', 'Unit parameter is required')
			throw new Error('Unit is required')
		}
		if (!UNIT_SCALES[unit]) {
			logger.error('useMeasurement', 'Invalid unit specified', { unit })
			throw new Error(`Invalid unit: ${unit}. Available units: ${Object.keys(UNIT_SCALES).join(', ')}`)
		}
		
		currentUnit.value = unit
		// Recalculate all existing measurements
		measurements.value = measurements.value.map(m => ({
			...m,
			...convertDistance(m.distance),
		}))
		// Update all text labels on 3D objects
		updateAllTextLabels()
		logger.info('useMeasurement', 'Unit changed', { unit })
	}
	
	// Set model scale (how many real units = 1 Three.js unit)
	const setModelScale = (scale) => {
		if (typeof scale !== 'number') {
			logger.error('useMeasurement', 'Scale must be a number')
			throw new Error('Scale must be a number')
		}
		if (scale <= 0) {
			logger.error('useMeasurement', 'Scale must be positive', { scale })
			throw new Error('Scale must be a positive number')
		}
		if (!isFinite(scale)) {
			logger.error('useMeasurement', 'Scale must be finite', { scale })
			throw new Error('Scale must be a finite number')
		}
		
		modelScale.value = scale
		// Recalculate all existing measurements
		measurements.value = measurements.value.map(m => ({
			...m,
			...convertDistance(m.distance),
		}))
		// Update all text labels on 3D objects
		updateAllTextLabels()
		logger.info('useMeasurement', 'Model scale updated', { scale })
	}
	
	// Update all text labels on 3D objects with current measurement values
	const updateAllTextLabels = () => {
		if (!measurementGroup.value || textMeshes.value.length === 0) return

		try {
			// Update each text mesh with corresponding measurement
			measurements.value.forEach((measurement, index) => {
				if (index < textMeshes.value.length) {
					const textMesh = textMeshes.value[index]
					
					// Use formatted value with current unit
					const displayText = measurement.formatted || `${measurement.distance.toFixed(2)} units`
					
					// Create text texture using shared utility
					const texture = createTextTexture(displayText, {
						width: 512,
						height: 128,
						textColor: '#00ff00',
						bgColor: 'rgba(0, 0, 0, 0.8)',
						fontSize: 48,
						fontFamily: 'Arial',
					})

					if (texture) {
						textMesh.material.map = texture
						textMesh.material.needsUpdate = true
					}
				}
			})
		} catch (error) {
			logError('useMeasurement', 'Failed to update text labels', error)
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
		if (!isActive.value) {
			return
		}

		if (!sceneRef.value) {
			return
		}

		try {
			// Use shared raycasting utility with custom filter
			const point = raycastIntersection(event, camera, sceneRef.value, {
				filterMesh: (mesh) => mesh.isMesh && mesh.name !== 'measurementGroup' && mesh.visible,
				recursive: true,
			})

			if (point) {
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

		// If we have 2 points, create a measurement
		if (points.value.length === 2) {
			createMeasurement()
		}
	}

	// Create visual indicator for a point
	const createPointIndicator = (point) => {
		if (!measurementGroup.value) return

		// Use shared marker sphere utility
		const sphere = createMarkerSphere(point, {
			scale: visualScale.value,
			color: 0xffff00, // Bright yellow for measurements
			sizeMultiplier: 2,
			opacity: 0.9,
			renderOrder: 999,
			name: `measurementPoint_${points.value.length}`,
		})

		if (sphere) {
			measurementGroup.value.add(sphere)
			pointMeshes.value.push(sphere)
		}
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
		const lineRadius = visualScale.value * 0.3 // Scale line thickness with model
		const cylinderGeometry = new THREE.CylinderGeometry(lineRadius, lineRadius, distance, 8)
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
			// Use formatted value if available, otherwise show raw distance with units
			const displayText = measurement.formatted || `${measurement.distance.toFixed(2)} units`
			
			// Use shared text mesh utility
			const textMesh = createTextMesh(displayText, measurement.midpoint, {
				scale: visualScale.value,
				widthMultiplier: 30,
				heightMultiplier: 7.5,
				yOffset: 0, // No offset for measurements (at midpoint)
				textColor: '#00ff00',
				bgColor: 'rgba(0, 0, 0, 0.8)',
				fontSize: 48,
				canvasWidth: 512,
				canvasHeight: 128,
				renderOrder: 996,
				name: 'measurementText',
			})

			if (textMesh) {
				measurementGroup.value.add(textMesh)
				textMeshes.value.push(textMesh)
			}
		} catch (error) {
			logError('useMeasurement', 'Failed to create distance text', error)
		}
	}

	// Clear current measurement
	const clearCurrentMeasurement = () => {
		points.value = []
		currentMeasurement.value = null
	}

	// Delete a single measurement
	const deleteMeasurement = (measurementId) => {
		const index = measurements.value.findIndex(m => m.id === measurementId)
		if (index !== -1) {
			// Remove visual elements for this measurement
			if (measurementGroup.value) {
				// Find and remove point meshes (2 per measurement)
				// Note: Each measurement has 2 points, but we need to be careful not to delete
				// points that might be shared with other measurements
				// For safety, we'll remove line and text, but keep point cleanup simple
				
				// Remove line mesh
				if (index < lineMeshes.value.length) {
					const lineMesh = lineMeshes.value[index]
					if (lineMesh) {
						measurementGroup.value.remove(lineMesh)
						lineMeshes.value.splice(index, 1)
					}
				}
				
				// Remove text mesh
				if (index < textMeshes.value.length) {
					const textMesh = textMeshes.value[index]
					if (textMesh) {
						measurementGroup.value.remove(textMesh)
						textMeshes.value.splice(index, 1)
					}
				}
				
				// Remove point meshes for this measurement (2 points per measurement)
				// Points are stored sequentially: measurement 0 = points 0,1; measurement 1 = points 2,3; etc.
				const pointStartIndex = index * 2
				for (let i = 0; i < 2; i++) {
					const pointIndex = pointStartIndex
					if (pointIndex < pointMeshes.value.length) {
						const pointMesh = pointMeshes.value[pointIndex]
						if (pointMesh) {
							measurementGroup.value.remove(pointMesh)
						}
						pointMeshes.value.splice(pointIndex, 1)
					}
				}
			}

			// Remove from measurements array
			measurements.value.splice(index, 1)
		}
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
		visualScale,

		// Computed
		hasPoints,
		canMeasure,
		measurementCount,

		// Methods
		init,
		updateVisualScale,
		toggleMeasurement,
		handleClick,
		addMeasurementPoint,
		createMeasurement,
		clearCurrentMeasurement,
		deleteMeasurement,
		clearAllMeasurements,
		getMeasurementSummary,
		convertDistance,
		setUnit,
		setModelScale,
		getAvailableUnits,
	}
}
