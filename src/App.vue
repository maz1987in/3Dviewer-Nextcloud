<template>
	<NcAppContent>
		<div id="viewer-wrapper">
			<ToastContainer :toasts="toasts" @dismiss="dismissToast" />
			
			<!-- Minimal Top Bar -->
			<MinimalTopBar
				:model-name="filename"
				:is-loading="isLoading"
				:fps="fps"
				:show-performance="showPerformance"
				:is-mobile="isMobile"
				@reset-view="onReset"
				@fit-to-view="onFitToView"
				@toggle-performance="onTogglePerformance"
				@take-screenshot="onTakeScreenshot"
				@toggle-help="onToggleHelp"
				@toggle-tools="onToggleTools" />
			
			<!-- Slide-Out Tool Panel -->
			<SlideOutToolPanel
				ref="toolsPanel"
				:auto-rotate="autoRotate"
				:current-preset="currentPreset"
				:presets="animationPresets"
				:grid="grid"
				:axes="axes"
				:wireframe="wireframe"
				:background-color="background"
				:measurement-mode="measurementMode"
				:annotation-mode="annotationMode"
				:comparison-mode="comparisonMode"
				:is-mobile="isMobile"
				@reset-view="onReset"
				@fit-to-view="onFitToView"
				@toggle-auto-rotate="onToggleAutoRotate"
				@change-preset="onChangePreset"
				@toggle-grid="grid = !grid"
				@toggle-axes="axes = !axes"
				@toggle-wireframe="wireframe = !wireframe"
				@change-background="onBackgroundChange"
				@toggle-measurement="onToggleMeasurement"
				@toggle-annotation="onToggleAnnotation"
				@toggle-comparison="onToggleComparison"
				@toggle-performance="onTogglePerformance"
				@take-screenshot="onTakeScreenshot"
				@toggle-help="onToggleHelp" />
			
			<!-- 3D Viewer -->
			<ThreeViewer
				:file-id="fileId"
				:filename="filename"
				:dir="dir"
				ref="viewer"
				:show-grid="grid"
				:show-axes="axes"
				:wireframe="wireframe"
				:background="background"
				:measurement-mode="measurementMode"
				:annotation-mode="annotationMode"
				:comparison-mode="comparisonMode"
				:performance-mode="performanceMode"
				@model-loaded="onModelLoaded"
				@loading-state-changed="onLoadingStateChanged"
				@fps-updated="onFpsUpdated"
				@error="onError" />
		</div>
	</NcAppContent>
</template>

<script>
import ToastContainer from './components/ToastContainer.vue'
import ThreeViewer from './components/ThreeViewer.vue'
import MinimalTopBar from './components/MinimalTopBar.vue'
import SlideOutToolPanel from './components/SlideOutToolPanel.vue'
import { NcAppContent } from '@nextcloud/vue'

export default {
	name: 'App',
	components: {
		NcAppContent,
		ToastContainer,
		ThreeViewer,
		MinimalTopBar,
		SlideOutToolPanel,
	},
	data() {
		return {
			fileId: this.parseFileId(),
			filename: this.parseFilename(),
			dir: this.parseDir(),
			grid: true,
			axes: true,
			wireframe: false,
			background: '#f5f5f5',
			autoRotate: false,
			animationPresets: [],
			currentPreset: '',
			lastError: null,
			modelMeta: null,
			// Advanced features
			measurementMode: false,
			annotationMode: false,
			comparisonMode: false,
			performanceMode: 'auto',
			toasts: [],
			_prefsLoaded: false,
			// UI state
			isLoading: false,
			fps: 0,
			showPerformance: true,
			isMobile: false,
		}
	},
	watch: {
		grid() { this.savePrefs() },
		axes() { this.savePrefs() },
		wireframe() { this.savePrefs() },
		background() { this.savePrefs() },
	},
	created() {
		this.loadPrefs()
	},
	mounted() {
		// Test harness fallback: if no fileId parsed but a global test file id is present inject it.
		if (!this.fileId && typeof window !== 'undefined' && window.__TEST_FILE_ID) {
			this.fileId = Number(window.__TEST_FILE_ID)
		}
		
		// Detect mobile device
		this.detectMobile()
		window.addEventListener('resize', this.detectMobile)
	},
	beforeUnmount() {
		window.removeEventListener('resize', this.detectMobile)
	},
	methods: {
		parseFileId() {
			// First try data attribute from template (RESTful route: /apps/threedviewer/{fileId})
			const appRoot = document.getElementById('threedviewer')
			if (appRoot && appRoot.dataset.fileId) {
				return Number(appRoot.dataset.fileId)
			}
			
			// Fallback: Try query params (legacy: /apps/threedviewer/?fileId=123)
			const params = new URLSearchParams(window.location.search)
			const id = params.get('fileId')
			return id ? Number(id) : null
		},
		parseFilename() {
			const params = new URLSearchParams(window.location.search)
			return params.get('filename') || null
		},
		parseDir() {
			// First try data attribute from template
			const appRoot = document.getElementById('threedviewer')
			if (appRoot && appRoot.dataset.dir) {
				return appRoot.dataset.dir || null
			}
			
			// Fallback: Try query params
			const params = new URLSearchParams(window.location.search)
			return params.get('dir') || null
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

		// Advanced features event handlers
		onToggleMeasurement() {
			this.measurementMode = !this.measurementMode
			this.annotationMode = false
			this.comparisonMode = false
			this.$refs.viewer?.toggleMeasurementMode?.()
		},

		onToggleAnnotation() {
			this.annotationMode = !this.annotationMode
			this.measurementMode = false
			this.comparisonMode = false
			this.$refs.viewer?.toggleAnnotationMode?.()
		},

		onToggleComparison() {
			this.comparisonMode = !this.comparisonMode
			this.measurementMode = false
			this.annotationMode = false
			this.$refs.viewer?.toggleComparisonMode?.()
		},

	onTogglePerformance() {
		// Toggle the performance stats overlay visibility
		this.$refs.viewer?.togglePerformanceStats?.()
	},
		onBackgroundChange(val) {
			this.background = val
		},
		onTakeScreenshot() {
			// TODO: Implement screenshot functionality
			this.pushToast({ 
				type: 'info', 
				title: this.t('threedviewer', 'Screenshot'), 
				message: this.t('threedviewer', 'Screenshot feature coming soon') 
			})
		},
		onToggleHelp() {
			// TODO: Implement help modal
			this.pushToast({ 
				type: 'info', 
				title: this.t('threedviewer', 'Help'), 
				message: this.t('threedviewer', 'Press T to toggle tools panel') 
			})
		},
		onToggleTools() {
			// Toggle the tools panel
			if (this.$refs.toolsPanel) {
				this.$refs.toolsPanel.togglePanel()
			}
		},
		onLoadingStateChanged(loading) {
			this.isLoading = loading
		},
		onFpsUpdated(fps) {
			this.fps = fps
		},
		onModelLoaded(meta) {
			this.modelMeta = meta
			this.lastError = null
			this.isLoading = false
			// Sync animation presets from viewer
			if (this.$refs.viewer?.animationPresets) {
				this.animationPresets = this.$refs.viewer.animationPresets
			}
			this.pushToast({ type: 'success', title: this.tSuccessTitle(), message: this.tLoadedMessage(meta.filename) })
		},
		onError(error) {
			// Extract message from error object or use as string
			const message = error?.message || error || 'Unknown error occurred'
			this.lastError = message
			// Viewer error handled - show detailed error message in toast
			this.pushToast({ type: 'error', title: this.tErrorTitle(), message })
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
				paused: false,
			})
		},
		dismissToast(id) {
			this.toasts = this.toasts.filter(t => t.id !== id)
		},
		detectMobile() {
			this.isMobile = window.innerWidth <= 768
		},
		tSuccessTitle() { return this.t('threedviewer', 'Model loaded') },
		tLoadedMessage(name) { return this.t('threedviewer', 'Loaded {file}', { file: name }) },
		tErrorTitle() { return this.t('threedviewer', 'Error loading model') },
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
