/**
 * The overlay draws the earlier version as a ghost over the open model, aligned by the
 * file's own coordinates. Both models are centred by the loader on their own bounding
 * box, so aligning those boxes would shift the whole ghost as soon as a part is added.
 */
import * as THREE from 'three'
import { useComparison, GHOST_OPACITY, GHOST_COLOR } from '../../../src/composables/useComparison.js'
import { loadModelByExtension } from '../../../src/loaders/registry.js'
import { fetchVersion } from '../../../src/utils/fileVersions.js'
import { centerObject } from '../../../src/utils/three-utils.js'

jest.mock('@nextcloud/dialogs', () => ({ getFilePickerBuilder: jest.fn() }), { virtual: true })
jest.mock('../../../src/loaders/registry.js', () => ({ loadModelByExtension: jest.fn() }))
jest.mock('../../../src/utils/fileVersions.js', () => ({ fetchVersion: jest.fn() }))
jest.mock('../../../src/loaders/multiFileHelpers.js', () => ({ getFileIdByPath: jest.fn(), loadModelWithDependencies: jest.fn() }))

const VERSION = { id: '1', url: '/v/1', mtime: 1000, size: 1, label: null, author: null }

/** A unit cube from `min` to `min + 1`, as a mesh with its own material. */
function cube(name, min) {
	const geometry = new THREE.BoxGeometry(1, 1, 1)
	geometry.translate(min[0] + 0.5, min[1] + 0.5, min[2] + 0.5)
	const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x888888 }))
	mesh.name = name
	return mesh
}

/** A model as the loader hands it over: a group of parts, centred on its own box. */
function loadedModel(...parts) {
	const root = new THREE.Group()
	parts.forEach((part) => root.add(part))
	root.updateMatrixWorld(true)
	centerObject(root)
	root.updateMatrixWorld(true)
	return root
}

function worldBox(object) {
	object.updateMatrixWorld(true)
	return new THREE.Box3().setFromObject(object)
}

function worldVertices(mesh) {
	mesh.updateMatrixWorld(true)
	const position = mesh.geometry.attributes.position
	const out = []
	for (let i = 0; i < position.count; i++) {
		out.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld))
	}
	return out
}

/** The open model and the version, side by side as Compare lays them out. */
async function sideBySide(openModel, versionModel) {
	const scene = new THREE.Scene()
	scene.add(openModel)
	fetchVersion.mockResolvedValue(new ArrayBuffer(1))
	loadModelByExtension.mockResolvedValue({ object3D: versionModel, animations: [] })
	const comparison = useComparison()
	await comparison.loadComparisonModelFromVersion(VERSION, { fileId: 1, filename: 'a.stl', dirPath: '/' }, { THREE, scene, hasDraco: false, hasKtx2: false, hasMeshopt: false })
	const fit = jest.fn()
	comparison.fitBothModelsToView(openModel, comparison.comparisonModel.value, fit, scene)
	return { scene, comparison, fit }
}

beforeEach(() => jest.clearAllMocks())

test('an identical version sits exactly on the open model', async () => {
	const openModel = loadedModel(cube('a', [10, 0, 0]))
	const versionModel = loadedModel(cube('a', [10, 0, 0]))
	const { scene, comparison, fit } = await sideBySide(openModel, versionModel)

	comparison.setOverlay(true, openModel, fit, scene)

	const open = worldBox(openModel)
	const ghost = worldBox(comparison.comparisonModel.value)
	expect(ghost.min.distanceTo(open.min)).toBeLessThan(1e-6)
	expect(ghost.max.distanceTo(open.max)).toBeLessThan(1e-6)
	expect(comparison.overlayActive.value).toBe(true)
})

test('shared parts stay put when the earlier version lacks a part', async () => {
	const openCube = cube('a', [0, 0, 0])
	const openModel = loadedModel(openCube, cube('b', [3, 0, 0]))
	const versionCube = cube('a', [0, 0, 0])
	const versionModel = loadedModel(versionCube)
	const { scene, comparison, fit } = await sideBySide(openModel, versionModel)

	comparison.setOverlay(true, openModel, fit, scene)

	const open = worldVertices(openCube)
	const ghost = worldVertices(versionCube)
	open.forEach((vertex, i) => expect(ghost[i].distanceTo(vertex)).toBeLessThan(1e-6))
})

test('the ghost follows the open model when it has been moved and turned', async () => {
	const openCube = cube('a', [0, 0, 0])
	const openModel = loadedModel(openCube)
	const versionCube = cube('a', [0, 0, 0])
	const { scene, comparison, fit } = await sideBySide(openModel, loadedModel(versionCube))
	openModel.rotation.set(0.3, 1.1, 0)
	openModel.scale.setScalar(2)

	comparison.setOverlay(true, openModel, fit, scene)

	const open = worldVertices(openCube)
	const ghost = worldVertices(versionCube)
	open.forEach((vertex, i) => expect(ghost[i].distanceTo(vertex)).toBeLessThan(1e-6))
})

test('ghost uses one translucent material and turning off restores the own ones', async () => {
	const versionCube = cube('a', [0, 0, 0])
	const ownMaterial = versionCube.material
	const { scene, comparison, fit } = await sideBySide(loadedModel(cube('a', [0, 0, 0]), cube('b', [2, 0, 0])), loadedModel(versionCube, cube('c', [5, 0, 0])))
	const openModel = scene.children.find((child) => child.isGroup && child !== comparison.comparisonModel.value)

	comparison.setOverlay(true, openModel, fit, scene)
	const ghostMaterials = new Set()
	comparison.comparisonModel.value.traverse((child) => { if (child.isMesh) ghostMaterials.add(child.material) })
	expect(ghostMaterials.size).toBe(1)
	const [ghost] = ghostMaterials
	expect(ghost.transparent).toBe(true)
	expect(ghost.opacity).toBe(GHOST_OPACITY)
	expect(ghost.color.getHex()).toBe(GHOST_COLOR)
	expect(ghost.depthWrite).toBe(false)

	comparison.setOverlay(false, openModel, fit, scene)
	expect(versionCube.material).toBe(ownMaterial)
	expect(comparison.overlayActive.value).toBe(false)
})

test('turning off puts the models side by side again', async () => {
	const openModel = loadedModel(cube('a', [0, 0, 0]))
	const { scene, comparison, fit } = await sideBySide(openModel, loadedModel(cube('a', [0, 0, 0])))
	const before = worldBox(comparison.comparisonModel.value)

	comparison.setOverlay(true, openModel, fit, scene)
	comparison.setOverlay(false, openModel, fit, scene)

	const after = worldBox(comparison.comparisonModel.value)
	expect(after.min.distanceTo(before.min)).toBeLessThan(1e-6)
	expect(after.intersectsBox(worldBox(openModel))).toBe(false)
})

test('clearComparison turns the overlay off', async () => {
	const openModel = loadedModel(cube('a', [0, 0, 0]))
	const { scene, comparison, fit } = await sideBySide(openModel, loadedModel(cube('a', [0, 0, 0])))

	comparison.setOverlay(true, openModel, fit, scene)
	comparison.clearComparison(scene)

	expect(comparison.overlayActive.value).toBe(false)
	expect(comparison.comparisonModel.value).toBeNull()
})

test('Fit Both before Overlay does not wrap the model twice, and the ghost still lines up', async () => {
	const openCube = cube('a', [0, 0, 0])
	const openModel = loadedModel(openCube, cube('b', [3, 0, 0]))
	const versionCube = cube('a', [0, 0, 0])
	const { scene, comparison, fit } = await sideBySide(openModel, loadedModel(versionCube))
	const wrapper = comparison.comparisonModel.value

	// Fit Both runs the layout again
	comparison.fitBothModelsToView(openModel, comparison.comparisonModel.value, fit, scene)
	expect(comparison.comparisonModel.value).toBe(wrapper)
	expect(wrapper.children[0].userData.comparisonWrapper).toBeFalsy()

	comparison.setOverlay(true, openModel, fit, scene)
	const open = worldVertices(openCube)
	const ghost = worldVertices(versionCube)
	open.forEach((vertex, i) => expect(ghost[i].distanceTo(vertex)).toBeLessThan(1e-6))
})

test('the ghost follows the open model when it is moved with Overlay on', async () => {
	const openCube = cube('a', [0, 0, 0])
	const openModel = loadedModel(openCube)
	const versionCube = cube('a', [0, 0, 0])
	const { scene, comparison, fit } = await sideBySide(openModel, loadedModel(versionCube))
	comparison.setOverlay(true, openModel, fit, scene)

	openModel.position.x += 4
	openModel.rotation.z = 0.7
	comparison.syncOverlay(openModel)

	const open = worldVertices(openCube)
	const ghost = worldVertices(versionCube)
	open.forEach((vertex, i) => expect(ghost[i].distanceTo(vertex)).toBeLessThan(1e-6))
})

test('syncOverlay does nothing while Overlay is off', async () => {
	const openModel = loadedModel(cube('a', [0, 0, 0]))
	const { comparison } = await sideBySide(openModel, loadedModel(cube('a', [0, 0, 0])))
	const before = worldBox(comparison.comparisonModel.value)
	openModel.position.x += 4
	comparison.syncOverlay(openModel)
	expect(worldBox(comparison.comparisonModel.value).min.distanceTo(before.min)).toBeLessThan(1e-9)
})

test('clearing without the scene still takes the model out of it', async () => {
	const openModel = loadedModel(cube('a', [0, 0, 0]))
	const { scene, comparison, fit } = await sideBySide(openModel, loadedModel(cube('a', [0, 0, 0])))
	const wrapper = comparison.comparisonModel.value
	comparison.setOverlay(true, openModel, fit, scene)

	comparison.clearComparison()

	expect(wrapper.parent).toBeNull()
	expect(scene.children).not.toContain(wrapper)
})
