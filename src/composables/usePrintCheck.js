/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Print check: whether the open model fits a printer, where it overhangs, roughly how much
 * filament it takes, the slicer's own numbers for a G-code file, and on request how thick
 * its walls are.
 *
 * Nothing here changes the model. The build box, the bed, the overhang shading and the
 * thickness colours are objects in the scene, beside the model (printCheck/surfaceOverlay.js),
 * so exports, thumbnails and render modes never see them. Sizes are measured the way an
 * export writes the model: parts together, placed as the user placed it. Everything is let
 * go of when Print check closes or the model changes, and a worker still running is ended.
 *
 * Nothing that goes through every vertex or triangle runs on the page's thread: the card
 * opens at once, and the fit, overhangs and filament fill in as the print-check worker
 * answers (printCheckClient.openSurfaceSession). The shading's shaders are compiled before
 * they are first drawn (surfaceOverlay.compileQuietly), so no step stops the page.
 */

import { ref, shallowRef, isRef, toRaw, watch } from 'vue'
import * as THREE from 'three'
import { bedAxes, fitReport } from '../printCheck/buildVolume.js'
import { createOverhangMaterial, createFlatMaterial, setOverhangThreshold } from '../printCheck/overhang.js'
import { createOverlaySet, compileQuietly } from '../printCheck/surfaceOverlay.js'
import { modelClosed } from '../printCheck/closedMesh.js'
import { estimateFilament } from '../printCheck/filament.js'
import { findSlicerSummary } from '../printCheck/slicerSummary.js'
import { openSurfaceSession, measureThickness } from '../printCheck/printCheckClient.js'
import { measuredObjects, surfacePart } from '../printCheck/surfaceMeasures.js'
import { loadPrintCheckSettings, savePrintCheckSettings, flushPrintCheckSettings, sanitizePrintCheckSettings } from '../printCheck/printCheckSettings.js'
import { PRINTERS, MATERIALS, NEAR_THIN_FACTOR, BED_EPSILON_MM } from '../printCheck/printers.js'
import { withPartsTogether } from '../utils/viewerTransforms.js'
import { logger } from '../utils/logger.js'

const FIT_COLOUR = 0x9e9e9e
const OVER_COLOUR = 0xe53935
const RECOMPUTE_DELAY_MS = 200

// The up axis chosen for each file, for this session only
const upChoices = new Map()

/**
 * @param {unknown} source - A ref, a getter or a value
 * @return {unknown} Its current value; a three.js object as itself, never a Vue proxy, so
 *   identity checks against meshes from the scene hold
 */
const read = (source) => toRaw(isRef(source) ? source.value : (typeof source === 'function' ? source() : source))

/**
 * The parts of a model Print check measures: its meshes, overlays left out.
 *
 * @param {?THREE.Object3D} root - The model
 * @return {THREE.Mesh[]} The meshes, in a fixed order
 */
function partsOf(root) {
	const meshes = []
	root?.traverse((child) => {
		if (child.isMesh && child.geometry?.attributes?.position && !child.userData?.viewerOverlay) {
			meshes.push(child)
		}
	})
	return meshes
}

/**
 * A mesh's positions as a plain array, in the world when `matrix` is given.
 *
 * @param {THREE.Mesh} mesh - The mesh
 * @param {?THREE.Matrix4} [matrix] - Transform to apply
 * @return {Float32Array} xyz per vertex
 */
function positionsOf(mesh, matrix = null) {
	const attribute = mesh.geometry.attributes.position
	const out = new Float32Array(attribute.count * 3)
	const vertex = new THREE.Vector3()
	for (let i = 0; i < attribute.count; i++) {
		vertex.fromBufferAttribute(attribute, i)
		if (matrix) {
			vertex.applyMatrix4(matrix)
		}
		out[i * 3] = vertex.x
		out[i * 3 + 1] = vertex.y
		out[i * 3 + 2] = vertex.z
	}
	return out
}

/**
 * Each triangle's area in the world.
 *
 * @param {THREE.Mesh} mesh - The mesh, world matrix up to date
 * @return {Float64Array} One area per triangle
 */
function triangleAreas(mesh) {
	const position = mesh.geometry.attributes.position
	const index = mesh.geometry.index
	const count = (index ? index.count : position.count) / 3
	const areas = new Float64Array(count)
	const a = new THREE.Vector3()
	const b = new THREE.Vector3()
	const c = new THREE.Vector3()
	for (let t = 0; t < count; t++) {
		a.fromBufferAttribute(position, index ? index.getX(t * 3) : t * 3).applyMatrix4(mesh.matrixWorld)
		b.fromBufferAttribute(position, index ? index.getX(t * 3 + 1) : t * 3 + 1).applyMatrix4(mesh.matrixWorld)
		c.fromBufferAttribute(position, index ? index.getX(t * 3 + 2) : t * 3 + 2).applyMatrix4(mesh.matrixWorld)
		const area = b.sub(a).cross(c.sub(a)).length() / 2
		areas[t] = Number.isFinite(area) ? area : 0
	}
	return areas
}

// Stands for "no wall met" in the colour data: the GPU interpolates between vertices, and
// Infinity there turns into NaN along edges, which the shader would draw as near-thin
const NO_WALL = 1e30

/**
 * @param {?Float32Array} perVertex - Thickness per vertex, Infinity where no wall was met
 * @param {number} count - The part's vertex count, for a part that wasn't measured
 * @return {Float32Array} The same, finite throughout
 */
function colourData(perVertex, count) {
	return perVertex ? perVertex.map((value) => (Number.isFinite(value) ? value : NO_WALL)) : new Float32Array(count).fill(NO_WALL)
}

/**
 * The material that colours thin walls: red under the minimum, yellow close to it, and
 * nothing elsewhere. Reads the overlay's per-vertex `thickness`, in scene units.
 *
 * @param {number} minimum - The minimum, in scene units
 * @param {?THREE.Plane[]} clippingPlanes - The model's open cut, if any
 * @return {THREE.ShaderMaterial} The material
 */
function createThicknessMaterial(minimum, clippingPlanes = null) {
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uMin: { value: minimum },
			uNear: { value: minimum * NEAR_THIN_FACTOR },
		},
		vertexShader: `
			#include <common>
			#include <clipping_planes_pars_vertex>
			attribute float thickness;
			varying float vThickness;
			void main() {
				vThickness = thickness;
				vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
				gl_Position = projectionMatrix * mvPosition;
				#include <clipping_planes_vertex>
			}
		`,
		fragmentShader: `
			#include <common>
			#include <clipping_planes_pars_fragment>
			uniform float uMin;
			uniform float uNear;
			varying float vThickness;
			void main() {
				#include <clipping_planes_fragment>
				if (vThickness >= uNear) discard;
				gl_FragColor = vThickness < uMin ? vec4(0.898, 0.224, 0.208, 0.75) : vec4(0.984, 0.753, 0.176, 0.7);
			}
		`,
		transparent: true,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		polygonOffsetUnits: -2,
		// The cross-section cuts with the renderer's planes; a ShaderMaterial only gets them with this
		clipping: true,
	})
	if (clippingPlanes?.length) {
		material.clippingPlanes = clippingPlanes
	}
	return material
}

/**
 * @param {object} viewer - What Print check works on; each a ref, a getter or a value
 * @param {unknown} viewer.scene - The scene
 * @param {unknown} viewer.modelRoot - The open model
 * @param {unknown} viewer.camera - The camera
 * @param {unknown} viewer.controls - The orbit controls
 * @param {unknown} viewer.mmPerUnit - Millimetres per scene unit
 * @param {unknown} viewer.filename - The open file's name
 * @param {unknown} viewer.fileId - The open file's id
 * @param {unknown} [viewer.renderer] - The renderer, to compile the shading's shaders
 *   before it is first drawn
 * @return {object} Print check's state and methods
 */
export function usePrintCheck({ scene, modelRoot, camera, controls, mmPerUnit, filename, fileId, renderer = null }) {
	const active = ref(false)
	const settings = ref(null)
	const up = ref('y')
	const kind = ref('mesh')
	const fit = ref(null)
	const overhang = ref(null)
	const closed = ref(null)
	const openParts = ref(0)
	const estimate = ref(null)
	const slicerSummary = shallowRef(null)
	// The worker could not measure the model: the fit and overhangs will not come
	const measureFailed = ref(false)
	const thickness = ref({ state: 'idle', progress: 0, share: 0, sampled: false, warnOpen: false })

	// What open() made, all of it let go of by teardown()
	let helpers = []
	let buildBox = null
	let buildBed = null
	let overhangSet = null
	// The worker holding the model, what was measured on it last, and which request that is
	let session = null
	let sessionObjects = []
	let measured = null
	let measureRequest = 0
	// The build volume and shading are drawn once their shaders are compiled
	let shadersReady = false
	let thicknessSet = null
	let thicknessResults = null
	let thicknessParts = []
	let thicknessController = null
	let recomputeTimer = null
	let savedUp = null
	// The camera whose up Print check turned, and `savedUp` is that camera's own
	let upCamera = null
	// Bumped by every open and teardown; a worker result for an earlier one is dropped
	let generation = 0
	// The model's world matrix when the fit was last measured
	const lastPlacement = new THREE.Matrix4()

	const fileKey = () => `${read(fileId) ?? ''}:${read(filename) ?? ''}`
	const volume = () => {
		const chosen = settings.value
		if (chosen.printerId === 'custom') {
			return chosen.custom
		}
		return PRINTERS.find((printer) => printer.id === chosen.printerId) ?? PRINTERS[0]
	}

	const disposeHelpers = () => {
		helpers.forEach((object) => {
			object.removeFromParent()
			object.geometry?.dispose()
			object.material?.dispose()
		})
		helpers = []
	}

	const updateEstimate = () => {
		if (closed.value !== 'closed' || !measured) {
			estimate.value = null
			return
		}
		// As filament.modelVolumeAndArea gives them, from the worker's measurement in scene units
		const unit = read(mmPerUnit) || 1
		const volumeMm3 = measured.volume * unit ** 3
		const areaMm2 = measured.area * unit ** 2
		const density = MATERIALS.find((material) => material.id === settings.value.material)?.density ?? MATERIALS[0].density
		estimate.value = estimateFilament({ volumeMm3, areaMm2, infillPercent: settings.value.infill, density })
	}

	/**
	 * The build box and the bed: made once, hidden until there is something to show, and
	 * moved after that, so measuring again never makes a shader to compile.
	 */
	const makeBuildVolume = () => {
		const target = read(scene)
		if (!target) {
			return
		}
		// Drawn with the overhang shading's own shader (createFlatMaterial): one to compile, not three
		buildBox = new THREE.LineSegments(
			new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => new THREE.Vector3())),
			createFlatMaterial({ color: FIT_COLOUR, opacity: 1 }),
		)
		// Both faces of the plate as triangles of their own: a material drawing both sides
		// would be a shader of its own
		buildBed = new THREE.Mesh(
			new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3())),
			createFlatMaterial({ color: FIT_COLOUR, opacity: 0.15 }),
		)
		for (const object of [buildBox, buildBed]) {
			object.userData.viewerOverlay = true
			object.name = 'Print check build volume'
			object.visible = false
			target.add(object)
			helpers.push(object)
		}
	}

	/**
	 * Show the build volume and the shading once both their shaders and a measurement are in.
	 */
	const reveal = () => {
		if (!shadersReady || !measured) {
			return
		}
		if (buildBox && buildBed) {
			buildBox.visible = true
			buildBed.visible = true
		}
		overhangSet?.hold(false)
	}

	/**
	 * Put the build box and the bed around the model's footprint, resting at its lowest point.
	 * @param {object} extent - As from modelExtentMm
	 * @param {object} axes - From bedAxes
	 */
	const drawBuildVolume = (extent, axes) => {
		if (!buildBox || !buildBed) {
			return
		}
		const unit = read(mmPerUnit) || 1
		const { width, depth, height } = volume()
		const centreW = (extent.min.x + extent.max.x) / 2
		const centreD = (extent.min.z + extent.max.z) / 2
		const bed = extent.min.y
		const w = width / unit / 2
		const d = depth / unit / 2
		const h = height / unit
		const at = (sw, su, sd) => new THREE.Vector3()
			.addScaledVector(axes.width, centreW + sw * w)
			.addScaledVector(axes.up, bed + su * h)
			.addScaledVector(axes.depth, centreD + sd * d)
		const corners = [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]].map(([sw, su, sd]) => at(sw, su, sd))
		const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]

		buildBox.geometry.setFromPoints(edges.flatMap(([a, b]) => [corners[a], corners[b]]))
		const [c0, c1, c2, c3] = corners
		buildBed.geometry.setFromPoints([c0, c1, c2, c0, c2, c3, c0, c2, c1, c0, c3, c2])
		for (const object of [buildBox, buildBed]) {
			// Culling goes by the bounding sphere, which moving the points leaves where it was
			object.geometry.computeBoundingSphere()
		}
		buildBox.material.uniforms.uColor.value.setHex(fit.value?.fits === false ? OVER_COLOUR : FIT_COLOUR)
	}

	/**
	 * The last measured extent in millimetres, as `modelExtentMm` gives it.
	 * @return {object} Sizes in mm, and `min` and `max` along the bed's axes in scene units
	 */
	const extentMm = () => {
		const unit = read(mmPerUnit) || 1
		const extent = measured.extent
		if (!extent) {
			return { width: 0, depth: 0, height: 0, min: new THREE.Vector3(), max: new THREE.Vector3() }
		}
		const min = new THREE.Vector3().fromArray(extent.min)
		const max = new THREE.Vector3().fromArray(extent.max)
		return { width: (max.x - min.x) * unit, depth: (max.z - min.z) * unit, height: (max.y - min.y) * unit, min, max }
	}

	/**
	 * Hold the last measured size against the chosen printer, and redraw the box.
	 */
	const showFit = () => {
		if (!active.value || !measured || kind.value === 'gcode') {
			return
		}
		const extent = extentMm()
		fit.value = { size: { width: extent.width, depth: extent.depth, height: extent.height }, ...fitReport(extent, volume()) }
		drawBuildVolume(extent, bedAxes(measured.up))
	}

	/**
	 * Take in what the worker measured.
	 * @param {object} result - From surfaceMeasures.measureSurface
	 * @param {object} request - What was asked: `up`, `bedEpsilon`
	 */
	const applyMeasurement = (result, request) => {
		measured = { ...result, up: request.up }
		measureFailed.value = false
		showFit()
		if (kind.value === 'mesh') {
			const { overhangArea, totalArea } = result
			overhang.value = { share: totalArea > 0 ? overhangArea / totalArea : 0 }
			const axes = bedAxes(request.up)
			const bedHeight = result.extent ? result.extent.min[1] : 0
			overhangSet?.overlays.forEach(({ object }) => {
				object.material.uniforms.uUp.value.copy(axes.up)
				object.material.uniforms.uBedHeight.value = bedHeight
				object.material.uniforms.uBedEpsilon.value = request.bedEpsilon
				setOverhangThreshold(object.material, settings.value.overhangAngle)
			})
			updateEstimate()
		}
		reveal()
	}

	/**
	 * Measure the fit and the overhangs again, in the worker; the card keeps what it shows
	 * until the answer comes.
	 */
	const recompute = () => {
		const root = read(modelRoot)
		if (!active.value || !root || !session || kind.value === 'gcode') {
			return
		}
		const axes = bedAxes(up.value)
		const unit = read(mmPerUnit) || 1
		const matrices = withPartsTogether(root, () => {
			root.updateMatrixWorld(true)
			return sessionObjects.map((object) => Float64Array.from(object.matrixWorld.elements))
		})
		lastPlacement.copy(root.matrixWorld)
		const request = { up: up.value, bedEpsilon: BED_EPSILON_MM / unit }
		const asked = ++measureRequest
		const opened = generation
		session.measure({
			matrices,
			axes: { up: axes.up.toArray(), width: axes.width.toArray(), depth: axes.depth.toArray() },
			thresholdDeg: settings.value.overhangAngle,
			bedEpsilon: request.bedEpsilon,
		}).then((result) => {
			// A later request's answer is on its way, and is the one that counts
			if (opened === generation && asked === measureRequest) {
				applyMeasurement(result, request)
			}
		}, (error) => {
			if (opened === generation && asked === measureRequest && error?.name !== 'AbortError') {
				logger.warn('usePrintCheck', 'Could not measure the model', error)
				measureFailed.value = true
			}
		})
	}

	const recomputeSoon = () => {
		clearTimeout(recomputeTimer)
		recomputeTimer = setTimeout(recompute, RECOMPUTE_DELAY_MS)
	}

	/**
	 * Point the camera's up, and the orbit with it, along `axis`.
	 * @param {THREE.Vector3} axis - The new up
	 */
	const orbitAbout = (axis) => {
		const cam = read(camera)
		const orbit = read(controls)
		if (!cam) {
			return
		}
		cam.up.copy(axis)
		// OrbitControls works out its orbit from camera.up once, when it is made
		if (orbit?._quat && orbit?._quatInverse) {
			orbit._quat.setFromUnitVectors(cam.up, new THREE.Vector3(0, 1, 0))
			orbit._quatInverse.copy(orbit._quat).invert()
		}
		cam.lookAt(orbit?.target ?? new THREE.Vector3())
		orbit?.update?.()
	}

	/**
	 * Toggling the projection swaps in the viewer's other camera, which still has its own
	 * up: the one that was turned goes back, and the new one is turned instead.
	 */
	const followCamera = () => {
		const cam = read(camera)
		if (!savedUp || !upCamera || !cam || cam === upCamera) {
			return
		}
		upCamera.up.copy(savedUp)
		savedUp = cam.up.clone()
		upCamera = cam
		if (up.value === 'z') {
			orbitAbout(new THREE.Vector3(0, 0, 1))
		}
	}

	const teardown = () => {
		followCamera()
		generation++
		thicknessController?.abort()
		thicknessController = null
		session?.close()
		session = null
		sessionObjects = []
		measured = null
		shadersReady = false
		clearTimeout(recomputeTimer)
		disposeHelpers()
		buildBox = null
		buildBed = null
		overhangSet?.dispose()
		thicknessSet?.dispose()
		overhangSet = null
		thicknessSet = null
		thicknessResults = null
		thicknessParts = []
		if (savedUp) {
			orbitAbout(savedUp)
			savedUp = null
		}
		upCamera = null
		active.value = false
		fit.value = null
		overhang.value = null
		closed.value = null
		openParts.value = 0
		estimate.value = null
		slicerSummary.value = null
		measureFailed.value = false
		thickness.value = { state: 'idle', progress: 0, share: 0, sampled: false, warnOpen: false }
	}

	/**
	 * Open Print check on the model now open.
	 */
	const open = () => {
		const root = read(modelRoot)
		const target = read(scene)
		if (!root || !target || active.value) {
			return
		}
		generation++
		const opened = generation
		settings.value = loadPrintCheckSettings()
		up.value = upChoices.get(fileKey()) ?? 'y'
		active.value = true

		const summary = findSlicerSummary(root)
		const name = String(read(filename) ?? '').toLowerCase()
		const meshes = partsOf(root)
		kind.value = summary || name.endsWith('.gcode') || name.endsWith('.gco') ? 'gcode' : (meshes.length ? 'mesh' : 'points')
		if (kind.value === 'gcode') {
			slicerSummary.value = summary ?? { slicer: null, printSeconds: null, filamentMm: null, filamentGrams: null }
			return
		}

		const cam = read(camera)
		savedUp = cam ? cam.up.clone() : null
		upCamera = cam ?? null
		if (up.value === 'z') {
			orbitAbout(new THREE.Vector3(0, 0, 1))
		}

		makeBuildVolume()
		if (kind.value === 'mesh') {
			// Held out of sight until it has a bed to measure from and its shader is compiled
			overhangSet = createOverlaySet(target, root, (mesh) => {
				const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
				return createOverhangMaterial({
					up: bedAxes(up.value).up,
					thresholdDeg: settings.value.overhangAngle,
					bedHeight: 0,
					bedEpsilon: 0,
					clippingPlanes: material?.clippingPlanes ?? null,
				})
			}, undefined, { held: true })
		}
		compileQuietly(read(renderer), read(camera), target, [...helpers, ...(overhangSet?.overlays.map(({ object }) => object) ?? [])]).then(() => {
			if (opened === generation) {
				shadersReady = true
				reveal()
			}
		})

		// The worker gets a copy of the model once, and measures it for every request after
		sessionObjects = measuredObjects(root)
		session = openSurfaceSession(sessionObjects.map(surfacePart))
		recompute()

		if (kind.value === 'mesh') {
			closed.value = 'checking'
			session.checkClosed()
				.then((reports) => {
					if (opened !== generation) {
						return
					}
					const result = modelClosed(reports)
					closed.value = result.closed ? 'closed' : 'open'
					openParts.value = result.openParts
					updateEstimate()
				})
				.catch((error) => {
					if (opened === generation && error?.name !== 'AbortError') {
						logger.warn('usePrintCheck', 'Could not check whether the model is closed', error)
						closed.value = null
					}
				})
		}
	}

	const close = () => {
		if (!active.value) {
			return
		}
		teardown()
		flushPrintCheckSettings()
	}

	const updateThinShare = () => {
		if (!thicknessResults) {
			return
		}
		const unit = read(mmPerUnit) || 1
		const minimum = settings.value.minThickness
		let thin = 0
		let total = 0
		thicknessResults.forEach((result, part) => {
			const areas = triangleAreas(thicknessParts[part])
			areas.forEach((area, t) => {
				total += area
				if (result.triangleThickness[t] * unit < minimum) {
					thin += area
				}
			})
		})
		thickness.value = { ...thickness.value, share: total > 0 ? thin / total : 0 }
	}

	/**
	 * Change the settings, keep them, and redo what depends on them.
	 * @param {object} change - The fields that change
	 */
	const change = (change) => {
		if (!settings.value) {
			return
		}
		// A typed value is held to the same range as a stored one
		settings.value = sanitizePrintCheckSettings({ ...settings.value, ...change })
		savePrintCheckSettings(settings.value)
	}

	// The size is measured already: only what it is held against changes
	const setPrinter = (id) => {
		change({ printerId: id })
		showFit()
	}
	const setCustom = (size) => {
		change({ custom: { ...settings.value.custom, ...size } })
		showFit()
	}
	const setOverhangAngle = (degrees) => {
		change({ overhangAngle: degrees })
		overhangSet?.overlays.forEach(({ object }) => setOverhangThreshold(object.material, degrees))
		recomputeSoon()
	}
	const setInfill = (percent) => {
		change({ infill: percent })
		updateEstimate()
	}
	const setMaterial = (id) => {
		change({ material: id })
		updateEstimate()
	}
	// The thickness overlay's limits, in scene units, from the minimum in millimetres
	const applyThicknessLimits = () => {
		const mm = settings.value.minThickness
		const unit = read(mmPerUnit) || 1
		thicknessSet?.overlays.forEach(({ object }) => {
			object.material.uniforms.uMin.value = mm / unit
			object.material.uniforms.uNear.value = (mm * NEAR_THIN_FACTOR) / unit
		})
		updateThinShare()
	}
	const setMinThickness = (mm) => {
		change({ minThickness: mm })
		applyThicknessLimits()
	}

	/**
	 * The file's unit changed (the user chose one, or the saved one arrived): measure the
	 * fit, the filament and the thickness limits again in the new millimetres.
	 */
	const unitChanged = () => {
		if (!active.value) {
			return
		}
		// Sizes and filament scale at once; what counts as resting on the bed is measured again
		showFit()
		updateEstimate()
		applyThicknessLimits()
		recompute()
	}

	const setUp = (axis) => {
		if (!active.value || (axis !== 'y' && axis !== 'z')) {
			return
		}
		followCamera()
		up.value = axis
		upChoices.set(fileKey(), axis)
		orbitAbout(axis === 'z' ? new THREE.Vector3(0, 0, 1) : (savedUp ?? new THREE.Vector3(0, 1, 0)))
		// What was measured along the other axis is not shown meanwhile
		if (measured && measured.up !== axis) {
			fit.value = null
			overhang.value = null
		}
		recompute()
	}

	/**
	 * Measure the walls in a worker and colour the thin ones.
	 * @return {Promise<void>} Settled when done, cancelled or failed
	 */
	const runThickness = async () => {
		const root = read(modelRoot)
		if (!active.value || kind.value !== 'mesh' || !root || thickness.value.state === 'running') {
			return
		}
		const started = generation
		thicknessSet?.dispose()
		thicknessSet = null
		thicknessController = new AbortController()
		thickness.value = { state: 'running', progress: 0, share: 0, sampled: false, warnOpen: false }
		const meshes = partsOf(root)
		const parts = withPartsTogether(root, () => {
			root.updateMatrixWorld(true)
			// In the world, so a scaled model's walls are measured at the size it is shown
			return meshes.map((mesh) => ({ positions: positionsOf(mesh, mesh.matrixWorld), index: mesh.geometry.index?.array ?? null }))
		})
		try {
			const results = await measureThickness(parts, {
				signal: thicknessController.signal,
				onProgress: (done, total) => {
					if (started === generation) {
						thickness.value = { ...thickness.value, progress: total > 0 ? done / total : 0 }
					}
				},
			})
			if (started !== generation) {
				return
			}
			thicknessResults = results
			thicknessParts = meshes
			const unit = read(mmPerUnit) || 1
			const minimum = settings.value.minThickness / unit
			const byMesh = new Map(meshes.map((mesh, i) => [mesh, results[i]]))
			const colours = createOverlaySet(read(scene), root,
				(mesh) => createThicknessMaterial(minimum, (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.clippingPlanes ?? null),
				(mesh) => ({ thickness: new THREE.BufferAttribute(colourData(byMesh.get(mesh)?.thickness, mesh.geometry.attributes.position.count), 1) }),
				{ held: true })
			thicknessSet = colours
			// Shown once its shader is compiled, as the overhang shading is
			compileQuietly(read(renderer), read(camera), read(scene), colours.overlays.map(({ object }) => object)).then(() => {
				if (thicknessSet === colours) {
					colours.hold(false)
				}
			})
			thickness.value = {
				state: 'done',
				progress: 1,
				share: 0,
				sampled: results.some((result) => result.sampled),
				warnOpen: closed.value === 'open',
			}
			updateThinShare()
		} catch (error) {
			if (started !== generation) {
				return
			}
			if (error?.name === 'AbortError') {
				thickness.value = { ...thickness.value, state: 'cancelled' }
			} else {
				logger.warn('usePrintCheck', 'Could not measure the wall thickness', error)
				thickness.value = { ...thickness.value, state: 'error' }
			}
		} finally {
			if (started === generation) {
				thicknessController = null
			}
		}
	}

	const cancelThickness = () => thicknessController?.abort()

	/**
	 * The wall thickness where the pointer is.
	 * @param {?{object: THREE.Object3D, faceIndex: number}} hit - A raycast hit on the model
	 * @return {?number} Millimetres, or null when not measured there
	 */
	const thicknessAt = (hit) => {
		if (!thicknessResults || !hit || hit.faceIndex == null) {
			return null
		}
		const part = thicknessParts.indexOf(hit.object)
		const value = part >= 0 ? thicknessResults[part].triangleThickness[hit.faceIndex] : undefined
		return Number.isFinite(value) ? value * (read(mmPerUnit) || 1) : null
	}

	/**
	 * Called every frame: overlays follow their parts, and a model that moved (the
	 * transform gizmo, or anything else) is measured again once it settles.
	 */
	const onFrame = () => {
		if (!active.value) {
			return
		}
		followCamera()
		overhangSet?.sync()
		thicknessSet?.sync()
		const root = read(modelRoot)
		if (root && !root.matrixWorld.equals(lastPlacement)) {
			lastPlacement.copy(root.matrixWorld)
			recomputeSoon()
		}
	}

	// A different model, or none: everything made for the last one goes
	const stopWatching = watch(() => read(modelRoot), (next, previous) => {
		if (next !== previous && active.value) {
			teardown()
		}
	})

	const dispose = () => {
		const wasActive = active.value
		teardown()
		stopWatching()
		// The viewer is going: a change still waiting for its debounce is sent now
		if (wasActive) {
			flushPrintCheckSettings()
		}
	}

	return {
		active,
		settings,
		up,
		kind,
		fit,
		overhang,
		closed,
		openParts,
		estimate,
		slicerSummary,
		measureFailed,
		thickness,
		open,
		close,
		toggle: () => (active.value ? close() : open()),
		setPrinter,
		setCustom,
		setUp,
		setOverhangAngle,
		setInfill,
		setMaterial,
		setMinThickness,
		runThickness,
		cancelThickness,
		thicknessAt,
		modelMoved: recomputeSoon,
		unitChanged,
		onFrame,
		dispose,
	}
}
