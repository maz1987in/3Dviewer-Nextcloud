export default async function loadObj(arrayBuffer, context) {
	const { THREE, applyWireframe, ensurePlaceholderRemoved, wireframe, fileId } = context
	const textDecoder = new TextDecoder()
	const objText = textDecoder.decode(arrayBuffer)
	let mtlName = null
	for (const line of objText.split(/\r?\n/)) {
		if (line.toLowerCase().startsWith('mtllib ')) { mtlName = line.split(/\s+/)[1]?.trim(); break }
	}
	const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
	const loader = new OBJLoader()
	if (mtlName) {
		try {
			const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js')
			const mtlUrl = `/ocs/v2.php/apps/threedviewer/file/${fileId}/mtl/${encodeURIComponent(mtlName)}`
			const mtlRes = await fetch(mtlUrl, { headers: { 'Accept': 'text/plain' } })
			if (mtlRes.ok) {
				const mtlText = await mtlRes.text()
				const mtlLoader = new MTLLoader()
				const materials = mtlLoader.parse(mtlText, '')
				materials.preload()
				loader.setMaterials(materials)
			}
		} catch (e) { /* optional */ }
	}
	ensurePlaceholderRemoved()
	const object3D = loader.parse(objText)
	applyWireframe(wireframe)
	return { object3D }
}
