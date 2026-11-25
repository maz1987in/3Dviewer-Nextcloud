/**
 * Model statistics composable
 * Analyzes and provides detailed statistics about 3D models
 */

import { ref, computed, readonly } from 'vue'
import { logger } from '../utils/logger.js'
import { getBoundingInfo } from '../utils/three-utils.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
import { displayLengthFactor, formatLength } from '../utils/sourceUnits.js'
import { withPartsTogether } from '../utils/viewerTransforms.js'
import { computeMeshStats, getGeometryStats, getMaterials, getTextures } from '../utils/modelMeasures.js'

// Unit scales from measurement config. A scene unit is however many millimetres the
// model's format says (setModelScale, from utils/sourceUnits.js).
const UNIT_SCALES = VIEWER_CONFIG.measurement.unitScales
const DEFAULT_UNIT = VIEWER_CONFIG.measurement.defaultUnit

export function useModelStats() {
	// State
	const modelStats = ref(null)
	const showStats = ref(false)
	const currentUnit = ref(DEFAULT_UNIT)
	// Whether the user picked the unit; until then each model starts in its own
	const unitChosen = ref(false)
	// Millimetres per scene unit, from the format the model came in, and per unit of the
	// file itself (differs only when the loader rescaled the model)
	const modelScale = ref(1)
	const fileScale = ref(1)
	const selectedMeshUuid = ref(null)

	/**
	 * Calculate volume of bounding box
	 * @param {THREE.Vector3} size - Bounding box size
	 * @return {number} Volume in cubic units
	 */
	const calculateVolume = (size) => {
		return size.x * size.y * size.z
	}

	/**
	 * Compute per-mesh statistics for every mesh in the scene graph.
	 * @param {THREE.Object3D} object3D - Root object to analyze
	 * @return {Array} Per-mesh stats with vertices, faces, surfaceArea, volume, watertight
	 */
	const computePerMeshStats = (object3D) => {
		const perMesh = []

		object3D.traverse((child) => {
			if (!child.isMesh || !child.geometry || child.userData?.tdvBoundsProxy) return
			// Skip internal helper meshes (TransformControls, annotation markers, etc.)
			const name = child.name || ''
			if (name === 'TransformControlsPlane' || name.startsWith('__helper')) return

			const pos = child.geometry.attributes.position
			if (!pos) return

			const vertices = pos.count
			const idx = child.geometry.index
			const faces = Math.floor(idx ? idx.count / 3 : pos.count / 3)

			const stats = computeMeshStats(child)

			perMesh.push({
				uuid: child.uuid,
				name: name || `Mesh ${perMesh.length + 1}`,
				vertices,
				faces,
				surfaceArea: stats.surfaceArea,
				volume: stats.volume,
				watertight: stats.watertight,
				boundaryEdges: stats.boundaryEdges,
				nonManifoldEdges: stats.nonManifoldEdges,
			})
		})

		return perMesh
	}

	/**
	 * Format bytes to human-readable string
	 * @param {number} bytes - Bytes to format
	 * @return {string} Formatted string
	 */
	const formatBytes = (bytes) => {
		if (bytes === 0) return '0 B'

		const k = 1024
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
		const i = Math.floor(Math.log(bytes) / Math.log(k))

		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
	}

	/**
	 * Analyze a 3D model and calculate all statistics. Measured with its parts together
	 * (viewerTransforms): Exploded view, which a new model can open in, spreads the parts
	 * for viewing only, and the bounding box and the per-part sizes are the model's.
	 * @param {THREE.Object3D} object3D - Object to analyze
	 * @param {string} filename - Model filename
	 * @param {number} fileSize - File size in bytes
	 * @return {object} Complete statistics
	 */
	const analyzeModel = (object3D, filename = '', fileSize = 0) => {
		if (!object3D) {
			logger.warn('useModelStats', 'No object provided for analysis')
			return null
		}
		return withPartsTogether(object3D, () => analyzeAssembled(object3D, filename, fileSize))
	}

	/**
	 * `analyzeModel`, on a model whose parts are where the model puts them.
	 * @param {THREE.Object3D} object3D - Object to analyze
	 * @param {string} filename - Model filename
	 * @param {number} fileSize - File size in bytes
	 * @return {object} Complete statistics
	 */
	const analyzeAssembled = (object3D, filename, fileSize) => {

		try {
			logger.info('useModelStats', 'Starting model analysis', { filename })

			// Get geometry statistics
			const geometryStats = getGeometryStats(object3D)

			// Get materials
			const materials = getMaterials(object3D)

			// Get textures
			const textureInfo = getTextures(object3D)

			// Get bounding box
			const boundingInfo = getBoundingInfo(object3D)
			const volume = calculateVolume(boundingInfo.size)

			// Compute per-mesh stats, then aggregate
			const perMesh = computePerMeshStats(object3D)
			let surfaceArea = 0
			let meshVolume = 0
			let watertightMeshes = 0
			let knownWatertightMeshes = 0
			for (const m of perMesh) {
				surfaceArea += m.surfaceArea
				meshVolume += m.volume
				if (m.watertight !== null) {
					knownWatertightMeshes++
					if (m.watertight) watertightMeshes++
				}
			}
			const allWatertight = knownWatertightMeshes > 0 && watertightMeshes === knownWatertightMeshes
				? true
				: knownWatertightMeshes === 0
					? null
					: false

			// Extract file extension
			const format = filename.split('.').pop().toLowerCase()

			// Reset selection on fresh analysis
			selectedMeshUuid.value = null

			// A scan's own account of itself (pointclouds/buildPointCloud.js), and a splat's
			// (splats/loadSplat.js)
			const cloud = object3D.userData?.tdvPointCloud ?? null
			const splat = object3D.userData?.tdvSplat ?? null

			// Create statistics object
			const stats = {
				// Geometry
				vertices: geometryStats.vertices,
				faces: geometryStats.faces,
				meshes: geometryStats.meshes,

				// A scan: points drawn, points in the file, and what each point records
				isPointCloud: cloud !== null,
				pointCount: geometryStats.points,
				pointTotal: cloud?.total ?? geometryStats.points,
				pointAttributes: cloud ? ['color', 'intensity', 'classification'].filter((key) => cloud.attributes[key]) : [],

				// A splat: splats drawn, and splats in the file
				isSplat: splat !== null,
				splatCount: splat?.count ?? 0,
				splatTotal: splat?.total ?? 0,

				// Materials
				materials: materials.slice(0, 10), // Limit to 10 for display
				materialCount: materials.length,

				// Textures
				textures: textureInfo.textures,
				textureCount: textureInfo.count,
				texturePendingCount: textureInfo.pendingCount,
				textureMissingCount: textureInfo.missingCount,
				textureMemoryMB: textureInfo.memoryMB,

				// Dimensions
				boundingBox: {
					x: boundingInfo.size.x,
					y: boundingInfo.size.y,
					z: boundingInfo.size.z,
				},
				center: {
					x: boundingInfo.center.x,
					y: boundingInfo.center.y,
					z: boundingInfo.center.z,
				},
				volume,
				surfaceArea,
				meshVolume,

				// Per-mesh + watertightness
				perMesh,
				allWatertight,
				watertightMeshes,
				knownWatertightMeshes,

				// File
				fileSize,
				fileSizeMB: fileSize / (1024 * 1024),
				format,
			}

			modelStats.value = stats

			logger.info('useModelStats', 'Model analysis complete', {
				vertices: stats.vertices,
				faces: stats.faces,
				materials: stats.materialCount,
				textures: stats.textureCount,
				surfaceArea: stats.surfaceArea,
				meshVolume: stats.meshVolume,
				perMeshCount: perMesh.length,
				allWatertight,
			})

			return stats
		} catch (error) {
			logger.error('useModelStats', 'Model analysis failed', error)
			return null
		}
	}

	/**
	 * Toggle statistics panel visibility
	 */
	const toggleStatsPanel = () => {
		showStats.value = !showStats.value
		logger.info('useModelStats', 'Statistics panel toggled', { visible: showStats.value })
	}

	/**
	 * Clear statistics
	 */
	const clearStats = () => {
		modelStats.value = null
		showStats.value = false
		selectedMeshUuid.value = null
		logger.info('useModelStats', 'Statistics cleared')
	}

	/**
	 * Set the display unit (mm / cm / m / in / ft / units): the user's choice, kept from
	 * one model to the next.
	 * @param {string} unit - Unit key from VIEWER_CONFIG.measurement.unitScales
	 */
	const setUnit = (unit) => {
		if (!UNIT_SCALES[unit]) {
			logger.warn('useModelStats', 'Unknown unit, ignoring', { unit })
			return
		}
		unitChosen.value = true
		currentUnit.value = unit
	}

	/**
	 * The unit a newly opened model reads best in, taken only while the user has not
	 * picked one.
	 * @param {string} unit - Unit key from VIEWER_CONFIG.measurement.unitScales
	 * @return {boolean} Whether it was taken
	 */
	const suggestUnit = (unit) => {
		if (unitChosen.value || !UNIT_SCALES[unit]) {
			return false
		}
		currentUnit.value = unit
		return true
	}

	/**
	 * How many millimetres one scene unit is, for the model being analysed.
	 * @param {number} scale - Millimetres per scene unit (utils/sourceUnits.js)
	 * @param {number} [perFileUnit] - Millimetres per unit of the file, for "units"; the
	 *   same as `scale` unless the loader rescaled the model
	 */
	const setModelScale = (scale, perFileUnit = scale) => {
		if (!(typeof scale === 'number' && isFinite(scale) && scale > 0)) {
			logger.warn('useModelStats', 'Invalid model scale, ignoring', { scale })
			return
		}
		modelScale.value = scale
		fileScale.value = Number.isFinite(perFileUnit) && perFileUnit > 0 ? perFileUnit : scale
	}

	/**
	 * Select a mesh for focused display; pass null to clear.
	 * @param {string|null} uuid - Mesh UUID or null
	 */
	const selectMesh = (uuid) => {
		selectedMeshUuid.value = uuid || null
	}

	/**
	 * Active unit config and its scaling factors, from scene units to the display unit:
	 * lengths by the factor, areas by its square and volumes by its cube.
	 */
	const unitConfig = computed(() => UNIT_SCALES[currentUnit.value] || UNIT_SCALES.units)
	const lengthScale = computed(() => displayLengthFactor(unitConfig.value, modelScale.value, fileScale.value))
	const areaScale = computed(() => lengthScale.value * lengthScale.value)
	const volumeScale = computed(() => lengthScale.value * lengthScale.value * lengthScale.value)

	const getAvailableUnits = () => {
		return Object.entries(UNIT_SCALES).map(([key, config]) => ({
			value: key,
			label: config.label,
			suffix: config.suffix,
		}))
	}

	/**
	 * Compute a plain-text report of current stats (all mesh dimensions, selected mesh
	 * if any, unit annotations). Used by the Copy Measurements button.
	 * @return {string} Report text
	 */
	const buildMeasurementReport = () => {
		const stats = modelStats.value
		if (!stats) return ''
		const u = unitConfig.value
		const L = lengthScale.value
		const A = areaScale.value
		const V = volumeScale.value
		const fmt = (n) => {
			if (!Number.isFinite(n)) return '—'
			if (n === 0) return '0'
			const abs = Math.abs(n)
			if (abs >= 1000 || abs < 0.01) return n.toExponential(3)
			// Three significant figures at least: 0.05 m is 0.0500, not 0.050
			return formatLength(n, 3)
		}
		const lines = []
		lines.push(`# Model measurements (${u.label})`)
		if (stats.format) lines.push(`Format: ${stats.format.toUpperCase()}`)
		lines.push('')
		lines.push(`Bounding box:  ${fmt(stats.boundingBox.x * L)} × ${fmt(stats.boundingBox.y * L)} × ${fmt(stats.boundingBox.z * L)} ${u.suffix}`)
		lines.push(`Surface area:  ${fmt(stats.surfaceArea * A)} ${u.suffix}²`)
		lines.push(`Mesh volume:   ${fmt(stats.meshVolume * V)} ${u.suffix}³`)
		lines.push(`BBox volume:   ${fmt(stats.volume * V)} ${u.suffix}³`)
		if (stats.allWatertight === false) {
			lines.push('Watertight:    no (mesh volume may be unreliable)')
		} else if (stats.allWatertight === true) {
			lines.push('Watertight:    yes')
		} else {
			lines.push('Watertight:    unknown')
		}
		if (stats.perMesh && stats.perMesh.length > 1) {
			lines.push('')
			lines.push('## Per mesh')
			for (const m of stats.perMesh) {
				const wt = m.watertight === true ? ' [watertight]' : m.watertight === false ? ' [open]' : ''
				lines.push(`- ${m.name}: area ${fmt(m.surfaceArea * A)} ${u.suffix}², volume ${fmt(m.volume * V)} ${u.suffix}³${wt}`)
			}
		}
		return lines.join('\n')
	}

	return {
		// State (readonly)
		modelStats: readonly(modelStats),
		showStats: readonly(showStats),
		currentUnit: readonly(currentUnit),
		unitChosen: readonly(unitChosen),
		modelScale: readonly(modelScale),
		selectedMeshUuid: readonly(selectedMeshUuid),

		// Computed
		unitConfig,
		lengthScale,
		areaScale,
		volumeScale,

		// Methods
		analyzeModel,
		getMaterials,
		getTextures,
		getGeometryStats,
		calculateVolume,
		formatBytes,
		toggleStatsPanel,
		clearStats,
		setUnit,
		suggestUnit,
		setModelScale,
		selectMesh,
		getAvailableUnits,
		buildMeasurementReport,
	}
}
