import { BaseLoader } from '../BaseLoader.js'
import { decodeTextFromBuffer } from '../../utils/fileHelpers.js'
import { logger } from '../../utils/logger.js'

/**
 * X3D loader class — parses X3D/XML files into Three.js geometry
 */
class X3dLoader extends BaseLoader {

	constructor() {
		super('X3DLoader', ['x3d'])
	}

	/**
	 * Load X3D model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { THREE, additionalFiles = [] } = context

		const text = decodeTextFromBuffer(arrayBuffer)
		const parser = new DOMParser()
		const doc = parser.parseFromString(text, 'application/xml')

		const parseError = doc.querySelector('parsererror')
		if (parseError) {
			throw new Error('Invalid X3D file: XML parsing failed')
		}

		const sceneEl = doc.querySelector('Scene')
		if (!sceneEl) {
			throw new Error('No Scene element found in X3D file')
		}

		// Pre-convert texture files to data URIs (CSP-safe)
		const dataUriMap = new Map()
		for (const file of additionalFiles) {
			const fileName = file.name.split(/[/\\]/).pop().toLowerCase()
			if (/\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName)) {
				try {
					const dataUri = await new Promise((resolve, reject) => {
						const reader = new FileReader()
						reader.onload = () => resolve(reader.result)
						reader.onerror = reject
						reader.readAsDataURL(file)
					})
					dataUriMap.set(fileName, dataUri)
				} catch (e) {
					logger.warn('X3DLoader', 'Failed to convert texture to data URI', { fileName })
				}
			}
		}

		// DEF/USE registry for shared nodes (textures, materials, etc.)
		const defRegistry = new Map()

		const rootGroup = new THREE.Group()
		this.parseChildren(sceneEl, rootGroup, THREE, dataUriMap, defRegistry)

		if (rootGroup.children.length === 0) {
			throw new Error('No geometry found in X3D file')
		}

		// X3D uses Y-up by default (same as Three.js), no rotation needed

		logger.info('X3DLoader', 'X3D model loaded', { children: rootGroup.children.length })
		return this.processModel(rootGroup, context)
	}

	/**
	 * Recursively parse child elements
	 */
	parseChildren(el, parent, THREE, dataUriMap, defRegistry) {
		for (const child of el.children) {
			const tag = child.tagName

			if (tag === 'Transform' || tag === 'Group') {
				const group = new THREE.Group()
				if (child.getAttribute('DEF')) {
					group.name = child.getAttribute('DEF')
				}

				if (tag === 'Transform') {
					this.applyTransform(child, group)
				}

				this.parseChildren(child, group, THREE, dataUriMap, defRegistry)

				if (group.children.length > 0) {
					parent.add(group)
				}
			} else if (tag === 'Shape') {
				const mesh = this.parseShape(child, THREE, dataUriMap, defRegistry)
				if (mesh) {
					parent.add(mesh)
				}
			} else {
				// Recurse into other container elements
				this.parseChildren(child, parent, THREE, dataUriMap, defRegistry)
			}
		}
	}

	/**
	 * Apply X3D Transform attributes to a Three.js group
	 */
	applyTransform(el, group) {
		const translation = this.parseVec3(el.getAttribute('translation'))
		if (translation) {
			group.position.set(translation[0], translation[1], translation[2])
		}

		const scale = this.parseVec3(el.getAttribute('scale'))
		if (scale) {
			group.scale.set(scale[0], scale[1], scale[2])
		}

		const rotation = this.parseVec4(el.getAttribute('rotation'))
		if (rotation) {
			// X3D rotation is axis-angle: (x, y, z, angle)
			const axis = new group.position.constructor(rotation[0], rotation[1], rotation[2]).normalize()
			group.quaternion.setFromAxisAngle(axis, rotation[3])
		}
	}

	/**
	 * Parse a Shape element into a Three.js mesh
	 */
	parseShape(shapeEl, THREE, dataUriMap, defRegistry) {
		const appearance = shapeEl.querySelector('Appearance')
		const ifs = shapeEl.querySelector('IndexedFaceSet')
			|| shapeEl.querySelector('IndexedTriangleSet')

		if (!ifs) return null

		const geometry = this.parseIndexedFaceSet(ifs, THREE)
		if (!geometry) return null

		const material = this.parseMaterial(appearance, THREE, dataUriMap, defRegistry)
		const mesh = new THREE.Mesh(geometry, material)

		return mesh
	}

	/**
	 * Parse IndexedFaceSet into BufferGeometry
	 */
	parseIndexedFaceSet(ifs, THREE) {
		const coordEl = ifs.querySelector('Coordinate')
		if (!coordEl) return null

		const coordStr = coordEl.getAttribute('point')
		if (!coordStr) return null

		// Parse vertex positions
		const coords = this.parseFloatArray(coordStr)
		if (coords.length < 9) return null

		// Parse face indices
		const coordIndexStr = ifs.getAttribute('coordIndex')
		if (!coordIndexStr) return null
		const coordIndices = coordIndexStr.trim().split(/\s+/).map(Number)

		// Parse UV coordinates
		const texCoordEl = ifs.querySelector('TextureCoordinate')
		let texCoords = null
		if (texCoordEl) {
			texCoords = this.parseFloatArray(texCoordEl.getAttribute('point'))
		}
		const texCoordIndexStr = ifs.getAttribute('texCoordIndex')
		let texCoordIndices = null
		if (texCoordIndexStr) {
			texCoordIndices = texCoordIndexStr.trim().split(/\s+/).map(Number)
		}

		// Parse normals
		const normalEl = ifs.querySelector('Normal')
		let normals = null
		if (normalEl) {
			normals = this.parseFloatArray(normalEl.getAttribute('vector'))
		}
		const normalIndexStr = ifs.getAttribute('normalIndex')
		let normalIndices = null
		if (normalIndexStr) {
			normalIndices = normalIndexStr.trim().split(/\s+/).map(Number)
		}

		// Convert indexed faces to triangles
		const positions = []
		const uvs = []
		const norms = []

		// Split faces by -1 separator
		const faces = []
		let currentFace = []
		let currentTexFace = []
		let currentNormFace = []

		for (let i = 0; i < coordIndices.length; i++) {
			if (coordIndices[i] === -1) {
				if (currentFace.length >= 3) {
					faces.push({
						verts: currentFace,
						texVerts: currentTexFace,
						normVerts: currentNormFace,
					})
				}
				currentFace = []
				currentTexFace = []
				currentNormFace = []
			} else {
				currentFace.push(coordIndices[i])
				if (texCoordIndices) currentTexFace.push(texCoordIndices[i])
				if (normalIndices) currentNormFace.push(normalIndices[i])
			}
		}
		// Handle last face without trailing -1
		if (currentFace.length >= 3) {
			faces.push({
				verts: currentFace,
				texVerts: currentTexFace,
				normVerts: currentNormFace,
			})
		}

		// Triangulate faces and build vertex arrays
		for (const face of faces) {
			// Fan triangulation: vertex 0 connects to each consecutive pair
			for (let i = 1; i < face.verts.length - 1; i++) {
				const triIndices = [0, i, i + 1]

				for (const ti of triIndices) {
					const vi = face.verts[ti]
					positions.push(coords[vi * 3], coords[vi * 3 + 1], coords[vi * 3 + 2])

					if (texCoords && face.texVerts.length > 0) {
						const tci = face.texVerts[ti]
						if (tci !== undefined && tci >= 0) {
							uvs.push(texCoords[tci * 2], texCoords[tci * 2 + 1])
						}
					}

					if (normals && face.normVerts.length > 0) {
						const ni = face.normVerts[ti]
						if (ni !== undefined && ni >= 0) {
							norms.push(normals[ni * 3], normals[ni * 3 + 1], normals[ni * 3 + 2])
						}
					} else if (normals && !normalIndices) {
						// Per-vertex normals (no separate index)
						norms.push(normals[vi * 3], normals[vi * 3 + 1], normals[vi * 3 + 2])
					}
				}
			}
		}

		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

		if (uvs.length === (positions.length / 3) * 2) {
			geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
		}

		if (norms.length === positions.length) {
			geometry.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3))
		} else {
			geometry.computeVertexNormals()
		}

		return geometry
	}

	/**
	 * Parse Appearance/Material into a Three.js material
	 */
	parseMaterial(appearance, THREE, dataUriMap, defRegistry) {
		if (!appearance) {
			return new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide })
		}

		const matEl = appearance.querySelector('Material')
		const props = { side: THREE.DoubleSide }

		if (matEl) {
			const diffuse = this.parseVec3(matEl.getAttribute('diffuseColor'))
			if (diffuse) {
				props.color = new THREE.Color(diffuse[0], diffuse[1], diffuse[2])
			}

			const specular = this.parseVec3(matEl.getAttribute('specularColor'))
			if (specular) {
				props.specular = new THREE.Color(specular[0], specular[1], specular[2])
			}

			const emissive = this.parseVec3(matEl.getAttribute('emissiveColor'))
			if (emissive) {
				props.emissive = new THREE.Color(emissive[0], emissive[1], emissive[2])
			}

			const shininess = parseFloat(matEl.getAttribute('shininess'))
			if (!isNaN(shininess)) {
				props.shininess = shininess * 128
			}

			const transparency = parseFloat(matEl.getAttribute('transparency'))
			if (!isNaN(transparency) && transparency > 0.01) {
				props.transparent = true
				props.opacity = 1 - transparency
				props.depthWrite = false
			}
		}

		// Load texture (handle DEF/USE references)
		const texEl = appearance.querySelector('ImageTexture')
		if (texEl) {
			let texture = null
			const useRef = texEl.getAttribute('USE')
			const defName = texEl.getAttribute('DEF')

			if (useRef && defRegistry.has(useRef)) {
				// Reuse previously defined texture
				texture = defRegistry.get(useRef)
			} else {
				const urlAttr = texEl.getAttribute('url')
				if (urlAttr) {
					texture = this.loadX3dTexture(urlAttr, THREE, dataUriMap)
					if (texture && defName) {
						defRegistry.set(defName, texture)
					}
				}
			}

			if (texture) {
				props.map = texture
				props.color = new THREE.Color(1, 1, 1)
			}
		}

		return new THREE.MeshPhongMaterial(props)
	}

	/**
	 * Load texture from X3D ImageTexture url attribute
	 */
	loadX3dTexture(urlAttr, THREE, dataUriMap) {
		// X3D url can be: '"path1" "path2" "path3"'
		const urls = urlAttr.match(/"([^"]+)"/g)
		if (!urls) return null

		for (let url of urls) {
			url = url.replace(/"/g, '').trim()
			const fileName = url.split(/[/\\]/).pop().toLowerCase()

			const dataUri = dataUriMap.get(fileName)
			if (dataUri) {
				const img = new Image()
				img.src = dataUri
				const texture = new THREE.Texture(img)
				texture.colorSpace = THREE.SRGBColorSpace
				texture.needsUpdate = true

				img.onload = () => {
					texture.needsUpdate = true
				}

				logger.info('X3DLoader', 'Loaded texture', { fileName })
				return texture
			}
		}

		return null
	}

	/** Parse space-separated floats */
	parseFloatArray(str) {
		if (!str) return []
		return str.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n))
	}

	/** Parse "x y z" string to [x,y,z] */
	parseVec3(str) {
		if (!str) return null
		const parts = str.trim().split(/\s+/).map(Number)
		return parts.length >= 3 ? parts : null
	}

	/** Parse "x y z w" string to [x,y,z,w] */
	parseVec4(str) {
		if (!str) return null
		const parts = str.trim().split(/\s+/).map(Number)
		return parts.length >= 4 ? parts : null
	}

}

export default X3dLoader
