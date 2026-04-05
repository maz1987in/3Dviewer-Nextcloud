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
				:class="{ 'mobile': isMobile }"
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
							aria-controls="panel-section-view"
							@click="toggleSection('view')">
							<span class="section-icon">📷</span>
							<span class="section-title">{{ t('threedviewer', 'View') }}</span>
							<span class="expand-icon">{{ sections.view ? '▼' : '▶' }}</span>
						</button>
						<div id="panel-section-view" v-show="sections.view" class="section-content">
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
							<!-- Bookmarks -->
							<div class="tool-group">
								<label class="tool-label-small">{{ t('threedviewer', 'Bookmarks') }}</label>
								<button class="tool-btn"
									:disabled="!modelLoaded"
									@click="emit('add-bookmark')">
									<span class="tool-icon">🔖</span>
									<span class="tool-label">{{ t('threedviewer', 'Save View') }}</span>
								</button>
								<div v-if="bookmarks.length > 0" class="bookmark-list">
									<div v-for="(bm, i) in bookmarks" :key="i" class="bookmark-item">
										<button class="bookmark-name" @click="emit('load-bookmark', i)">
											{{ bm.name }}
										</button>
										<button class="bookmark-delete"
											:title="t('threedviewer', 'Remove')"
											@click="emit('remove-bookmark', i)">
											×
										</button>
									</div>
								</div>
							</div>
						</div>
					</section>

					<!-- SCENE Section (was Display) -->
					<section class="panel-section">
						<button class="section-header"
							:aria-expanded="sections.scene"
							aria-controls="panel-section-scene"
							@click="toggleSection('scene')">
							<span class="section-icon">🎨</span>
							<span class="section-title">{{ t('threedviewer', 'Scene') }}</span>
							<span class="expand-icon">{{ sections.scene ? '▼' : '▶' }}</span>
						</button>
						<div id="panel-section-scene" v-show="sections.scene" class="section-content">
							<label class="toggle-row" @click.prevent="emit('toggle-grid')">
								<span class="toggle-switch" :class="{ on: grid }" />
								<span class="toggle-text">{{ t('threedviewer', 'Grid') }}</span>
							</label>
							<label class="toggle-row" @click.prevent="emit('toggle-axes')">
								<span class="toggle-switch" :class="{ on: axes }" />
								<span class="toggle-text">{{ t('threedviewer', 'Axes') }}</span>
							</label>
							<label class="toggle-row" @click.prevent="emit('toggle-wireframe')">
								<span class="toggle-switch" :class="{ on: wireframe }" />
								<span class="toggle-text">{{ t('threedviewer', 'Wireframe') }}</span>
							</label>
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
							<!-- Lighting Presets -->
							<div v-if="lightingPresets.length > 0" class="tool-group">
								<label class="tool-label-small">{{ t('threedviewer', 'Lighting') }}</label>
								<div class="preset-buttons">
									<button v-for="preset in lightingPresets" :key="preset.name"
										class="preset-btn"
										:class="{ 'active': lightingPreset === preset.name }"
										@click="emit('apply-lighting-preset', preset.name)">
										{{ preset.label }}
									</button>
								</div>
							</div>
						</div>
					</section>

					<!-- ANALYZE Section (was Tools) -->
					<section class="panel-section">
						<button class="section-header"
							:aria-expanded="sections.analyze"
							aria-controls="panel-section-analyze"
							@click="toggleSection('analyze')">
							<span class="section-icon">📐</span>
							<span class="section-title">{{ t('threedviewer', 'Analyze') }}</span>
							<span class="expand-icon">{{ sections.analyze ? '▼' : '▶' }}</span>
						</button>
						<div id="panel-section-analyze" v-show="sections.analyze" class="section-content">
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
							<!-- Clipping Plane / Cross-Section -->
							<button class="tool-btn feature-btn"
								:class="{ 'active': clippingActive }"
								:disabled="!modelLoaded"
								@click="emit('toggle-clipping')">
								<span class="tool-icon">✂️</span>
								<span class="tool-label">{{ t('threedviewer', 'Cross-Section') }}</span>
								<span v-if="clippingActive" class="active-badge">{{ t('threedviewer', 'Active') }}</span>
							</button>
							<div v-if="clippingActive" class="clipping-controls">
								<div class="axis-buttons">
									<button v-for="a in ['x','y','z']" :key="a"
										class="axis-btn"
										:class="{ 'active': clippingAxis === a }"
										@click="emit('set-clipping-axis', a)">
										{{ a.toUpperCase() }}
									</button>
									<button class="axis-btn"
										:class="{ 'active': clippingFlipped }"
										:title="t('threedviewer', 'Flip direction')"
										@click="emit('toggle-clipping-flip')">
										↕
									</button>
								</div>
								<input type="range"
									class="clipping-slider"
									min="-1" max="1" step="0.01"
									:value="clippingPosition"
									@input="emit('set-clipping-position', parseFloat($event.target.value))">
							</div>
							<!-- Exploded View -->
							<button v-if="explodedViewAvailable"
								class="tool-btn feature-btn"
								:class="{ 'active': explodedViewActive }"
								@click="emit('toggle-exploded-view')">
								<span class="tool-icon">💥</span>
								<span class="tool-label">{{ t('threedviewer', 'Exploded View') }}</span>
								<span v-if="explodedViewActive" class="active-badge">{{ t('threedviewer', 'Active') }}</span>
							</button>
							<div v-if="explodedViewActive" class="tool-group">
								<label class="tool-label-small">{{ t('threedviewer', 'Explosion') }}</label>
								<input type="range"
									class="clipping-slider"
									min="0" max="1" step="0.01"
									:value="explodedViewFactor"
									@input="emit('set-exploded-factor', parseFloat($event.target.value))">
							</div>
							<!-- Model Statistics -->
							<button class="tool-btn"
								:disabled="!modelLoaded"
								@click="emit('toggle-stats')">
								<span class="tool-icon">📊</span>
								<span class="tool-label">{{ t('threedviewer', 'Model Statistics') }}</span>
							</button>
						</div>
					</section>

					<!-- ANIMATION Section (conditional) -->
					<section v-if="hasAnimations" class="panel-section">
						<button class="section-header"
							:aria-expanded="sections.animation"
							aria-controls="panel-section-animation"
							@click="toggleSection('animation')">
							<span class="section-icon">▶️</span>
							<span class="section-title">{{ t('threedviewer', 'Animation') }}</span>
							<span class="expand-icon">{{ sections.animation ? '▼' : '▶' }}</span>
						</button>
						<div id="panel-section-animation" v-show="sections.animation" class="section-content">
							<div class="animation-controls">
								<button class="tool-btn"
									:class="{ 'active': isAnimationPlaying }"
									@click="emit('toggle-animation-play')">
									<span class="tool-icon">{{ isAnimationPlaying ? '⏸️' : '▶️' }}</span>
									<span class="tool-label">{{ isAnimationPlaying ? t('threedviewer', 'Pause') : t('threedviewer', 'Play') }}</span>
								</button>
								<label class="toggle-row" @click.prevent="emit('toggle-animation-loop')">
									<span class="toggle-switch" :class="{ on: isAnimationLooping }" />
									<span class="toggle-text">{{ t('threedviewer', 'Loop') }}</span>
								</label>
							</div>
							<!-- Timeline scrubber -->
							<div v-if="animationDuration > 0" class="timeline-scrubber">
								<div class="timeline-row">
									<button class="step-btn" :title="t('threedviewer', 'Step back')" @click="emit('animation-step-backward')">⏮</button>
									<input type="range"
										class="timeline-slider"
										:min="0"
										:max="animationDuration"
										:step="animationDuration / 100"
										:value="animationCurrentTime"
										@input="emit('animation-seek', parseFloat($event.target.value))">
									<button class="step-btn" :title="t('threedviewer', 'Step forward')" @click="emit('animation-step-forward')">⏭</button>
								</div>
								<div class="timeline-time">
									{{ animationCurrentTime.toFixed(2) }}s / {{ animationDuration.toFixed(2) }}s
								</div>
							</div>
						</div>
					</section>

					<!-- EXPORT Section (extracted from Settings) -->
					<section class="panel-section">
						<button class="section-header"
							:aria-expanded="sections.export"
							aria-controls="panel-section-export"
							@click="toggleSection('export')">
							<span class="section-icon">📤</span>
							<span class="section-title">{{ t('threedviewer', 'Export') }}</span>
							<span class="expand-icon">{{ sections.export ? '▼' : '▶' }}</span>
						</button>
						<div id="panel-section-export" v-show="sections.export" class="section-content">
							<button class="tool-btn" @click="emit('take-screenshot')">
								<span class="tool-icon">📷</span>
								<span class="tool-label">{{ t('threedviewer', 'Screenshot') }}</span>
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
							<button class="tool-btn"
								:disabled="!modelLoaded"
								@click="emit('send-to-slicer')">
								<span class="tool-icon">🖨️</span>
								<span class="tool-label">{{ t('threedviewer', 'Send to Slicer') }}</span>
							</button>
						</div>
					</section>

					<!-- SETTINGS Section (slimmed) -->
					<section class="panel-section">
						<button class="section-header"
							:aria-expanded="sections.settings"
							aria-controls="panel-section-settings"
							@click="toggleSection('settings')">
							<span class="section-icon">⚙️</span>
							<span class="section-title">{{ t('threedviewer', 'Settings') }}</span>
							<span class="expand-icon">{{ sections.settings ? '▼' : '▶' }}</span>
						</button>
						<div id="panel-section-settings" v-show="sections.settings" class="section-content">
							<button class="tool-btn" @click="cyclePerformanceMode">
								<span class="tool-icon">⚡</span>
								<span class="tool-label">{{ t('threedviewer', 'Performance') }}: {{ getPerformanceModeText() }}</span>
							</button>
							<button class="tool-btn" @click="cycleTheme">
								<span class="tool-icon">{{ getThemeIcon() }}</span>
								<span class="tool-label">{{ t('threedviewer', 'Theme') }}: {{ getThemeText() }}</span>
							</button>
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
import { ref, onMounted, onBeforeUnmount } from 'vue'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'

export default {
	name: 'SlideOutToolPanel',

	props: {
		// View props
		autoRotate: { type: Boolean, default: false },
		cameraType: { type: String, default: 'perspective' },

		// Scene props
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
		animationCurrentTime: { type: Number, default: 0 },
		animationDuration: { type: Number, default: 0 },

		// Clipping plane props
		clippingActive: { type: Boolean, default: false },
		clippingAxis: { type: String, default: 'y' },
		clippingPosition: { type: Number, default: 0 },
		clippingFlipped: { type: Boolean, default: false },

		// Lighting preset
		lightingPreset: { type: String, default: 'default' },
		lightingPresets: { type: Array, default: () => [] },

		// Bookmarks
		bookmarks: { type: Array, default: () => [] },

		// Exploded view
		explodedViewActive: { type: Boolean, default: false },
		explodedViewAvailable: { type: Boolean, default: false },
		explodedViewFactor: { type: Number, default: 0 },

		// Mobile detection
		isMobile: { type: Boolean, default: false },

		// Cache stats
		cacheStats: {
			type: Object,
			default: () => ({ enabled: false, count: 0, sizeMB: 0, hits: 0, misses: 0, hitRate: 0 }),
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
		'animation-seek',
		'animation-step-forward',
		'animation-step-backward',
		'toggle-clipping',
		'set-clipping-axis',
		'set-clipping-position',
		'toggle-clipping-flip',
		'apply-lighting-preset',
		'add-bookmark',
		'load-bookmark',
		'remove-bookmark',
		'toggle-exploded-view',
		'set-exploded-factor',
	],

	setup(props, { emit }) {
		const isOpen = ref(false)
		const exportSelect = ref(null)

		// Section collapse states
		const sections = ref({
			view: true,
			scene: true,
			analyze: true,
			animation: true,
			export: false,
			settings: false,
		})

		const togglePanel = () => {
			isOpen.value = !isOpen.value
			emit(isOpen.value ? 'panel-opened' : 'panel-closed')
			try { localStorage.setItem('3dviewer-panel-open', isOpen.value) } catch { /* ignore */ }
		}

		const closePanel = () => {
			if (isOpen.value) {
				isOpen.value = false
				emit('panel-closed')
				try { localStorage.setItem('3dviewer-panel-open', 'false') } catch { /* ignore */ }
			}
		}

		const toggleSection = (sectionName) => {
			sections.value[sectionName] = !sections.value[sectionName]
			try { localStorage.setItem('3dviewer-panel-sections', JSON.stringify(sections.value)) } catch { /* ignore */ }
		}

		const handleKeyPress = (event) => {
			if (event.key === 't' || event.key === 'T') {
				if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') return
				togglePanel()
			}
			if (event.key === 'Escape' && isOpen.value) closePanel()
		}

		onMounted(() => {
			try {
				const savedState = localStorage.getItem('3dviewer-panel-open')
				if (savedState !== null) isOpen.value = savedState === 'true'

				const savedSections = localStorage.getItem('3dviewer-panel-sections')
				if (savedSections) {
					const parsed = JSON.parse(savedSections)
					// Migrate old section keys
					if ('display' in parsed) { parsed.scene = parsed.display; delete parsed.display }
					if ('tools' in parsed) { parsed.analyze = parsed.tools; delete parsed.tools }
					sections.value = { ...sections.value, ...parsed }
				}
			} catch { /* ignore */ }

			window.addEventListener('keydown', handleKeyPress)
		})

		onBeforeUnmount(() => {
			window.removeEventListener('keydown', handleKeyPress)
		})

		const handleExportChange = (format) => {
			if (format) {
				emit('export-model', format)
				if (exportSelect.value) exportSelect.value.value = ''
			}
		}

		const cyclePerformanceMode = () => {
			const modes = ['auto', 'low', 'balanced', 'high', 'ultra']
			const currentIndex = modes.indexOf(props.performanceMode)
			emit('cycle-performance-mode', modes[(currentIndex + 1) % modes.length])
		}

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

		const cycleTheme = () => {
			const modes = ['auto', 'light', 'dark']
			const currentIndex = modes.indexOf(props.themeMode)
			emit('cycle-theme', modes[(currentIndex + 1) % modes.length])
		}

		const getThemeText = () => {
			switch (props.themeMode) {
			case 'light': return t('threedviewer', 'Light')
			case 'dark': return t('threedviewer', 'Dark')
			case 'auto':
			default: return t('threedviewer', 'Auto')
			}
		}

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
	top: 50px;
	inset-inline-end: 0;
	bottom: 0;
	width: 320px;
	background: var(--color-main-background);
	color: var(--color-main-text);
	box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
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
	padding: 12px 20px;
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

.panel-content::-webkit-scrollbar { width: 8px; }
.panel-content::-webkit-scrollbar-track { background: var(--color-background-dark); }
.panel-content::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }
.panel-content::-webkit-scrollbar-thumb:hover { background: var(--color-border-dark); }

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

.section-header:hover { background: var(--color-background-hover); }
.section-icon { font-size: 18px; }
.section-title { flex: 1; }
.expand-icon { font-size: 12px; opacity: 0.6; }

.section-content { padding: 8px; }

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

.tool-btn:last-child { margin-bottom: 0; }
.tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.tool-icon { font-size: 18px; }
.tool-label { flex: 1; }

.active-badge {
	padding: 2px 8px;
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
	font-size: 11px;
	font-weight: 600;
	border-radius: 10px;
	text-transform: uppercase;
}

/* Toggle switch rows */
.toggle-row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
	cursor: pointer;
	border-radius: 6px;
	transition: background 0.15s ease;
	margin-bottom: 4px;
}

.toggle-row:hover {
	background: var(--color-background-hover);
}

.toggle-switch {
	position: relative;
	width: 36px;
	height: 20px;
	background: var(--color-border);
	border-radius: 10px;
	flex-shrink: 0;
	transition: background 0.2s ease;
}

.toggle-switch::after {
	content: '';
	position: absolute;
	top: 2px;
	inset-inline-start: 2px;
	width: 16px;
	height: 16px;
	background: var(--color-main-background);
	border-radius: 50%;
	transition: transform 0.2s ease;
	box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
}

.toggle-switch.on {
	background: var(--color-primary-element);
}

.toggle-switch.on::after {
	transform: translateX(16px);
}

[dir="rtl"] .toggle-switch.on::after {
	transform: translateX(-16px);
}

.toggle-text {
	font-size: 14px;
	color: var(--color-main-text);
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

/* Animation Controls */
.animation-controls {
	display: flex;
	gap: 6px;
	align-items: center;
}

.animation-controls .tool-btn {
	flex: 1;
	margin-bottom: 0;
}

.animation-controls .toggle-row {
	padding: 6px 12px;
	margin-bottom: 0;
}

/* Timeline scrubber */
.timeline-scrubber { margin-top: 8px; }

.timeline-row {
	display: flex;
	align-items: center;
	gap: 4px;
}

.step-btn {
	background: transparent;
	border: 1px solid var(--color-border);
	border-radius: 4px;
	color: var(--color-main-text);
	cursor: pointer;
	padding: 2px 6px;
	font-size: 12px;
	line-height: 1;
}

.step-btn:hover { background: var(--color-background-hover); }

.timeline-slider {
	flex: 1;
	height: 4px;
	accent-color: var(--color-primary-element);
	cursor: pointer;
}

.timeline-time {
	font-size: 11px;
	color: var(--color-text-maxcontrast);
	text-align: center;
	margin-top: 4px;
}

/* Clipping controls */
.clipping-controls {
	padding: 8px 16px 0;
}

.axis-buttons {
	display: flex;
	gap: 4px;
	margin-bottom: 8px;
}

.axis-btn {
	flex: 1;
	padding: 4px 8px;
	border: 1px solid var(--color-border);
	border-radius: 4px;
	background: var(--color-main-background);
	color: var(--color-main-text);
	cursor: pointer;
	font-size: 12px;
	font-weight: 600;
	text-align: center;
	transition: all 0.15s ease;
}

.axis-btn:hover { background: var(--color-background-hover); }

.axis-btn.active {
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
	border-color: var(--color-primary-element);
}

.clipping-slider {
	width: 100%;
	accent-color: var(--color-primary-element);
	cursor: pointer;
}

/* Lighting preset buttons */
.preset-buttons {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.preset-btn {
	padding: 4px 10px;
	border: 1px solid var(--color-border);
	border-radius: 4px;
	background: var(--color-main-background);
	color: var(--color-main-text);
	cursor: pointer;
	font-size: 11px;
	transition: all 0.15s ease;
}

.preset-btn:hover { background: var(--color-background-hover); }

.preset-btn.active {
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
	border-color: var(--color-primary-element);
}

/* Bookmark list */
.bookmark-list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-top: 6px;
}

.bookmark-item {
	display: flex;
	align-items: center;
	gap: 4px;
}

.bookmark-name {
	flex: 1;
	padding: 4px 8px;
	border: 1px solid var(--color-border);
	border-radius: 4px;
	background: var(--color-main-background);
	color: var(--color-main-text);
	cursor: pointer;
	font-size: 12px;
	text-align: start;
	text-overflow: ellipsis;
	overflow: hidden;
	white-space: nowrap;
	transition: background 0.15s ease;
}

.bookmark-name:hover { background: var(--color-background-hover); }

.bookmark-delete {
	background: transparent;
	border: none;
	color: var(--color-text-maxcontrast);
	cursor: pointer;
	font-size: 16px;
	padding: 2px 6px;
	border-radius: 4px;
}

.bookmark-delete:hover {
	color: var(--color-error-text, #c00);
	background: var(--color-error, #ffe7e7);
}

/* Export select */
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

.export-select:hover:not(:disabled) {
	background: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.export-select:focus {
	outline: none;
	border-color: var(--color-primary-element);
	box-shadow: 0 0 0 2px var(--color-primary-element-light);
}

.export-select:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.export-select option {
	background: var(--color-main-background);
	color: var(--color-main-text);
}

/* Color Picker */
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
	margin-top: 0;
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

.cache-stat-value.good { color: var(--color-success-text, #2e7d32); }
.cache-stat-value.warning { color: var(--color-warning-text, #e65100); }
.cache-stat-value.poor { color: var(--color-error-text, #c62828); }

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

.slide-panel-enter-from,
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

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
	.slide-panel-enter-active,
	.slide-panel-leave-active,
	.tool-btn {
		transition: none;
	}
}

/* RTL (Right-to-Left) Support */
[dir="rtl"] .slide-out-panel {
	inset-inline: 0 auto;
	box-shadow: 4px 0 20px rgb(0 0 0 / 10%);
}

[dir="rtl"] .expand-icon {
	transform: scaleX(-1);
}

[dir="rtl"] .slide-panel-enter-active { animation: slide-in-left 0.3s ease; }
[dir="rtl"] .slide-panel-leave-active { animation: slide-out-left 0.3s ease; }

@keyframes slide-in-left {
	from { transform: translateX(-100%); }
	to { transform: translateX(0); }
}

@keyframes slide-out-left {
	from { transform: translateX(0); }
	to { transform: translateX(-100%); }
}
</style>
