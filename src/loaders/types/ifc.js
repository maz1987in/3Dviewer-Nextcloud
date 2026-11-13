import * as THREE from 'three'
import * as WebIFC from 'web-ifc'
import { BaseLoader } from '../BaseLoader.js'
import { createIfcApi, ifcTypeLabel } from '../ifcRuntime.js'

/**
 * IFC (Industry Foundation Classes) loader.
 *
 * Uses ThatOpen's `web-ifc` WASM — a modern IFC 2x3/4 parser with
 * tessellator. On first use it fetches `web-ifc.wasm` (~5 MB) from
 * the app's `web-ifc/` directory; `scripts/copy-decoders.mjs` copies both
 * the single-threaded and multi-threaded variants out of `node_modules`
 * so air-gapped Nextcloud installs don't need CDN reachability.
 *
 * The IFC → Three.js bridge is hand-written because `web-ifc-three` has
 * been deprecated and its modern replacement (`@thatopen/components`) is
 * a heavy framework we don't need just for file loading. The bridge is
 * straightforward: stream all tessellated meshes, deinterleave positions
 * from the `[px,py,pz,nx,ny,nz]` vertex layout, apply the placed-geometry
 * transform, and attach the per-geometry color. One Three.js mesh per
 * (ifc element × geometry) instance; an element drawn from several geometries is a
 * group of them. Elements are grouped by the storey (or other spatial structure) that
 * contains them, and carry their name, type and express ID in `userData.ifc`: the Parts
 * panel lists them by those, and reads an element's properties by its express ID when
 * it is chosen (ifcProperties.js).
 *
 * Memory: IfcAPI holds C++ state internally. We call `CloseModel` and
 * `geometry.delete()` on every emitted geometry to release the WASM-side
 * handle; forgetting either leaks in linear fashion.
 */
class IfcLoader extends BaseLoader {

	constructor() {
		super('IFCLoader', ['ifc'])
		this.ifcApi = null
	}

	async loadModel(arrayBuffer, context) {
		this.ifcApi = await createIfcApi()

		const uint8 = new Uint8Array(arrayBuffer)
		const modelID = this.ifcApi.OpenModel(uint8)

		try {
			const group = this.buildGroup(modelID)

			let meshes = 0
			group.traverse((child) => { if (child.isMesh) meshes++ })
			if (meshes === 0) {
				throw new Error('IFC file contained no tessellatable geometry')
			}

			this.logInfo('IFC model loaded successfully', {
				schemaVersion: this.ifcApi.GetModelSchema ? this.ifcApi.GetModelSchema(modelID) : 'unknown',
				meshes,
			})

			return this.processModel(group, context)
		} finally {
			// Free the WASM-side model regardless of success/failure.
			try { this.ifcApi.CloseModel(modelID) } catch { /* already closed */ }
		}
	}

	buildGroup(modelID) {
		const group = new THREE.Group()
		const { containerOf, containerNames } = this.readContainers(modelID)
		const containerGroups = new Map()

		// web-ifc's StreamAllMeshes yields a FlatMesh per IFC element; each
		// FlatMesh can carry multiple PlacedGeometry entries (body + holes
		// etc.). We create one Three.js mesh per placed geometry.
		this.ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
			const placed = flatMesh.geometries
			const count = placed.size()
			const meshes = []
			for (let i = 0; i < count; i++) {
				const pg = placed.get(i)
				const mesh = this.buildPlacedMesh(modelID, pg, flatMesh.expressID)
				if (mesh) meshes.push(mesh)
			}
			if (meshes.length === 0) {
				return
			}

			const container = containerOf.get(flatMesh.expressID)
			const info = this.describeElement(modelID, flatMesh.expressID)
			if (container !== undefined) {
				info.storey = containerNames.get(container) || ''
			}
			const label = info.name || info.typeLabel
			let node = meshes[0]
			if (meshes.length === 1) {
				Object.assign(node.userData.ifc, info)
			} else {
				node = new THREE.Group()
				node.userData.ifc = info
				meshes.forEach((mesh, i) => {
					mesh.name = `${label} (${i + 1}/${meshes.length})`
					node.add(mesh)
				})
			}
			node.name = label || node.name

			if (container === undefined) {
				group.add(node)
				return
			}
			if (!containerGroups.has(container)) {
				const containerGroup = new THREE.Group()
				containerGroup.name = containerNames.get(container) || ''
				containerGroup.userData.ifc = {
					expressID: container,
					name: containerGroup.name,
					typeLabel: this.typeLabelOf(modelID, container),
				}
				containerGroups.set(container, containerGroup)
				group.add(containerGroup)
			}
			containerGroups.get(container).add(node)
		})

		return group
	}

	/**
	 * Which storey, building or space contains each element, and what each is called.
	 * One relation lists many elements, so this is a handful of lines, not one per element.
	 *
	 * @param {number} modelID - The open model
	 * @return {{containerOf: Map<number, number>, containerNames: Map<number, string>}} The
	 *   container of each element, and the name of each container
	 */
	readContainers(modelID) {
		const containerOf = new Map()
		const containerNames = new Map()
		try {
			const relations = this.ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)
			for (let i = 0; i < relations.size(); i++) {
				const relation = this.ifcApi.GetLine(modelID, relations.get(i), false)
				const container = relation?.RelatingStructure?.value
				if (!Number.isFinite(container)) {
					continue
				}
				if (!containerNames.has(container)) {
					const line = this.ifcApi.GetLine(modelID, container, false)
					containerNames.set(container, line?.Name?.value || line?.LongName?.value || this.typeLabelOf(modelID, container))
				}
				for (const element of relation.RelatedElements ?? []) {
					containerOf.set(element.value, container)
				}
			}
		} catch (e) {
			this.logWarning('IFC: could not read the spatial structure', { error: e.message })
		}
		return { containerOf, containerNames }
	}

	/**
	 * @param {number} modelID - The open model
	 * @param {number} expressID - A line of the file
	 * @return {string} Its type in words, such as "Wall"
	 */
	typeLabelOf(modelID, expressID) {
		try {
			return ifcTypeLabel(this.ifcApi.GetNameFromTypeCode(this.ifcApi.GetLineType(modelID, expressID)))
		} catch {
			return ''
		}
	}

	/**
	 * What the Parts panel lists an element by: its name and type, not its properties,
	 * which are read when it is chosen.
	 *
	 * @param {number} modelID - The open model
	 * @param {number} expressID - The element
	 * @return {{expressID: number, typeLabel: string, name: string, globalId: string}} The element's
	 */
	describeElement(modelID, expressID) {
		let line = null
		try {
			line = this.ifcApi.GetLine(modelID, expressID, false)
		} catch { /* a line it cannot read is listed by its type */ }
		return {
			expressID,
			typeLabel: this.typeLabelOf(modelID, expressID),
			name: typeof line?.Name?.value === 'string' ? line.Name.value : '',
			globalId: typeof line?.GlobalId?.value === 'string' ? line.GlobalId.value : '',
		}
	}

	buildPlacedMesh(modelID, placedGeometry, expressID) {
		const geometry = this.ifcApi.GetGeometry(modelID, placedGeometry.geometryExpressID)

		try {
			const vertexPtr = geometry.GetVertexData()
			const vertexSize = geometry.GetVertexDataSize()
			const indexPtr = geometry.GetIndexData()
			const indexSize = geometry.GetIndexDataSize()

			// Vertex layout from web-ifc: interleaved [px,py,pz,nx,ny,nz].
			// GetVertexArray returns a view over WASM memory — copy before
			// the geometry handle goes out of scope, otherwise the backing
			// buffer is freed out from under us.
			const interleaved = this.ifcApi.GetVertexArray(vertexPtr, vertexSize)
			const indices = new Uint32Array(this.ifcApi.GetIndexArray(indexPtr, indexSize))

			const vertexCount = interleaved.length / 6
			const positions = new Float32Array(vertexCount * 3)
			const normals = new Float32Array(vertexCount * 3)
			for (let v = 0; v < vertexCount; v++) {
				positions[v * 3] = interleaved[v * 6]
				positions[v * 3 + 1] = interleaved[v * 6 + 1]
				positions[v * 3 + 2] = interleaved[v * 6 + 2]
				normals[v * 3] = interleaved[v * 6 + 3]
				normals[v * 3 + 1] = interleaved[v * 6 + 4]
				normals[v * 3 + 2] = interleaved[v * 6 + 5]
			}

			const threeGeom = new THREE.BufferGeometry()
			threeGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
			threeGeom.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
			threeGeom.setIndex(new THREE.BufferAttribute(indices, 1))

			const color = placedGeometry.color || { x: 0.8, y: 0.8, z: 0.8, w: 1 }
			const material = this.createMaterial({
				color: new THREE.Color(color.x, color.y, color.z),
				transparent: color.w < 1,
				opacity: color.w,
				side: THREE.DoubleSide,
			})

			const mesh = new THREE.Mesh(threeGeom, material)

			// flatTransformation is a column-major 4×4 matrix per web-ifc docs.
			// THREE.Matrix4.fromArray expects column-major, so this maps 1:1.
			const matrix = new THREE.Matrix4().fromArray(placedGeometry.flatTransformation)
			mesh.applyMatrix4(matrix)

			mesh.name = `IFC_${expressID}_${placedGeometry.geometryExpressID}`
			mesh.userData.ifc = {
				expressID,
				geometryExpressID: placedGeometry.geometryExpressID,
			}

			return mesh
		} finally {
			// Always release the WASM geometry handle.
			try { geometry.delete() } catch { /* already freed */ }
		}
	}

}

export default IfcLoader
