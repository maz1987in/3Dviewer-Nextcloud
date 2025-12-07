<template>
	<NcContent app-name="threedviewer">
		<FileNavigation
			ref="fileNavigation"
			:selected-file-id="fileId"
			:default-sort="defaultSort"
			:restore-sort-state="handleRestoreSortState"
			@select-file="onSelectFile"
			@navigate-folder="onNavigateFolder"
			@navigate-type="onNavigateType"
			@navigate-date="onNavigateDate"
			@navigate-viewer="onNavigateViewer"
			@navigate-all="onNavigateAll" />
		<NcAppContent>
			<!-- File Browser View -->
			<FileBrowser
				v-if="showFileBrowser"
				:files="browserFiles"
				:folders="browserFolders"
				:types="browserTypes"
				:dates="browserDates"
				:sort="browserSort"
				:loading="browserLoading"
				:current-path="browserPath"
				:current-type="browserType"
				:current-date="browserDate"
				:selected-file-id="fileId"
				@select-file="onSelectFile"
				@navigate-folder="onNavigateFolder"
				@navigate-type="onNavigateType"
				@navigate-date="onNavigateDate"
				@navigate-all="onNavigateAll" />

			<!-- 3D Viewer -->
			<div v-else id="viewer-wrapper" key="viewer-wrapper">
				<ToastContainer :toasts="toasts" @dismiss="dismissToast" />

				<!-- Help Panel -->
				<HelpPanel v-if="showHelp" @close="showHelp = false" />

				<!-- Slicer Modal -->
				<SlicerModal
					:is-open="showSlicerModal"
					:model-object="getModelObject()"
					:model-name="getModelName()"
					:is-dark-theme="themeMode === 'dark'"
					@close="showSlicerModal = false"
					@success="onSlicerSuccess"
					@error="onSlicerError" />

				<!-- Minimal Top Bar -->
				<MinimalTopBar
					:model-name="filename"
					:is-loading="isLoading"
					:fps="fps"
					:show-performance="showPerformance"
					:show-controller="showController"
					:is-mobile="isMobile"
					:has-animations="hasAnimationsComputed"
					:is-animation-playing="isAnimationPlayingComputed"
					@reset-view="onReset"
					@fit-to-view="onFitToView"
					@toggle-performance="onTogglePerformance"
					@toggle-controller="onToggleController"
					@take-screenshot="onTakeScreenshot"
					@toggle-help="onToggleHelp"
					@toggle-tools="onToggleTools"
					@toggle-animation-play="onToggleAnimationPlay" />

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
					:has-animations="hasAnimations"
					:is-animation-playing="isAnimationPlaying"
					:is-animation-looping="isAnimationLooping"
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
					@send-to-slicer="onSendToSlicer"
					@clear-cache="onClearCache"
					@reindex-files="onReindexFiles"
					@toggle-help="onToggleHelp"
					@toggle-animation-play="onToggleAnimationPlay"
					@toggle-animation-loop="onToggleAnimationLoop" />

				<!-- 3D Viewer -->
				<ThreeViewer
					v-if="prefsLoaded"
					key="three-viewer"
					ref="viewer"
					:file-id="fileId"
					:filename="filename"
					:dir="dir"
					:show-grid="grid"
					:show-axes="axes"
					:wireframe="wireframe"
					:background="background"
					:show-controller="showController"
					:persist-controller-position="persistControllerPosition"
					:auto-rotate="autoRotate"
					:auto-rotate-speed="autoRotateSpeed"
					:ambient-light-intensity="ambientLightIntensity"
					:directional-light-intensity="directionalLightIntensity"
					:zoom-speed="zoomSpeed"
					:pan-speed="panSpeed"
					:enable-damping="enableDamping"
					:enable-shadows="enableShadows"
					:enable-antialiasing="enableAntialiasing"
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
	</NcContent>
</template>

<script>
import ToastContainer from './components/ToastContainer.vue'
import ThreeViewer from './components/ThreeViewer.vue'
import MinimalTopBar from './components/MinimalTopBar.vue'
import SlideOutToolPanel from './components/SlideOutToolPanel.vue'
import HelpPanel from './components/HelpPanel.vue'
import SlicerModal from './components/SlicerModal.vue'
import FileNavigation from './components/FileNavigation.vue'
import FileBrowser from './components/FileBrowser.vue'
import { NcContent, NcAppContent } from '@nextcloud/vue'
import { loadState } from '@nextcloud/initial-state'
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { VIEWER_CONFIG } from './config/viewer-config.js'

export default {
	name: 'App',
	components: {
		NcContent,
		NcAppContent,
		FileNavigation,
		FileBrowser,
		ToastContainer,
		ThreeViewer,
		MinimalTopBar,
		SlideOutToolPanel,
		HelpPanel,
		SlicerModal,
	},
	props: {
		fileId: { type: [Number, String], default: null },
		filename: { type: String, default: null },
		dir: { type: String, default: null },
	},
	data() {
		loadState('threedviewer', 'navigation-initial-state') || {}
		// Prefer props if provided (from main.js), otherwise parse from DOM/query params
		const initialFileId = this.fileId || this.parseFileId() || null
		const initialFilename = this.filename || this.parseFilename()
		const initialDir = this.dir || this.parseDir()
		return {
			fileId: initialFileId,
			filename: initialFilename,
			dir: initialDir,
			defaultSort: 'viewer', // Always start in viewer mode regardless of prior preference
			// File browser state
			showFileBrowser: false, // Default to viewer, show browser only when navigating to folders/types/dates
			browserFiles: [],
			browserFolders: null,
			browserTypes: null,
			browserDates: null,
			browserLoading: false,
			browserPath: null,
			browserType: null,
			browserDate: null,
			browserSort: null,
			lastBrowserStates: {
				folders: null,
				type: null,
				date: null,
				favorites: null,
			},
			grid: true,
			axes: true,
			wireframe: false,
			background: '#f5f5f5',
			autoRotate: false,
			autoRotateSpeed: 2.0,
			cameraType: 'perspective',
			// Lighting
			ambientLightIntensity: VIEWER_CONFIG.lighting.ambient.intensity,
			directionalLightIntensity: VIEWER_CONFIG.lighting.directional.intensity,
			// Interaction
			zoomSpeed: VIEWER_CONFIG.interaction.zoomSpeed,
			panSpeed: VIEWER_CONFIG.interaction.panSpeed,
			enableDamping: VIEWER_CONFIG.interaction.enableDamping,
			// Performance
			enableShadows: VIEWER_CONFIG.performance.enableShadows,
			enableAntialiasing: VIEWER_CONFIG.performance.enableAntialiasing,
			animationPresets: [],
			currentPreset: '',
			showController: true,
			persistControllerPosition: true,
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
			lastSortState: null,
			prefsLoaded: false,
			// UI state
			isLoading: false,
			fps: 0,
			showPerformance: true,
			showHelp: false,
			isMobile: false,
			showSlicerModal: false,
			// Animation state (updated from viewer)
			hasAnimations: false,
			isAnimationPlaying: false,
			isAnimationLooping: false,
		}
	},
	computed: {
		// Computed properties that return data properties (for reactivity)
		hasAnimationsComputed() {
			const result = this.hasAnimations
			// Debug logging (remove in production)
			if (this.modelLoaded) {
				console.log('[App.vue] hasAnimationsComputed', {
					result,
					dataProperty: this.hasAnimations,
					viewerHasAnimations: this.$refs.viewer?.hasAnimations,
				})
			}
			return result
		},
		isAnimationPlayingComputed() {
			return this.isAnimationPlaying
		},
		isAnimationLoopingComputed() {
			return this.isAnimationLooping
		},
	},
	watch: {
		grid() { this.savePrefs() },
		axes() { this.savePrefs() },
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
	mounted() {
		// If fileId wasn't provided via props, try parsing from DOM/query params now that DOM is ready
		if (!this.fileId) {
			const parsedFileId = this.parseFileId()
			if (parsedFileId) {
				this.fileId = parsedFileId
			}
		}

		// If filename wasn't provided via props, try parsing now
		if (!this.filename) {
			const parsedFilename = this.parseFilename()
			if (parsedFilename) {
				this.filename = parsedFilename
			}
		}

		// If dir wasn't provided via props, try parsing now
		if (!this.dir) {
			const parsedDir = this.parseDir()
			if (parsedDir) {
				this.dir = parsedDir
			}
		}

		// Test harness fallback: if no fileId parsed but a global test file id is present inject it.
		if (!this.fileId && typeof window !== 'undefined' && window.__TEST_FILE_ID) {
			this.fileId = Number(window.__TEST_FILE_ID)
		}

		// Detect mobile device
		this.detectMobile()
		if (this.isMobile) {
			this.showController = false
		}
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
		async loadPrefs() {
			let timeoutId
			// Set a timeout to ensure viewer loads even if API hangs
			const timeoutPromise = new Promise(resolve => {
				timeoutId = setTimeout(() => {
					console.warn('App: Settings load timed out, using defaults')
					resolve(null)
				}, 5000)
			})

			try {
				const responsePromise = axios.get(generateUrl('/apps/threedviewer/settings'))

				// Race between API call and timeout
				const response = await Promise.race([responsePromise, timeoutPromise])

				// Clear timeout if request succeeded to prevent false warning
				clearTimeout(timeoutId)

				if (response && response.data) {
					const settings = response.data.settings || {}

					// Deep merge settings into VIEWER_CONFIG
					this.deepMerge(VIEWER_CONFIG, settings)

					// Update App state props that control the viewer
					if (settings.grid && typeof settings.grid.visible === 'boolean') this.grid = settings.grid.visible
					if (settings.axes && typeof settings.axes.visible === 'boolean') this.axes = settings.axes.visible
					if (settings.controller) {
						if (typeof settings.controller.defaultVisible === 'boolean') this.showController = settings.controller.defaultVisible
						if (typeof settings.controller.persistPosition === 'boolean') this.persistControllerPosition = settings.controller.persistPosition
					}
					if (settings.animation && settings.animation.autoRotate) {
						if (typeof settings.animation.autoRotate.enabled === 'boolean') this.autoRotate = settings.animation.autoRotate.enabled
						if (typeof settings.animation.autoRotate.speed === 'number') this.autoRotateSpeed = settings.animation.autoRotate.speed
					}
					if (settings.theme && settings.theme.mode) {
						this.themeMode = settings.theme.mode
					}
					// Lighting
					if (settings.lighting) {
						if (settings.lighting.ambient && typeof settings.lighting.ambient.intensity === 'number') {
							this.ambientLightIntensity = settings.lighting.ambient.intensity
						}
						if (settings.lighting.directional && typeof settings.lighting.directional.intensity === 'number') {
							this.directionalLightIntensity = settings.lighting.directional.intensity
						}
					}
					if (settings.interaction) {
						if (typeof settings.interaction.zoomSpeed === 'number') this.zoomSpeed = settings.interaction.zoomSpeed
						if (typeof settings.interaction.panSpeed === 'number') this.panSpeed = settings.interaction.panSpeed
						if (typeof settings.interaction.enableDamping === 'boolean') this.enableDamping = settings.interaction.enableDamping
					}
					if (settings.performance) {
						if (typeof settings.performance.enableShadows === 'boolean') this.enableShadows = settings.performance.enableShadows
						if (typeof settings.performance.enableAntialiasing === 'boolean') this.enableAntialiasing = settings.performance.enableAntialiasing
					}
				}
			} catch (e) {
				console.error('App: Failed to load settings', e)
			} finally {
				this.prefsLoaded = true
			}
		},
		deepMerge(target, source) {
			for (const key in source) {
				// Guard against prototype pollution by blocking dangerous property names
				if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
					continue
				}
				
				// Only process own properties
				if (!Object.prototype.hasOwnProperty.call(source, key)) {
					continue
				}
				
				if (source[key] instanceof Object && !Array.isArray(source[key]) && key in target) {
					Object.assign(target[key], this.deepMerge(target[key], source[key]))
				} else {
					target[key] = source[key]
				}
			}
			return target
		},
		savePrefs() {
			// Avoid saving before initial load to prevent overwriting valid existing settings prematurely
			if (!this.prefsLoaded) return
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

		onSendToSlicer() {
			// Open the slicer modal
			if (this.modelLoaded) {
				this.showSlicerModal = true
			} else {
				this.pushToast({
					message: 'No model loaded',
					type: 'error',
					duration: 3000,
				})
			}
		},

		getModelObject() {
			// Get the model object from the viewer
			return this.$refs.viewer?.getModelObject?.() || null
		},

		getModelName() {
			// Return filename without extension for export
			if (!this.filename) return 'model'

			// Extract just the filename (remove path)
			const parts = this.filename.split('/')
			const filenameOnly = parts[parts.length - 1]

			// Remove extension
			const lastDot = filenameOnly.lastIndexOf('.')
			return lastDot > 0 ? filenameOnly.substring(0, lastDot) : filenameOnly
		},

		onSlicerSuccess({ slicerId, method }) {
			// Show success toast
			this.pushToast({
				message: method === 'url-scheme'
					? 'Model sent to slicer'
					: 'STL downloaded successfully',
				type: 'success',
				duration: 3000,
			})
			this.showSlicerModal = false
		},

		onSlicerError(error) {
			// Show error toast
			this.pushToast({
				message: `Failed to send to slicer: ${error.message}`,
				type: 'error',
				duration: 5000,
			})
		},

		onClearCache() {
		// Clear dependency cache
			this.$refs.viewer?.handleClearCache?.()
		},

		async onReindexFiles() {
			try {
				this.pushToast({
					type: 'info',
					message: this.t('threedviewer', 'Indexing files...'),
					timeout: 2000,
				})

				const url = generateUrl('/apps/threedviewer/api/files/index')
				await axios.post(url)

				this.pushToast({
					type: 'success',
					message: this.t('threedviewer', 'Files indexed successfully'),
				})

				// Reload file navigation if available
				if (this.$refs.fileNavigation) {
					// Force reload of files
					await this.$refs.fileNavigation.loadFiles()
					// If we are currently browsing files, we should also refresh the current view
					// by re-emitting the navigation event if needed, but loadFiles updates the data
					// which should reactively update the view if bound correctly.
					// However, FileNavigation emits 'navigate-all' after loading.
					// We might want to trigger a refresh of the current view in App.vue too.

					// If browser is open, refresh the view
					if (this.showFileBrowser && this.browserSort) {
						// Trigger changeSort with forceReload=true to refresh the main content
						this.$refs.fileNavigation.changeSort(this.browserSort, null, true)
					}
				}
			} catch (error) {
				console.error('Failed to re-index files:', error)
				this.pushToast({
					type: 'error',
					message: this.t('threedviewer', 'Failed to re-index files'),
				})
			}
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
			// Update animation state from viewer
			// Use a small delay to ensure animations are initialized
			this.$nextTick(() => {
				// Try immediately
				this.updateAnimationState()
				// Also try after delays to catch animations that initialize asynchronously
				setTimeout(() => {
					this.updateAnimationState()
				}, 100)
				setTimeout(() => {
					this.updateAnimationState()
				}, 500)
				setTimeout(() => {
					this.updateAnimationState()
				}, 1000)
			})
			this.pushToast({ type: 'success', title: this.tSuccessTitle(), message: this.tLoadedMessage(meta.filename) })
		},
		onAnimationsInitialized(data) {
			// Called when animations are initialized in ThreeViewer
			console.log('[App.vue] Animations initialized event received', data)
			this.hasAnimations = data.hasAnimations || false
			this.isAnimationPlaying = data.isPlaying || false
			console.log('[App.vue] Animation state updated from event', {
				hasAnimations: this.hasAnimations,
				isAnimationPlaying: this.isAnimationPlaying,
				hasAnimationsComputed: this.hasAnimationsComputed,
			})
		},
		onError(error) {
			// Extract message from error object or use as string
			let message = error?.message || error || 'Unknown error occurred'
			this.lastError = message

			// Provide user-friendly error messages for common error types
			if (typeof message === 'string') {
				// Handle 404 errors
				if (message.includes('404') || message.includes('not found') || message.includes('File not found')) {
					message = this.t('threedviewer', 'File not found. The file may have been deleted, moved, or you may not have access to it.')
				}
				// Handle 403 errors
				else if (message.includes('403') || message.includes('Access denied') || message.includes('permission')) {
					message = this.t('threedviewer', 'Access denied. You may not have permission to access this file.')
				}
				// Handle 401 errors
				else if (message.includes('401') || message.includes('authentication') || message.includes('not authenticated')) {
					message = this.t('threedviewer', 'Authentication required. Please log in again.')
				}
				// Handle network errors
				else if (message.includes('Failed to fetch') || message.includes('network') || message.includes('NetworkError')) {
					message = this.t('threedviewer', 'Network error. Please check your connection and try again.')
				}
				// Handle unsupported format errors
				else if (message.includes('Unsupported') || message.includes('unsupported file')) {
					message = this.t('threedviewer', 'Unsupported file format. Please try a different file.')
				}
			}

			// Log error for debugging
			console.error('App: Model loading error:', error)

			// Show error in toast with longer timeout for reading
			this.pushToast({ 
				type: 'error', 
				title: this.tErrorTitle(), 
				message,
				timeout: 10000 // 10 seconds for error messages
			})

			// Reset loading state
			this.isLoading = false
			this.modelLoaded = false
		},
		onSelectFile(file) {
			// Load file in the same viewer area (no page reload)
			if (file && file.id) {
				// Remember current browser state so we can restore it later
				if (this.showFileBrowser) {
					this.saveBrowserStateSnapshot()
				}

				this.fileId = file.id
				// Use path from backend response (formatFileIndex returns 'path' and 'folder_path')
				this.filename = file.path || file.name || null
				this.dir = file.folder_path || null

				// Switch to viewer mode
				this.showFileBrowser = false
				this.$refs.fileNavigation?.setActiveSort('viewer')

				// Update URL without page reload using history API
				const url = `/apps/threedviewer/f/${file.id}`
				window.history.pushState({ fileId: file.id }, '', url)

				// Save selected file ID to config
				this.saveSelectedFileId(file.id)
			}
		},
		onNavigateFolder(folder) {
			this.showFileBrowser = true
			this.browserSort = 'folders'
			this.browserPath = folder.path || folder.name
			this.browserType = null
			this.browserDate = null
			// Ensure files is always an array
			this.browserFiles = Array.isArray(folder.files) ? folder.files : []
			// If subfolders are provided, show them in the browser
			if (folder.subfolders && folder.subfolders.length > 0) {
				// Set folders to show subfolders alongside files
				this.browserFolders = folder.subfolders
			} else {
				this.browserFolders = null
			}
			this.saveBrowserStateSnapshot()
		},
		onNavigateType(type) {
			this.showFileBrowser = true
			this.browserSort = 'type'
			this.browserPath = null
			this.browserType = type.extension
			this.browserDate = null
			// Ensure files is always an array
			this.browserFiles = Array.isArray(type.files) ? type.files : []
			this.browserFolders = null
			this.browserDates = null
			this.browserTypes = null
			this.saveBrowserStateSnapshot()
		},
		onNavigateDate(date) {
			this.showFileBrowser = true
			this.browserSort = 'date'
			this.browserPath = null
			this.browserType = null
			this.browserDate = {
				year: date.year,
				month: date.month,
			}
			// Ensure files is always an array
			this.browserFiles = Array.isArray(date.files) ? date.files : []
			this.browserFolders = null
			this.browserTypes = null
			this.saveBrowserStateSnapshot()
		},
		onNavigateViewer() {
			// Switch to viewer mode - hide file browser and show 3D viewer in default/empty state
			this.showFileBrowser = false
			this.fileId = null
			this.filename = null
			this.dir = null
			this.selectedFileId = null
			// Update URL to remove file ID and show default viewer
			window.history.pushState({}, '', generateUrl('/apps/threedviewer/'))
		},
		onNavigateAll(data) {
			if (data.resetState) {
				this.lastSortState = null
			}
			this.showFileBrowser = true
			this.browserPath = null
			this.browserType = null
			this.browserDate = null
			this.browserSort = data.sort
			// For folders/type/date modes, show the structure first, not files
			// Only show files directly for favorites mode
			if (data.sort === 'favorites') {
				// Ensure files is always an array
				this.browserFiles = Array.isArray(data.files) ? data.files : []
				this.browserFolders = null
				this.browserTypes = null
				this.browserDates = null
			} else {
				// Show folders/types/dates structure, not files
				this.browserFiles = []
				// If folders/types/dates are not provided OR this is from a breadcrumb click,
				// trigger FileNavigation to reload
				// This happens when navigating from breadcrumb click in FileBrowser
				if ((!data.folders && !data.types && !data.dates) || data.fromBreadcrumb) {
					// Trigger FileNavigation to reload and emit navigate-all with the structure
					// Pass forceReload=true to reload even if already in this sort mode
					if (this.$refs.fileNavigation) {
						this.$refs.fileNavigation.changeSort(data.sort, null, true).catch(err => {
							console.error('Error in changeSort:', err)
						})
					}
				} else {
					this.browserFolders = data.folders || null
					this.browserTypes = data.types || null
					this.browserDates = data.dates || null
				}
			}
			this.saveBrowserStateSnapshot()
		},
		saveBrowserStateSnapshot() {
			if (!this.showFileBrowser || !this.browserSort) {
				return
			}
			this.lastSortState = {
				sort: this.browserSort,
				browserPath: this.browserPath,
				browserType: this.browserType,
				browserDate: this.cloneData(this.browserDate),
				browserFolders: this.cloneData(this.browserFolders),
				browserFiles: this.cloneData(this.browserFiles),
				browserTypes: this.cloneData(this.browserTypes),
				browserDates: this.cloneData(this.browserDates),
			}
		},
		handleRestoreSortState(sort) {
			if (!this.lastSortState || this.lastSortState.sort !== sort) {
				return false
			}
			const state = this.lastSortState
			this.browserSort = state.sort
			this.browserPath = state.browserPath || null
			this.browserType = state.browserType || null
			this.browserDate = this.cloneData(state.browserDate) || null
			this.browserFolders = this.cloneData(state.browserFolders) || null
			this.browserFiles = this.cloneData(state.browserFiles) || []
			this.browserTypes = this.cloneData(state.browserTypes) || null
			this.browserDates = this.cloneData(state.browserDates) || null
			this.showFileBrowser = true
			return true
		},
		cloneData(value) {
			if (value === null || value === undefined) {
				return value
			}
			try {
				if (typeof structuredClone === 'function') {
					return structuredClone(value)
				}
				return JSON.parse(JSON.stringify(value))
			} catch (error) {
				return Array.isArray(value) ? value.slice() : value
			}
		},
		saveSelectedFileId(fileId) {
			// Save to user config via API
			const url = generateUrl('/apps/threedviewer/config')
			axios.put(url, {
				values: {
					selected_file_id: String(fileId),
				},
			}).catch(error => {
				console.error('Failed to save selected file ID:', error)
			})
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
			const wasMobile = this.isMobile
			this.isMobile = window.innerWidth <= 768
			if (this.isMobile && !wasMobile) {
				this.showController = false
			}
		},
		tSuccessTitle() { return this.t('threedviewer', 'Model loaded') },
		tLoadedMessage(name) { return this.t('threedviewer', 'Loaded {file}', { file: name }) },
		tErrorTitle() { return this.t('threedviewer', 'Error loading model') },
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
				const viewerHasAnimations = this.$refs.viewer.hasAnimations || false
				const viewerIsPlaying = this.$refs.viewer.isAnimationPlaying || false
				const viewerIsLooping = this.$refs.viewer.isAnimationLooping || false
				
				this.hasAnimations = viewerHasAnimations
				this.isAnimationPlaying = viewerIsPlaying
				this.isAnimationLooping = viewerIsLooping
				
				console.log('[App.vue] Animation state updated', {
					hasAnimations: this.hasAnimations,
					isAnimationPlaying: this.isAnimationPlaying,
					isAnimationLooping: this.isAnimationLooping,
					viewerHasAnimations,
					viewerIsPlaying,
					viewerIsLooping,
					hasAnimationsComputed: this.hasAnimationsComputed,
					isAnimationPlayingComputed: this.isAnimationPlayingComputed,
				})
			} else {
				console.warn('[App.vue] Cannot update animation state: viewer ref not available')
			}
		},
	},
}
</script>

<style scoped lang="scss">
// Ensure content takes full width and removes gap
:deep(.app-content) {
	// Allow content to fill available space (whether flex or grid)
	flex: 1 1 auto;
	width: 100%;
	min-width: 0; // Prevent flex/grid item from overflowing
	margin-top: 0 !important;
	padding-top: 0 !important;
}

:deep(.app-content-list) {
	margin-top: 0 !important;
	padding-top: 0 !important;
}

:deep(.app-content-wrapper) {
	margin-top: 0 !important;
	padding-top: 0 !important;
}

.content {
	// Do not force display:flex as it breaks Nextcloud's grid layout
	margin-top: 0 !important;
}

#viewer-wrapper {
	width: 100%;
	height: 100%;
	padding: 0;
	margin: 0;
}
</style>
