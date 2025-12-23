import { ref, computed, readonly } from 'vue'
import * as THREE from 'three'
import { logger } from '../utils/logger.js'
import { logError } from '../utils/error-handler.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import {
	calculateModelScale,
	createTextTexture,
	createTextMesh,
	raycastIntersection,
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

					// Update existing texture canvas if it's a CanvasTexture, otherwise create new texture
					const existingTexture = textMesh.material.map
					let texture = null

					if (existingTexture && existingTexture.isCanvasTexture && existingTexture.image) {
						// Update existing canvas texture
						const canvas = existingTexture.image
						const context = canvas.getContext('2d')

						// Get original font size from userData, fallback to 48 for small models
						const originalFontSize = textMesh.userData?.originalFontSize || 48

						// Clear canvas completely first (important to prevent ghosting)
						context.clearRect(0, 0, canvas.width, canvas.height)

						// Draw background
						context.fillStyle = 'rgba(0, 0, 0, 0.9)'
						context.fillRect(0, 0, canvas.width, canvas.height)

						// Draw text with original font size
						context.fillStyle = '#ffffff'
						context.font = `bold ${originalFontSize}px Arial`
						context.textAlign = 'center'
						context.textBaseline = 'middle'
						context.fillText(displayText, canvas.width / 2, canvas.height / 2)

						// Mark texture for update - this is critical for CanvasTexture
						existingTexture.needsUpdate = true
						// Also ensure the material knows the texture changed
						if (textMesh.material) {
							textMesh.material.needsUpdate = true
						}
						texture = existingTexture
					} else {
						// Create new texture - use original dimensions and font size from userData if available
						const originalFontSize = textMesh.userData?.originalFontSize || 48
						const originalCanvasWidth = textMesh.userData?.originalCanvasWidth || 512
						const originalCanvasHeight = textMesh.userData?.originalCanvasHeight || 128

						texture = createTextTexture(displayText, {
							width: originalCanvasWidth,
							height: originalCanvasHeight,
							textColor: '#ffffff',
							bgColor: 'rgba(0, 0, 0, 0.9)',
							fontSize: originalFontSize,
							fontFamily: 'Arial',
						})

						if (texture) {
							// Dispose old texture to prevent memory leaks
							if (existingTexture) {
								existingTexture.dispose()
							}
							textMesh.material.map = texture
							texture.needsUpdate = true
						} else {
							logError('useMeasurement', 'Failed to create texture', new Error('Texture creation failed'))
						}
					}

					// Always mark material for update
					if (texture) {
						textMesh.material.needsUpdate = true
					}

					// Update position with new yOffset to position label above the line
					// Recalculate textScale and yOffset based on current visualScale
					const modelMaxDim = visualScale.value / 0.005 // Reverse calculate max dimension from visual scale
					const baseTextScale = Math.max(modelMaxDim * 0.02, 2) // At least 2% of model or 2 units minimum
					const textScale = Math.min(baseTextScale, modelMaxDim * 0.1) // Cap at 10% of model size
					const yOffset = textScale >= 2 ? 0.15 : 0.2 // Increased offset to position label above the line

					// Reset position to midpoint and apply new yOffset
					textMesh.position.copy(measurement.midpoint)
					textMesh.position.y += textScale * yOffset
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

		// Calculate point size - use a percentage of the *actual* model size with a minimum visible size
		// Prefer the real bounding box over the reverse-calculated value from visualScale,
		// because visualScale is clamped and can greatly overestimate size for tiny models.
		let modelMaxDim = visualScale.value / 0.005 // Fallback from visualScale

		if (sceneRef.value) {
			const box = new THREE.Box3()
			const meshes = []
			sceneRef.value.traverse((child) => {
				if (child.isMesh && !child.name?.startsWith('measurement') && !child.name?.startsWith('annotation')) {
					meshes.push(child)
					const meshBox = new THREE.Box3().setFromObject(child)
					box.union(meshBox)
				}
			})

			if (meshes.length > 0) {
				const size = new THREE.Vector3()
				box.getSize(size)
				const actualMaxDim = Math.max(size.x, size.y, size.z)
				if (actualMaxDim > 0) {
					modelMaxDim = actualMaxDim
				}
			}
		}

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
			color: 0xffff00, // Bright yellow for measurements
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

		const geometry = new THREE.BufferGeometry().setFromPoints([
			measurement.point1,
			measurement.point2,
		])

		// Use a thicker, more visible line with tube geometry for WebGL.
		// Note: linewidth doesn't work in WebGL, so we create a cylinder instead.
		const direction = new THREE.Vector3().subVectors(measurement.point2, measurement.point1)
		const distance = direction.length()
		// Calculate line radius - use a percentage of the *actual* model size with a minimum visible size
		// Prefer the real bounding box over the reverse-calculated value from visualScale, because
		// visualScale is clamped and can greatly overestimate size for tiny models.
		let modelMaxDim = visualScale.value / 0.005 // Fallback from visualScale

		if (sceneRef.value) {
			const box = new THREE.Box3()
			const meshes = []
			sceneRef.value.traverse((child) => {
				if (child.isMesh && !child.name?.startsWith('measurement') && !child.name?.startsWith('annotation')) {
					meshes.push(child)
					const meshBox = new THREE.Box3().setFromObject(child)
					box.union(meshBox)
				}
			})

			if (meshes.length > 0) {
				const size = new THREE.Vector3()
				box.getSize(size)
				const actualMaxDim = Math.max(size.x, size.y, size.z)
				if (actualMaxDim > 0) {
					modelMaxDim = actualMaxDim
				}
			}
		}

		// Target radius based on configuration (default ~0.8% of model size),
		// clamped to stay within a reasonable visible range
		const basePercent = typeof MEASUREMENT_SIZING.lineThicknessPercent === 'number' ? MEASUREMENT_SIZING.lineThicknessPercent : 0.8
		const targetRadius = modelMaxDim * (basePercent / 100)
		const minRadius = modelMaxDim * ((basePercent * 0.625) / 100) // ~0.5% when base is 0.8
		const maxRadius = modelMaxDim * ((basePercent * 1.875) / 100) // ~1.5% when base is 0.8
		const lineRadius = Math.min(Math.max(targetRadius, minRadius), maxRadius)

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

			// Calculate text size - use a percentage of actual model size with a minimum visible size
			// Prefer the real bounding box size over the reverse-calculated value from visualScale,
			// because visualScale is clamped (min 0.3) which can greatly overestimate size for tiny models.
			let modelMaxDim = visualScale.value / 0.005 // Fallback: reverse calculate from visualScale

			if (sceneRef.value) {
				const box = new THREE.Box3()
				const meshes = []
				sceneRef.value.traverse((child) => {
					if (child.isMesh && !child.name?.startsWith('measurement') && !child.name?.startsWith('annotation')) {
						meshes.push(child)
						const meshBox = new THREE.Box3().setFromObject(child)
						box.union(meshBox)
					}
				})

				if (meshes.length > 0) {
					const size = new THREE.Vector3()
					box.getSize(size)
					const actualMaxDim = Math.max(size.x, size.y, size.z)
					if (actualMaxDim > 0) {
						modelMaxDim = actualMaxDim
					}
				}
			}

			// For very small models, use a smaller minimum text scale so labels don't cover everything
			const minTextScale = modelMaxDim < 1 ? modelMaxDim * 0.1 : Math.min(modelMaxDim * 0.02, 2)
			const baseTextScale = Math.max(minTextScale, modelMaxDim * 0.02) // At least 2% of model
			const textScale = Math.min(baseTextScale, modelMaxDim * 0.1) // Cap at 10% of model size

			// Use shared text mesh utility
			// Position text close to the line with better visibility (similar to annotations)
			// For large models, use larger multipliers to ensure visibility
			// Position label above the line (positive yOffset moves label upward)
			// For large models, use a larger yOffset to ensure label is clearly above the line
			const yOffset = textScale >= 2 ? 0.15 : 0.2 // Increased offset to position label above the line
			// For large models, use larger canvas to ensure text quality at larger sizes
			const canvasWidth = textScale >= 2 ? 1024 : 512
			const canvasHeight = textScale >= 2 ? 256 : 128
			const fontSize = textScale >= 2 ? 96 : 48 // Much larger font for large models (increased from 64)

			// For large models, reduce width but keep height for better text visibility.
			// Width is driven by configuration as a percentage of model size, relative to a 20% baseline.
			const baseLabelWidthPercent = 20
			const configuredLabelWidthPercent = typeof MEASUREMENT_SIZING.labelWidthPercent === 'number'
				? MEASUREMENT_SIZING.labelWidthPercent
				: baseLabelWidthPercent
			const widthScale = configuredLabelWidthPercent / baseLabelWidthPercent
			const widthMultiplier = (textScale >= 2 ? 6 : 2) * widthScale
			const heightMultiplier = textScale >= 2 ? 2.5 : 0.5 // Keep height the same

			const textMesh = createTextMesh(displayText, measurement.midpoint, {
				scale: textScale, // Use calculated size directly
				widthMultiplier, // Larger multiplier for better visibility
				heightMultiplier, // Larger multiplier for better visibility
				yOffset, // Offset above the line, adjusted for large models
				textColor: '#ffffff', // White text for better contrast
				bgColor: 'rgba(0, 0, 0, 0.9)', // Darker background for better readability
				fontSize,
				canvasWidth,
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

				// Store original font size and canvas dimensions in userData for later updates
				textMesh.userData.originalFontSize = fontSize
				textMesh.userData.originalCanvasWidth = canvasWidth
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
