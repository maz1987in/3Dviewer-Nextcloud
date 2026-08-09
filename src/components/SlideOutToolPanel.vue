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
						<ViewerIcon name="close" :size="16" />
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
							<span class="section-title">{{ t('threedviewer', 'View') }}</span>
							<ViewerIcon class="expand-icon"
								:class="{ collapsed: !sections.view }"
								name="chevron"
								:size="15" />
						</button>
						<div v-show="sections.view" id="panel-section-view" class="section-content">
							<button class="tool-btn" @click="emit('reset-view')">
								<ViewerIcon class="tool-icon" name="resetView" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Reset View') }}</span>
							</button>
							<button class="tool-btn" @click="emit('fit-to-view')">
								<ViewerIcon class="tool-icon" name="fitToView" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Fit to View') }}</span>
							</button>
							<button class="tool-btn"
								:class="{ 'active': autoRotate }"
								@click="emit('toggle-auto-rotate')">
								<ViewerIcon class="tool-icon" name="autoRotate" :size="17" />
								<span class="tool-label">{{ autoRotate ? t('threedviewer', 'Auto-Rotate On') : t('threedviewer', 'Auto-Rotate Off') }}</span>
							</button>
							<button class="tool-btn"
								:class="{ 'active': cameraType === 'orthographic' }"
								@click="emit('toggle-projection')">
								<ViewerIcon class="tool-icon" name="projection" :size="17" />
								<span class="tool-label">{{ cameraType === 'perspective' ? t('threedviewer', 'Perspective') : t('threedviewer', 'Orthographic') }}</span>
							</button>
							<!-- Copy shareable view link: encodes current camera state
							     (position, target, zoom) into the URL as a `cam=...`
							     parameter so others can open the same exact viewpoint.
							     Feedback is surfaced via a toast, not inline. -->
							<button class="tool-btn"
								:disabled="!modelLoaded"
								:title="t('threedviewer', 'Copy a link to this exact viewpoint')"
								@click="emit('copy-view-link')">
								<ViewerIcon class="tool-icon" name="copyLink" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Copy View Link') }}</span>
							</button>
							<!-- Bookmarks -->
							<div class="tool-group">
								<label class="tool-label-small">{{ t('threedviewer', 'Bookmarks') }}</label>
								<button class="tool-btn"
									:disabled="!modelLoaded"
									@click="emit('add-bookmark')">
									<ViewerIcon class="tool-icon" name="saveView" :size="17" />
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
							<span class="section-title">{{ t('threedviewer', 'Scene') }}</span>
							<ViewerIcon class="expand-icon"
								:class="{ collapsed: !sections.scene }"
								name="chevron"
								:size="15" />
						</button>
						<div v-show="sections.scene" id="panel-section-scene" class="section-content">
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
							<!-- Lighting Presets -->
							<div v-if="lightingPresets.length > 0" class="tool-group">
								<label class="tool-label-small">{{ t('threedviewer', 'Lighting') }}</label>
								<div class="preset-buttons">
									<button v-for="preset in lightingPresets"
										:key="preset.name"
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
							<span class="section-title">{{ t('threedviewer', 'Analyze') }}</span>
							<ViewerIcon class="expand-icon"
								:class="{ collapsed: !sections.analyze }"
								name="chevron"
								:size="15" />
						</button>
						<div v-show="sections.analyze" id="panel-section-analyze" class="section-content">
							<button class="tool-btn feature-btn"
								:class="{ 'active': measurementMode }"
								@click="emit('toggle-measurement')">
								<ViewerIcon class="tool-icon" name="measurement" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Measurement') }}</span>
								<span v-if="measurementMode" class="active-badge">{{ t('threedviewer', 'Active') }}</span>
							</button>
							<button class="tool-btn feature-btn"
								:class="{ 'active': annotationMode }"
								@click="emit('toggle-annotation')">
								<ViewerIcon class="tool-icon" name="annotation" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Annotation') }}</span>
								<span v-if="annotationMode" class="active-badge">{{ t('threedviewer', 'Active') }}</span>
							</button>
							<button class="tool-btn feature-btn"
								:class="{ 'active': comparisonMode }"
								@click="emit('toggle-comparison')">
								<ViewerIcon class="tool-icon" name="comparison" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Comparison') }}</span>
								<span v-if="comparisonMode" class="active-badge">{{ t('threedviewer', 'Active') }}</span>
							</button>
							<!-- Clipping Plane / Cross-Section -->
							<button class="tool-btn feature-btn"
								:class="{ 'active': clippingActive }"
								:disabled="!modelLoaded"
								@click="emit('toggle-clipping')">
								<ViewerIcon class="tool-icon" name="crossSection" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Cross-Section') }}</span>
								<span v-if="clippingActive" class="active-badge">{{ t('threedviewer', 'Active') }}</span>
							</button>
							<div v-if="clippingActive" class="clipping-controls">
								<!-- Mode switch: single plane vs 6-plane box -->
								<div class="axis-buttons clipping-mode-switch">
									<button class="axis-btn"
										:class="{ 'active': clippingMode === 'plane' }"
										:title="t('threedviewer', 'Single cross-section plane')"
										@click="emit('set-clipping-mode', 'plane')">
										{{ t('threedviewer', 'Plane') }}
									</button>
									<button class="axis-btn"
										:class="{ 'active': clippingMode === 'box' }"
										:title="t('threedviewer', '6-plane clipping box')"
										@click="emit('set-clipping-mode', 'box')">
										{{ t('threedviewer', 'Box') }}
									</button>
								</div>

								<!-- Plane mode: single axis + position slider -->
								<template v-if="clippingMode === 'plane'">
									<div class="axis-buttons">
										<button v-for="a in ['x','y','z']"
											:key="a"
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
										min="-1"
										max="1"
										step="0.01"
										:value="clippingPosition"
										@input="emit('set-clipping-position', parseFloat($event.target.value))">
								</template>

								<!-- Box mode: three axis rows, each with a −/+ pair of sliders
								     representing the offset inward from the min/max face. -->
								<template v-else>
									<div class="clipping-box-grid">
										<div v-for="axis in ['x', 'y', 'z']" :key="axis" class="clipping-box-row">
											<div class="clipping-box-label">
												{{ axis.toUpperCase() }}
											</div>
											<div class="clipping-box-pair">
												<span class="clipping-box-sublabel">−</span>
												<input type="range"
													class="clipping-slider clipping-slider-box"
													min="0"
													max="1"
													step="0.01"
													:value="clippingBoxOffsets[axis + 'Min']"
													:aria-label="t('threedviewer', '{axis} min face offset', { axis: axis.toUpperCase() })"
													@input="emit('set-clipping-box-offset', { face: axis + 'Min', value: parseFloat($event.target.value) })">
											</div>
											<div class="clipping-box-pair">
												<span class="clipping-box-sublabel">+</span>
												<input type="range"
													class="clipping-slider clipping-slider-box"
													min="0"
													max="1"
													step="0.01"
													:value="clippingBoxOffsets[axis + 'Max']"
													:aria-label="t('threedviewer', '{axis} max face offset', { axis: axis.toUpperCase() })"
													@input="emit('set-clipping-box-offset', { face: axis + 'Max', value: parseFloat($event.target.value) })">
											</div>
										</div>
									</div>
									<button class="axis-btn clipping-box-reset"
										:title="t('threedviewer', 'Reset all 6 box faces')"
										@click="emit('reset-clipping-box')">
										{{ t('threedviewer', 'Reset box') }}
									</button>
								</template>
							</div>
							<!-- Exploded View -->
							<button v-if="explodedViewAvailable"
								class="tool-btn feature-btn"
								:class="{ 'active': explodedViewActive }"
								@click="emit('toggle-exploded-view')">
								<ViewerIcon class="tool-icon" name="explode" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Exploded View') }}</span>
								<span v-if="explodedViewActive" class="active-badge">{{ t('threedviewer', 'Active') }}</span>
							</button>
							<div v-if="explodedViewActive" class="tool-group">
								<label class="tool-label-small">{{ t('threedviewer', 'Explosion') }}</label>
								<input type="range"
									class="clipping-slider"
									min="0"
									max="1"
									step="0.01"
									:value="explodedViewFactor"
									@input="emit('set-exploded-factor', parseFloat($event.target.value))">
							</div>
							<!-- Transform Gizmo -->
							<button class="tool-btn feature-btn"
								:class="{ 'active': transformGizmoActive }"
								:disabled="!modelLoaded"
								@click="emit('toggle-transform-gizmo')">
								<ViewerIcon class="tool-icon" name="transform" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Transform') }}</span>
								<span v-if="transformGizmoActive" class="active-badge">{{ t('threedviewer', 'Active') }}</span>
							</button>
							<div v-if="transformGizmoActive" class="clipping-controls">
								<div class="axis-buttons">
									<button class="axis-btn"
										:class="{ 'active': transformGizmoMode === 'translate' }"
										:title="t('threedviewer', 'Move')"
										@click="emit('set-transform-mode', 'translate')">
										{{ t('threedviewer', 'Move') }}
									</button>
									<button class="axis-btn"
										:class="{ 'active': transformGizmoMode === 'rotate' }"
										:title="t('threedviewer', 'Rotate')"
										@click="emit('set-transform-mode', 'rotate')">
										{{ t('threedviewer', 'Rotate') }}
									</button>
									<button class="axis-btn"
										:class="{ 'active': transformGizmoMode === 'scale' }"
										:title="t('threedviewer', 'Scale')"
										@click="emit('set-transform-mode', 'scale')">
										{{ t('threedviewer', 'Scale') }}
									</button>
									<button class="axis-btn"
										:title="t('threedviewer', 'Reset transform')"
										@click="emit('reset-transform')">
										{{ t('threedviewer', 'Reset') }}
									</button>
								</div>
							</div>
							<!-- Model Statistics -->
							<button class="tool-btn"
								:disabled="!modelLoaded"
								@click="emit('toggle-stats')">
								<ViewerIcon class="tool-icon" name="statistics" :size="17" />
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
							<span class="section-title">{{ t('threedviewer', 'Animation') }}</span>
							<ViewerIcon class="expand-icon"
								:class="{ collapsed: !sections.animation }"
								name="chevron"
								:size="15" />
						</button>
						<div v-show="sections.animation" id="panel-section-animation" class="section-content">
							<!-- Clip selector -->
							<div v-if="animationClipNames.length > 1" class="clip-selector">
								<label class="clip-label">{{ t('threedviewer', 'Clip') }}</label>
								<select class="clip-dropdown"
									:value="animationActiveClipIndex"
									@change="emit('animation-select-clip', parseInt($event.target.value))">
									<option v-for="(name, idx) in animationClipNames"
										:key="idx"
										:value="idx">
										{{ name }}
									</option>
								</select>
							</div>
							<div class="animation-controls">
								<button class="tool-btn"
									:class="{ 'active': isAnimationPlaying }"
									@click="emit('toggle-animation-play')">
									<ViewerIcon class="tool-icon" :name="isAnimationPlaying ? 'animationPause' : 'animationPlay'" :size="17" />
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
									<button class="step-btn" :title="t('threedviewer', 'Step back')" @click="emit('animation-step-backward')">
										⏮
									</button>
									<input type="range"
										class="timeline-slider"
										:min="0"
										:max="animationDuration"
										:step="animationDuration / 100"
										:value="animationCurrentTime"
										@input="emit('animation-seek', parseFloat($event.target.value))">
									<button class="step-btn" :title="t('threedviewer', 'Step forward')" @click="emit('animation-step-forward')">
										⏭
									</button>
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
							<span class="section-title">{{ t('threedviewer', 'Export') }}</span>
							<ViewerIcon class="expand-icon"
								:class="{ collapsed: !sections.export }"
								name="chevron"
								:size="15" />
						</button>
						<div v-show="sections.export" id="panel-section-export" class="section-content">
							<button class="tool-btn" @click="emit('take-screenshot')">
								<ViewerIcon class="tool-icon" name="camera" :size="17" />
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
									<option v-if="hasMultipleSourceFiles" value="zip">
										{{ t('threedviewer', 'ZIP (All Files)') }}
									</option>
								</select>
							</div>
							<button class="tool-btn"
								:disabled="!modelLoaded"
								@click="emit('send-to-slicer')">
								<ViewerIcon class="tool-icon" name="sendToSlicer" :size="17" />
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
							<span class="section-title">{{ t('threedviewer', 'Settings') }}</span>
							<ViewerIcon class="expand-icon"
								:class="{ collapsed: !sections.settings }"
								name="chevron"
								:size="15" />
						</button>
						<div v-show="sections.settings" id="panel-section-settings" class="section-content">
							<button class="tool-btn" @click="cyclePerformanceMode">
								<ViewerIcon class="tool-icon" name="performance" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Performance') }}: {{ getPerformanceModeText() }}</span>
							</button>
							<button class="tool-btn" @click="cycleTheme">
								<ViewerIcon class="tool-icon" :name="getThemeIcon()" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Theme') }}: {{ getThemeText() }}</span>
							</button>
							<div class="tool-group palette-group">
								<label class="tool-label-small">{{ t('threedviewer', 'Custom palette') }}</label>
								<div class="palette-row">
									<span class="palette-key">{{ t('threedviewer', 'Background') }}</span>
									<input type="color"
										class="palette-swatch"
										:value="paletteValueFor('background')"
										:aria-label="t('threedviewer', 'Background color')"
										@input="onPaletteInput('background', $event.target.value)">
									<button v-if="customPalette.background"
										class="palette-clear"
										:title="t('threedviewer', 'Reset to theme default')"
										@click="emit('set-palette-color', { key: 'background', hex: null })">
										×
									</button>
								</div>
								<div class="palette-row">
									<span class="palette-key">{{ t('threedviewer', 'Grid') }}</span>
									<input type="color"
										class="palette-swatch"
										:value="paletteValueFor('gridColor')"
										:aria-label="t('threedviewer', 'Grid color')"
										@input="onPaletteInput('gridColor', $event.target.value)">
									<button v-if="customPalette.gridColor"
										class="palette-clear"
										:title="t('threedviewer', 'Reset to theme default')"
										@click="emit('set-palette-color', { key: 'gridColor', hex: null })">
										×
									</button>
								</div>
								<button v-if="hasAnyPaletteOverride"
									class="tool-btn palette-reset"
									@click="emit('reset-palette')">
									<span class="tool-icon">↺</span>
									<span class="tool-label">{{ t('threedviewer', 'Reset all palette colors') }}</span>
								</button>
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
									<ViewerIcon class="tool-icon" name="delete" :size="17" />
									<span class="tool-label">{{ t('threedviewer', 'Clear Cache') }}</span>
								</button>
							</div>
							<button v-else class="tool-btn" @click="emit('clear-cache')">
								<ViewerIcon class="tool-icon" name="delete" :size="17" />
								<span class="tool-label">{{ t('threedviewer', 'Clear Cache') }}</span>
							</button>
							<button class="tool-btn" @click="emit('toggle-help')">
								<ViewerIcon class="tool-icon" name="help" :size="17" />
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
import ViewerIcon from './ViewerIcon.vue'
import { VIEWER_CONFIG } from '../config/viewer-config.js'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'

export default {
	name: 'SlideOutToolPanel',

	components: {
		ViewerIcon,
	},

	props: {
		// View props
		autoRotate: { type: Boolean, default: false },
		cameraType: { type: String, default: 'perspective' },

		// Scene props
		grid: { type: Boolean, default: true },
		axes: { type: Boolean, default: true },
		wireframe: { type: Boolean, default: false },

		// Tool states
		measurementMode: { type: Boolean, default: false },
		annotationMode: { type: Boolean, default: false },
		comparisonMode: { type: Boolean, default: false },
		transformGizmoActive: { type: Boolean, default: false },
		transformGizmoMode: { type: String, default: 'translate' },
		modelLoaded: { type: Boolean, default: false },
		hasMultipleSourceFiles: { type: Boolean, default: false },
		performanceMode: { type: String, default: 'auto' },
		themeMode: { type: String, default: 'auto' },

		// Animation props
		hasAnimations: { type: Boolean, default: false },
		isAnimationPlaying: { type: Boolean, default: false },
		isAnimationLooping: { type: Boolean, default: false },
		animationCurrentTime: { type: Number, default: 0 },
		animationDuration: { type: Number, default: 0 },
		animationClipNames: { type: Array, default: () => [] },
		animationActiveClipIndex: { type: Number, default: 0 },

		// Clipping plane props
		clippingActive: { type: Boolean, default: false },
		clippingMode: { type: String, default: 'plane' }, // 'plane' | 'box'
		clippingAxis: { type: String, default: 'y' },
		clippingPosition: { type: Number, default: 0 },
		clippingFlipped: { type: Boolean, default: false },
		// Box-mode offsets (0..1 per face). Keys match useClippingPlane.
		clippingBoxOffsets: {
			type: Object,
			default: () => ({ xMin: 0, xMax: 0, yMin: 0, yMax: 0, zMin: 0, zMax: 0 }),
		},

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

		// Custom color palette — null per-key means "use base theme color"
		customPalette: {
			type: Object,
			default: () => ({ background: null, gridColor: null }),
		},
	},

	emits: [
		'panel-opened',
		'panel-closed',
		'reset-view',
		'fit-to-view',
		'toggle-auto-rotate',
		'toggle-projection',
		'copy-view-link',
		'toggle-grid',
		'toggle-axes',
		'toggle-wireframe',
		'toggle-measurement',
		'toggle-annotation',
		'toggle-comparison',
		'toggle-transform-gizmo',
		'set-transform-mode',
		'reset-transform',
		'cycle-performance-mode',
		'cycle-theme',
		'set-palette-color',
		'reset-palette',
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
		'animation-select-clip',
		'toggle-clipping',
		'set-clipping-mode',
		'set-clipping-axis',
		'set-clipping-position',
		'toggle-clipping-flip',
		'set-clipping-box-offset',
		'reset-clipping-box',
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
			case 'light': return 'themeLight'
			case 'dark': return 'themeDark'
			case 'auto':
			default: return 'themeAuto'
			}
		}

		// Palette helpers ----------------------------------------------------
		/*
		 * What the swatch shows when the user has not overridden a key: the value the
		 * scene is actually using. This used to be a defaults map of its own, which said
		 * the grid was #888888 while the scene drew it in #00ff00 — a control describing
		 * the colour of something, showing a colour that thing had never been.
		 */
		const themeDefaults = computed(() => {
			const resolved = props.themeMode === 'auto'
				? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
				: props.themeMode
			return VIEWER_CONFIG.theme[resolved] || VIEWER_CONFIG.theme.light
		})
		const paletteValueFor = (key) => {
			return (props.customPalette && props.customPalette[key]) || themeDefaults.value[key]
		}
		const onPaletteInput = (key, hex) => {
			emit('set-palette-color', { key, hex })
		}
		const hasAnyPaletteOverride = computed(() => {
			const p = props.customPalette || {}
			return !!(p.background || p.gridColor)
		})

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
			paletteValueFor,
			onPaletteInput,
			hasAnyPaletteOverride,
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
	background: rgb(0, 0, 0, 0.5);
	z-index: 1001;
	backdrop-filter: blur(4px);
}

/*
 * The mockup floats this as a card inset from the viewer's edges rather than filling the
 * right side to the corners.
 */
.slide-out-panel {
	position: fixed;

	/* Below Nextcloud's header *and* the viewer's own bar. Clearing only the first left
	   the card sitting over the right end of the bar — including the Tools button that
	   opens it, so the button that toggled the panel was underneath the panel. */
	top: calc(var(--tdv-nc-header-height) + var(--tdv-topbar-height) + 16px);
	inset-inline-end: 16px;
	bottom: 16px;
	z-index: 1002;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	width: 320px;
	border: 1px solid var(--tdv-color-border);
	border-radius: var(--tdv-radius-dialog);
	background: var(--tdv-color-surface);
	box-shadow: var(--tdv-shadow-floating);
	color: var(--tdv-color-text);
}

/* Panel Header */
.panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 20px;
	background: var(--tdv-color-surface-sunken);
	border-bottom: 1px solid var(--tdv-color-border);
}

.panel-title {
	font-size: 18px;
	font-weight: 600;
	margin: 0;
	color: var(--tdv-color-text);
}

.close-btn {
	background: transparent;
	border: none;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	padding: 0;
	border-radius: 18px;
	color: var(--tdv-color-text-secondary);
	cursor: pointer;
	transition: background 0.2s ease;
}

.close-btn:hover {
	background: var(--tdv-color-hover-bg);
}

/* Panel Content */
.panel-content {
	flex: 1;
	overflow: hidden auto;
	padding: 8px;
}

.panel-content::-webkit-scrollbar { width: 8px; }
.panel-content::-webkit-scrollbar-track { background: var(--tdv-color-surface-sunken); }
.panel-content::-webkit-scrollbar-thumb { background: var(--tdv-color-border); border-radius: 4px; }
.panel-content::-webkit-scrollbar-thumb:hover { background: var(--tdv-color-border-strong); }

/* Panel Sections */
.panel-section {
	margin-bottom: 8px;
	background: var(--tdv-color-hover-bg);
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
	color: var(--tdv-color-text);
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: background 0.2s ease;
	text-align: start;
}

.section-header:hover { background: var(--tdv-color-hover-bg); }
.section-title { flex: 1; }

/* The chevron points down when open and right when collapsed, rotated rather than
   swapped so the change reads as the same object moving. */
.expand-icon {
	color: var(--tdv-color-text-secondary);
	transition: transform 0.15s ease;
}

.expand-icon.collapsed {
	transform: rotate(-90deg);
}

.section-content { padding: 8px; }

/* Tool Buttons */
.tool-btn {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 16px;
	background: var(--tdv-color-surface);
	border: 1px solid var(--tdv-color-border);
	border-radius: 6px;
	color: var(--tdv-color-text);
	font-size: 14px;
	cursor: pointer;
	transition: all 0.2s ease;
	margin-bottom: 6px;
	text-align: start;
}

.tool-btn:hover {
	background: var(--tdv-color-hover-bg);
	border-color: var(--tdv-color-primary);
}

.tool-btn.active {
	background: var(--tdv-color-primary);
	border-color: var(--tdv-color-primary);
	color: var(--tdv-color-on-primary);
}

.tool-btn:last-child { margin-bottom: 0; }
.tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.tool-icon { color: var(--tdv-color-text-secondary); }
.tool-label { flex: 1; }

.active-badge {
	padding: 2px 8px;
	background: var(--tdv-color-primary);
	color: var(--tdv-color-on-primary);
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
	background: var(--tdv-color-hover-bg);
}

.toggle-switch {
	position: relative;
	width: 36px;
	height: 20px;
	background: var(--tdv-color-border);
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
	background: var(--tdv-color-surface);
	border-radius: 50%;
	transition: transform 0.2s ease;
	box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
}

.toggle-switch.on {
	background: var(--tdv-color-primary);
}

.toggle-switch.on::after {
	transform: translateX(16px);
}

[dir="rtl"] .toggle-switch.on::after {
	transform: translateX(-16px);
}

.toggle-text {
	font-size: 14px;
	color: var(--tdv-color-text);
}

/* Tool Groups */
.tool-group {
	padding: 12px 16px;
	background: var(--tdv-color-surface);
	border: 1px solid var(--tdv-color-border);
	border-radius: 6px;
	margin-bottom: 6px;
	transition: all 0.2s ease;
}

.tool-group:hover {
	background: var(--tdv-color-hover-bg);
	border-color: var(--tdv-color-primary);
}

.tool-label-small {
	display: block;
	font-size: 12px;
	color: var(--tdv-color-text-secondary);
	margin-bottom: 8px;
	font-weight: 500;
}

/* Clip selector */
.clip-selector {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 8px;
}

.clip-label {
	font-size: 12px;
	color: var(--tdv-color-text-secondary);
	white-space: nowrap;
}

.clip-dropdown {
	flex: 1;
	padding: 4px 8px;
	border: 1px solid var(--tdv-color-border);
	border-radius: 4px;
	background: var(--tdv-color-surface);
	color: var(--tdv-color-text);
	font-size: 12px;
	cursor: pointer;
	min-width: 0;
}

.clip-dropdown:hover {
	border-color: var(--tdv-color-primary);
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
	border: 1px solid var(--tdv-color-border);
	border-radius: 4px;
	color: var(--tdv-color-text);
	cursor: pointer;
	padding: 2px 6px;
	font-size: 12px;
	line-height: 1;
}

.step-btn:hover { background: var(--tdv-color-hover-bg); }

.timeline-slider {
	flex: 1;
	height: 4px;
	accent-color: var(--tdv-color-primary);
	cursor: pointer;
}

.timeline-time {
	font-size: 11px;
	color: var(--tdv-color-text-secondary);
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
	border: 1px solid var(--tdv-color-border);
	border-radius: 4px;
	background: var(--tdv-color-surface);
	color: var(--tdv-color-text);
	cursor: pointer;
	font-size: 12px;
	font-weight: 600;
	text-align: center;
	transition: all 0.15s ease;
}

.axis-btn:hover { background: var(--tdv-color-hover-bg); }

.axis-btn.active {
	background: var(--tdv-color-primary);
	color: var(--tdv-color-on-primary);
	border-color: var(--tdv-color-primary);
}

.clipping-slider {
	width: 100%;
	accent-color: var(--tdv-color-primary);
	cursor: pointer;
}

.clipping-mode-switch {
	margin-bottom: 4px;
}

.clipping-box-grid {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin-top: 2px;
}

.clipping-box-row {
	display: grid;
	grid-template-columns: 16px 1fr 1fr;
	align-items: center;
	gap: 6px;
}

.clipping-box-label {
	font-size: 11px;
	font-weight: 600;
	text-align: center;
	color: var(--tdv-color-text-secondary);
}

.clipping-box-pair {
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
}

.clipping-box-sublabel {
	font-size: 10px;
	color: var(--tdv-color-text-secondary);
	width: 10px;
	text-align: center;
	font-weight: 700;
}

.clipping-slider-box {
	flex: 1;
	min-width: 0;
}

.clipping-box-reset {
	margin-top: 4px;
	font-size: 11px !important;
}

/* Lighting preset buttons */
.preset-buttons {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.preset-btn {
	padding: 4px 10px;
	border: 1px solid var(--tdv-color-border);
	border-radius: 4px;
	background: var(--tdv-color-surface);
	color: var(--tdv-color-text);
	cursor: pointer;
	font-size: 11px;
	transition: all 0.15s ease;
}

.preset-btn:hover { background: var(--tdv-color-hover-bg); }

.preset-btn.active {
	background: var(--tdv-color-primary);
	color: var(--tdv-color-on-primary);
	border-color: var(--tdv-color-primary);
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
	border: 1px solid var(--tdv-color-border);
	border-radius: 4px;
	background: var(--tdv-color-surface);
	color: var(--tdv-color-text);
	cursor: pointer;
	font-size: 12px;
	text-align: start;
	text-overflow: ellipsis;
	overflow: hidden;
	white-space: nowrap;
	transition: background 0.15s ease;
}

.bookmark-name:hover { background: var(--tdv-color-hover-bg); }

.bookmark-delete {
	background: transparent;
	border: none;
	color: var(--tdv-color-text-secondary);
	cursor: pointer;
	font-size: 16px;
	padding: 2px 6px;
	border-radius: 4px;
}

.bookmark-delete:hover {
	color: var(--tdv-color-on-error);
	background: var(--tdv-color-error);
}

/* Export select */
.export-select {
	width: 100%;
	padding: 8px 12px;
	background: var(--tdv-color-surface-sunken);
	border: 1px solid var(--tdv-color-border);
	border-radius: 4px;
	color: var(--tdv-color-text);
	font-size: 13px;
	cursor: pointer;
	transition: all 0.2s ease;
}

.export-select:hover:not(:disabled) {
	background: var(--tdv-color-hover-bg);
	border-color: var(--tdv-color-primary);
}

.export-select:focus {
	outline: none;
	border-color: var(--tdv-color-primary);
	box-shadow: 0 0 0 2px var(--tdv-color-primary-light);
}

.export-select:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.export-select option {
	background: var(--tdv-color-surface);
	color: var(--tdv-color-text);
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
	border: 1px solid var(--tdv-color-border);
	border-radius: 4px;
	cursor: pointer;
	background: transparent;
}

.reset-color-btn {
	padding: 8px 12px;
	background: var(--tdv-color-hover-bg);
	border: 1px solid var(--tdv-color-border);
	border-radius: 4px;
	color: var(--tdv-color-text);
	font-size: 12px;
	cursor: pointer;
	transition: all 0.2s ease;
}

.reset-color-btn:hover {
	background: var(--tdv-color-primary);
	color: var(--tdv-color-on-primary);
}

/* Cache Management */
.cache-group {
	margin-top: 0;
}

.palette-group {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 8px;
	background: var(--tdv-color-surface-sunken);
	border: 1px solid var(--tdv-color-border);
	border-radius: 4px;
}

.palette-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.palette-key {
	flex: 1;
	font-size: 12px;
	color: var(--tdv-color-text-secondary);
}

.palette-swatch {
	width: 36px;
	height: 24px;
	border: 1px solid var(--tdv-color-border);
	border-radius: 4px;
	background: transparent;
	cursor: pointer;
	padding: 0;
}

.palette-clear {
	width: 22px;
	height: 22px;
	border: none;
	background: var(--tdv-color-hover-bg);
	color: var(--tdv-color-text-secondary);
	border-radius: 3px;
	cursor: pointer;
	font-size: 14px;
	line-height: 22px;
	padding: 0;
}

.palette-clear:hover {
	background: var(--tdv-color-surface-recessed);
}

.palette-reset {
	margin-top: 4px;
}

.cache-info {
	background: var(--tdv-color-surface-sunken);
	border: 1px solid var(--tdv-color-border);
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
	border-bottom: 1px solid var(--tdv-color-border);
	padding-bottom: 6px;
	margin-bottom: 4px;
}

.cache-stat-label {
	color: var(--tdv-color-text-secondary);
	font-weight: 500;
}

.cache-stat-value {
	color: var(--tdv-color-text);
	font-weight: 600;
}

.cache-stat-value.good { color: var(--tdv-color-on-success); }
.cache-stat-value.warning { color: var(--tdv-color-on-warning); }
.cache-stat-value.poor { color: var(--tdv-color-on-error); }

.cache-clear-btn {
	width: 100%;
	margin-top: 8px;
}

/* Panel Footer */
.panel-footer {
	padding: 12px 20px;
	background: var(--tdv-color-surface-sunken);
	border-top: 1px solid var(--tdv-color-border);
	text-align: center;
}

.keyboard-hint {
	font-size: 12px;
	color: var(--tdv-color-text-secondary);
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
	border: none;
	border-radius: var(--tdv-radius-dialog) var(--tdv-radius-dialog) 0 0;
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
