<template>
	<div class="viewer-modal">
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
		<ViewerToolbar
			:grid="grid"
			:axes="axes"
			:wireframe="wireframe"
			:background="background"
			@reset-view="onReset"
			@toggle-grid="grid = !grid"
			@toggle-axes="axes = !axes"
			@toggle-wireframe="wireframe = !wireframe"
			@change-background="onBackgroundChange"
			class="modal-toolbar"
		/>
	</div>
</template>

<script>
import ThreeViewer from './ThreeViewer.vue'
import ViewerToolbar from './ViewerToolbar.vue'

export default {
	name: 'ViewerModal',
	components: {
		ThreeViewer,
		ViewerToolbar,
	},
	props: {
		fileId: { type: [Number, String], required: true },
		file: { type: Object, default: null },
		attr: { type: Object, default: null },
	},
	data() {
		return {
			grid: true,
			axes: true,
			wireframe: false,
			background: '#f5f5f5',
			_prefsLoaded: false,
		}
	},
	created() {
		this.loadPrefs()
	},
	methods: {
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
		onBackgroundChange(val) {
			this.background = val
		},
		onModelLoaded(meta) {
			// Emit event for parent components
			this.$emit('model-loaded', meta)
		},
		onError(msg) {
			// Emit event for parent components
			this.$emit('error', msg)
		},
	},
	watch: {
		grid() { this.savePrefs() },
		axes() { this.savePrefs() },
		wireframe() { this.savePrefs() },
		background() { this.savePrefs() },
	},
}
</script>

<style scoped lang="scss">
.viewer-modal {
	position: relative;
	width: 100%;
	height: 100vh;
	background: var(--color-main-background, #ffffff);
	overflow: hidden;
}

.modal-toolbar {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	z-index: 1000;
	background: rgba(255, 255, 255, 0.95);
	backdrop-filter: blur(10px);
	border-bottom: 1px solid var(--color-border, #e0e0e0);
}

// Dark mode support
.theme--dark .viewer-modal {
	background: var(--color-main-background, #1e1e1e);
}

.theme--dark .modal-toolbar {
	background: rgba(30, 30, 30, 0.95);
	border-bottom-color: var(--color-border, #404040);
}
</style>
