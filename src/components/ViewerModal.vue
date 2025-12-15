<template>
	<div class="viewer-modal">
		<!-- Slicer Modal -->
		<SlicerModal
			:is-open="showSlicerModal"
			:model-object="getModelObject()"
			:model-name="getModelName()"
			:is-dark-theme="false"
			@close="showSlicerModal = false"
			@success="onSlicerSuccess"
			@error="onSlicerError" />

		<ThreeViewer
			ref="viewer"
			:file-id="fileId"
			:show-grid="grid"
			:show-axes="axes"
			:wireframe="wireframe"
			:background="background"
			:performance-mode="performanceMode"
			@model-loaded="onModelLoaded"
			@animations-initialized="onAnimationsInitialized"
			@error="onError" />
		<ViewerToolbar
			:grid="grid"
			:axes="axes"
			:face-labels="faceLabels"
			:wireframe="wireframe"
			:background="background"
			:performance-mode="performanceMode"
			:model-loaded="modelLoaded"
			:has-animations="hasAnimations"
			:is-animation-playing="isAnimationPlaying"
			:is-animation-looping="isAnimationLooping"
			class="modal-toolbar"
			@reset-view="onReset"
			@toggle-grid="grid = !grid"
			@toggle-axes="axes = !axes"
			@toggle-face-labels="toggleFaceLabels"
			@toggle-wireframe="wireframe = !wireframe"
			@change-background="onBackgroundChange"
			@cycle-performance-mode="onCyclePerformanceMode"
			@send-to-slicer="onSendToSlicer"
			@toggle-animation-play="onToggleAnimationPlay"
			@toggle-animation-loop="onToggleAnimationLoop" />
	</div>
</template>

<script>
import ThreeViewer from './ThreeViewer.vue'
import ViewerToolbar from './ViewerToolbar.vue'
import SlicerModal from './SlicerModal.vue'

export default {
	name: 'ViewerModal',
	components: {
		ThreeViewer,
		ViewerToolbar,
		SlicerModal,
	},
	props: {
		fileId: { type: [Number, String], required: true },
		file: { type: Object, default: null },
		attr: { type: Object, default: null },
	},
	emits: ['model-loaded', 'error'],
	data() {
		return {
			grid: true,
			axes: true,
			faceLabels: false,
			wireframe: false,
			background: '#f5f5f5',
			_prefsLoaded: false,
			showSlicerModal: false,
			modelLoaded: false,
			// Animation state (updated from viewer)
			hasAnimations: false,
			isAnimationPlaying: false,
			isAnimationLooping: false,
		}
	},
	watch: {
		grid() { this.savePrefs() },
		axes() { this.savePrefs() },
		faceLabels() { this.savePrefs() },
		wireframe() { this.savePrefs() },
		background() { this.savePrefs() },
		// Watch modelLoaded to update animation state
		modelLoaded(newVal) {
			if (newVal) {
				// Update animation state when model loads
				this.$nextTick(() => {
					this.updateAnimationState()
				})
			} else {
				// Reset animation state when model unloads
				this.hasAnimations = false
				this.isAnimationPlaying = false
				this.isAnimationLooping = false
			}
		},
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
					if (typeof parsed.faceLabels === 'boolean') this.faceLabels = parsed.faceLabels
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
					faceLabels: this.faceLabels,
					wireframe: this.wireframe,
					background: this.background,
					v: 1,
				}
				localStorage.setItem('threedviewer:prefs', JSON.stringify(data))
			} catch (_) { /* storage may be disabled */ }
		},
		toggleFaceLabels() {
			this.faceLabels = !this.faceLabels
			this.$refs.viewer?.toggleFaceLabels?.()
		},
		onReset() {
			this.$refs.viewer?.resetView?.()
		},
		onBackgroundChange(val) {
			this.background = val
		},
		onCyclePerformanceMode(mode) {
			this.performanceMode = mode
			this.$refs.viewer?.setPerformanceMode?.(mode)
		},
		onModelLoaded(meta) {
			// Set model loaded flag
			this.modelLoaded = true
			// Update animation state from viewer
			// Primary synchronization happens via @animations-initialized event
			// This is a fallback in case the event doesn't fire
			this.$nextTick(() => {
				this.updateAnimationState()
			})
			// Emit event for parent components
			this.$emit('model-loaded', meta)
		},
		onAnimationsInitialized(data) {
			// Called when animations are initialized in ThreeViewer
			this.hasAnimations = data.hasAnimations || false
			this.isAnimationPlaying = data.isPlaying || false
			this.isAnimationLooping = data.isLooping ?? true // Default to true (animations loop by default)
		},
		onError(msg) {
			// Emit event for parent components
			this.$emit('error', msg)
		},
		onSendToSlicer() {
			// Open the slicer modal
			if (this.modelLoaded) {
				this.showSlicerModal = true
			}
		},
		getModelObject() {
			// Get the model object from the viewer
			return this.$refs.viewer?.getModelObject?.() || null
		},
		getModelName() {
			// Return filename without extension for export
			if (!this.file?.name) return 'model'

			// Extract just the filename (remove any path)
			const fullPath = this.file.name
			const parts = fullPath.split('/')
			const filenameOnly = parts[parts.length - 1]

			// Remove extension
			const lastDot = filenameOnly.lastIndexOf('.')
			return lastDot > 0 ? filenameOnly.substring(0, lastDot) : filenameOnly
		},
		onSlicerSuccess() {
			// Close modal on success
			this.showSlicerModal = false
		},
		onSlicerError(error) {
			// Log error
			console.error('Slicer error:', error)
		},
		onToggleAnimationPlay() {
			if (this.$refs.viewer?.animation) {
				this.$refs.viewer.animation.togglePlay()
				// Update state after toggle
				this.updateAnimationState()
			}
		},
		onToggleAnimationLoop() {
			if (this.$refs.viewer?.animation) {
				this.$refs.viewer.animation.toggleLoop()
				// Update state after toggle
				this.updateAnimationState()
			}
		},
		updateAnimationState() {
			// Update animation state from viewer (called when model loads or state changes)
			if (this.$refs.viewer) {
				// Access computed properties from setup()
				// Vue 3 may auto-unwrap computed refs when accessed via $refs, so handle both cases:
				// 1. If already unwrapped (primitive boolean), use directly
				// 2. If still a ref (object with .value), unwrap it
				const hasAnimationsRef = this.$refs.viewer.hasAnimations
				const isPlayingRef = this.$refs.viewer.isAnimationPlaying
				const isLoopingRef = this.$refs.viewer.isAnimationLooping

				// Helper to safely unwrap: if it's a primitive, use it; if it's a ref, unwrap it
				const unwrap = (val) => {
					if (val == null) return false
					// If it's already a primitive (boolean, number, string), use it directly
					if (typeof val !== 'object') return Boolean(val)
					// If it's an object with .value (ref), unwrap it
					if ('value' in val) return Boolean(val.value)
					// Otherwise, convert to boolean
					return Boolean(val)
				}

				this.hasAnimations = unwrap(hasAnimationsRef)
				this.isAnimationPlaying = unwrap(isPlayingRef)
				this.isAnimationLooping = unwrap(isLoopingRef)
			}
		},
	},
}
</script>

<style scoped lang="scss">
.viewer-modal {
	position: relative;
	width: 100%;
	height: 100vh;
	background: var(--color-main-background, #fff);
	overflow: hidden;
}

.modal-toolbar {
	position: absolute;
	top: 0;
	inset-inline: 0;
	z-index: 1000;
	background: rgb(255 255 255 / 95%);
	backdrop-filter: blur(10px);
	border-bottom: 1px solid var(--color-border, #e0e0e0);
}

// Dark mode support
.theme--dark .viewer-modal {
	background: var(--color-main-background, #1e1e1e);
}

.theme--dark .modal-toolbar {
	background: rgb(30 30 30 / 95%);
	border-bottom-color: var(--color-border, #404040);
}
</style>
