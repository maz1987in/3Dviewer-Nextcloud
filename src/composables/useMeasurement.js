import { ref, shallowRef, computed, readonly, toRaw } from 'vue'
import * as THREE from 'three'
import { logger } from '../utils/logger.js'
import { logError } from '../utils/error-handler.js'
import { VIEWER_CONFIG, MARKER_COLORS } from '../config/viewer-config.js'
import {
	calculateModelScale,
	createTextMesh,
	getModelMaxDimension,
	isHelperMesh,
	raycastIntersection,
	updateTextMesh,
} from '../utils/modelScaleUtils.js'

// Unit conversion factors from config
const UNIT_SCALES = VIEWER_CONFIG.measurement.unitScales
const DEFAULT_UNIT = VIEWER_CONFIG.measurement.defaultUnit

// Visual sizing configuration for measurements (percentages of model size)
const MEASUREMENT_SIZING = (VIEWER_CONFIG.visualSizing && VIEWER_CONFIG.visualSizing.measurement) || {
	pointSizePercent: 1.5,
	lineThicknessPercent: 0.8,
	labelWidthPercent: 20,
}

export function useMeasurement() {
	// Measurement state
	const isActive = ref(false)
	const points = ref([])
	const measurements = ref([])
	const currentMeasurement = ref(null)

	// Unit configuration
	const currentUnit = ref(DEFAULT_UNIT) // Use configured default unit
	const modelScale = ref(1) // Scale factor: 1 Three.js unit = modelScale real units
	const visualScale = ref(1) // Visual scale for markers based on model size

	// Scene reference
	const sceneRef = shallowRef(null)

	// Visual elements
	const measurementGroup = shallowRef(null)
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
		if (!sceneRef.value) {
			return
		}

		const calculatedScale = calculateModelScale(sceneRef.value)
		visualScale.value = calculatedScale
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
			formatted: `${realDistance.toFixed(3)} ${unitConfig.suffix}`,
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

		const oldUnit = currentUnit.value
		currentUnit.value = unit
		// Recalculate all existing measurements
		measurements.value = measurements.value.map(m => {
			const converted = convertDistance(m.distance)
			const updated = {
				...m,
				...converted,
			}
			return updated
		})
		// Update all text labels on 3D objects
		updateAllTextLabels()
		logger.info('useMeasurement', 'Unit changed', { unit, oldUnit, measurementCount: measurements.value.length })
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
		if (!measurementGroup.value || textMeshes.value.length === 0) {
			return
		}

		try {
			// Update each text mesh with corresponding measurement
			measurements.value.forEach((measurement, index) => {
				if (index < textMeshes.value.length) {
					const textMesh = textMeshes.value[index]

					// Use formatted value with current unit
					// If formatted is not up to date, recalculate it
					let displayText = measurement.formatted
					if (!displayText || !measurement.formatted) {
						const converted = convertDistance(measurement.distance)
						displayText = converted.formatted
						// Update the measurement object with the correct formatted value
						measurement.formatted = converted.formatted
						measurement.suffix = converted.suffix
						measurement.value = converted.value
					}

					// One updater, shared with the annotation labels: it re-measures the text,
					// so a reading that gets longer when the unit changes is redrawn rather than
					// clipped by the canvas it was first drawn into.
					updateTextMesh(textMesh, displayText, {
						textColor: MARKER_COLORS.measurement,
						bgColor: MARKER_COLORS.labelSurface,
					})

					// Keep label at its current position — only text content changes when switching units
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
			/*
			 * The model, and nothing else the viewer put in the scene. Filtering only by
			 * name and visibility let the click land on TransformControls' picker — an
			 * invisible material on a visible object, sized so a drag cannot run off it —
			 * so a point clicked on the model was placed on a plane in front of it and the
			 * marker floated clear of the surface.
			 */
			const point = raycastIntersection(event, camera, sceneRef.value, {
				filterMesh: (mesh) => mesh.isMesh && mesh.visible && !isHelperMesh(mesh),
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

		// The real bounding box rather than the reverse-calculated value from visualScale,
		// which is clamped and greatly overestimates the size of a small model.
		const modelMaxDim = getModelMaxDimension(sceneRef.value, visualScale.value / 0.005)

		// Use a small percentage of the model size for the measurement point radius,
		// driven by configuration (default ~1.5% of model size, clamped between ~1% and ~3%)
		const basePercent = typeof MEASUREMENT_SIZING.pointSizePercent === 'number' ? MEASUREMENT_SIZING.pointSizePercent : 1.5
		const targetRadius = modelMaxDim * (basePercent / 100)
		const minRadius = modelMaxDim * ((basePercent * 0.666) / 100) // ~2/3 of target → ~1% when base is 1.5%
		const maxRadius = modelMaxDim * ((basePercent * 2) / 100) // 2x target → ~3% when base is 1.5%
		const pointRadius = Math.min(Math.max(targetRadius, minRadius), maxRadius)

		// Create sphere directly to bypass the 0.02 cap in createMarkerSphere
		const geometry = new THREE.SphereGeometry(pointRadius, 16, 16)
		const material = new THREE.MeshBasicMaterial({
			color: MARKER_COLORS.measurement,
			transparent: true,
			opacity: 0.9,
			depthTest: false, // Always render on top
		})
		const sphere = new THREE.Mesh(geometry, material)
		sphere.position.copy(point)
		sphere.name = `measurementPoint_${points.value.length}`
		sphere.renderOrder = 999

		// Add to scene
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

		// Reset for next measurement
		points.value = []
	}

	// Create visual line between measurement points
	const createMeasurementLine = (measurement) => {
		if (!measurementGroup.value) return

		// Use a thicker, more visible line with tube geometry for WebGL.
		// Note: linewidth doesn't work in WebGL, so we create a cylinder instead.
		const direction = new THREE.Vector3().subVectors(measurement.point2, measurement.point1)
		const distance = direction.length()
		const modelMaxDim = getModelMaxDimension(sceneRef.value, visualScale.value / 0.005)

		// Target radius based on configuration (default ~0.8% of model size),
		// clamped to stay within a reasonable visible range
		const basePercent = typeof MEASUREMENT_SIZING.lineThicknessPercent === 'number' ? MEASUREMENT_SIZING.lineThicknessPercent : 0.8
		const targetRadius = modelMaxDim * (basePercent / 100)
		const minRadius = modelMaxDim * ((basePercent * 0.625) / 100) // ~0.5% when base is 0.8
		const maxRadius = modelMaxDim * ((basePercent * 1.875) / 100) // ~1.5% when base is 0.8
		const lineRadius = Math.min(Math.max(targetRadius, minRadius), maxRadius)

		const cylinderGeometry = new THREE.CylinderGeometry(lineRadius, lineRadius, distance, 8)
		const cylinderMaterial = new THREE.MeshBasicMaterial({
			color: MARKER_COLORS.measurement,
			transparent: true,
			opacity: 0.8,
			depthTest: false,
		})
		const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial)

		// Position and orient the cylinder
		cylinder.position.copy(measurement.point1).add(direction.multiplyScalar(0.5))
		cylinder.quaternion.setFromUnitVectors(
			new THREE.Vector3(0, 1, 0),
			direction.normalize(),
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
			const displayText = measurement.formatted || `${measurement.distance.toFixed(3)} units`

			const modelMaxDim = getModelMaxDimension(sceneRef.value, visualScale.value / 0.005)

			/*
			 * One number decides how big the reading is: its height, as a percentage of the
			 * model. Width follows the text, so nothing else needs saying.
			 *
			 * What was here computed a scale from three clamps — a minimum that branched on
			 * whether the model was over one unit, a second minimum, and a cap — then
			 * multiplied it by a height multiplier that branched again on the result. None
			 * of the four was about legibility, and together they produced a label 1% of the
			 * model's height: a smudge, on the one thing a measurement exists to tell you.
			 */
			const basePercent = typeof MEASUREMENT_SIZING.labelHeightPercent === 'number' ? MEASUREMENT_SIZING.labelHeightPercent : 4
			const labelHeight = modelMaxDim * (basePercent / 100)
			const yOffset = 0.2

			// The texture's own resolution, which is about crispness rather than size —
			// the label's dimensions in the scene come from `labelHeight` and the text.
			const fontSize = 48
			const canvasHeight = 128

			const textMesh = createTextMesh(displayText, measurement.midpoint, {
				scale: labelHeight,
				heightMultiplier: 1,
				yOffset,
				textColor: MARKER_COLORS.measurement,
				bgColor: MARKER_COLORS.labelSurface,
				fontSize,
				canvasHeight,
				renderOrder: 998, // Higher render order to be in front of the line (997)
				name: 'measurementText',
			})

			if (textMesh) {
				// Check if a text mesh already exists for this measurement
				const existingMeshIndex = textMeshes.value.findIndex((mesh, idx) => {
					return measurements.value[idx]?.id === measurement.id
				})

				if (existingMeshIndex >= 0) {
					// Remove existing mesh before adding new one
					const oldMesh = textMeshes.value[existingMeshIndex]
					if (oldMesh && oldMesh.parent) {
						oldMesh.parent.remove(oldMesh)
						// Dispose geometry and material
						if (oldMesh.geometry) oldMesh.geometry.dispose()
						if (oldMesh.material) {
							if (oldMesh.material.map) oldMesh.material.map.dispose()
							oldMesh.material.dispose()
						}
					}
					textMeshes.value.splice(existingMeshIndex, 1)
				}

				// Kept for the in-place texture update when a unit changes.
				textMesh.userData.originalFontSize = fontSize
				textMesh.userData.originalCanvasHeight = canvasHeight

				// Double-check mesh isn't already in scene
				if (!textMesh.parent) {
					measurementGroup.value.add(textMesh)
				} else if (textMesh.parent !== measurementGroup.value) {
					// Mesh is in wrong parent, move it
					textMesh.parent.remove(textMesh)
					measurementGroup.value.add(textMesh)
				}

				// Only add to array if not already present
				if (!textMeshes.value.includes(textMesh)) {
					textMeshes.value.push(textMesh)
				}

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

				// Remove line mesh (toRaw to match Three.js scene reference)
				if (index < lineMeshes.value.length) {
					const lineMesh = lineMeshes.value[index]
					if (lineMesh) {
						measurementGroup.value.remove(toRaw(lineMesh))
						lineMeshes.value.splice(index, 1)
					}
				}

				// Remove text mesh
				if (index < textMeshes.value.length) {
					const textMesh = textMeshes.value[index]
					if (textMesh) {
						measurementGroup.value.remove(toRaw(textMesh))
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
							measurementGroup.value.remove(toRaw(pointMesh))
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

	/**
	 * Dispose of measurement resources
	 */
	const dispose = () => {
		// Clear all measurements and points
		points.value = []
		measurements.value = []
		currentMeasurement.value = null
		isActive.value = false

		// Clear visual elements
		pointMeshes.value = []
		lineMeshes.value = []
		textMeshes.value = []

		logger.info('useMeasurement', 'Measurement resources disposed')
	}

	return {
		// State
		isActive: readonly(isActive),
		points: readonly(points),
		measurements: readonly(measurements),
		currentMeasurement: readonly(currentMeasurement),
		currentUnit: readonly(currentUnit),
		modelScale: readonly(modelScale),
		visualScale: readonly(visualScale),

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
		dispose,
	}
}
