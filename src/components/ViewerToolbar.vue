<template>
	<div class="viewer-toolbar" role="toolbar" :aria-label="t('threedviewer', '3D viewer controls')" :class="{ 'mobile': isMobile }">
		<div class="toolbar-main">
			<button @click="$emit('reset-view')" :aria-label="t('threedviewer','Reset view')" class="tb" type="button">
				<span class="tb-icon">🔄</span>
				<span class="tb-text">{{ t('threedviewer','Reset') }}</span>
			</button>
			<button @click="$emit('fit-to-view')" :aria-label="t('threedviewer','Fit to view')" class="tb" type="button" :title="t('threedviewer','Fit model to view')">
				<span class="tb-icon">📏</span>
				<span class="tb-text">{{ t('threedviewer','Fit') }}</span>
			</button>
			<button @click="$emit('toggle-auto-rotate')" :aria-pressed="autoRotate" :aria-label="t('threedviewer','Toggle auto-rotate')" class="tb" type="button" :title="t('threedviewer','Toggle auto-rotate')">
				<span class="tb-icon">🔄</span>
				<span class="tb-text">{{ autoRotate ? t('threedviewer','Auto-rotate on') : t('threedviewer','Auto-rotate off') }}</span>
			</button>
			<div class="view-presets" v-if="!isMobile">
				<select @change="$emit('change-preset', $event.target.value)" :value="currentPreset" class="preset-select" :title="t('threedviewer','Camera presets')">
					<option value="">{{ t('threedviewer','View Presets') }}</option>
					<option v-for="preset in presets" :key="preset.name" :value="preset.name">{{ preset.label }}</option>
				</select>
			</div>
			<button @click="$emit('toggle-grid')" :aria-pressed="grid" :aria-label="t('threedviewer','Toggle grid')" class="tb" type="button" :title="t('threedviewer','Toggle grid')">
				<span class="tb-icon">⊞</span>
				<span class="tb-text">{{ grid ? t('threedviewer','Grid on') : t('threedviewer','Grid off') }}</span>
			</button>
			<button @click="$emit('toggle-axes')" :aria-pressed="axes" :aria-label="t('threedviewer','Toggle axes')" class="tb" type="button" :title="t('threedviewer','Toggle axes')">
				<span class="tb-icon">📐</span>
				<span class="tb-text">{{ axes ? t('threedviewer','Axes on') : t('threedviewer','Axes off') }}</span>
			</button>
			<button @click="$emit('toggle-wireframe')" :aria-pressed="wireframe" :aria-label="t('threedviewer','Toggle wireframe')" class="tb" type="button" :title="t('threedviewer','Toggle wireframe')">
				<span class="tb-icon">🔲</span>
				<span class="tb-text">{{ wireframe ? t('threedviewer','Wireframe on') : t('threedviewer','Wireframe off') }}</span>
			</button>
		</div>
		<div class="toolbar-secondary">
			<label class="color-picker" :aria-label="t('threedviewer','Background color')">
				<span class="tb-icon">🎨</span>
				<input type="color" :value="background" @input="$emit('change-background', $event.target.value)" />
			</label>
		</div>
	</div>
</template>

<script>
export default {
	name: 'ViewerToolbar',
	props: {
		grid: { type: Boolean, default: true },
		axes: { type: Boolean, default: true },
		wireframe: { type: Boolean, default: false },
		background: { type: String, default: '#f5f5f5' },
		autoRotate: { type: Boolean, default: false },
		presets: { type: Array, default: () => [] },
		currentPreset: { type: String, default: '' },
	},
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
	beforeDestroy() {
		window.removeEventListener('resize', this.handleResize)
		this.removeKeyboardNavigation()
	},
	methods: {
		detectMobile() {
			return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
				   (navigator.maxTouchPoints && navigator.maxTouchPoints > 1) ||
				   window.innerWidth <= 768
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
		}
	}
}
</script>

<style scoped>
.viewer-toolbar {
	position: absolute;
	top: 8px;
	left: 8px;
	z-index: 10;
	background: rgba(0,0,0,0.45);
	backdrop-filter: blur(8px);
	padding: 6px 8px;
	border-radius: 8px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	align-items: center;
	transition: all 0.3s ease;
	border: 1px solid rgba(255, 255, 255, 0.1);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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

.tb {
	font-size: 11px;
	line-height: 1;
	padding: 6px 8px;
	background: var(--color-primary-element, #1976d2);
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
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	position: relative;
	overflow: hidden;
}

.tb::before {
	content: '';
	position: absolute;
	top: 0;
	left: -100%;
	width: 100%;
	height: 100%;
	background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
	transition: left 0.5s;
}

.tb:hover::before {
	left: 100%;
}

.tb-icon {
	font-size: 12px;
	line-height: 1;
}

.tb-text {
	font-size: 10px;
	white-space: nowrap;
}

.tb[aria-pressed="true"] {
	background: var(--color-success, #2e7d32);
}

.tb:focus-visible {
	outline: 2px solid var(--color-primary-text, #fff);
	outline-offset: 2px;
}

.tb:hover {
	background: var(--color-primary-element-hover, #1565c0);
	transform: translateY(-1px);
}

.color-picker {
	display: flex;
	align-items: center;
	gap: 4px;
	cursor: pointer;
	padding: 4px 6px;
	background: var(--color-primary-element, #1976d2);
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
	border: 1px solid rgba(255, 255, 255, 0.3);
	border-radius: 4px;
	background: rgba(255, 255, 255, 0.1);
	color: white;
	cursor: pointer;
	min-width: 100px;
}

.preset-select:focus {
	outline: 2px solid var(--color-primary-text, #fff);
	outline-offset: 2px;
}

.preset-select option {
	background: #333;
	color: white;
}

/* Mobile-specific styles */
.viewer-toolbar.mobile {
	top: 4px;
	left: 4px;
	right: 4px;
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
@media (max-width: 768px) and (orientation: landscape) {
	.viewer-toolbar.mobile {
		top: 2px;
		left: 2px;
		right: 2px;
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
@media (max-width: 480px) {
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
.dark-theme .viewer-toolbar {
	background: rgba(30, 30, 30, 0.8);
	border-color: rgba(255, 255, 255, 0.2);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.dark-theme .tb {
	background: var(--color-primary, #64b5f6);
	color: #000;
}

.dark-theme .tb[aria-pressed="true"] {
	background: var(--color-success, #4caf50);
	color: #fff;
}

.dark-theme .color-picker {
	background: var(--color-primary, #64b5f6);
}

.dark-theme .preset-select {
	background: rgba(255, 255, 255, 0.1);
	border-color: rgba(255, 255, 255, 0.3);
	color: white;
}

.dark-theme .preset-select option {
	background: #2d2d2d;
	color: white;
}

/* Accessibility improvements */
.tb:focus-visible,
.color-picker:focus-visible,
.preset-select:focus-visible {
	outline: 2px solid var(--color-primary, #0d47a1);
	outline-offset: 2px;
	box-shadow: 0 0 0 4px rgba(13, 71, 161, 0.2);
}

/* High contrast mode */
@media (prefers-contrast: high) {
	.tb {
		border: 2px solid currentColor;
	}
	
	.viewer-toolbar {
		border: 2px solid rgba(255, 255, 255, 0.5);
	}
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
	.tb::before {
		display: none;
	}
	
	.tb:hover {
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
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
</style>
