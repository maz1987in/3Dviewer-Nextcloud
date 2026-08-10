<template>
	<div class="viewer-toolbar"
		role="toolbar"
		:aria-label="t('threedviewer', '3D viewer controls')"
		:class="{ 'mobile': isMobile }">
		<div class="toolbar-main">
			<button :aria-label="t('threedviewer','Reset view')"
				class="tb"
				type="button"
				@click="$emit('reset-view')">
				<ViewerIcon class="tb-icon" name="resetView" :size="18" />
				<span class="tb-text">{{ t('threedviewer','Reset') }}</span>
			</button>
			<button :aria-label="t('threedviewer','Fit to view')"
				class="tb"
				type="button"
				:title="t('threedviewer','Fit model to view')"
				@click="$emit('fit-to-view')">
				<ViewerIcon class="tb-icon" name="measurement" :size="18" />
				<span class="tb-text">{{ t('threedviewer','Fit') }}</span>
			</button>
			<button :aria-pressed="autoRotate"
				:aria-label="t('threedviewer','Toggle auto-rotate')"
				class="tb"
				type="button"
				:title="t('threedviewer','Toggle auto-rotate')"
				@click="$emit('toggle-auto-rotate')">
				<ViewerIcon class="tb-icon" name="resetView" :size="18" />
				<span class="tb-text">{{ autoRotate ? t('threedviewer','Auto-rotate on') : t('threedviewer','Auto-rotate off') }}</span>
			</button>
			<div v-if="!isMobile" class="view-presets">
				<select :value="currentPreset"
					class="preset-select"
					:title="t('threedviewer','Camera presets')"
					@change="$emit('change-preset', $event.target.value)">
					<option value="">
						{{ t('threedviewer','View Presets') }}
					</option>
					<option v-for="preset in presets" :key="preset.name" :value="preset.name">
						{{ preset.label }}
					</option>
				</select>
			</div>
			<button :aria-pressed="grid"
				:aria-label="t('threedviewer','Toggle grid')"
				class="tb"
				type="button"
				:title="t('threedviewer','Toggle grid')"
				@click="$emit('toggle-grid')">
				<span class="tb-icon">⊞</span>
				<span class="tb-text">{{ grid ? t('threedviewer','Grid on') : t('threedviewer','Grid off') }}</span>
			</button>
			<button :aria-pressed="axes"
				:aria-label="t('threedviewer','Toggle axes')"
				class="tb"
				type="button"
				:title="t('threedviewer','Toggle axes')"
				@click="$emit('toggle-axes')">
				<ViewerIcon class="tb-icon" name="projection" :size="18" />
				<span class="tb-text">{{ axes ? t('threedviewer','Axes on') : t('threedviewer','Axes off') }}</span>
			</button>
			<button :aria-pressed="faceLabels"
				:aria-label="t('threedviewer','Toggle face labels')"
				class="tb"
				type="button"
				:title="t('threedviewer','Toggle face labels')"
				@click="$emit('toggle-face-labels')">
				<ViewerIcon class="tb-icon" name="faceLabels" :size="18" />
				<span class="tb-text">{{ faceLabels ? t('threedviewer','Labels on') : t('threedviewer','Labels off') }}</span>
			</button>
			<button :aria-pressed="wireframe"
				:aria-label="t('threedviewer','Toggle wireframe')"
				class="tb"
				type="button"
				:title="t('threedviewer','Toggle wireframe')"
				@click="$emit('toggle-wireframe')">
				<ViewerIcon class="tb-icon" name="wireframe" :size="18" />
				<span class="tb-text">{{ wireframe ? t('threedviewer','Wireframe on') : t('threedviewer','Wireframe off') }}</span>
			</button>
			<!-- Advanced features -->
			<button :aria-pressed="measurementMode"
				:aria-label="t('threedviewer','Measurement tools')"
				class="tb"
				type="button"
				:title="t('threedviewer','Measurement tools')"
				@click="$emit('toggle-measurement')">
				<ViewerIcon class="tb-icon" name="measurement" :size="18" />
				<span class="tb-text">{{ t('threedviewer','Measure') }}</span>
			</button>
			<button :aria-pressed="annotationMode"
				:aria-label="t('threedviewer','Add annotations')"
				class="tb"
				type="button"
				:title="t('threedviewer','Add annotations')"
				@click="$emit('toggle-annotation')">
				<ViewerIcon class="tb-icon" name="annotation" :size="18" />
				<span class="tb-text">{{ t('threedviewer','Annotate') }}</span>
			</button>
			<button :aria-pressed="comparisonMode"
				:aria-label="t('threedviewer','Compare models')"
				class="tb"
				type="button"
				:title="t('threedviewer','Compare models')"
				@click="$emit('toggle-comparison')">
				<ViewerIcon class="tb-icon" name="comparison" :size="18" />
				<span class="tb-text">{{ t('threedviewer','Compare') }}</span>
			</button>
			<button :aria-label="t('threedviewer','Send to Slicer')"
				class="tb"
				type="button"
				:title="t('threedviewer','Send model to 3D printing slicer')"
				:disabled="!modelLoaded"
				@click="$emit('send-to-slicer')">
				<ViewerIcon class="tb-icon" name="sendToSlicer" :size="18" />
				<span class="tb-text">{{ t('threedviewer','Send to Slicer') }}</span>
			</button>
			<!-- Animation controls -->
			<button v-if="hasAnimations"
				:aria-label="isAnimationPlaying ? t('threedviewer','Pause animation') : t('threedviewer','Play animation')"
				class="tb"
				type="button"
				:title="isAnimationPlaying ? t('threedviewer','Pause animation') : t('threedviewer','Play animation')"
				@click="$emit('toggle-animation-play')">
				<ViewerIcon class="tb-icon" :name="isAnimationPlaying ? 'animationPause' : 'animationPlay'" :size="18" />
				<span class="tb-text">{{ isAnimationPlaying ? t('threedviewer','Pause') : t('threedviewer','Play') }}</span>
			</button>
			<button v-if="hasAnimations"
				:aria-pressed="isAnimationLooping"
				:aria-label="t('threedviewer','Toggle animation loop')"
				class="tb"
				type="button"
				:title="t('threedviewer','Toggle animation loop')"
				:class="{ 'active': isAnimationLooping }"
				@click="$emit('toggle-animation-loop')">
				<ViewerIcon class="tb-icon" name="loop" :size="18" />
				<span class="tb-text">{{ isAnimationLooping ? t('threedviewer','Loop on') : t('threedviewer','Loop off') }}</span>
			</button>
			<button :aria-label="t('threedviewer','Performance settings')"
				class="tb"
				type="button"
				:title="t('threedviewer','Click to cycle performance mode')"
				@click="cyclePerformanceMode">
				<ViewerIcon class="tb-icon" name="performance" :size="18" />
				<span class="tb-text">{{ getPerformanceModeText() }}</span>
			</button>
			<label class="color-picker" :aria-label="t('threedviewer','Background color')">
				<ViewerIcon class="tb-icon" name="palette" :size="18" />
				<input type="color" :value="background" @input="$emit('change-background', $event.target.value)">
			</label>
		</div>
	</div>
</template>

<script>
import ViewerIcon from './ViewerIcon.vue'
export default {
	name: 'ViewerToolbar',

	components: {
		ViewerIcon,
	},
	props: {
		grid: { type: Boolean, default: true },
		axes: { type: Boolean, default: true },
		faceLabels: { type: Boolean, default: false },
		wireframe: { type: Boolean, default: false },
		background: { type: String, default: '#f5f5f5' },
		autoRotate: { type: Boolean, default: false },
		presets: { type: Array, default: () => [] },
		currentPreset: { type: String, default: '' },
		// Advanced features
		measurementMode: { type: Boolean, default: false },
		annotationMode: { type: Boolean, default: false },
		comparisonMode: { type: Boolean, default: false },
		performanceMode: { type: String, default: 'auto' },
		modelLoaded: { type: Boolean, default: false },
		// Animation props
		hasAnimations: { type: Boolean, default: false },
		isAnimationPlaying: { type: Boolean, default: false },
		isAnimationLooping: { type: Boolean, default: false },
	},
	emits: [
		'reset-view',
		'fit-to-view',
		'toggle-auto-rotate',
		'change-preset',
		'toggle-grid',
		'toggle-axes',
		'toggle-face-labels',
		'toggle-wireframe',
		'toggle-measurement',
		'toggle-annotation',
		'toggle-comparison',
		'send-to-slicer',
		'toggle-animation-play',
		'toggle-animation-loop',
		'change-background',
		'cycle-performance-mode',
	],
	data() {
		return {
			isMobile: false,
		}
	},
	mounted() {
		this.isMobile = this.detectMobile()
		window.addEventListener('resize', this.handleResize)
		this.setupKeyboardNavigation()
	},
	beforeUnmount() {
		window.removeEventListener('resize', this.handleResize)
		this.removeKeyboardNavigation()
	},
	methods: {
		detectMobile() {
			return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
				   || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1)
				   || window.innerWidth <= 768
		},
		handleResize() {
			this.isMobile = this.detectMobile()
		},

		setupKeyboardNavigation() {
			// Add keyboard navigation for toolbar
			this.$el.addEventListener('keydown', this.handleKeydown)
		},

		removeKeyboardNavigation() {
			this.$el.removeEventListener('keydown', this.handleKeydown)
		},

		handleKeydown(event) {
			// Handle arrow key navigation within toolbar
			if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
				const buttons = this.$el.querySelectorAll('button, select')
				const currentIndex = Array.from(buttons).indexOf(event.target)
				let nextIndex

				if (event.key === 'ArrowRight') {
					nextIndex = (currentIndex + 1) % buttons.length
				} else {
					nextIndex = (currentIndex - 1 + buttons.length) % buttons.length
				}

				buttons[nextIndex]?.focus()
				event.preventDefault()
			}
		},

		cyclePerformanceMode() {
			const modes = ['auto', 'low', 'balanced', 'high', 'ultra']
			const currentIndex = modes.indexOf(this.performanceMode)
			const nextIndex = (currentIndex + 1) % modes.length
			const nextMode = modes[nextIndex]
			this.$emit('cycle-performance-mode', nextMode)
		},
		getPerformanceModeText() {
			switch (this.performanceMode) {
			case 'low': return this.t('threedviewer', 'Low')
			case 'balanced': return this.t('threedviewer', 'Balanced')
			case 'high': return this.t('threedviewer', 'High')
			case 'ultra': return this.t('threedviewer', 'Ultra')
			case 'auto':
			default: return this.t('threedviewer', 'Auto')
			}
		},
	},
}
</script>

<style scoped>
.viewer-toolbar {
	position: absolute;
	top: 8px;
	inset-inline-start: 8px;
	z-index: 10;
	background: rgb(0 0 0 / 45%);
	backdrop-filter: blur(8px);
	padding: 6px 8px;
	border-radius: 8px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	align-items: center;
	transition: all 0.3s ease;
	border: 1px solid rgb(255 255 255 / 10%);
	box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
}

.toolbar-main {
	display: flex;
	gap: 4px;
	align-items: center;
	flex-wrap: wrap;
}

.toolbar-secondary {
	display: flex;
	gap: 4px;
	align-items: center;
}

.tb.tb {
	font-size: 11px;
	line-height: 1;
	padding: 6px 8px;
	background: var(--tdv-color-primary);
	color: #fff;
	border: none;
	border-radius: 6px;
	cursor: pointer;
	display: flex;
	align-items: center;
	gap: 4px;
	transition: all 0.2s ease;
	touch-action: manipulation;
	min-height: 32px;
	font-weight: 500;
	box-shadow: 0 2px 4px rgb(0 0 0 / 10%);
	position: relative;
	overflow: hidden;
}

.tb.tb::before {
	content: '';
	position: absolute;
	top: 0;
	inset-inline-start: -100%;
	width: 100%;
	height: 100%;
	background: linear-gradient(90deg, transparent, rgb(255 255 255 / 20%), transparent);
	transition: left 0.5s;
}

.tb.tb:hover::before {
	inset-inline-start: 100%;
}

.tb-icon {
	font-size: 12px;
	line-height: 1;
}

.tb-text {
	font-size: 10px;
	white-space: nowrap;
}

.tb.tb[aria-pressed="true"] {
	background: var(--tdv-color-success);
}

.tb.tb:focus-visible {
	outline: 2px solid var(--tdv-color-on-primary);
	outline-offset: 2px;
}

.tb.tb:hover:not(:disabled) {
	background: var(--tdv-color-primary-hover);
	transform: translateY(-1px);
}

.tb.tb:disabled {
	opacity: 0.5;
	cursor: not-allowed;
	background: var(--tdv-color-surface-sunken);
}

.color-picker {
	display: flex;
	align-items: center;
	gap: 4px;
	cursor: pointer;
	padding: 4px 6px;
	background: var(--tdv-color-primary);
	border-radius: 4px;
	min-height: 32px;
}

.color-picker input[type="color"] {
	width: 24px;
	height: 24px;
	padding: 0;
	border: none;
	background: transparent;
	cursor: pointer;
	border-radius: 2px;
}

.view-presets {
	display: flex;
	align-items: center;
}

.preset-select {
	font-size: 10px;
	padding: 4px 6px;
	border: 1px solid rgb(255 255 255 / 30%);
	border-radius: 4px;
	background: rgb(255 255 255 / 10%);
	color: white;
	cursor: pointer;
	min-width: 100px;
}

.preset-select:focus {
	outline: 2px solid var(--tdv-color-on-primary);
	outline-offset: 2px;
}

.preset-select option {
	background: #333;
	color: white;
}

/* Mobile-specific styles */
.viewer-toolbar.mobile {
	top: 4px;
	inset-inline: 4px;
	flex-direction: row;
	justify-content: space-between;
	padding: 6px 8px;
	border-radius: 8px;
}

.viewer-toolbar.mobile .toolbar-main {
	flex: 1;
	justify-content: flex-start;
}

.viewer-toolbar.mobile .toolbar-secondary {
	flex-shrink: 0;
}

.viewer-toolbar.mobile .tb {
	font-size: 10px;
	padding: 6px 8px;
	min-height: 44px; /* iOS recommended touch target size */
	border-radius: 6px;
}

.viewer-toolbar.mobile .tb-icon {
	font-size: 14px;
}

.viewer-toolbar.mobile .tb-text {
	font-size: 9px;
}

.viewer-toolbar.mobile .color-picker {
	padding: 6px 8px;
	min-height: 44px;
	border-radius: 6px;
}

.viewer-toolbar.mobile .color-picker input[type="color"] {
	width: 32px;
	height: 32px;
}

/* Landscape mobile optimization */
@media (width <= 768px) and (orientation: landscape) {
	.viewer-toolbar.mobile {
		top: 2px;
		inset-inline: 2px;
		padding: 4px 6px;
	}

	.viewer-toolbar.mobile .tb {
		padding: 4px 6px;
		min-height: 36px;
	}

	.viewer-toolbar.mobile .color-picker {
		padding: 4px 6px;
		min-height: 36px;
	}
}

/* Very small screens */
@media (width <= 480px) {
	.viewer-toolbar.mobile .tb-text {
		display: none; /* Hide text on very small screens, show only icons */
	}

	.viewer-toolbar.mobile .tb {
		padding: 8px;
		min-width: 44px;
		justify-content: center;
	}
}

/* Dark theme support */
.theme--dark .viewer-toolbar {
	background: rgb(30 30 30 / 80%);
	border-color: rgb(255 255 255 / 20%);
	box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
}

.theme--dark .tb {
	background: var(--tdv-color-primary);
	color: var(--tdv-color-on-primary);
}

.theme--dark .tb[aria-pressed="true"] {
	background: var(--tdv-color-success);
	color: #fff;
}

.theme--dark .color-picker {
	background: var(--tdv-color-primary);
}

.theme--dark .preset-select {
	background: rgb(255 255 255 / 10%);
	border-color: rgb(255 255 255 / 30%);
	color: white;
}

.theme--dark .preset-select option {
	background: #2d2d2d;
	color: white;
}

/* Accessibility improvements */
.tb:focus-visible,
.color-picker:focus-visible,
.preset-select:focus-visible {
	outline: 2px solid var(--tdv-color-primary);
	outline-offset: 2px;
	box-shadow: 0 0 0 4px rgb(13 71 161 / 20%);
}

/* High contrast mode */
@media (prefers-contrast: high) {
	.tb.tb {
		border: 2px solid currentcolor;
	}

	.viewer-toolbar {
		border: 2px solid rgb(255 255 255 / 50%);
	}
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
	.tb.tb::before {
		display: none;
	}

	.tb.tb:hover {
		transform: none;
	}

	.viewer-toolbar {
		transition: none;
	}
}

/* Screen reader support */
.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;

	/* clip-path rather than the deprecated `clip`; same effect — the element stays
	   in the accessibility tree for screen readers but is not visually rendered. */
	clip-path: inset(50%);
	white-space: nowrap;
	border: 0;
}
</style>
