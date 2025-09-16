<template>
	<div class="three-viewer" ref="container" :aria-label="t('threedviewer','3D viewer canvas container')">
		<div v-if="loading" class="loading" aria-live="polite">
			<span v-if="progress.message">{{ progress.message }}</span>
			<span v-else-if="progress.total > 0">{{ t('threedviewer', 'Loading {loaded}/{total}…', { loaded: progress.loaded, total: progress.total }) }}</span>
			<span v-else-if="progress.loaded > 0">{{ t('threedviewer', 'Loaded {loaded}…', { loaded: progress.loaded }) }}</span>
			<span v-else>{{ t('threedviewer', 'Loading 3D scene…') }}</span>
			<div v-if="progress.total > 0" class="progress-bar" :aria-label="t('threedviewer','Model load progress')" role="progressbar" :aria-valuemin="0" :aria-valuemax="progress.total" :aria-valuenow="progress.loaded">
				<div class="progress-bar__fill" :style="{ width: Math.min(100, (progress.loaded / progress.total) * 100) + '%' }"></div>
			</div>
			<div class="loading-actions">
				<button type="button" class="cancel-btn" @click="cancelLoad" :disabled="aborting">{{ aborting ? t('threedviewer','Canceling…') : t('threedviewer','Cancel loading') }}</button>
			</div>
		</div>
	</div>
</template>

<script>
import * as THREE from 'three'
import { loadModelByExtension, isSupportedExtension } from '../loaders/registry.js'

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
			progress: { loaded: 0, total: 0, message: null },
			renderer: null,
			scene: null,
			camera: null,
			controls: null,
			animationId: null,
			modelRoot: null,
			initialCameraPos: null,
			initialTarget: new THREE.Vector3(0,0,0),
			baselineCameraPos: null,
			baselineTarget: null,
			currentFileId: null,
			_saveTimer: null,
			hasDraco: null,
			hasKtx2: null,
			hasMeshopt: null,
			abortController: null,
			aborting: false,
			abortedEmitted: false,
		}
	},
	mounted() { this.init(); if (typeof window !== 'undefined') { window.__THREEDVIEWER_VIEWER = this } },
	beforeDestroy() { this.dispose(); this.cancelOngoingLoad() },
	watch: {
		showGrid(val) { if (this.grid) this.grid.visible = val },
		showAxes(val) { if (this.axes) this.axes.visible = val },
		wireframe(val) { this.applyWireframe(val) },
		background(val) { this.applyBackground(val) },
		fileId: { immediate: false, handler(id) { if (id) { this.cancelOngoingLoad(); this.loadModel(id) } } },
	},
	methods: {
		async init() {
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
			if (!this.fileId) {
				const geo = new THREE.BoxGeometry(1, 1, 1)
				const mat = new THREE.MeshStandardMaterial({ color: 0x1565c0, metalness: 0.1, roughness: 0.8 })
				this.cube = new THREE.Mesh(geo, mat)
				this.scene.add(this.cube)
			}
			this.grid = new THREE.GridHelper(10, 10)
			this.axes = new THREE.AxesHelper(2)
			this.scene.add(this.grid, this.axes)
			this.grid.visible = this.showGrid
			this.axes.visible = this.showAxes
			// Lazy-load OrbitControls to keep main bundle smaller
			try {
				const mod = await import(/* webpackChunkName: "orbit-controls" */ 'three/examples/jsm/controls/OrbitControls.js')
				const OrbitControls = mod.OrbitControls || mod.default
				this.controls = new OrbitControls(this.camera, this.renderer.domElement)
				this.controls.enableDamping = true
				this.controls.dampingFactor = 0.05
				this.controls.screenSpacePanning = false
				this.controls.update()
				this.controls.addEventListener('end', this.onControlsEnd)
			} catch (e) {
				// If dynamic import fails, continue without controls (rare)
				console.warn('[ThreeViewer] Failed to load OrbitControls chunk', e)
			}
			window.addEventListener('resize', this.onWindowResize)
			this.initialCameraPos = this.camera.position.clone()
			this.loading = false
			this.animate()
			if (this.fileId) this.loadModel(this.fileId)
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
			this.cancelOngoingLoad()
			this.loading = true
			this.progress = { loaded: 0, total: 0, message: null }
			this.currentFileId = fileId
			this.baselineCameraPos = null
			this.baselineTarget = null
			this.aborting = false
			this.abortedEmitted = false
			this.abortController = new AbortController()
			// Announce load start early (before fetch) for external listeners / tests
			const startPayload = { fileId }
			this.$emit('load-start', startPayload)
			this.dispatchViewerEvent('load-start', startPayload)
			try {
				const url = `/ocs/v2.php/apps/threedviewer/file/${fileId}`
				const res = await fetch(url, { headers: { 'Accept': 'application/octet-stream' }, signal: this.abortController.signal })
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				let filename = (res.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)"?/i)?.[1] || 'model.glb'
				const ext = filename.split('.').pop().toLowerCase()
				if (!isSupportedExtension(ext)) throw new Error(`Unsupported extension: ${ext}`)
				let arrayBuffer
				const contentLength = Number(res.headers.get('Content-Length') || 0)
				if (res.body && contentLength > 0 && 'getReader' in res.body) {
					this.progress.total = contentLength
					const reader = res.body.getReader()
					const chunks = []
					let received = 0
					while (true) {
						const { done, value } = await reader.read()
						if (done) break
						chunks.push(value)
						received += value.byteLength
						this.progress.loaded = received
						if (this.aborting) throw new DOMException('Aborted', 'AbortError')
					}
					const totalLength = received
					arrayBuffer = new Uint8Array(totalLength)
					let offset = 0
					for (const c of chunks) { arrayBuffer.set(c, offset); offset += c.byteLength }
					arrayBuffer = arrayBuffer.buffer
				} else {
					const blob = await res.blob()
					arrayBuffer = await blob.arrayBuffer()
					this.progress.loaded = this.progress.total = arrayBuffer.byteLength
				}
				if (['glb','gltf'].includes(ext)) await this.detectDecoderAssets()
				const { object3D } = await loadModelByExtension(ext, arrayBuffer, {
					THREE,
					scene: this.scene,
					renderer: this.renderer,
					applyWireframe: (enabled) => this.applyWireframe(enabled),
					ensurePlaceholderRemoved: () => this.ensurePlaceholderRemoved(),
					hasDraco: this.hasDraco,
					hasKtx2: this.hasKtx2,
					wireframe: this.wireframe,
					fileId: this.fileId,
				})
				if (this.aborting) throw new DOMException('Aborted', 'AbortError')
				this.modelRoot = object3D
				this.scene.add(this.modelRoot)
				this.fitCameraToObject(this.modelRoot)
				this.baselineCameraPos = this.camera.position.clone()
				this.baselineTarget = this.controls.target.clone()
				this.applySavedCamera(fileId)
				const payload = { fileId, filename }
				this.$emit('model-loaded', payload)
				this.dispatchViewerEvent('model-loaded', payload)
			} catch (e) {
				if (e && e.name === 'AbortError') {
					this.progress.message = t('threedviewer','Canceled')
					const payload = { fileId }
					this.$emit('model-aborted', payload)
					this.dispatchViewerEvent('model-aborted', payload)
				} else {
					console.error(e)
					const payload = { message: e.message || e.toString(), error: e }
					this.$emit('error', payload)
					this.dispatchViewerEvent('error', payload)
					this.progress.message = null
					this.progress.loaded = 0
					this.progress.total = 0
				}
			} finally {
				if (this.progress.total > 0 && this.progress.loaded < this.progress.total && !this.aborting) {
					this.progress.loaded = this.progress.total
				}
				this.loading = false
				this.aborting = false
				this.abortController = null
			}
		},
		cancelOngoingLoad() {
			if (this.abortController) {
				try { this.abortController.abort() } catch (_) {}
				this.abortController = null
				this.aborting = false
			}
		},
		cancelLoad() {
			if (!this.loading || this.aborting) return
			if (this.abortController) {
				this.aborting = true
				try { this.abortController.abort() } catch (_) {}
				// Proactively dispatch aborted event to guarantee external listeners receive it,
				// even if the underlying fetch rejects before our try/catch below handles it.
				if (!this.abortedEmitted) {
					const payload = { fileId: this.currentFileId }
					this.$emit('model-aborted', payload)
					this.dispatchViewerEvent('model-aborted', payload)
					this.abortedEmitted = true
				}
			}
		},
		async ensurePlaceholderRemoved() {
			if (this.cube) {
				this.scene.remove(this.cube)
				this.cube.geometry.dispose()
				this.cube.material.dispose()
				this.cube = null
			}
		},
		async detectDecoderAssets() {
			if (this.hasDraco !== null && this.hasKtx2 !== null && this.hasMeshopt !== null) return
			const dracoUrl = '/apps/threedviewer/draco/draco_decoder.wasm'
			const ktx2Url = '/apps/threedviewer/basis/basis_transcoder.wasm'
			// Meshopt decoder (optional) — place expected decoder at /apps/threedviewer/meshopt/meshopt_decoder.wasm
			const meshoptUrl = '/apps/threedviewer/meshopt/meshopt_decoder.wasm'
			const head = async url => {
				try {
					const res = await fetch(url, { method: 'HEAD' })
					if (res.ok) return true
					if (res.status === 405) {
						const getRes = await fetch(url, { method: 'GET' })
						return getRes.ok
					}
				} catch (_) {}
				return false
			}
			const [draco, ktx2, meshopt] = await Promise.all([
				this.hasDraco === null ? head(dracoUrl) : this.hasDraco,
				this.hasKtx2 === null ? head(ktx2Url) : this.hasKtx2,
				this.hasMeshopt === null ? head(meshoptUrl) : this.hasMeshopt,
			])
			this.hasDraco = !!draco
			this.hasKtx2 = !!ktx2
			this.hasMeshopt = !!meshopt
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
			if (!this.baselineCameraPos || !this.baselineTarget) {
				this.baselineCameraPos = this.camera.position.clone()
				this.baselineTarget = this.controls.target.clone()
			}
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
		applyBackground(val) { if (val) { try { this.scene.background = new THREE.Color(val) } catch (_) {} } },
		resetView() {
			if (this.baselineCameraPos && this.baselineTarget) {
				this.camera.position.copy(this.baselineCameraPos)
				this.controls.target.copy(this.baselineTarget)
				this.controls.update()
			} else if (this.initialCameraPos) {
				this.camera.position.copy(this.initialCameraPos)
				this.controls.target.copy(this.initialTarget)
				this.controls.update()
			}
			this.$emit('reset-done')
		},
		onControlsEnd() { if (this.fileId) this.scheduleCameraSave() },
		scheduleCameraSave() {
			if (this._saveTimer) clearTimeout(this._saveTimer)
			this._saveTimer = setTimeout(() => this.saveCameraState(this.fileId), 400)
		},
		getCameraStore() { try { return JSON.parse(localStorage.getItem('threedviewer.camera.v1')) || {} } catch (_) { return {} } },
		setCameraStore(store) { try { localStorage.setItem('threedviewer.camera.v1', JSON.stringify(store)) } catch (_) {} },
		saveCameraState(fileId) {
			if (!fileId || !this.camera || !this.controls) return
			const store = this.getCameraStore()
			store[fileId] = { pos: [this.camera.position.x, this.camera.position.y, this.camera.position.z], target: [this.controls.target.x, this.controls.target.y, this.controls.target.z] }
			this.setCameraStore(store)
		},
		applySavedCamera(fileId) {
			if (!fileId) return false
			const entry = this.getCameraStore()[fileId]
			if (!entry || !entry.pos || !entry.target) return false
			try {
				this.camera.position.set(entry.pos[0], entry.pos[1], entry.pos[2])
				this.controls.target.set(entry.target[0], entry.target[1], entry.target[2])
				this.controls.update()
				return true
			} catch (_) { return false }
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
			if (this.controls) this.controls.removeEventListener('end', this.onControlsEnd)
			if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null }
			this.cancelOngoingLoad()
			if (this.renderer) {
				this.renderer.dispose()
				if (this.renderer.domElement?.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
			}
			;['cube', 'grid', 'axes', 'modelRoot'].forEach(key => {
				if (this[key]) {
					this.scene?.remove(this[key])
					if (this[key].geometry) this[key].geometry.dispose()
					if (this[key].material) {
						if (Array.isArray(this[key].material)) this[key].material.forEach(m => m.dispose())
						else this[key].material.dispose()
					}
				}
			})
		},
		dispatchViewerEvent(type, detail) {
			try {
				const el = this.$refs.container
				if (el) {
					el.dispatchEvent(new CustomEvent(`threedviewer:${type}` , { detail, bubbles: true, composed: true }))
				}
			} catch (_) {}
		},
	},
}
</script>

<style scoped>
.three-viewer { position: relative; width: 100%; height: calc(100vh - 120px); min-height: 400px; outline: none; display: flex; align-items: center; justify-content: center; }
.loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.95rem; color: var(--color-text-light, #555); }
.loading-actions { margin-top: 0.5rem; text-align: center; }
.cancel-btn { cursor: pointer; font-size: 0.75rem; padding: 4px 10px; border-radius: 4px; background: var(--color-primary, #0d47a1); color: #fff; border: none; }
.cancel-btn[disabled] { opacity: 0.6; cursor: default; }
</style>

