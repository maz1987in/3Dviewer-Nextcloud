<template>
	<div class="minimal-top-bar"
		role="toolbar"
		:aria-label="t('threedviewer', 'Quick actions')"
		:class="{ mobile: isMobile }">
		<!-- Left: view actions -->
		<div class="bar-cluster">
			<button :aria-label="t('threedviewer', 'Reset view')"
				class="tdv-btn tdv-btn--icon tdv-btn--on-canvas"
				:title="t('threedviewer', 'Reset view')"
				@click="$emit('reset-view')">
				<ViewerIcon name="resetView" :size="20" />
			</button>

			<button :aria-label="t('threedviewer', 'Fit to view')"
				class="tdv-btn tdv-btn--icon tdv-btn--on-canvas"
				:title="t('threedviewer', 'Fit model to view')"
				@click="$emit('fit-to-view')">
				<ViewerIcon name="fitToView" :size="20" />
			</button>

			<button :aria-label="t('threedviewer', 'Take screenshot')"
				class="tdv-btn tdv-btn--icon tdv-btn--on-canvas"
				:title="t('threedviewer', 'Take screenshot')"
				@click="$emit('take-screenshot')">
				<ViewerIcon name="camera" :size="20" />
			</button>
		</div>

		<!-- Centre: what is open. Absolutely positioned so it is centred on the bar rather
			than on whatever space the two clusters happen to leave, and click-through so a
			long filename cannot cover the buttons underneath it. -->
		<div class="bar-title">
			<span class="model-name" :title="modelName">
				{{ modelName || t('threedviewer', '3D Viewer') }}
			</span>
			<span v-if="isLoading" class="model-meta">
				{{ t('threedviewer', 'Loading…') }}
			</span>
			<span v-else-if="modelFormat" class="model-meta">{{ modelFormat }}</span>
		</div>

		<!-- Right: state, then the panels -->
		<div class="bar-cluster bar-cluster--end">
			<button v-if="showPerformance"
				class="fps-badge"
				:aria-label="performanceText"
				:title="performanceText"
				@click="$emit('toggle-performance')">
				<span class="fps-dot" :class="`fps-dot--${fpsHealth}`" />
				<span class="fps-value">{{ fps ? t('threedviewer', '{fps} fps', { fps: Math.round(fps) }) : '—' }}</span>
			</button>

			<!-- G-code toolpath colour mode (G-code models only) -->
			<button v-if="isGcodeModel"
				:aria-label="t('threedviewer', 'Toggle toolpath color mode')"
				class="tdv-btn tdv-btn--icon tdv-btn--on-canvas"
				:title="gcodeColorMode === 'single' ? t('threedviewer', 'Color: Single') : t('threedviewer', 'Color: Gradient')"
				@click="$emit('toggle-gcode-color-mode')">
				<ViewerIcon name="palette" :size="20" />
			</button>

			<label v-if="isGcodeModel && gcodeColorMode === 'single'"
				class="topbar-color-picker"
				:title="t('threedviewer', 'Select toolpath color')">
				<input type="color" :value="gcodeSingleColor" @input="$emit('change-gcode-color', $event.target.value)">
			</label>

			<button v-if="hasAnimations"
				:aria-label="isAnimationPlaying ? t('threedviewer', 'Pause animation') : t('threedviewer', 'Play animation')"
				class="tdv-btn tdv-btn--icon tdv-btn--on-canvas"
				:class="{ 'is-active': isAnimationPlaying }"
				:title="isAnimationPlaying ? t('threedviewer', 'Pause animation') : t('threedviewer', 'Play animation')"
				@click="$emit('toggle-animation-play')">
				<ViewerIcon v-if="isAnimationPlaying" name="animationPause" :size="20" />
				<ViewerIcon v-else name="animationPlay" :size="20" />
			</button>

			<button :aria-label="t('threedviewer', '3D Controller')"
				class="tdv-btn tdv-btn--icon tdv-btn--on-canvas"
				:class="{ 'is-active': showController }"
				:title="t('threedviewer', '3D Controller')"
				@click="$emit('toggle-controller')">
				<ViewerIcon name="controller" :size="20" />
			</button>

			<button v-if="webxrSupported"
				:aria-label="webxrActive ? t('threedviewer', 'Exit VR') : t('threedviewer', 'Enter VR')"
				class="tdv-btn tdv-btn--icon tdv-btn--on-canvas"
				:class="{ 'is-active': webxrActive }"
				:title="webxrActive ? t('threedviewer', 'Exit VR') : t('threedviewer', 'Enter VR')"
				@click="$emit('toggle-vr')">
				<ViewerIcon name="vr" :size="20" />
			</button>

			<button :aria-label="t('threedviewer', 'Help')"
				class="tdv-btn tdv-btn--icon tdv-btn--on-canvas"
				:title="t('threedviewer', 'Help & shortcuts')"
				@click="$emit('toggle-help')">
				<ViewerIcon name="help" :size="20" />
			</button>

			<button :aria-label="t('threedviewer', 'Toggle tools panel')"
				class="tdv-btn tdv-btn--primary tools-btn"
				:title="t('threedviewer', 'Toggle tools panel (T)')"
				@click="$emit('toggle-tools')">
				<ViewerIcon name="tools" :size="18" />
				<span class="btn-text">{{ t('threedviewer', 'Tools') }}</span>
			</button>
		</div>
	</div>
</template>

<script>
import { computed } from 'vue'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import ViewerIcon from './ViewerIcon.vue'
import { getFormatLabel } from '../utils/fileHelpers.js'

/** Below this the frame budget is missed often enough to be felt as stutter. */
const FPS_DEGRADED = 45

/** Below this it reads as a slideshow rather than as a slow scene. */
const FPS_POOR = 25

export default {
	name: 'MinimalTopBar',

	components: {
		ViewerIcon,
	},

	props: {
		modelName: { type: String, default: '' },
		isLoading: { type: Boolean, default: false },
		fps: { type: Number, default: 0 },
		showPerformance: { type: Boolean, default: false },
		showController: { type: Boolean, default: true },
		isMobile: { type: Boolean, default: false },
		hasAnimations: { type: Boolean, default: false },
		isAnimationPlaying: { type: Boolean, default: false },
		webxrSupported: { type: Boolean, default: false },
		webxrActive: { type: Boolean, default: false },
		// G-code toolpath color controls
		isGcodeModel: { type: Boolean, default: false },
		gcodeColorMode: { type: String, default: 'single' }, // 'single' | 'gradient'
		gcodeSingleColor: { type: String, default: '#ff5722' },
	},

	emits: [
		'reset-view',
		'fit-to-view',
		'toggle-performance',
		'toggle-controller',
		'take-screenshot',
		'toggle-vr',
		'toggle-help',
		'toggle-tools',
		'toggle-animation-play',
		// G-code color events
		'toggle-gcode-color-mode',
		'change-gcode-color',
	],

	setup(props) {
		const performanceText = computed(() => {
			if (!props.fps) return t('threedviewer', 'Performance info')
			return t('threedviewer', 'FPS: {fps}', { fps: Math.round(props.fps) })
		})

		/**
		 * The format, for the line under the filename.
		 *
		 * Read off the name rather than taken as a prop: the parent has the filename and
		 * nothing else, and a prop nothing passes renders nothing while looking wired up.
		 *
		 * The helper handles the empty name, which matters more than it looks: `App.vue`
		 * declares `filename` with a `null` default, and a prop default only fills in for
		 * `undefined`, so this receives `null` every time the app opens without a model.
		 */
		const modelFormat = computed(() => getFormatLabel(props.modelName))

		/** Which of the three status colours the dot takes. */
		const fpsHealth = computed(() => {
			if (!props.fps) return 'unknown'
			if (props.fps < FPS_POOR) return 'poor'
			return props.fps < FPS_DEGRADED ? 'degraded' : 'good'
		})

		return {
			t,
			performanceText,
			modelFormat,
			fpsHealth,
		}
	},
}
</script>

<style scoped>
.minimal-top-bar {
	position: absolute;
	top: 0;
	inset-inline: 0;
	z-index: 100;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	height: var(--tdv-topbar-height);
	background: var(--tdv-canvas-dark);

	/*
	 * The mockup pads this bar 12px on both sides. The start side keeps a wider inset
	 * because Nextcloud draws its own navigation toggle over the top-left of the app
	 * content, inside this bar's own box. The previous bar reserved 45px for it with no
	 * recorded reason; loading the app on a Nextcloud 34 confirmed the toggle is there,
	 * centred around 33px in, so 45px is what keeps Reset from sitting underneath a
	 * button belonging to something else.
	 */
	padding: 0 12px 0 45px;
}

.bar-cluster {
	display: flex;
	gap: 2px;
	align-items: center;

	/* Above the centred title, which spans the bar and would otherwise sit on top. */
	position: relative;
	z-index: 1;
}

.bar-cluster--end {
	gap: 4px;
	margin-inline-start: auto;
}

/* ---------------------------------- Title ---------------------------------- */

.bar-title {
	position: absolute;
	inset-inline: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	max-width: 100%;
	line-height: 1.2;
	text-align: center;

	/* The clusters are the only interactive thing in this bar; the title must not take
	   a click meant for a button it happens to overlap. */
	pointer-events: none;
}

.model-name {
	max-width: 40vw;
	overflow: hidden;
	font-size: var(--tdv-font-size-body);
	font-weight: var(--tdv-font-weight-medium);
	color: var(--tdv-hud-text);
	text-overflow: ellipsis;
	white-space: nowrap;

	/* Re-enabled so the title attribute's tooltip still works on a truncated name. */
	pointer-events: auto;
}

.model-meta {
	font-size: 11px;
	color: var(--tdv-hud-text-secondary);
}

/* --------------------------------- Controls -------------------------------- */

/* Toggled-on icon button on the canvas chrome: the themed active pair is tuned for a
   light surface and disappears here. */
.tdv-btn--on-canvas.is-active {
	background: var(--tdv-hud-chip-bg);
	color: var(--tdv-hud-text);
}

.tools-btn {
	margin-inline-start: 4px;
	padding: 0 18px;
}

.fps-badge {
	display: flex;
	gap: 6px;
	align-items: center;
	height: 32px;
	margin-inline-end: 4px;
	padding: 0 12px;
	border: none;
	border-radius: 16px;
	background: var(--tdv-hud-chip-bg);

	/* Stated, not inherited: Nextcloud sets a colour on every button, and anything in
	   here without its own would take the light theme's text on this near-black pill. */
	color: var(--tdv-hud-text);
	cursor: pointer;
}

/*
 * Nextcloud paints every button's hover, focus and pressed states, and its selectors
 * outrank a bare class. Without these the pill turns pale blue under its own pale text
 * the moment it is clicked — and `:focus` has to be named alongside `:focus-visible`,
 * because a mouse click leaves a button focused but not focus-visible, which is the
 * state Nextcloud's rule was winning.
 */
.fps-badge:hover,
.fps-badge:focus,
.fps-badge:focus-visible {
	background: var(--tdv-hud-hover-bg);
	color: var(--tdv-hud-text);
}

.fps-badge:active {
	background: var(--tdv-hud-hover-bg) !important;
	color: var(--tdv-hud-text) !important;
}

.fps-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--tdv-hud-text-secondary);
}

.fps-dot--good { background: var(--tdv-hud-success); }
.fps-dot--degraded { background: var(--tdv-hud-warning); }
.fps-dot--poor { background: var(--tdv-hud-error); }

.fps-value {
	font-family: var(--tdv-font-mono);
	font-size: var(--tdv-font-size-secondary);
	font-weight: var(--tdv-font-weight-medium);
	color: var(--tdv-hud-text);
}

/* Topbar color picker */
.topbar-color-picker {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 36px;
	border-radius: 8px;

	/* The well behind a colour input, which is a swatch of the user's own colour: it needs
	   a neutral behind it in either theme, not the chrome's own surface. */
	background: var(--tdv-color-on-primary);
}

.topbar-color-picker input[type="color"] {
	width: 32px;
	height: 24px;
	padding: 0;
	border: none;
	border-radius: 4px;
	background: transparent;
	cursor: pointer;
	appearance: none;
}

/* --------------------------------- Narrow --------------------------------- */

.minimal-top-bar.mobile {
	gap: 4px;
	padding: 0 8px 0 45px;
}

.minimal-top-bar.mobile .btn-text {
	display: none;
}

.minimal-top-bar.mobile .tools-btn {
	padding: 0;
	width: var(--tdv-hit-target);
}

/*
 * Under 600px the two clusters meet in the middle and there is no centre left to put a
 * title in. It is hidden rather than shrunk: the filename is in the Files list the viewer
 * was opened from, and a name clipped to four characters is not information.
 */
@media (width <= 600px) {
	.bar-title {
		display: none;
	}
}

@media (width <= 480px) {
	.minimal-top-bar {
		gap: 2px;
		padding: 0 4px 0 45px;
	}

	.fps-badge {
		padding: 0 8px;
	}
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
	.tdv-btn,
	.fps-badge {
		transition: none;
	}
}

@media (prefers-contrast: high) {
	.tdv-btn,
	.fps-badge {
		border: 2px solid #fff;
	}
}

/* Landscape mobile optimization */
@media (height <= 500px) and (orientation: landscape) {
	.minimal-top-bar {
		height: 44px;
	}
}
</style>
