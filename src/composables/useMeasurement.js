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
import { displayLengthFactor, formatLength } from '../utils/sourceUnits.js'

// Unit conversion factors from config
const UNIT_SCALES = VIEWER_CONFIG.measurement.unitScales
const DEFAULT_UNIT = VIEWER_CONFIG.measurement.defaultUnit

// Visual sizing configuration for measurements (percentages of model size)
const MEASUREMENT_SIZING = (VIEWER_CONFIG.visualSizing && VIEWER_CONFIG.visualSizing.measurement) || {
	pointSizePercent: 1.5,
	lineThicknessPercent: 0.8,
	labelWidthPercent: 20,
}

// Distance takes two clicks; angle takes three, the middle one being the vertex
export const MEASUREMENT_MODES = ['distance', 'angle']

/**
 * Angle at `vertex` between the legs to `point1` and `point2`, in degrees.
 * @param {THREE.Vector3} point1
 * @param {THREE.Vector3} vertex
 * @param {THREE.Vector3} point2
 * @return {number} 0..180, or 0 when a leg has no length
 */
export function computeAngle(point1, vertex, point2) {
	const a = new THREE.Vector3().subVectors(point1, vertex)
	const b = new THREE.Vector3().subVectors(point2, vertex)
	if (a.lengthSq() === 0 || b.lengthSq() === 0) return 0
	return THREE.MathUtils.radToDeg(a.angleTo(b))
}

/**
 * Each measurement's number in the panel, counted within its kind: distances 1, 2, 3 and
 * angles 1, 2, so "Angle 2" is the second angle, not the second item of the list.
 * @param {Array<{ id: *, type?: string }>} list - the measurements, in panel order
 * @return {Map<*, number>} measurement id -> its number
 */
export function measurementNumbers(list) {
	const counts = { distance: 0, angle: 0 }
	const numbers = new Map()
	for (const m of list) {
		const kind = m.type === 'angle' ? 'angle' : 'distance'
		numbers.set(m.id, ++counts[kind])
	}
	return numbers
}

/**
 * Reading for an angle; degrees are the same whatever the length unit.
 * @param {number} angle - degrees
 * @return {object} value, formatted, unit, suffix
 */
export function formatAngle(angle) {
	return {
		value: angle,
		formatted: `${angle.toFixed(2)}°`,
		unit: 'deg',
		suffix: '°',
	}
}

/**
 * Where an angle's label goes: a little way from the vertex, inside the angle, so it
 * sits between the legs rather than on top of the vertex marker.
 * @param {THREE.Vector3} point1
 * @param {THREE.Vector3} vertex
 * @param {THREE.Vector3} point2
 * @return {THREE.Vector3}
 */
function angleLabelPosition(point1, vertex, point2) {
	const a = new THREE.Vector3().subVectors(point1, vertex)
	const b = new THREE.Vector3().subVectors(point2, vertex)
	const reach = Math.min(a.length(), b.length()) * 0.35
	const bisector = a.normalize().add(b.normalize())
	// Legs pointing opposite ways have no bisector; the vertex itself will do
	if (bisector.lengthSq() < 1e-8) return vertex.clone()
	return vertex.clone().add(bisector.normalize().multiplyScalar(reach))
}

export function useMeasurement() {
	// Measurement state
	const isActive = ref(false)
	const points = ref([])
	const measurements = ref([])
	const currentMeasurement = ref(null)

	// Unit configuration
	const currentUnit = ref(DEFAULT_UNIT) // Use configured default unit
	// Whether the user picked the unit; until then each model starts in its own
	const unitChosen = ref(false)
	// Millimetres per scene unit, from the format the model came in (utils/sourceUnits.js),
	// and per unit of the file itself (differs only when the loader rescaled the model)
	const modelScale = ref(1)
	const fileScale = ref(1)
	const visualScale = ref(1) // Visual scale for markers based on model size

	// Scene reference
	const sceneRef = shallowRef(null)

	// Distance or angle
	const mode = ref('distance')
	const requiredPoints = computed(() => (mode.value === 'angle' ? 3 : 2))

	// Visual elements. Kept out of reactive state: the scene holds the real objects, and
	// a proxy of one is a different object as far as `remove` is concerned.
	const measurementGroup = shallowRef(null)
	const pendingPointMeshes = [] // markers for points not yet part of a measurement
	const measurementObjects = new Map() // measurement id -> { points, lines, text }

	let noteHooks = {}
	const setNoteHooks = (hooks) => { noteHooks = hooks || {} }

	// Date.now() alone collides when notes are drawn in the same millisecond on load.
	let idSequence = 0
	const nextId = () => `${Date.now()}-${++idSequence}`

	// Computed properties
	const hasPoints = computed(() => points.value.length > 0)
	const canMeasure = computed(() => points.value.length >= requiredPoints.value)
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
		// One scene unit is modelScale millimetres; "units" shows the file's own numbers
		const realDistance = threeJsDistance * displayLengthFactor(unitConfig, modelScale.value, fileScale.value)
		return {
			value: realDistance,
			formatted: `${formatLength(realDistance)} ${unitConfig.suffix}`,
			unit: currentUnit.value,
			suffix: unitConfig.suffix,
		}
	}

	// Show every reading in a unit, without saying who chose it
	const applyUnit = (unit) => {
		const oldUnit = currentUnit.value
		currentUnit.value = unit
		// Recalculate all existing measurements
		measurements.value = measurements.value.map(m => (m.type === 'angle'
			? m
			: { ...m, ...convertDistance(m.distance) }))
		// Update all text labels on 3D objects
		updateAllTextLabels()
		logger.info('useMeasurement', 'Unit changed', { unit, oldUnit, measurementCount: measurements.value.length })
	}

	// Set the measurement unit: the user's choice, kept from one model to the next
	const setUnit = (unit) => {
		if (!unit) {
			logger.error('useMeasurement', 'Unit parameter is required')
			throw new Error('Unit is required')
		}
		if (!UNIT_SCALES[unit]) {
			logger.error('useMeasurement', 'Invalid unit specified', { unit })
			throw new Error(`Invalid unit: ${unit}. Available units: ${Object.keys(UNIT_SCALES).join(', ')}`)
		}

		unitChosen.value = true
		applyUnit(unit)
	}

	/**
	 * The unit a newly opened model reads best in (its own: m for a glTF, mm for an STL),
	 * taken only while the user has not picked one.
	 * @param {string} unit - A key of VIEWER_CONFIG.measurement.unitScales
	 * @return {boolean} Whether it was taken
	 */
	const suggestUnit = (unit) => {
		if (unitChosen.value || !UNIT_SCALES[unit]) {
			return false
		}
		if (unit !== currentUnit.value) {
			applyUnit(unit)
		}
		return true
	}

	/**
	 * Set the model scale: how many millimetres one scene unit is (utils/sourceUnits.js).
	 * @param {number} scale - Millimetres per scene unit
	 * @param {number} [perFileUnit] - Millimetres per unit of the file, for "units";
	 *   the same as `scale` unless the loader rescaled the model
	 */
	const setModelScale = (scale, perFileUnit = scale) => {
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
		fileScale.value = Number.isFinite(perFileUnit) && perFileUnit > 0 ? perFileUnit : scale
		// Recalculate all existing measurements
		measurements.value = measurements.value.map(m => (m.type === 'angle'
			? m
			: { ...m, ...convertDistance(m.distance) }))
		// Update all text labels on 3D objects
		updateAllTextLabels()
		logger.info('useMeasurement', 'Model scale updated', { scale })
	}

	// Update all text labels on 3D objects with current measurement values
	const updateAllTextLabels = () => {
		if (!measurementGroup.value) {
			return
		}

		try {
			measurements.value.forEach((measurement) => {
				// An angle reads the same in any unit
				if (measurement.type === 'angle') return
				const textMesh = measurementObjects.get(measurement.id)?.text
				if (!textMesh) return

				const displayText = measurement.formatted || convertDistance(measurement.distance).formatted

				// One updater, shared with the annotation labels: it re-measures the text,
				// so a reading that gets longer when the unit changes is redrawn rather than
				// clipped by the canvas it was first drawn into.
				updateTextMesh(textMesh, displayText, {
					textColor: MARKER_COLORS.measurement,
					bgColor: MARKER_COLORS.labelSurface,
				})
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
				filterMesh: (mesh) => (mesh.isMesh || mesh.isPoints) && mesh.visible && !isHelperMesh(mesh),
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
		// An angle's legs need length. A second click on the point just picked (usually a
		// double click) would leave the angle undefined and read 0°, so it is not taken.
		const previous = points.value[points.value.length - 1]
		if (mode.value === 'angle' && previous && previous.distanceTo(point) <= coincidentTolerance()) {
			logger.info('useMeasurement', 'Ignored a click on the point just picked')
			return
		}

		points.value.push(point.clone())

		// Create visual indicator for the point
		pendingPointMeshes.push(createPointIndicator(point))

		// Two clicks make a distance, three make an angle
		if (points.value.length >= requiredPoints.value) {
			createMeasurement()
		}
	}

	/**
	 * Record a finished measurement from its points, whatever mode the panel is in: an
	 * import, or a stored note. A point the user had already clicked is dropped with its
	 * marker first, so a half-picked measurement never takes these points as its next.
	 * @param {'distance'|'angle'} type
	 * @param {THREE.Vector3[]} measured - two points, or point, corner, point
	 * @param {object} [options]
	 * @param {boolean} [options.silent] - true for a stored note: no hook fires, so
	 *   loading notes never saves them back
	 * @param {?object} [options.meta] - the note's id, author and save state
	 * @return {object} the measurement as listed
	 */
	const addMeasurement = (type, measured, { silent = false, meta = null } = {}) => {
		if (!MEASUREMENT_MODES.includes(type)) {
			throw new Error(`Invalid measurement type: ${type}`)
		}
		if (measured.length !== (type === 'angle' ? 3 : 2)) {
			throw new Error(`A ${type} measurement needs ${type === 'angle' ? 3 : 2} points`)
		}
		cancelPendingPoint()
		const markers = measured.map(createPointIndicator)
		return finishMeasurement(type, measured.map(p => p.clone()), markers, { silent, meta })
	}

	/**
	 * Draw a distance that came from the server.
	 * @param {THREE.Vector3} point1
	 * @param {THREE.Vector3} point2
	 * @param {object} meta - the note's id, author and save state
	 * @return {object} the measurement as listed
	 */
	const addMeasurementFromNote = (point1, point2, meta) => addMeasurement('distance', [point1, point2], { silent: true, meta })

	/**
	 * Draw an angle that came from the server.
	 * @param {THREE.Vector3} point1
	 * @param {THREE.Vector3} vertex - the corner
	 * @param {THREE.Vector3} point2
	 * @param {object} meta - the note's id, author and save state
	 * @return {object} the measurement as listed
	 */
	const addAngleFromNote = (point1, vertex, point2, meta) => addMeasurement('angle', [point1, vertex, point2], { silent: true, meta })

	// Remove a scene object and free what it holds on the GPU
	const disposeObject = (object) => {
		if (!object) return
		const raw = toRaw(object)
		if (raw.parent) raw.parent.remove(raw)
		raw.geometry?.dispose()
		if (raw.material) {
			raw.material.map?.dispose()
			raw.material.dispose()
		}
	}

	// Two clicks closer than a millionth of the model are the same point
	const coincidentTolerance = () => getModelMaxDimension(sceneRef.value, visualScale.value / 0.005) * 1e-6

	// Size of a marker, as a percentage of the model, clamped to a band around it
	const markerSize = (percent, fallback, minFactor, maxFactor) => {
		// The real bounding box rather than the reverse-calculated value from visualScale,
		// which is clamped and greatly overestimates the size of a small model.
		const modelMaxDim = getModelMaxDimension(sceneRef.value, visualScale.value / 0.005)
		const basePercent = typeof percent === 'number' ? percent : fallback
		const target = modelMaxDim * (basePercent / 100)
		const min = modelMaxDim * ((basePercent * minFactor) / 100)
		const max = modelMaxDim * ((basePercent * maxFactor) / 100)
		return Math.min(Math.max(target, min), max)
	}

	// Create visual indicator for a point
	const createPointIndicator = (point) => {
		if (!measurementGroup.value) return null

		// Default ~1.5% of model size, clamped between ~1% and ~3%
		const pointRadius = markerSize(MEASUREMENT_SIZING.pointSizePercent, 1.5, 0.666, 2)

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

		measurementGroup.value.add(sphere)
		return sphere
	}

	// Create a measurement from the points collected so far
	const createMeasurement = ({ silent = false, meta = null } = {}) => {
		const required = requiredPoints.value
		if (points.value.length < required) return null

		const picked = points.value.slice(-required).map(p => p.clone())
		return finishMeasurement(mode.value, picked, pendingPointMeshes.splice(0), { silent, meta })
	}

	/**
	 * Record a measurement and draw its legs and label.
	 * @param {'distance'|'angle'} type
	 * @param {THREE.Vector3[]} picked - two points, or point, corner, point
	 * @param {Array<?THREE.Mesh>} markers - the point markers already drawn for them
	 * @param {object} options
	 * @param {boolean} options.silent - true when drawing a stored note: no hook fires
	 * @param {?object} options.meta - the note's id, author and save state
	 * @return {object} the measurement as listed
	 */
	const finishMeasurement = (type, picked, markers, { silent, meta }) => {
		const id = nextId()
		let measurement

		if (type === 'angle') {
			const [point1, vertex, point2] = picked
			const angle = computeAngle(point1, vertex, point2)
			measurement = {
				id,
				type: 'angle',
				point1,
				vertex,
				point2,
				angle,
				...formatAngle(angle),
				midpoint: angleLabelPosition(point1, vertex, point2),
			}
		} else {
			const [point1, point2] = picked
			const distance = point1.distanceTo(point2)
			measurement = {
				id,
				type: 'distance',
				point1,
				point2,
				distance, // Raw Three.js distance
				...convertDistance(distance), // Add value, formatted, unit, suffix
				midpoint: new THREE.Vector3().addVectors(point1, point2).multiplyScalar(0.5),
			}
		}
		measurement.meta = meta ?? { noteId: null, author: null, saveState: 'new' }

		// Legs: one for a distance, two meeting at the vertex for an angle
		const legs = type === 'angle'
			? [[measurement.vertex, measurement.point1], [measurement.vertex, measurement.point2]]
			: [[measurement.point1, measurement.point2]]

		measurementObjects.set(id, {
			points: markers.filter(Boolean),
			lines: legs.map(([a, b]) => createMeasurementLine(a, b, id)).filter(Boolean),
			text: createMeasurementText(measurement.formatted, measurement.midpoint),
		})

		measurements.value.push(measurement)
		// The listed entry, a reactive proxy: the panel follows its save state
		const entry = measurements.value[measurements.value.length - 1]
		currentMeasurement.value = entry

		// Reset for next measurement
		points.value = []

		if (!silent) {
			noteHooks.added?.(entry)
		}
		return entry
	}

	// Create visual line between two points
	const createMeasurementLine = (start, end, id) => {
		if (!measurementGroup.value) return null

		// linewidth doesn't work in WebGL, so the line is a thin cylinder.
		const direction = new THREE.Vector3().subVectors(end, start)
		const distance = direction.length()
		if (distance === 0) return null

		// Default ~0.8% of model size, clamped between ~0.5% and ~1.5%
		const lineRadius = markerSize(MEASUREMENT_SIZING.lineThicknessPercent, 0.8, 0.625, 1.875)

		const cylinderGeometry = new THREE.CylinderGeometry(lineRadius, lineRadius, distance, 8)
		const cylinderMaterial = new THREE.MeshBasicMaterial({
			color: MARKER_COLORS.measurement,
			transparent: true,
			opacity: 0.8,
			depthTest: false,
		})
		const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial)

		// Position and orient the cylinder
		cylinder.position.copy(start).add(direction.clone().multiplyScalar(0.5))
		cylinder.quaternion.setFromUnitVectors(
			new THREE.Vector3(0, 1, 0),
			direction.normalize(),
		)
		cylinder.renderOrder = 997
		cylinder.name = `measurementLine_${id}`

		measurementGroup.value.add(cylinder)
		return cylinder
	}

	// Create the label that shows a measurement's reading
	const createMeasurementText = (displayText, position) => {
		if (!measurementGroup.value) return null
		try {
			const modelMaxDim = getModelMaxDimension(sceneRef.value, visualScale.value / 0.005)

			/*
			 * One number decides how big the reading is: its height, as a percentage of the
			 * model. Width follows the text, so nothing else needs saying.
			 */
			const basePercent = typeof MEASUREMENT_SIZING.labelHeightPercent === 'number' ? MEASUREMENT_SIZING.labelHeightPercent : 4
			const labelHeight = modelMaxDim * (basePercent / 100)

			// The texture's own resolution, which is about crispness rather than size.
			const fontSize = 48
			const canvasHeight = 128

			const textMesh = createTextMesh(displayText, position, {
				scale: labelHeight,
				heightMultiplier: 1,
				yOffset: 0.2,
				textColor: MARKER_COLORS.measurement,
				bgColor: MARKER_COLORS.labelSurface,
				fontSize,
				canvasHeight,
				renderOrder: 998, // In front of the line (997)
				name: 'measurementText',
			})
			if (!textMesh) return null

			// Kept for the in-place texture update when a unit changes.
			textMesh.userData.originalFontSize = fontSize
			textMesh.userData.originalCanvasHeight = canvasHeight

			measurementGroup.value.add(textMesh)
			return textMesh
		} catch (error) {
			logError('useMeasurement', 'Failed to create measurement text', error)
			return null
		}
	}

	// Clear current measurement (the points picked so far, not the finished ones)
	const clearCurrentMeasurement = () => {
		pendingPointMeshes.splice(0).forEach(disposeObject)
		points.value = []
		currentMeasurement.value = null
	}

	// Drop a half-finished measurement: its pending points and their markers
	const cancelPendingPoint = clearCurrentMeasurement

	// Switch between distance (two clicks) and angle (three clicks)
	const setMode = (newMode) => {
		if (!MEASUREMENT_MODES.includes(newMode)) {
			throw new Error(`Invalid measurement mode: ${newMode}. Available modes: ${MEASUREMENT_MODES.join(', ')}`)
		}
		if (mode.value === newMode) return
		// Points picked for one kind of measurement mean nothing to the other
		clearCurrentMeasurement()
		mode.value = newMode
		logger.info('useMeasurement', 'Mode changed', { mode: newMode })
	}

	// Delete a single measurement
	const deleteMeasurement = (measurementId, { silent = false } = {}) => {
		const index = measurements.value.findIndex(m => m.id === measurementId)
		if (index === -1) return
		if (!silent) noteHooks.deleted?.(measurements.value[index])

		const objects = measurementObjects.get(measurementId)
		if (objects) {
			[...objects.points, ...objects.lines, objects.text].forEach(disposeObject)
			measurementObjects.delete(measurementId)
		}

		measurements.value.splice(index, 1)
	}

	// Clear all measurements
	const clearAllMeasurements = ({ silent = false } = {}) => {
		if (!silent) {
			for (const m of measurements.value) noteHooks.deleted?.(m)
		}

		measurementObjects.forEach(({ points: p, lines, text }) => [...p, ...lines, text].forEach(disposeObject))
		measurementObjects.clear()
		pendingPointMeshes.splice(0).forEach(disposeObject)

		// Anything else left in the group
		if (measurementGroup.value) {
			measurementGroup.value.clear()
		}

		// Reset state
		points.value = []
		measurements.value = []
		currentMeasurement.value = null
	}

	// Get measurement summary
	const getMeasurementSummary = () => {
		return {
			active: isActive.value,
			pointCount: points.value.length,
			measurementCount: measurements.value.length,
			currentUnit: currentUnit.value,
			modelScale: modelScale.value,
			mode: mode.value,
			measurements: measurements.value.map(m => ({
				id: m.id,
				type: m.type,
				distance: m.distance,
				angle: m.angle,
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
		// Clear all measurements, points and the objects drawn for them. Silent: closing
		// the viewer must not delete the shared notes they were drawn from.
		clearAllMeasurements({ silent: true })
		isActive.value = false

		logger.info('useMeasurement', 'Measurement resources disposed')
	}

	return {
		// State
		isActive: readonly(isActive),
		points: readonly(points),
		measurements: readonly(measurements),
		currentMeasurement: readonly(currentMeasurement),
		currentUnit: readonly(currentUnit),
		unitChosen: readonly(unitChosen),
		mode: readonly(mode),
		modelScale: readonly(modelScale),
		visualScale: readonly(visualScale),

		// Computed
		hasPoints,
		canMeasure,
		measurementCount,
		requiredPoints,

		// Methods
		init,
		updateVisualScale,
		toggleMeasurement,
		handleClick,
		setNoteHooks,
		addMeasurementPoint,
		addMeasurement,
		addMeasurementFromNote,
		addAngleFromNote,
		createMeasurement,
		clearCurrentMeasurement,
		cancelPendingPoint,
		setMode,
		deleteMeasurement,
		clearAllMeasurements,
		getMeasurementSummary,
		convertDistance,
		setUnit,
		suggestUnit,
		setModelScale,
		getAvailableUnits,
		dispose,
	}
}
