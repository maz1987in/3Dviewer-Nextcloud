export default async function loadThreeMF(arrayBuffer, context) {
	const { applyWireframe, ensurePlaceholderRemoved, wireframe } = context
	const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js')
	const loader = new ThreeMFLoader()
	return await new Promise((resolve, reject) => {
		try {
			const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' })
			const url = URL.createObjectURL(blob)
			loader.load(url, object => {
				URL.revokeObjectURL(url)
				ensurePlaceholderRemoved()
				applyWireframe(wireframe)
				resolve({ object3D: object })
			}, undefined, err => { URL.revokeObjectURL(url); reject(err) })
		} catch (e) { reject(e) }
	})
}
