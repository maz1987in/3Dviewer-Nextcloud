<template>
	<div class="minimal-top-bar"
		role="toolbar"
		:aria-label="t('threedviewer', 'Quick actions')"
		:class="{ 'mobile': isMobile }">
		<!-- Left: Quick Actions -->
		<div class="left-section">
			<button :aria-label="t('threedviewer', 'Reset view')"
				class="quick-btn"
				:title="t('threedviewer', 'Reset view')"
				@click="$emit('reset-view')">
				<span class="btn-icon">🔄</span>
				<span class="btn-text">{{ t('threedviewer', 'Reset') }}</span>
			</button>

			<button :aria-label="t('threedviewer', 'Fit to view')"
				class="quick-btn"
				:title="t('threedviewer', 'Fit model to view')"
				@click="$emit('fit-to-view')">
				<span class="btn-icon">📏</span>
				<span class="btn-text">{{ t('threedviewer', 'Fit') }}</span>
			</button>
		</div>

		<!-- Center: Model Info -->
		<div class="center-section">
			<span class="model-name" :title="modelName">
				{{ modelName || t('threedviewer', '3D Viewer') }}
			</span>
			<span v-if="isLoading" class="loading-indicator">
				<span class="spinner">⏳</span>
				{{ t('threedviewer', 'Loading...') }}
			</span>
		</div>

		<!-- Right: Settings & Info -->
		<div class="right-section">
			<!-- Animation Play/Pause Button -->
			<button v-if="hasAnimations"
				:aria-label="isAnimationPlaying ? t('threedviewer', 'Pause animation') : t('threedviewer', 'Play animation')"
				class="icon-btn"
				:class="{ 'active': isAnimationPlaying }"
				:title="isAnimationPlaying ? t('threedviewer', 'Pause animation') : t('threedviewer', 'Play animation')"
				@click="$emit('toggle-animation-play')">
				<span class="btn-icon">{{ isAnimationPlaying ? '⏸️' : '▶️' }}</span>
			</button>

			<button v-if="showPerformance"
				:aria-label="t('threedviewer', 'Toggle performance stats')"
				class="icon-btn"
				:title="performanceText"
				@click="$emit('toggle-performance')">
				<span class="btn-icon">⚡</span>
				<span v-if="fps" class="fps-badge">{{ Math.round(fps) }}</span>
			</button>

			<button :aria-label="t('threedviewer', '3D Controller')"
				class="icon-btn"
				:class="{ 'active': showController }"
				:title="t('threedviewer', '3D Controller')"
				@click="$emit('toggle-controller')">
				<span class="btn-icon">🎮</span>
			</button>

			<button :aria-label="t('threedviewer', 'Take screenshot')"
				class="icon-btn"
				:title="t('threedviewer', 'Take screenshot')"
				@click="$emit('take-screenshot')">
				<span class="btn-icon">📷</span>
			</button>

			<button :aria-label="t('threedviewer', 'Help')"
				class="icon-btn"
				:title="t('threedviewer', 'Help & shortcuts')"
				@click="$emit('toggle-help')">
				<span class="btn-icon">ⓘ</span>
			</button>

			<!-- Tools Button - Last item -->
			<button :aria-label="t('threedviewer', 'Toggle tools panel')"
				class="tools-btn"
				:title="t('threedviewer', 'Toggle tools panel (T)')"
				@click="$emit('toggle-tools')">
				<span class="btn-icon">☰</span>
				<span class="btn-text">{{ t('threedviewer', 'Tools') }}</span>
			</button>
		</div>
	</div>
</template>

<script>
import { computed } from 'vue'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'

export default {
	name: 'MinimalTopBar',

	props: {
		modelName: { type: String, default: '' },
		isLoading: { type: Boolean, default: false },
		fps: { type: Number, default: 0 },
		showPerformance: { type: Boolean, default: false },
		showController: { type: Boolean, default: true },
		isMobile: { type: Boolean, default: false },
		hasAnimations: { type: Boolean, default: false },
		isAnimationPlaying: { type: Boolean, default: false },
	},

	emits: [
		'reset-view',
		'fit-to-view',
		'toggle-performance',
		'toggle-controller',
		'take-screenshot',
		'toggle-help',
		'toggle-tools',
		'toggle-animation-play',
	],

	setup(props, { emit }) {
		const performanceText = computed(() => {
			if (!props.fps) return t('threedviewer', 'Performance info')
			return t('threedviewer', 'FPS: {fps}', { fps: Math.round(props.fps) })
		})

		return {
			t,
			performanceText,
		}
	},
}
</script>

<style scoped>
.minimal-top-bar {
	position: absolute;
	top: 0;
	inset-inline: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 16px 12px 45px;
	background: rgb(0 0 0 / 85%);
	border-bottom: 1px solid rgb(255 255 255 / 20%);
	z-index: 100;
	gap: 16px;
	box-shadow: 0 1px 3px rgb(0 0 0 / 30%);
	backdrop-filter: blur(10px);
}

/* Sections */
.left-section,
.right-section {
	display: flex;
	align-items: center;
	gap: 8px;
}

.center-section {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 12px;
	min-width: 0; /* Allow text truncation */
}

/* Model Name */
.model-name {
	font-size: 15px;
	font-weight: 600;
	color: #fff;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 400px;
}

.loading-indicator {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 13px;
	color: rgb(255 255 255 / 70%);
}

.spinner {
	animation: spin 2s linear infinite;
}

@keyframes spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

/* Buttons */
.quick-btn,
.icon-btn {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 8px 12px;
	background: rgb(255 255 255 / 10%);
	border: 1px solid rgb(255 255 255 / 20%);
	border-radius: 6px;
	color: #fff;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s ease;
	white-space: nowrap;
}

.quick-btn:hover,
.icon-btn:hover {
	background: rgb(255 255 255 / 20%);
	border-color: rgb(255 255 255 / 40%);
	transform: translateY(-1px);
}

.quick-btn:active,
.icon-btn:active {
	transform: translateY(0);
}

.icon-btn {
	padding: 8px 10px;
	position: relative;
}

.icon-btn.active {
	background: rgb(0 130 201 / 80%) !important;
	border-color: rgb(0 130 201 / 60%) !important;
}

.btn-icon {
	font-size: 16px;
	line-height: 1;
}

.btn-text {
	font-size: 13px;
}

/* Tools Button - Nextcloud blue accent */
.tools-btn {
	background: rgb(0 130 201 / 80%) !important;
	border-color: rgb(0 130 201 / 40%) !important;
	color: #fff !important;
	font-weight: 600;
}

.tools-btn:hover {
	background: rgb(0 130 201 / 90%) !important;
	border-color: rgb(0 130 201 / 60%) !important;
	color: #fff !important;
}

.fps-badge {
	position: absolute;
	top: -4px;
	inset-inline-end: -4px;
	padding: 2px 5px;
	background: rgb(0 130 201 / 90%);
	color: #fff;
	font-size: 10px;
	font-weight: 700;
	border-radius: 8px;
	line-height: 1;
	box-shadow: 0 2px 4px rgb(0 0 0 / 30%);
}

/* Mobile Styles */
.minimal-top-bar.mobile {
	padding: 8px 12px;
	gap: 8px;
}

.minimal-top-bar.mobile .btn-text {
	display: none;
}

.minimal-top-bar.mobile .quick-btn,
.minimal-top-bar.mobile .icon-btn {
	padding: 8px;
	min-width: 40px;
	justify-content: center;
}

.minimal-top-bar.mobile .model-name {
	font-size: 13px;
	max-width: 200px;
}

.minimal-top-bar.mobile .loading-indicator {
	font-size: 11px;
}

/* Very small screens */
@media (width <= 480px) {
	.minimal-top-bar {
		padding: 6px 8px;
	}

	.left-section .quick-btn:last-child {
		display: none; /* Hide "Fit" button on very small screens */
	}

	.model-name {
		font-size: 12px;
		max-width: 120px;
	}

	.fps-badge {
		font-size: 9px;
		padding: 1px 4px;
	}
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
	.quick-btn,
	.icon-btn,
	.spinner {
		transition: none;
		animation: none;
	}
}

/* High contrast mode */
@media (prefers-contrast: high) {
	.quick-btn,
	.icon-btn {
		border-width: 2px;
		border-color: white;
	}
}

/* Landscape mobile optimization */
@media (height <= 500px) and (orientation: landscape) {
	.minimal-top-bar {
		padding: 4px 8px;
	}

	.quick-btn,
	.icon-btn {
		padding: 6px 8px;
	}
}

/* RTL (Right-to-Left) Support */
[dir="rtl"] .btn-group {
	flex-direction: row-reverse;
}

[dir="rtl"] .quick-btn,
[dir="rtl"] .icon-btn {
	margin-inline: 0 4px;
}

[dir="rtl"] .quick-btn:first-child,
[dir="rtl"] .icon-btn:first-child {
	margin-inline-end: 0;
}
</style>
