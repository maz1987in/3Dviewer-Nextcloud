<template>
	<div class="three-viewer" ref="container" :aria-label="t('threedviewer','3D viewer canvas container')">
		<div v-if="loading" class="loading" aria-live="polite">{{ t('threedviewer', 'Loading 3D scene…') }}</div>
	</div>
</template>

<script>
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export default {
	name: 'ThreeViewer',
	props: {
		fileId: { type: [Number, String], default: null },
		showGrid: { type: Boolean, default: true },
		showAxes: { type: Boolean, default: true },
		wireframe: { type: Boolean, default: false },
		background: { type: String, default: null },
	},
	data() {
		return {
			loading: true,
			renderer: null,
			scene: null,
			camera: null,
			controls: null,
			animationId: null,
			observer: null,
			modelRoot: null,
			initialCameraPos: null,
			initialTarget: new THREE.Vector3(0,0,0),
			hasDraco: null, // null = undetected, boolean after probe
			hasKtx2: null,
		}
	},
	mounted() {
		this.init()
	},
	beforeDestroy() {
		this.dispose()
	},
	watch: {
		showGrid(val) { if (this.grid) this.grid.visible = val },
		showAxes(val) { if (this.axes) this.axes.visible = val },
		wireframe(val) { this.applyWireframe(val) },
		background(val) { this.applyBackground(val) },
		fileId: {
			immediate: false,
			handler(id) { if (id) { this.loadModel(id) } },
		},
	},
	methods: {
		init() {
			const container = this.$refs.container
			const width = container.clientWidth || 800
			const height = container.clientHeight || 600

			this.scene = new THREE.Scene()
			this.scene.background = new THREE.Color(this.$root?.$ncTheme?.isDark ? 0x1e1e1e : 0xf5f5f5)

			this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
			this.camera.position.set(2, 2, 2)

			this.renderer = new THREE.WebGLRenderer({ antialias: true })
			this.renderer.setPixelRatio(window.devicePixelRatio)
			this.renderer.setSize(width, height)
			container.appendChild(this.renderer.domElement)

			const ambient = new THREE.AmbientLight(0xffffff, 0.7)
			const dir = new THREE.DirectionalLight(0xffffff, 0.8)
			dir.position.set(5, 10, 7.5)
			this.scene.add(ambient, dir)

			// Placeholder geometry (spinning cube) if no file provided yet
			if (!this.fileId) {
				const geo = new THREE.BoxGeometry(1, 1, 1)
				const mat = new THREE.MeshStandardMaterial({ color: 0x1565c0, metalness: 0.1, roughness: 0.8 })
				this.cube = new THREE.Mesh(geo, mat)
				this.scene.add(this.cube)
			}

			// Grid & axes helpers (default visible; can be toggled later)
			this.grid = new THREE.GridHelper(10, 10)
			this.axes = new THREE.AxesHelper(2)
			this.scene.add(this.grid, this.axes)
			this.grid.visible = this.showGrid
			this.axes.visible = this.showAxes

			this.controls = new OrbitControls(this.camera, this.renderer.domElement)
			this.controls.enableDamping = true
			this.controls.dampingFactor = 0.05
			this.controls.screenSpacePanning = false
			this.controls.update()

			window.addEventListener('resize', this.onWindowResize)

			this.initialCameraPos = this.camera.position.clone()
			this.loading = false
			this.animate()
			if (this.fileId) {
				this.loadModel(this.fileId)
			}
		},
		animate() {
			this.animationId = requestAnimationFrame(this.animate)
			if (this.cube && !this.modelRoot) {
				this.cube.rotation.x += 0.01
				this.cube.rotation.y += 0.015
			}
			this.controls?.update()
			this.renderer?.render(this.scene, this.camera)
		},
		async loadModel(fileId) {
			this.loading = true
			try {
				const url = `/ocs/v2.php/apps/threedviewer/file/${fileId}`
				const res = await fetch(url, { headers: { 'Accept': 'application/octet-stream' } })
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				// Determine extension from content-disposition filename or fallback to glb
				let filename = (res.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)"?/i)?.[1] || `model.glb`
				const ext = filename.split('.').pop().toLowerCase()
				const blob = await res.blob()
				const arrayBuffer = await blob.arrayBuffer()
				if (['glb','gltf'].includes(ext)) {
					await this.loadGltf(arrayBuffer)
				} else if (ext === 'stl') {
					await this.loadStl(arrayBuffer)
				} else if (ext === 'ply') {
					await this.loadPly(arrayBuffer)
				} else if (ext === 'obj') {
					await this.loadObj(arrayBuffer)
				} else if (ext === 'fbx') {
					await this.loadFbx(arrayBuffer)
				} else {
					console.warn('Unsupported loader yet for', ext)
				}
				this.$emit('model-loaded', { fileId, filename })
			} catch (e) {
				console.error(e)
				this.$emit('error', e.message || e.toString())
			} finally {
				this.loading = false
			}
		},
		async loadFbx(arrayBuffer) {
			// FBXLoader expects a DataView / ArrayBuffer parse via parse() is not publicly exposed; we create a Blob URL.
			// We convert the ArrayBuffer to a Blob and feed it to loader.load using an object URL.
			const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
			const loader = new FBXLoader()
			return new Promise((resolve, reject) => {
				try {
					const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' })
					const url = URL.createObjectURL(blob)
					loader.load(url, object => {
						URL.revokeObjectURL(url)
						this.ensurePlaceholderRemoved()
						this.modelRoot = object
						this.scene.add(this.modelRoot)
						this.fitCameraToObject(this.modelRoot)
						this.applyWireframe(this.wireframe)
						resolve()
					}, undefined, err => {
						URL.revokeObjectURL(url)
						reject(err)
					})
				} catch (e) { reject(e) }
			})
		},
		async ensurePlaceholderRemoved() {
			if (this.cube) {
				this.scene.remove(this.cube)
				this.cube.geometry.dispose()
				this.cube.material.dispose()
				this.cube = null
			}
		},
		async loadGltf(arrayBuffer) {
			// Dynamically import GLTFLoader and wire optional DRACO & KTX2 decoders.
			await this.detectDecoderAssets()
			const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
			const loader = new GLTFLoader()
			// DRACO (compressed geometry) support – only if assets detected.
			if (this.hasDraco) {
				try {
					const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js')
					const dracoLoader = new DRACOLoader()
					dracoLoader.setDecoderPath('/apps/threedviewer/draco/')
					loader.setDRACOLoader(dracoLoader)
				} catch (e) {
					console.warn('[threedviewer] DRACO dynamic import failed after positive detection', e)
				}
			}
			// KTX2 (Basis) – only if assets detected.
			if (this.hasKtx2) {
				try {
					const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
					const ktx2Loader = new KTX2Loader()
					ktx2Loader.setTranscoderPath('/apps/threedviewer/basis/')
					ktx2Loader.detectSupport(this.renderer)
					loader.setKTX2Loader(ktx2Loader)
				} catch (e) {
					console.warn('[threedviewer] KTX2 dynamic import failed after positive detection', e)
				}
			}
			return new Promise((resolve, reject) => {
				loader.parse(arrayBuffer, '', gltf => {
					this.ensurePlaceholderRemoved()
					this.modelRoot = gltf.scene
					this.scene.add(this.modelRoot)
					this.fitCameraToObject(this.modelRoot)
					this.applyWireframe(this.wireframe)
					resolve()
				}, reject)
			})
		},
		async detectDecoderAssets() {
			// Only probe once per session (component lifetime)
			if (this.hasDraco !== null && this.hasKtx2 !== null) return
			const dracoUrl = '/apps/threedviewer/draco/draco_decoder.wasm'
			const ktx2Url = '/apps/threedviewer/basis/basis_transcoder.wasm'
			const head = async (url) => {
				try {
					const res = await fetch(url, { method: 'HEAD' })
					if (res.ok) return true
					// Some environments may disallow HEAD; attempt a very small GET (cannot easily range without server support)
					if (res.status === 405) {
						const getRes = await fetch(url, { method: 'GET' })
						return getRes.ok
					}
				} catch (_) { /* silent */ }
				return false
			}
			const [draco, ktx2] = await Promise.all([
				this.hasDraco === null ? head(dracoUrl) : this.hasDraco,
				this.hasKtx2 === null ? head(ktx2Url) : this.hasKtx2,
			])
			this.hasDraco = !!draco
			this.hasKtx2 = !!ktx2
			if (this.hasDraco || this.hasKtx2) {
				console.log('[threedviewer] Decoder assets detected', { draco: this.hasDraco, ktx2: this.hasKtx2 })
			} else {
				console.log('[threedviewer] No decoder assets detected; proceeding without DRACO/KTX2 support')
			}
		},
		async loadStl(arrayBuffer) {
			const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
			const loader = new STLLoader()
			return new Promise((resolve, reject) => {
				try {
					const geo = loader.parse(arrayBuffer)
					this.ensurePlaceholderRemoved()
					const mat = new THREE.MeshStandardMaterial({ color: 0x888888 })
					this.modelRoot = new THREE.Mesh(geo, mat)
					this.scene.add(this.modelRoot)
					this.fitCameraToObject(this.modelRoot)
					this.applyWireframe(this.wireframe)
					resolve()
				} catch (e) { reject(e) }
			})
		},
		async loadPly(arrayBuffer) {
			const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js')
			const loader = new PLYLoader()
			return new Promise((resolve, reject) => {
				try {
					const geo = loader.parse(arrayBuffer)
					geo.computeVertexNormals?.()
					this.ensurePlaceholderRemoved()
					const mat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, flatShading: false })
					this.modelRoot = new THREE.Mesh(geo, mat)
					this.scene.add(this.modelRoot)
					this.fitCameraToObject(this.modelRoot)
					this.applyWireframe(this.wireframe)
					resolve()
				} catch (e) { reject(e) }
			})
		},
		async loadObj(arrayBuffer) {
			const textDecoder = new TextDecoder()
			const objText = textDecoder.decode(arrayBuffer)
			// Extract potential mtllib references (first one only for now)
			let mtlName = null
			for (const line of objText.split(/\r?\n/)) {
				if (line.toLowerCase().startsWith('mtllib ')) {
					mtlName = line.split(/\s+/)[1]?.trim()
					break
				}
			}
			const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
			const loader = new OBJLoader()
			if (mtlName) {
				try {
					const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js')
					// We need a fileId to know base OBJ; pass current fileId prop
					const mtlUrl = `/ocs/v2.php/apps/threedviewer/file/${this.fileId}/mtl/${encodeURIComponent(mtlName)}`
					const mtlRes = await fetch(mtlUrl, { headers: { 'Accept': 'text/plain' } })
					if (mtlRes.ok) {
						const mtlText = await mtlRes.text()
						const mtlLoader = new MTLLoader()
						const materials = mtlLoader.parse(mtlText, '')
						materials.preload()
						loader.setMaterials(materials)
					} else {
						this.$emit('error', t('threedviewer', 'MTL fetch failed ({status})', { status: mtlRes.status }))
					}
				} catch (e) {
					// MTL optional; log quietly
				}
			}
			return new Promise((resolve, reject) => {
				try {
					this.ensurePlaceholderRemoved()
					this.modelRoot = loader.parse(objText)
					this.scene.add(this.modelRoot)
					this.fitCameraToObject(this.modelRoot)
					this.applyWireframe(this.wireframe)
					resolve()
				} catch (e) { reject(e) }
			})
		},
		fitCameraToObject(obj) {
			const box = new THREE.Box3().setFromObject(obj)
			if (box.isEmpty()) return
			const size = new THREE.Vector3()
			const center = new THREE.Vector3()
			box.getSize(size)
			box.getCenter(center)
			const maxDim = Math.max(size.x, size.y, size.z)
			const fov = this.camera.fov * (Math.PI / 180)
			let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.4
			this.camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ)
			this.controls.target.copy(center)
			this.controls.update()
		},
		applyWireframe(enabled) {
			if (!this.modelRoot) return
			this.modelRoot.traverse(node => {
				if (node.isMesh && node.material) {
					const materials = Array.isArray(node.material) ? node.material : [node.material]
					materials.forEach(m => { if ('wireframe' in m) m.wireframe = enabled })
				}
			})
		},
		applyBackground(val) {
			if (!val) return
			try { this.scene.background = new THREE.Color(val) } catch (_) { /* ignore invalid */ }
		},
		resetView() {
			if (this.initialCameraPos) {
				this.camera.position.copy(this.initialCameraPos)
				this.controls.target.copy(this.initialTarget)
				this.controls.update()
			}
			this.$emit('reset-done')
		},
		onWindowResize() {
			if (!this.renderer || !this.camera) return
			const container = this.$refs.container
			const width = container.clientWidth
			const height = container.clientHeight || width * 0.75
			this.camera.aspect = width / height
			this.camera.updateProjectionMatrix()
			this.renderer.setSize(width, height)
		},
		dispose() {
			cancelAnimationFrame(this.animationId)
			window.removeEventListener('resize', this.onWindowResize)
			this.controls?.dispose()
			if (this.renderer) {
				this.renderer.dispose()
				if (this.renderer.domElement?.parentNode) {
					this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
				}
			}
			// Basic cleanup of placeholder objects
			;['cube', 'grid', 'axes', 'modelRoot'].forEach(key => {
				if (this[key]) {
					this.scene?.remove(this[key])
					if (this[key].geometry) this[key].geometry.dispose()
					if (this[key].material) {
						if (Array.isArray(this[key].material)) {
							this[key].material.forEach(m => m.dispose())
						} else {
							this[key].material.dispose()
						}
					}
				}
			})
		},
	},
}
</script>

<style scoped>
.three-viewer {
	position: relative;
	width: 100%;
	height: calc(100vh - 120px);
	min-height: 400px;
	outline: none;
	display: flex;
	align-items: center;
	justify-content: center;
}
.loading {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	font-size: 0.95rem;
	color: var(--color-text-light, #555);
}
</style>
