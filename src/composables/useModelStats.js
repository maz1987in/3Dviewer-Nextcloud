/**
 * Model statistics composable
 * Analyzes and provides detailed statistics about 3D models
 */

import { ref, computed, readonly } from 'vue'
import * as THREE from 'three'
import { logger } from '../utils/logger.js'
import { getBoundingInfo } from '../utils/three-utils.js'
import { VIEWER_CONFIG } from '../config/viewer-config.js'

// Skip watertightness detection above this triangle count per mesh (edge map is O(n))
const WATERTIGHT_MAX_TRIANGLES = 500000

// Unit scales from measurement config — 1 three.js unit = 1 mm by convention
const UNIT_SCALES = VIEWER_CONFIG.measurement.unitScales
const DEFAULT_UNIT = VIEWER_CONFIG.measurement.defaultUnit

export function useModelStats() {
	// State
	const modelStats = ref(null)
	const showStats = ref(false)
	const currentUnit = ref(DEFAULT_UNIT)
	const selectedMeshUuid = ref(null)

	/**
	 * Get unique materials from a 3D object
	 * @param {THREE.Object3D} object3D - Object to analyze
	 * @return {Array} Array of unique materials
	 */
	const getMaterials = (object3D) => {
		const materials = new Map()

		object3D.traverse((child) => {
			if (child.isMesh && child.material) {
				const mats = Array.isArray(child.material) ? child.material : [child.material]
				mats.forEach((mat) => {
					if (!materials.has(mat.uuid)) {
						materials.set(mat.uuid, {
							uuid: mat.uuid,
							name: mat.name || 'Unnamed',
							type: mat.type || 'Unknown',
						})
					}
				})
			}
		})

		return Array.from(materials.values())
	}

	/**
	 * Get textures and calculate memory usage
	 * @param {THREE.Object3D} object3D - Object to analyze
	 * @return {object} Texture information
	 */
	const getTextures = (object3D) => {
		const textures = new Map()
		let totalMemory = 0
		let pendingCount = 0
		let missingCount = 0

		object3D.traverse((child) => {
			if (child.material) {
				const mats = Array.isArray(child.material) ? child.material : [child.material]
				mats.forEach((mat) => {
					// Check all material properties for textures
					Object.keys(mat).forEach((key) => {
						const value = mat[key]
						if (value && value.isTexture) {
							if (!textures.has(value.uuid)) {
								// Read real image dimensions. Loaders sometimes attach a
								// Texture with no image, or with an Image element that
								// failed to load, when a referenced file is missing (e.g.
								// FBX pointing to texture.png that isn't shipped alongside
								// the .fbx). Distinguish that from an image that is
								// genuinely mid-decode so the UI can say "missing" vs
								// "loading…" instead of reporting a fake 0 MB.
								const img = value.image
								const rawW = img?.width ?? 0
								const rawH = img?.height ?? 0
								const imageLoaded = rawW >= 4 && rawH >= 4
								// Multiple ways a reference "didn't resolve":
								// - no image attached at all
								// - HTMLImageElement without any src assigned
								// - HTMLImageElement that finished loading with naturalWidth 0 (broken image)
								// - 1×1 placeholder (our FBX loader substitutes a 1px base64
								//   PNG when a referenced texture file is missing). We can't
								//   distinguish this from a legit 1-pixel texture, but those
								//   essentially never ship in real models.
								const isHtmlImg = typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement
								const isPlaceholder = (rawW === 1 && rawH === 1)
									|| (img?.naturalWidth === 1 && img?.naturalHeight === 1)
								const isMissing = !img
									|| (isHtmlImg && !img.src)
									|| (isHtmlImg && img.complete && img.naturalWidth === 0)
									|| isPlaceholder
								const memory = imageLoaded ? rawW * rawH * 4 : 0 // RGBA bytes

								textures.set(value.uuid, {
									uuid: value.uuid,
									name: value.name || key,
									width: rawW || null,
									height: rawH || null,
									memory,
									pending: !imageLoaded && !isMissing,
									missing: isMissing,
								})

								if (imageLoaded) totalMemory += memory
								else if (isMissing) missingCount++
								else pendingCount++
							}
						}
					})
				})
			}
		})

		return {
			textures: Array.from(textures.values()),
			count: textures.size,
			pendingCount,
			missingCount,
			memoryBytes: totalMemory,
			memoryMB: totalMemory / (1024 * 1024),
		}
	}

	/**
	 * Get geometry statistics
	 * @param {THREE.Object3D} object3D - Object to analyze
	 * @return {object} Geometry statistics
	 */
	const getGeometryStats = (object3D) => {
		let vertices = 0
		let faces = 0
		let meshes = 0

		object3D.traverse((child) => {
			if (child.isMesh) {
				meshes++
				if (child.geometry) {
					// Count vertices
					if (child.geometry.attributes.position) {
						vertices += child.geometry.attributes.position.count
					}

					// Count faces
					if (child.geometry.index) {
						faces += child.geometry.index.count / 3
					} else if (child.geometry.attributes.position) {
						faces += child.geometry.attributes.position.count / 3
					}
				}
			} else if (child.isLine) {
				// Count G-code or other line segments
				if (child.geometry && child.geometry.attributes.position) {
					vertices += child.geometry.attributes.position.count
				}
			}
		})

		return {
			vertices,
			faces: Math.floor(faces),
			meshes,
		}
	}

	/**
	 * Calculate volume of bounding box
	 * @param {THREE.Vector3} size - Bounding box size
	 * @return {number} Volume in cubic units
	 */
	const calculateVolume = (size) => {
		return size.x * size.y * size.z
	}

	/**
	 * Compute surface area, volume, and watertightness for a single mesh.
	 * Volume uses the signed tetrahedra method (divergence theorem);
	 * watertightness uses edge-pair counting on indexed geometry.
	 * @param {THREE.Mesh} mesh - Mesh to analyze
	 * @return {object} { surfaceArea, volume, watertight, boundaryEdges, nonManifoldEdges }
	 */
	const computeMeshStats = (mesh) => {
		const result = {
			surfaceArea: 0,
			volume: 0,
			watertight: null, // null = unknown (non-indexed or too large)
			boundaryEdges: 0,
			nonManifoldEdges: 0,
		}

		const geo = mesh.geometry
		const pos = geo?.attributes?.position
		if (!pos) return result

		mesh.updateWorldMatrix(true, false)
		const matrix = mesh.matrixWorld

		const index = geo.index
		const triCount = index ? index.count / 3 : pos.count / 3

		const vA = new THREE.Vector3()
		const vB = new THREE.Vector3()
		const vC = new THREE.Vector3()
		const ab = new THREE.Vector3()
		const ac = new THREE.Vector3()
		const cross = new THREE.Vector3()

		let area = 0
		let signedVolume = 0

		// Edge map for watertightness — only meaningful for indexed geometry
		// and only built when mesh is below the size cap.
		const canCheckWatertight = !!index && triCount <= WATERTIGHT_MAX_TRIANGLES
		const edgeMap = canCheckWatertight ? new Map() : null
		const addEdge = (u, v) => {
			const key = u < v ? `${u}|${v}` : `${v}|${u}`
			edgeMap.set(key, (edgeMap.get(key) || 0) + 1)
		}

		for (let i = 0; i < triCount; i++) {
			let iA, iB, iC
			if (index) {
				iA = index.getX(i * 3)
				iB = index.getX(i * 3 + 1)
				iC = index.getX(i * 3 + 2)
			} else {
				iA = i * 3
				iB = i * 3 + 1
				iC = i * 3 + 2
			}

			vA.fromBufferAttribute(pos, iA)
			vB.fromBufferAttribute(pos, iB)
			vC.fromBufferAttribute(pos, iC)
			vA.applyMatrix4(matrix)
			vB.applyMatrix4(matrix)
			vC.applyMatrix4(matrix)

			ab.subVectors(vB, vA)
			ac.subVectors(vC, vA)
			area += ab.cross(ac).length() * 0.5

			cross.crossVectors(vB, vC)
			signedVolume += vA.dot(cross) / 6

			if (edgeMap) {
				addEdge(iA, iB)
				addEdge(iB, iC)
				addEdge(iC, iA)
			}
		}

		result.surfaceArea = area
		result.volume = Math.abs(signedVolume)

		if (edgeMap) {
			let boundary = 0
			let nonManifold = 0
			for (const count of edgeMap.values()) {
				if (count === 1) boundary++
				else if (count > 2) nonManifold++
			}
			result.boundaryEdges = boundary
			result.nonManifoldEdges = nonManifold
			result.watertight = boundary === 0 && nonManifold === 0
		}

		return result
	}

	/**
	 * Compute per-mesh statistics for every mesh in the scene graph.
	 * @param {THREE.Object3D} object3D - Root object to analyze
	 * @return {Array} Per-mesh stats with vertices, faces, surfaceArea, volume, watertight
	 */
	const computePerMeshStats = (object3D) => {
		const perMesh = []

		object3D.traverse((child) => {
			if (!child.isMesh || !child.geometry) return
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
	 * Analyze a 3D model and calculate all statistics
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

			// Create statistics object
			const stats = {
				// Geometry
				vertices: geometryStats.vertices,
				faces: geometryStats.faces,
				meshes: geometryStats.meshes,

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
	 * Set the display unit (mm / cm / m / in / ft / units).
	 * @param {string} unit - Unit key from VIEWER_CONFIG.measurement.unitScales
	 */
	const setUnit = (unit) => {
		if (!UNIT_SCALES[unit]) {
			logger.warn('useModelStats', 'Unknown unit, ignoring', { unit })
			return
		}
		currentUnit.value = unit
	}

	/**
	 * Select a mesh for focused display; pass null to clear.
	 * @param {string|null} uuid - Mesh UUID or null
	 */
	const selectMesh = (uuid) => {
		selectedMeshUuid.value = uuid || null
	}

	/**
	 * Active unit config and its scaling factors.
	 * 1 three.js unit = 1 mm (matches useMeasurement convention).
	 */
	const unitConfig = computed(() => UNIT_SCALES[currentUnit.value] || UNIT_SCALES.units)
	const lengthScale = computed(() => 1 / unitConfig.value.factor) // three.js → target unit
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
			return n.toFixed(3)
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
		selectMesh,
		getAvailableUnits,
		buildMeasurementReport,
	}
}
