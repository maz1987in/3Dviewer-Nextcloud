<template>
	<div class="slide-out-panel-wrapper">
		<!-- Backdrop (mobile only) -->
		<div v-if="isOpen && isMobile"
			class="panel-backdrop"
			@click="closePanel" />

		<!-- Slide-Out Panel -->
		<transition name="slide-panel">
			<div v-if="isOpen"
				class="slide-out-panel"
				:class="{ 'mobile': isMobile, 'dark-theme': isDarkTheme }"
				role="complementary"
				:aria-label="t('threedviewer', 'Tools panel')">
				<!-- Panel Header -->
				<div class="panel-header">
					<h2 class="panel-title">
						{{ t('threedviewer', 'Tools') }}
					</h2>
					<button class="close-btn"
						:aria-label="t('threedviewer', 'Close panel')"
						:title="t('threedviewer', 'Close (T or Esc)')"
						@click="closePanel">
						<span class="icon">×</span>
					</button>
				</div>

				<!-- Panel Content -->
				<div class="panel-content">
					<!-- VIEW Section -->
					<section class="panel-section">
						<button class="section-header"
							:aria-expanded="sections.view"
							@click="toggleSection('view')">
							<span class="section-icon">📷</span>
							<span class="section-title">{{ t('threedviewer', 'View') }}</span>
							<span class="expand-icon">{{ sections.view ? '▼' : '▶' }}</span>
						</button>
						<div v-show="sections.view" class="section-content">
							<button class="tool-btn" @click="emit('reset-view')">
								<span class="tool-icon">🔄</span>
								<span class="tool-label">{{ t('threedviewer', 'Reset View') }}</span>
							</button>
							<button class="tool-btn" @click="emit('fit-to-view')">
								<span class="tool-icon">📏</span>
								<span class="tool-label">{{ t('threedviewer', 'Fit to View') }}</span>
							</button>
							<button class="tool-btn"
								:class="{ 'active': autoRotate }"
								@click="emit('toggle-auto-rotate')">
								<span class="tool-icon">🔄</span>
								<span class="tool-label">{{ autoRotate ? t('threedviewer', 'Auto-Rotate On') : t('threedviewer', 'Auto-Rotate Off') }}</span>
							</button>
							<button class="tool-btn"
								:class="{ 'active': cameraType === 'orthographic' }"
								@click="emit('toggle-projection')">
								<span class="tool-icon">📐</span>
								<span class="tool-label">{{ cameraType === 'perspective' ? t('threedviewer', 'Perspective') : t('threedviewer', 'Orthographic') }}</span>
							</button>
						</div>
					</section>

					<!-- DISPLAY Section -->
					<section class="panel-section">
						<button class="section-header"
							:aria-expanded="sections.display"
							@click="toggleSection('display')">
							<span class="section-icon">👁️</span>
							<span class="section-title">{{ t('threedviewer', 'Display') }}</span>
							<span class="expand-icon">{{ sections.display ? '▼' : '▶' }}</span>
						</button>
						<div v-show="sections.display" class="section-content">
							<button class="tool-btn toggle-btn"
								:class="{ 'active': grid }"
								@click="emit('toggle-grid')">
								<span class="tool-icon">⊞</span>
								<span class="tool-label">{{ t('threedviewer', 'Grid') }}</span>
								<span class="toggle-indicator">{{ grid ? '✓' : '' }}</span>
							</button>
							<button class="tool-btn toggle-btn"
								:class="{ 'active': axes }"
								@click="emit('toggle-axes')">
								<span class="tool-icon">📐</span>
								<span class="tool-label">{{ t('threedviewer', 'Axes') }}</span>
								<span class="toggle-indicator">{{ axes ? '✓' : '' }}</span>
							</button>
							<button class="tool-btn toggle-btn"
								:class="{ 'active': wireframe }"
								@click="emit('toggle-wireframe')">
								<span class="tool-icon">🔲</span>
								<span class="tool-label">{{ t('threedviewer', 'Wireframe') }}</span>
								<span class="toggle-indicator">{{ wireframe ? '✓' : '' }}</span>
							</button>
							<div class="tool-group">
								<label class="tool-label-small">{{ t('threedviewer', 'Background') }}</label>
								<div class="color-picker-wrapper">
									<input type="color"
										:value="backgroundColor || '#ffffff'"
										class="color-input"
										@input="emit('change-background', $event.target.value)">
									<button class="reset-color-btn"
										:title="t('threedviewer', 'Reset background')"
										@click="emit('change-background', null)">
										{{ t('threedviewer', 'Reset') }}
									</button>
								</div>
							</div>
						</div>
					</section>

					<!-- TOOLS Section -->
					<section class="panel-section">
						<button class="section-header"
							:aria-expanded="sections.tools"
							@click="toggleSection('tools')">
							<span class="section-icon">🛠️</span>
							<span class="section-title">{{ t('threedviewer', 'Tools') }}</span>
							<span class="expand-icon">{{ sections.tools ? '▼' : '▶' }}</span>
						</button>
						<div v-show="sections.tools" class="section-content">
							<button class="tool-btn feature-btn"
								:class="{ 'active': measurementMode }"
								@click="emit('toggle-measurement')">
								<span class="tool-icon">📏</span>
								<span class="tool-label">{{ t('threedviewer', 'Measurement') }}</span>
								<span v-if="measurementMode" class="active-badge">{{ t('threedviewer', 'Active') }}</span>
							</button>
							<button class="tool-btn feature-btn"
								:class="{ 'active': annotationMode }"
								@click="emit('toggle-annotation')">
								<span class="tool-icon">📝</span>
								<span class="tool-label">{{ t('threedviewer', 'Annotation') }}</span>
								<span v-if="annotationMode" class="active-badge">{{ t('threedviewer', 'Active') }}</span>
							</button>
							<button class="tool-btn feature-btn"
								:class="{ 'active': comparisonMode }"
								@click="emit('toggle-comparison')">
								<span class="tool-icon">⚖️</span>
								<span class="tool-label">{{ t('threedviewer', 'Comparison') }}</span>
								<span v-if="comparisonMode" class="active-badge">{{ t('threedviewer', 'Active') }}</span>
							</button>
							<!-- Animation controls -->
							<div v-if="hasAnimations" class="tool-group">
								<label class="tool-label-small">{{ t('threedviewer', 'Animation') }}</label>
								<div class="animation-controls">
									<button class="tool-btn"
										:class="{ 'active': isAnimationPlaying }"
										@click="emit('toggle-animation-play')">
										<span class="tool-icon">{{ isAnimationPlaying ? '⏸️' : '▶️' }}</span>
										<span class="tool-label">{{ isAnimationPlaying ? t('threedviewer', 'Pause') : t('threedviewer', 'Play') }}</span>
									</button>
									<button class="tool-btn toggle-btn"
										:class="{ 'active': isAnimationLooping }"
										@click="emit('toggle-animation-loop')">
										<span class="tool-icon">🔁</span>
										<span class="tool-label">{{ t('threedviewer', 'Loop') }}</span>
										<span class="toggle-indicator">{{ isAnimationLooping ? '✓' : '' }}</span>
									</button>
								</div>
							</div>
						</div>
					</section>

					<!-- SETTINGS Section -->
					<section class="panel-section">
						<button class="section-header"
							:aria-expanded="sections.settings"
							@click="toggleSection('settings')">
							<span class="section-icon">⚙️</span>
							<span class="section-title">{{ t('threedviewer', 'Settings') }}</span>
							<span class="expand-icon">{{ sections.settings ? '▼' : '▶' }}</span>
						</button>
						<div v-show="sections.settings" class="section-content">
							<button class="tool-btn" @click="cyclePerformanceMode">
								<span class="tool-icon">⚡</span>
								<span class="tool-label">{{ t('threedviewer', 'Performance') }}: {{ getPerformanceModeText() }}</span>
							</button>
							<button class="tool-btn" @click="cycleTheme">
								<span class="tool-icon">{{ getThemeIcon() }}</span>
								<span class="tool-label">{{ t('threedviewer', 'Theme') }}: {{ getThemeText() }}</span>
							</button>
							<button class="tool-btn"
								:disabled="!modelLoaded"
								@click="emit('toggle-stats')">
								<span class="tool-icon">📊</span>
								<span class="tool-label">{{ t('threedviewer', 'Model Statistics') }}</span>
							</button>
							<button class="tool-btn" @click="emit('take-screenshot')">
								<span class="tool-icon">📷</span>
								<span class="tool-label">{{ t('threedviewer', 'Screenshot') }}</span>
							</button>
							<button class="tool-btn"
								:disabled="!modelLoaded"
								@click="emit('send-to-slicer')">
								<span class="tool-icon">🖨️</span>
								<span class="tool-label">{{ t('threedviewer', 'Send to Slicer') }}</span>
							</button>
							<div class="tool-group">
								<label class="tool-label-small">{{ t('threedviewer', 'Export Model') }}</label>
								<select ref="exportSelect"
									:disabled="!modelLoaded"
									class="export-select"
									@change="handleExportChange($event.target.value)">
									<option value="">
										{{ t('threedviewer', 'Select format...') }}
									</option>
									<option value="glb">
										{{ t('threedviewer', 'GLB (Recommended)') }}
									</option>
									<option value="stl">
										{{ t('threedviewer', 'STL (3D Printing)') }}
									</option>
									<option value="obj">
										{{ t('threedviewer', 'OBJ (Universal)') }}
									</option>
								</select>
							</div>
							<!-- Cache Management -->
							<div v-if="cacheStats.enabled" class="tool-group cache-group">
								<label class="tool-label-small">{{ t('threedviewer', 'Dependency Cache') }}</label>
								<div class="cache-info">
									<div class="cache-stat-row">
										<span class="cache-stat-label">{{ t('threedviewer', 'Size') }}:</span>
										<span class="cache-stat-value">{{ cacheStats.sizeMB.toFixed(1) }} MB</span>
									</div>
									<div class="cache-stat-row">
										<span class="cache-stat-label">{{ t('threedviewer', 'Files') }}:</span>
										<span class="cache-stat-value">{{ cacheStats.count }}</span>
									</div>
									<div v-if="cacheStats.hits + cacheStats.misses > 0" class="cache-stat-row">
										<span class="cache-stat-label">{{ t('threedviewer', 'Hit Rate') }}:</span>
										<span class="cache-stat-value" :class="{ 'good': cacheStats.hitRate >= 70, 'warning': cacheStats.hitRate >= 50 && cacheStats.hitRate < 70, 'poor': cacheStats.hitRate < 50 }">
											{{ cacheStats.hitRate.toFixed(1) }}%
										</span>
									</div>
								</div>
								<button class="tool-btn cache-clear-btn" @click="emit('clear-cache')">
									<span class="tool-icon">🗑️</span>
									<span class="tool-label">{{ t('threedviewer', 'Clear Cache') }}</span>
								</button>
							</div>
							<button v-else class="tool-btn" @click="emit('clear-cache')">
								<span class="tool-icon">🗑️</span>
								<span class="tool-label">{{ t('threedviewer', 'Clear Cache') }}</span>
							</button>
							<button class="tool-btn" @click="emit('toggle-help')">
								<span class="tool-icon">ⓘ</span>
								<span class="tool-label">{{ t('threedviewer', 'Help') }}</span>
							</button>
						</div>
					</section>
				</div>

				<!-- Panel Footer -->
				<div class="panel-footer">
					<span class="keyboard-hint">{{ t('threedviewer', 'Press T to toggle') }}</span>
				</div>
			</div>
		</transition>
	</div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { translate as t } from '@nextcloud/l10n'

export default {
	name: 'SlideOutToolPanel',

	props: {
		// View props
		autoRotate: { type: Boolean, default: false },
		cameraType: { type: String, default: 'perspective' },

		// Display props
		grid: { type: Boolean, default: true },
		axes: { type: Boolean, default: true },
		wireframe: { type: Boolean, default: false },
		backgroundColor: { type: String, default: null },

		// Tool states
		measurementMode: { type: Boolean, default: false },
		annotationMode: { type: Boolean, default: false },
		comparisonMode: { type: Boolean, default: false },
		modelLoaded: { type: Boolean, default: false },
		performanceMode: { type: String, default: 'auto' },
		themeMode: { type: String, default: 'auto' },

		// Animation props
		hasAnimations: { type: Boolean, default: false },
		isAnimationPlaying: { type: Boolean, default: false },
		isAnimationLooping: { type: Boolean, default: false },

		// Mobile detection
		isMobile: { type: Boolean, default: false },

		// Cache stats
		cacheStats: { 
			type: Object, 
			default: () => ({ enabled: false, count: 0, sizeMB: 0, hits: 0, misses: 0, hitRate: 0 }) 
		},
	},

	emits: [
		'panel-opened',
		'panel-closed',
		'reset-view',
		'fit-to-view',
		'toggle-auto-rotate',
		'toggle-projection',
		'toggle-grid',
		'toggle-axes',
		'toggle-wireframe',
		'change-background',
		'toggle-measurement',
		'toggle-annotation',
		'toggle-comparison',
		'cycle-performance-mode',
		'cycle-theme',
		'toggle-stats',
		'take-screenshot',
		'export-model',
		'send-to-slicer',
		'clear-cache',
		'toggle-help',
		'toggle-animation-play',
		'toggle-animation-loop',
	],

	setup(props, { emit }) {
		const isOpen = ref(false)
		const exportSelect = ref(null)

		// Section collapse states (all open by default)
		const sections = ref({
			view: true,
			display: true,
			tools: true,
			settings: true,
		})

		// Computed property to check if dark theme is active
		const isDarkTheme = computed(() => {
			return props.themeMode === 'dark'
		})

		/**
		 * Toggle panel open/closed
		 */
		const togglePanel = () => {
			isOpen.value = !isOpen.value
			emit(isOpen.value ? 'panel-opened' : 'panel-closed')

			// Save state to localStorage
			try {
				localStorage.setItem('3dviewer-panel-open', isOpen.value)
			} catch (e) {
				// Ignore localStorage errors
			}
		}

		/**
		 * Close panel
		 */
		const closePanel = () => {
			if (isOpen.value) {
				isOpen.value = false
				emit('panel-closed')

				try {
					localStorage.setItem('3dviewer-panel-open', 'false')
				} catch (e) {
					// Ignore localStorage errors
				}
			}
		}

		/**
		 * Toggle section collapsed state
		 * @param sectionName
		 */
		const toggleSection = (sectionName) => {
			sections.value[sectionName] = !sections.value[sectionName]

			// Save section states
			try {
				localStorage.setItem('3dviewer-panel-sections', JSON.stringify(sections.value))
			} catch (e) {
				// Ignore localStorage errors
			}
		}

		/**
		 * Handle keyboard shortcuts
		 * @param event
		 */
		const handleKeyPress = (event) => {
			// T key to toggle panel
			if (event.key === 't' || event.key === 'T') {
				// Don't trigger if user is typing in an input
				if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
					return
				}
				togglePanel()
			}

			// Escape key to close panel
			if (event.key === 'Escape' && isOpen.value) {
				closePanel()
			}
		}

		// Restore saved state on mount
		onMounted(() => {
			// Restore panel open state
			try {
				const savedState = localStorage.getItem('3dviewer-panel-open')
				if (savedState !== null) {
					isOpen.value = savedState === 'true'
				}

				// Restore section states
				const savedSections = localStorage.getItem('3dviewer-panel-sections')
				if (savedSections) {
					sections.value = { ...sections.value, ...JSON.parse(savedSections) }
				}
			} catch (e) {
				// Ignore localStorage errors
			}

			// Add keyboard listener
			window.addEventListener('keydown', handleKeyPress)
		})

		// Cleanup on unmount
		onBeforeUnmount(() => {
			window.removeEventListener('keydown', handleKeyPress)
		})

		/**
		 * Handle export format selection
		 * @param format
		 */
		const handleExportChange = (format) => {
			if (format) {
				emit('export-model', format)
				// Reset select after emitting
				if (exportSelect.value) {
					exportSelect.value.value = ''
				}
			}
		}

		/**
		 * Cycle through performance modes
		 */
		const cyclePerformanceMode = () => {
			const modes = ['auto', 'low', 'balanced', 'high', 'ultra']
			const currentIndex = modes.indexOf(props.performanceMode)
			const nextIndex = (currentIndex + 1) % modes.length
			const nextMode = modes[nextIndex]
			emit('cycle-performance-mode', nextMode)
		}

		/**
		 * Get display text for current performance mode
		 */
		const getPerformanceModeText = () => {
			switch (props.performanceMode) {
			case 'low': return t('threedviewer', 'Low')
			case 'balanced': return t('threedviewer', 'Balanced')
			case 'high': return t('threedviewer', 'High')
			case 'ultra': return t('threedviewer', 'Ultra')
			case 'auto':
			default: return t('threedviewer', 'Auto')
			}
		}

		/**
		 * Cycle through theme modes
		 */
		const cycleTheme = () => {
			const modes = ['auto', 'light', 'dark']
			const currentIndex = modes.indexOf(props.themeMode)
			const nextIndex = (currentIndex + 1) % modes.length
			const nextMode = modes[nextIndex]
			emit('cycle-theme', nextMode)
		}

		/**
		 * Get display text for current theme
		 */
		const getThemeText = () => {
			switch (props.themeMode) {
			case 'light': return t('threedviewer', 'Light')
			case 'dark': return t('threedviewer', 'Dark')
			case 'auto':
			default: return t('threedviewer', 'Auto')
			}
		}

		/**
		 * Get icon for current theme
		 */
		const getThemeIcon = () => {
			switch (props.themeMode) {
			case 'light': return '☀️'
			case 'dark': return '🌙'
			case 'auto':
			default: return '🌓'
			}
		}

		return {
			t,
			isOpen,
			sections,
			exportSelect,
			isDarkTheme,
			togglePanel,
			closePanel,
			toggleSection,
			handleExportChange,
			cyclePerformanceMode,
			getPerformanceModeText,
			cycleTheme,
			getThemeText,
			getThemeIcon,
			emit,
		}
	},

	// Expose methods for parent component access
	expose: ['togglePanel', 'closePanel'],
}
</script>

<style scoped>

/* Backdrop (mobile only) */
.panel-backdrop {
	position: fixed;
	top: 0;
	inset-inline: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.5);
	z-index: 1001;
	backdrop-filter: blur(4px);
}

/* Slide-Out Panel */
.slide-out-panel {
	position: fixed;
	top: 50px; /* Account for Nextcloud header */
	inset-inline-end: 0;
	bottom: 0;
	width: 320px;
	background: var(--color-main-background);
	color: var(--color-main-text);
	box-shadow: -4px 0 20px rgba(0, 0, 0, 0.2);
	z-index: 1002;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	border-left: 1px solid var(--color-border);
}

/* Panel Header */
.panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 20px;
	background: var(--color-background-dark);
	border-bottom: 1px solid var(--color-border);
}

.panel-title {
	font-size: 18px;
	font-weight: 600;
	margin: 0;
	color: var(--color-main-text);
}

.close-btn {
	background: transparent;
	border: none;
	color: var(--color-main-text);
	font-size: 28px;
	line-height: 1;
	cursor: pointer;
	padding: 4px 8px;
	border-radius: 4px;
	transition: background 0.2s ease;
}

.close-btn:hover {
	background: var(--color-background-hover);
}

/* Panel Content */
.panel-content {
	flex: 1;
	overflow: hidden auto;
	padding: 8px;
}

/* Custom scrollbar */
.panel-content::-webkit-scrollbar {
	width: 8px;
}

.panel-content::-webkit-scrollbar-track {
	background: var(--color-background-dark);
}

.panel-content::-webkit-scrollbar-thumb {
	background: var(--color-border);
	border-radius: 4px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
	background: var(--color-border-dark);
}

/* Panel Sections */
.panel-section {
	margin-bottom: 8px;
	background: var(--color-background-hover);
	border-radius: 8px;
	overflow: hidden;
}

.section-header {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px 16px;
	background: transparent;
	border: none;
	color: var(--color-main-text);
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: background 0.2s ease;
	text-align: start;
}

.section-header:hover {
	background: var(--color-background-hover);
}

.section-icon {
	font-size: 18px;
}

.section-title {
	flex: 1;
}

.expand-icon {
	font-size: 12px;
	opacity: 0.6;
}

.section-content {
	padding: 8px;
}

/* Tool Buttons */
.tool-btn {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 16px;
	background: var(--color-main-background);
	border: 1px solid var(--color-border);
	border-radius: 6px;
	color: var(--color-main-text);
	font-size: 14px;
	cursor: pointer;
	transition: all 0.2s ease;
	margin-bottom: 6px;
	text-align: start;
}

.tool-btn:hover {
	background: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.tool-btn.active {
	background: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text);
}

.tool-btn:last-child {
	margin-bottom: 0;
}

.tool-icon {
	font-size: 18px;
}

.tool-label {
	flex: 1;
}

.toggle-indicator {
	font-size: 16px;
	color: var(--color-primary-element);
	font-weight: bold;
}

.active-badge {
	padding: 2px 8px;
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
	font-size: 11px;
	font-weight: 600;
	border-radius: 10px;
	text-transform: uppercase;
}

/* Tool Groups */
.tool-group {
	padding: 12px 16px;
	background: var(--color-main-background);
	border: 1px solid var(--color-border);
	border-radius: 6px;
	margin-bottom: 6px;
	transition: all 0.2s ease;
}

.tool-group:hover {
	background: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.tool-label-small {
	display: block;
	font-size: 12px;
	color: var(--color-text-maxcontrast);
	margin-bottom: 8px;
	font-weight: 500;
}

.animation-controls {
	display: flex;
	gap: 6px;
}

.animation-controls .tool-btn {
	flex: 1;
	margin-bottom: 0;
}

.preset-select,
.export-select {
	width: 100%;
	padding: 8px 12px;
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 4px;
	color: var(--color-main-text);
	font-size: 13px;
	cursor: pointer;
	transition: all 0.2s ease;
}

.preset-select:hover,
.export-select:hover:not(:disabled) {
	background: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.preset-select:focus,
.export-select:focus {
	outline: none;
	border-color: var(--color-primary-element);
	box-shadow: 0 0 0 2px var(--color-primary-element-light);
}

.export-select:disabled {
	opacity: 0.5;
	cursor: not-allowed;
	background: var(--color-background-dark);
}

.preset-select option,
.export-select option {
	background: var(--color-main-background);
	color: var(--color-main-text);
}

.color-picker-wrapper {
	display: flex;
	gap: 8px;
	align-items: center;
}

.color-input {
	flex: 1;
	height: 36px;
	border: 1px solid var(--color-border);
	border-radius: 4px;
	cursor: pointer;
	background: transparent;
}

.reset-color-btn {
	padding: 8px 12px;
	background: var(--color-background-hover);
	border: 1px solid var(--color-border);
	border-radius: 4px;
	color: var(--color-main-text);
	font-size: 12px;
	cursor: pointer;
	transition: all 0.2s ease;
}

.reset-color-btn:hover {
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
}

/* Cache Management */
.cache-group {
	margin-top: 12px;
	padding-top: 12px;
	border-top: 1px solid var(--color-border);
}

.cache-info {
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 4px;
	padding: 10px;
	margin-bottom: 8px;
}

.cache-stat-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 4px 0;
	font-size: 12px;
}

.cache-stat-row:not(:last-child) {
	border-bottom: 1px solid var(--color-border);
	padding-bottom: 6px;
	margin-bottom: 4px;
}

.cache-stat-label {
	color: var(--color-text-maxcontrast);
	font-weight: 500;
}

.cache-stat-value {
	color: var(--color-main-text);
	font-weight: 600;
}

.cache-stat-value.good {
	color: #4caf50;
}

.cache-stat-value.warning {
	color: #ff9800;
}

.cache-stat-value.poor {
	color: #f44336;
}

.cache-clear-btn {
	width: 100%;
	margin-top: 8px;
}

/* Panel Footer */
.panel-footer {
	padding: 12px 20px;
	background: var(--color-background-dark);
	border-top: 1px solid var(--color-border);
	text-align: center;
}

.keyboard-hint {
	font-size: 12px;
	color: var(--color-text-maxcontrast);
	font-style: italic;
}

/* Animations */
.slide-panel-enter-active,
.slide-panel-leave-active {
	transition: transform 0.3s ease;
}

.slide-panel-enter-from {
	transform: translateX(100%);
}

.slide-panel-leave-to {
	transform: translateX(100%);
}

/* Mobile Styles */
.slide-out-panel.mobile {
	top: auto;
	inset-inline: 0;
	bottom: 0;
	width: 100%;
	max-height: 70vh;
	border-radius: 16px 16px 0 0;
}

.slide-panel-enter-from.mobile,
.slide-panel-leave-to.mobile {
	transform: translateY(100%);
}

/* Dark theme support - Component-level class binding */
.slide-out-panel.dark-theme {
	background: #2a2a2a !important;
	color: #ffffff !important;
	box-shadow: -4px 0 20px rgba(0, 0, 0, 0.4) !important;
	border-left-color: rgba(255, 255, 255, 0.1) !important;
}

.slide-out-panel.dark-theme .panel-header {
	background: #2a2a2a !important;
	border-bottom-color: rgba(255, 255, 255, 0.1) !important;
}

.slide-out-panel.dark-theme .panel-title,
.slide-out-panel.dark-theme .close-btn {
	color: #ffffff !important;
}

.slide-out-panel.dark-theme .close-btn:hover {
	background: rgba(255, 255, 255, 0.1) !important;
}

.slide-out-panel.dark-theme .panel-content::-webkit-scrollbar-track {
	background: rgba(255, 255, 255, 0.05) !important;
}

.slide-out-panel.dark-theme .panel-content::-webkit-scrollbar-thumb {
	background: rgba(255, 255, 255, 0.2) !important;
}

.slide-out-panel.dark-theme .panel-content::-webkit-scrollbar-thumb:hover {
	background: rgba(255, 255, 255, 0.3) !important;
}

.slide-out-panel.dark-theme .panel-section {
	background: rgba(255, 255, 255, 0.05) !important;
}

.slide-out-panel.dark-theme .section-header {
	color: #ffffff !important;
}

.slide-out-panel.dark-theme .section-header:hover {
	background: rgba(255, 255, 255, 0.1) !important;
}

.slide-out-panel.dark-theme .tool-btn {
	background: #333333 !important;
	border-color: rgba(255, 255, 255, 0.2) !important;
	color: #ffffff !important;
}

.slide-out-panel.dark-theme .tool-btn:hover {
	background: rgba(255, 255, 255, 0.15) !important;
	border-color: #4287f5 !important;
}

.slide-out-panel.dark-theme .tool-btn.active {
	background: #4287f5 !important;
	border-color: #4287f5 !important;
	color: #ffffff !important;
}

.slide-out-panel.dark-theme .tool-group {
	background: #333333 !important;
	border-color: rgba(255, 255, 255, 0.2) !important;
}

.slide-out-panel.dark-theme .tool-group:hover {
	background: rgba(255, 255, 255, 0.1) !important;
	border-color: #4287f5 !important;
}

.slide-out-panel.dark-theme .tool-label-small {
	color: rgba(255, 255, 255, 0.7) !important;
}

.slide-out-panel.dark-theme .preset-select,
.slide-out-panel.dark-theme .export-select {
	background: #333333 !important;
	border-color: rgba(255, 255, 255, 0.2) !important;
	color: #ffffff !important;
}

.slide-out-panel.dark-theme .preset-select:hover,
.slide-out-panel.dark-theme .export-select:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.1) !important;
	border-color: #4287f5 !important;
}

.slide-out-panel.dark-theme .preset-select option,
.slide-out-panel.dark-theme .export-select option {
	background: #2a2a2a !important;
	color: #ffffff !important;
}

.slide-out-panel.dark-theme .color-input {
	border-color: rgba(255, 255, 255, 0.2) !important;
}

.slide-out-panel.dark-theme .reset-color-btn {
	background: rgba(255, 255, 255, 0.1) !important;
	border-color: rgba(255, 255, 255, 0.2) !important;
	color: #ffffff !important;
}

.slide-out-panel.dark-theme .reset-color-btn:hover {
	background: rgba(255, 255, 255, 0.2) !important;
}

.slide-out-panel.dark-theme .panel-footer {
	background: #1f1f1f !important;
	border-top-color: rgba(255, 255, 255, 0.1) !important;
}

.slide-out-panel.dark-theme .keyboard-hint {
	color: rgba(255, 255, 255, 0.6) !important;
}

.slide-out-panel.dark-theme .toggle-indicator {
	color: #4287f5 !important;
}

.slide-out-panel.dark-theme .active-badge {
	background: #4287f5 !important;
	color: #ffffff !important;
}

.slide-out-panel.dark-theme .expand-icon {
	color: rgba(255, 255, 255, 0.6) !important;
}

/* Light theme support - Subtle shadow for light backgrounds */
:global(.theme--light) .slide-out-panel {
	box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
	border-left-color: rgba(0, 0, 0, 0.1);
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
	.slide-panel-enter-active,
	.slide-panel-leave-active,
	.panel-toggle-btn,
	.tool-btn {
		transition: none;
	}
}

/* RTL (Right-to-Left) Support */
[dir="rtl"] .slide-out-panel {
	inset-inline: 0 auto;
	box-shadow: 4px 0 20px rgb(0 0 0 / 10%);
}

[dir="rtl"] .panel-toggle-btn {
	inset-inline: 10px auto;
}

[dir="rtl"] .panel-toggle-btn .toggle-icon {
	transform: scaleX(-1); /* Flip arrow direction */
}

[dir="rtl"] .expand-icon {
	transform: scaleX(-1); /* Flip expand arrows */
}

/* Slide transitions for RTL */
[dir="rtl"] .slide-panel-enter-active {
	animation: slide-in-left 0.3s ease;
}

[dir="rtl"] .slide-panel-leave-active {
	animation: slide-out-left 0.3s ease;
}

@keyframes slide-in-left {
	from {
		transform: translateX(-100%);
	}

	to {
		transform: translateX(0);
	}
}

@keyframes slide-out-left {
	from {
		transform: translateX(0);
	}

	to {
		transform: translateX(-100%);
	}
}
</style>
