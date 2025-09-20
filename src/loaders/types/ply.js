import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'

export default async function loadPly(arrayBuffer, context) {
	const { THREE, applyWireframe, ensurePlaceholderRemoved, wireframe } = context
	const loader = new PLYLoader()
	const geo = loader.parse(arrayBuffer)
	geo.computeVertexNormals?.()
	const mat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, flatShading: false })
	ensurePlaceholderRemoved()
	const mesh = new THREE.Mesh(geo, mat)
	applyWireframe(wireframe)
	return { object3D: mesh }
}
