<template>
	<NcAppContent>
		<div id="viewer-wrapper">
			<ToastContainer :toasts="toasts" @dismiss="dismissToast" />
			<ViewerToolbar
				:grid="grid"
				:axes="axes"
				:wireframe="wireframe"
				:background="background"
				:auto-rotate="autoRotate"
				:presets="animationPresets"
				:current-preset="currentPreset"
				@reset-view="onReset"
				@fit-to-view="onFitToView"
				@toggle-auto-rotate="onToggleAutoRotate"
				@change-preset="onChangePreset"
				@toggle-grid="grid = !grid"
				@toggle-axes="axes = !axes"
				@toggle-wireframe="wireframe = !wireframe"
				@change-background="onBackgroundChange"
			/>
			<ThreeViewer
				:file-id="fileId"
				:show-grid="grid"
				:show-axes="axes"
				:wireframe="wireframe"
				:background="background"
				@model-loaded="onModelLoaded"
				@error="onError"
				ref="viewer"
			/>
		</div>
	</NcAppContent>
</template>

<script>
import ToastContainer from './components/ToastContainer.vue'
import ThreeViewer from './components/ThreeViewer.vue'
import ViewerToolbar from './components/ViewerToolbar.vue'

// Attempt to import NcAppContent (Nextcloud UI component); provide minimal fallback if unavailable (e.g., in Playwright data URL harness)
let NcAppContent
try {
	// eslint-disable-next-line import/no-unresolved
	NcAppContent = (await import('@nextcloud/vue/dist/Components/NcAppContent.js')).default
} catch (e) {
	NcAppContent = { name: 'NcAppContentStub', functional: true, render(h, ctx) { return h('div', { class: 'nc-app-content-stub' }, ctx.children) } }
}

export default {
	name: 'App',
	components: {
		NcAppContent,
		ToastContainer,
		ThreeViewer,
		ViewerToolbar,
	},
	data() {
		return {
			fileId: this.parseFileId(),
			grid: true,
			axes: true,
			wireframe: false,
			background: '#f5f5f5',
			autoRotate: false,
			animationPresets: [],
			currentPreset: '',
			lastError: null,
			modelMeta: null,
			toasts: [],
			_prefsLoaded: false,
		}
	},
	created() {
		this.loadPrefs()
	},
	mounted() {
		// Test harness fallback: if no fileId parsed but a global test file id is present inject it.
		if (!this.fileId && typeof window !== 'undefined' && window.__TEST_FILE_ID) {
			this.fileId = Number(window.__TEST_FILE_ID)
		}
	},
	watch: {
		grid() { this.savePrefs() },
		axes() { this.savePrefs() },
		wireframe() { this.savePrefs() },
		background() { this.savePrefs() },
	},
	methods: {
		parseFileId() {
			const params = new URLSearchParams(window.location.search)
			const id = params.get('fileId')
			return id ? Number(id) : null
		},
		loadPrefs() {
			try {
				const raw = localStorage.getItem('threedviewer:prefs')
				if (!raw) return
				const parsed = JSON.parse(raw)
				if (typeof parsed === 'object' && parsed) {
					if (typeof parsed.grid === 'boolean') this.grid = parsed.grid
					if (typeof parsed.axes === 'boolean') this.axes = parsed.axes
					if (typeof parsed.wireframe === 'boolean') this.wireframe = parsed.wireframe
					if (typeof parsed.background === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(parsed.background)) {
						this.background = parsed.background
					}
				}
				this._prefsLoaded = true
			} catch (e) { /* ignore corrupted prefs */ }
		},
		savePrefs() {
			// Avoid saving before initial load to prevent overwriting valid existing settings prematurely
			if (!this._prefsLoaded) return
			try {
				const data = {
					grid: this.grid,
					axes: this.axes,
					wireframe: this.wireframe,
					background: this.background,
					v: 1,
				}
				localStorage.setItem('threedviewer:prefs', JSON.stringify(data))
			} catch (_) { /* storage may be disabled */ }
		},
		onReset() {
			this.$refs.viewer?.resetView?.()
		},
		onFitToView() {
			this.$refs.viewer?.fitToView?.()
		},
		onToggleAutoRotate() {
			this.autoRotate = !this.autoRotate
			this.$refs.viewer?.toggleAutoRotate?.()
		},
		onChangePreset(presetName) {
			if (presetName) {
				this.currentPreset = presetName
				this.$refs.viewer?.animateToPreset?.(presetName)
			}
		},
		onBackgroundChange(val) {
			this.background = val
		},
		onModelLoaded(meta) {
			this.modelMeta = meta
			this.lastError = null
			// Sync animation presets from viewer
			if (this.$refs.viewer?.animationPresets) {
				this.animationPresets = this.$refs.viewer.animationPresets
			}
			this.pushToast({ type: 'success', title: this.tSuccessTitle(), message: this.tLoadedMessage(meta.filename) })
		},
		onError(msg) {
			this.lastError = msg
			console.error('Viewer error:', msg)
			this.pushToast({ type: 'error', title: this.tErrorTitle(), message: msg })
		},
		pushToast({ type = 'info', title, message, timeout = null }) {
			const id = Date.now() + Math.random()
			
			// Set different default timeouts based on toast type
			let defaultTimeout
			switch (type) {
				case 'success':
					defaultTimeout = 4000 // 4 seconds for success messages
					break
				case 'error':
					defaultTimeout = 8000 // 8 seconds for error messages (longer for reading)
					break
				case 'info':
				default:
					defaultTimeout = 5000 // 5 seconds for info messages
					break
			}
			
			this.toasts.push({ 
				id, 
				type, 
				title, 
				message, 
				timeout: timeout !== null ? timeout : defaultTimeout,
				progress: 0,
				paused: false
			})
		},
		dismissToast(id) {
			this.toasts = this.toasts.filter(t => t.id !== id)
		},
		tSuccessTitle() { return t('threedviewer', 'Model loaded') },
		tLoadedMessage(name) { return t('threedviewer', 'Loaded {file}', { file: name }) },
		tErrorTitle() { return t('threedviewer', 'Error loading model') },
	},
}
</script>

<style scoped lang="scss">
#viewer-wrapper {
	width: 100%;
	height: 100%;
	padding: 0;
}
</style>
