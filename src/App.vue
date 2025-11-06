<template>
	<NcAppContent>
		<div id="viewer-wrapper">
			<ToastContainer :toasts="toasts" @dismiss="dismissToast" />

			<!-- Help Panel -->
			<HelpPanel v-if="showHelp" @close="showHelp = false" />

			<!-- Minimal Top Bar -->
			<MinimalTopBar
				:model-name="filename"
				:is-loading="isLoading"
				:fps="fps"
				:show-performance="showPerformance"
				:show-controller="showController"
				:is-mobile="isMobile"
				@reset-view="onReset"
				@fit-to-view="onFitToView"
				@toggle-performance="onTogglePerformance"
				@toggle-controller="onToggleController"
				@take-screenshot="onTakeScreenshot"
				@toggle-help="onToggleHelp"
				@toggle-tools="onToggleTools" />

			<!-- Slide-Out Tool Panel -->
			<SlideOutToolPanel
				ref="toolsPanel"
				:auto-rotate="autoRotate"
				:camera-type="cameraType"
				:grid="grid"
				:axes="axes"
				:wireframe="wireframe"
				:background-color="background"
				:measurement-mode="measurementMode"
				:annotation-mode="annotationMode"
				:comparison-mode="comparisonMode"
				:model-loaded="modelLoaded"
				:performance-mode="performanceMode"
				:theme-mode="themeMode"
				:is-mobile="isMobile"
				@reset-view="onReset"
				@fit-to-view="onFitToView"
				@toggle-auto-rotate="onToggleAutoRotate"
				@toggle-projection="onToggleProjection"
				@toggle-grid="grid = !grid"
				@toggle-axes="axes = !axes"
				@toggle-wireframe="wireframe = !wireframe"
				@change-background="onBackgroundChange"
				@toggle-measurement="onToggleMeasurement"
				@toggle-annotation="onToggleAnnotation"
				@toggle-comparison="onToggleComparison"
				@cycle-performance-mode="onCyclePerformanceMode"
				@cycle-theme="onCycleTheme"
				@toggle-stats="onToggleStats"
				@take-screenshot="onTakeScreenshot"
				@export-model="onExportModel"
				@clear-cache="onClearCache"
				@toggle-help="onToggleHelp" />

			<!-- 3D Viewer -->
			<ThreeViewer
				ref="viewer"
				:file-id="fileId"
				:filename="filename"
				:dir="dir"
				:show-grid="grid"
				:show-axes="axes"
				:wireframe="wireframe"
				:background="background"
				:show-controller="showController"
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
import HelpPanel from './components/HelpPanel.vue'
import { NcAppContent } from '@nextcloud/vue'

export default {
	name: 'App',
	components: {
		NcAppContent,
		ToastContainer,
		ThreeViewer,
		MinimalTopBar,
		SlideOutToolPanel,
		HelpPanel,
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
			cameraType: 'perspective',
			animationPresets: [],
			currentPreset: '',
			showController: true,
			lastError: null,
			modelMeta: null,
			modelLoaded: false,
			// Advanced features
			measurementMode: false,
			annotationMode: false,
			comparisonMode: false,
			performanceMode: 'auto',
			themeMode: 'auto',
			toasts: [],
			_prefsLoaded: false,
			// UI state
			isLoading: false,
			fps: 0,
			showPerformance: true,
			showHelp: false,
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
			// First try data attribute from template (RESTful route: /apps/threedviewer/f/{fileId})
			const appRoot = document.getElementById('threedviewer')
			if (appRoot && appRoot.dataset.fileId) {
				return Number(appRoot.dataset.fileId)
			}

			// Fallback: Try query params (index page: /apps/threedviewer/?fileId=123)
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
		onToggleProjection() {
			this.$refs.viewer?.toggleCameraProjection?.()
			// Update camera type from viewer
			if (this.$refs.viewer?.cameraType) {
				this.cameraType = this.$refs.viewer.cameraType
			}
		},
		onChangePreset(presetName) {
			if (presetName) {
				this.currentPreset = presetName
				this.$refs.viewer?.animateToPreset?.(presetName)
			}
		},
		onToggleController() {
			this.showController = !this.showController
			this.$refs.viewer?.toggleController?.()
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
		// Toggle the performance stats overlay visibility (for MinimalTopBar button)
			this.$refs.viewer?.togglePerformanceStats?.()
		},

		onCyclePerformanceMode(mode) {
		// Set the new performance mode
			this.performanceMode = mode
			this.$refs.viewer?.setPerformanceMode?.(mode)
		},

		onCycleTheme(mode) {
		// Set the new theme mode
			this.themeMode = mode
			this.$refs.viewer?.setTheme?.(mode)
		},

		onToggleStats() {
		// Toggle the model statistics panel
			this.$refs.viewer?.toggleModelStats?.()
		},

		onExportModel(format) {
		// Trigger export on the viewer
			this.$refs.viewer?.handleExport?.(format)
		},

		onClearCache() {
		// Clear dependency cache
			this.$refs.viewer?.handleClearCache?.()
		},

		onBackgroundChange(val) {
			this.background = val
		},
		onTakeScreenshot() {
			// Trigger screenshot on the viewer
			this.$refs.viewer?.handleScreenshot?.()
		},
		onToggleHelp() {
			// Toggle help panel visibility
			this.showHelp = !this.showHelp
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
			this.modelLoaded = true
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
