export default async function loadStl(arrayBuffer, context) {
	const { THREE, applyWireframe, ensurePlaceholderRemoved, wireframe } = context
	const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
	const loader = new STLLoader()
	const geo = loader.parse(arrayBuffer)
	const mat = new THREE.MeshStandardMaterial({ color: 0x888888 })
	ensurePlaceholderRemoved()
	const mesh = new THREE.Mesh(geo, mat)
	applyWireframe(wireframe)
	return { object3D: mesh }
}
