/**
 * A measurement marker is smaller than the thing it marks.
 *
 * Taking a measurement filled the entire viewport with flat green. The line between two
 * points is drawn as a cylinder — WebGL ignores `linewidth`, so a line of any thickness
 * has to be geometry — and its radius is a percentage of the model's size. Get that size
 * wrong and the "line" becomes a wall in front of the camera, drawn with `depthTest:
 * false` so it covers the model, the grid and everything else.
 *
 * The markers are the other half of the same arithmetic, and they fail more quietly: a
 * sphere large enough to contain the camera renders as nothing at all, because its faces
 * are then seen from behind and culled. So the visible symptom is one green wall and no
 * yellow spheres, which reads as "the line is broken" rather than "every marker is
 * enormous".
 *
 * Asserting against the model rather than against a number: the sizing is deliberately
 * relative, and the property that has to hold is the relationship — a marker for a 2mm
 * bracket and a marker for a 2m turbine are different sizes and both are small.
 */

const THREE = require('three')
const { useMeasurement } = require('../../src/composables/useMeasurement.js')

/**
 * A scene holding one model of a known size — and the rest of what a viewer puts in a
 * scene.
 *
 * The gizmo's picker plane is the whole reason this file exists. TransformControls keeps
 * an invisible mesh in the scene sized so that a drag can never run off the end of it: on
 * a real instance it measured 107,700 units across, next to a model of 0.4. Any code that
 * sizes itself from "every mesh in the scene" is therefore sizing itself from the picker,
 * and a marker at 0.8% of it is 861 units wide — a green wall across the viewport, drawn
 * with `depthTest: false` so it covers everything behind it.
 *
 * A fixture with only the model in it cannot see this, and did not: the first version of
 * these tests passed on every model size while the viewport was solid green.
 *
 * @param {number} size - the model's extent along each axis, in Three.js units
 * @return {object} the scene and the model in it
 */
function sceneWithModel(size) {
	const scene = new THREE.Scene()
	const model = new THREE.Mesh(
		new THREE.BoxGeometry(size, size, size),
		new THREE.MeshBasicMaterial(),
	)
	model.name = 'model'
	scene.add(model)

	// TransformControls' picker, reproduced by type name and scale rather than imported:
	// what matters is that it is a mesh, it is enormous, and it is not the model.
	const gizmo = new THREE.Object3D()
	gizmo.type = 'TransformControls'
	const picker = new THREE.Mesh(
		new THREE.PlaneGeometry(100000, 100000),
		new THREE.MeshBasicMaterial({ visible: false }),
	)
	picker.type = 'TransformControlsPlane'
	picker.name = ''
	gizmo.add(picker)
	scene.add(gizmo)

	scene.add(new THREE.GridHelper(size * 10, 10))
	scene.add(new THREE.AxesHelper(size * 5))

	scene.updateMatrixWorld(true)
	return { scene, model }
}

/** Every mesh the measurement system added, with its world-space radius. */
function markers(scene) {
	const found = []
	scene.traverse((o) => {
		if (!o.isMesh) return
		if (!/^measurement/.test(o.name || '')) return
		o.geometry.computeBoundingSphere()
		const scale = new THREE.Vector3()
		o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)
		found.push({
			name: o.name,
			radius: o.geometry.boundingSphere.radius * Math.max(scale.x, scale.y, scale.z),
		})
	})
	return found
}

describe.each([
	['a 1-unit model', 1],
	['a model smaller than one unit', 0.05],
	['a model much larger than one unit', 250],
])('measuring on %s', (_label, size) => {
	/**
	 * Take one measurement between two points a tenth of the model apart.
	 *
	 * @return {object[]} the meshes the measurement produced
	 */
	function measure() {
		const { scene } = sceneWithModel(size)
		const measurement = useMeasurement()
		measurement.init(scene)
		measurement.updateVisualScale()
		measurement.addMeasurementPoint(new THREE.Vector3(0, 0, 0))
		measurement.addMeasurementPoint(new THREE.Vector3(size * 0.1, 0, 0))
		measurement.createMeasurement()
		scene.updateMatrixWorld(true)
		return markers(scene)
	}

	it('draws something', () => {
		expect(measure().length).toBeGreaterThan(0)
	})

	it.each(['measurementPoint', 'measurementLine'])(
		'keeps every %s well inside the model it annotates',
		(prefix) => {
			const oversized = measure()
				.filter((m) => m.name.startsWith(prefix))
				// A tenth of the model is already generous for a marker; the sheet asks for
				// 1.5% and 0.8%. Anything at or beyond the model's own size is a wall.
				.filter((m) => m.radius > size * 0.1)
				.map((m) => `${m.name} radius ${m.radius.toPrecision(3)} vs model ${size}`)
			expect(oversized).toEqual([])
		},
	)
})
