<template>
	<div class="help-panel-backdrop" @click="close">
		<div class="help-panel"
			role="dialog"
			aria-labelledby="help-title"
			@click.stop>
			<!-- Header -->
			<div class="help-header">
				<h2 id="help-title">
					{{ t('threedviewer', '3D Viewer Help') }}
				</h2>
				<button class="close-btn" :aria-label="t('threedviewer', 'Close help')" @click="close">
					×
				</button>
			</div>

			<!-- Content -->
			<div class="help-content">
				<!-- 3D CONTROLLER Section -->
				<section class="help-section">
					<h3>{{ t('threedviewer', '3D Controller') }}</h3>
					<div class="help-grid">
						<div class="help-item">
							<span class="help-icon">🎮</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Toggle Controller') }}</h4>
								<p>{{ t('threedviewer', 'Show or hide the 3D navigation controller from the top toolbar. The controller is draggable and can be positioned anywhere on screen.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">🔄</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Rotation Mode') }}</h4>
								<p>{{ t('threedviewer', 'Click or drag on the circular ring to rotate the model. Click farther from center for faster rotation.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">↔</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Panning Mode') }}</h4>
								<p>{{ t('threedviewer', 'Click the panning mode button to switch from rotation to panning. Click or drag to move the camera horizontally or vertically.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">±</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Zoom Controls') }}</h4>
								<p>{{ t('threedviewer', 'Use the + and - buttons on the controller to zoom in or out. Hold to zoom continuously.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">⌂</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Reset Position') }}</h4>
								<p>{{ t('threedviewer', 'In panning mode, click the reset button to return the camera to the centered position.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">↔</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Drag to Move') }}</h4>
								<p>{{ t('threedviewer', 'Drag the controller by its edge to reposition it anywhere on the screen. Position is saved automatically.') }}</p>
							</div>
						</div>
					</div>
				</section>

				<!-- VIEW Section -->
				<section class="help-section">
					<h3>{{ t('threedviewer', 'VIEW Controls') }}</h3>
					<div class="help-grid">
						<div class="help-item">
							<span class="help-icon">🔄</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Reset View') }}</h4>
								<p>{{ t('threedviewer', 'Reset camera to initial position and zoom level.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">📏</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Fit to View') }}</h4>
								<p>{{ t('threedviewer', 'Automatically adjust camera to fit the entire model on screen.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">🔄</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Auto-Rotate') }}</h4>
								<p>{{ t('threedviewer', 'Automatically rotate the model continuously. You can still zoom while rotating.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">👁️</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Camera Projection') }}</h4>
								<p>{{ t('threedviewer', 'Toggle between Perspective (realistic depth) and Orthographic (parallel lines) camera modes.') }}</p>
							</div>
						</div>
					</div>
				</section>

				<!-- DISPLAY Section -->
				<section class="help-section">
					<h3>{{ t('threedviewer', 'DISPLAY Options') }}</h3>
					<div class="help-grid">
						<div class="help-item">
							<span class="help-icon">⊞</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Grid') }}</h4>
								<p>{{ t('threedviewer', 'Show or hide the ground grid. Helps visualize model orientation and scale.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">📐</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Axes') }}</h4>
								<p>{{ t('threedviewer', 'Show or hide coordinate axes (Red=X, Green=Y, Blue=Z).') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">🔲</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Wireframe') }}</h4>
								<p>{{ t('threedviewer', 'Toggle wireframe mode to see the model\'s edge structure.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">🎨</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Background Color') }}</h4>
								<p>{{ t('threedviewer', 'Change the scene background color using the color picker.') }}</p>
							</div>
						</div>
					</div>
				</section>

				<!-- TOOLS Section -->
				<section class="help-section">
					<h3>{{ t('threedviewer', 'TOOLS') }}</h3>
					<div class="help-grid">
						<div class="help-item">
							<span class="help-icon">📏</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Measurement') }}</h4>
								<p>{{ t('threedviewer', 'Click on two points to measure distance. Switch units between mm, cm, m, inches, and feet.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">📝</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Annotation') }}</h4>
								<p>{{ t('threedviewer', 'Click on the model to add text notes. Edit or delete annotations as needed.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">⚖️</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Comparison') }}</h4>
								<p>{{ t('threedviewer', 'Compare two 3D models side-by-side. Select a second model to compare with the current one.') }}</p>
							</div>
						</div>
					</div>
				</section>

				<!-- SETTINGS Section -->
				<section class="help-section">
					<h3>{{ t('threedviewer', 'SETTINGS') }}</h3>
					<div class="help-grid">
						<div class="help-item">
							<span class="help-icon">⚡</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Performance') }}</h4>
								<p>{{ t('threedviewer', 'Cycle through quality modes: Auto (detects your device), Low, Balanced, High, Ultra. Affects rendering quality and frame rate.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">🌓</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Theme') }}</h4>
								<p>{{ t('threedviewer', 'Choose theme: Auto (follows system), Light, or Dark mode.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">📊</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Model Statistics') }}</h4>
								<p>{{ t('threedviewer', 'View detailed information: vertices, faces, materials, textures, and dimensions.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">📦</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Export Model') }}</h4>
								<p>{{ t('threedviewer', 'Export the current model as GLB (with textures), STL (for 3D printing), or OBJ (universal format).') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">🗑️</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Clear Cache') }}</h4>
								<p>{{ t('threedviewer', 'Clear cached textures and dependencies. Use if models aren\'t loading correctly.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<span class="help-icon">📷</span>
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Screenshot') }}</h4>
								<p>{{ t('threedviewer', 'Capture high-quality screenshots of the current 3D view. Screenshots are saved as PNG images with the model name and timestamp.') }}</p>
							</div>
						</div>
					</div>
				</section>

				<!-- KEYBOARD SHORTCUTS Section -->
				<section class="help-section">
					<h3>{{ t('threedviewer', 'Keyboard Shortcuts') }}</h3>
					<div class="shortcuts-table">
						<div class="shortcut-row">
							<kbd>T</kbd>
							<span>{{ t('threedviewer', 'Toggle tools panel') }}</span>
						</div>
						<div class="shortcut-row">
							<kbd>Escape</kbd>
							<span>{{ t('threedviewer', 'Close open panels and dialogs') }}</span>
						</div>
						<div class="shortcut-row">
							<kbd>{{ t('threedviewer', 'Mouse Drag') }}</kbd>
							<span>{{ t('threedviewer', 'Rotate camera around model') }}</span>
						</div>
						<div class="shortcut-row">
							<kbd>{{ t('threedviewer', 'Mouse Wheel') }}</kbd>
							<span>{{ t('threedviewer', 'Zoom in/out') }}</span>
						</div>
						<div class="shortcut-row">
							<kbd>{{ t('threedviewer', 'Right-Click Drag') }}</kbd>
							<span>{{ t('threedviewer', 'Pan camera') }}</span>
						</div>
						<div class="shortcut-row">
							<kbd>{{ t('threedviewer', 'Double-Click') }}</kbd>
							<span>{{ t('threedviewer', 'Focus on clicked point') }}</span>
						</div>
					</div>
				</section>

				<!-- TIPS Section -->
				<section class="help-section">
					<h3>{{ t('threedviewer', 'Tips & Tricks') }}</h3>
					<ul class="tips-list">
						<li>{{ t('threedviewer', 'Models load instantly! Textures appear progressively in the background.') }}</li>
						<li>{{ t('threedviewer', 'Textures in subdirectories (like "Texture/" folder) are automatically found.') }}</li>
						<li>{{ t('threedviewer', 'Dependencies (MTL files, textures) are cached for 7 days for faster reloads.') }}</li>
						<li>{{ t('threedviewer', 'Auto mode detects your device capabilities for optimal performance.') }}</li>
						<li>{{ t('threedviewer', 'All formats supported: {formats}', { formats: supportedFormats }) }}</li>
						<li>{{ t('threedviewer', 'Use comparison mode to spot differences between model versions.') }}</li>
					</ul>
				</section>
			</div>
		</div>
	</div>
</template>

<script>
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { FORMATS_DISPLAY_LIST } from '../config/viewer-config.js'

export default {
	name: 'HelpPanel',

	emits: ['close'],

	setup(props, { emit }) {
		const close = () => {
			emit('close')
		}

		// Handle Escape key to close
		const handleKeydown = (event) => {
			if (event.key === 'Escape') {
				close()
			}
		}

		// Add event listener on mount
		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', handleKeydown)
		}

		// Cleanup on unmount
		const cleanup = () => {
			if (typeof window !== 'undefined') {
				window.removeEventListener('keydown', handleKeydown)
			}
		}

		return {
			t,
			close,
			cleanup,
			supportedFormats: FORMATS_DISPLAY_LIST,
		}
	},

	beforeUnmount() {
		this.cleanup()
	},
}
</script>

<style scoped>
/* Backdrop */
.help-panel-backdrop {
	position: fixed;
	top: 0;
	inset-inline: 0;
	bottom: 0;
	background: rgb(0 0 0 / 70%);
	backdrop-filter: blur(4px);
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 20px;
	overflow: auto;
}

/* Panel Container */
.help-panel {
	background: var(--color-main-background);
	color: var(--color-main-text);
	border-radius: 12px;
	max-width: 900px;
	width: 100%;
	max-height: 90vh;
	display: flex;
	flex-direction: column;
	box-shadow: 0 8px 32px rgb(0 0 0 / 30%);
	animation: slide-in 0.3s ease;
}

@keyframes slide-in {
	from {
		opacity: 0;
		transform: scale(0.95) translateY(-20px);
	}

	to {
		opacity: 1;
		transform: scale(1) translateY(0);
	}
}

/* Header */
.help-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 20px 24px;
	border-bottom: 1px solid var(--color-border);
	background: var(--color-main-background);
	border-radius: 12px 12px 0 0;
}

.help-header h2 {
	margin: 0;
	font-size: 22px;
	font-weight: 600;
	color: var(--color-main-text);
}

.close-btn {
	background: transparent;
	border: none;
	color: var(--color-main-text);
	font-size: 32px;
	line-height: 1;
	cursor: pointer;
	padding: 4px 8px;
	border-radius: 6px;
	transition: background 0.2s ease;
}

.close-btn:hover {
	background: var(--color-background-hover);
}

.close-btn:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

/* Content Area */
.help-content {
	padding: 24px;
	overflow-y: auto;
	flex: 1;
}

/* Sections */
.help-section {
	margin-bottom: 32px;
}

.help-section:last-child {
	margin-bottom: 0;
}

.help-section h3 {
	font-size: 18px;
	font-weight: 600;
	color: var(--color-primary-element);
	margin: 0 0 16px;
	padding-bottom: 8px;
	border-bottom: 2px solid var(--color-primary-element);
}

/* Help Grid */
.help-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 16px;
}

.help-item {
	display: flex;
	gap: 12px;
	padding: 16px;
	background: var(--color-background-hover);
	border-radius: 8px;
	transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.help-item:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
}

.help-icon {
	font-size: 28px;
	flex-shrink: 0;
	width: 40px;
	height: 40px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--color-primary-element-light);
	border-radius: 8px;
}

.help-text {
	flex: 1;
}

.help-text h4 {
	margin: 0 0 6px;
	font-size: 15px;
	font-weight: 600;
	color: var(--color-main-text);
}

.help-text p {
	margin: 0;
	font-size: 13px;
	line-height: 1.5;
	color: var(--color-text-maxcontrast);
}

/* Keyboard Shortcuts Table */
.shortcuts-table {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.shortcut-row {
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 12px 16px;
	background: var(--color-background-hover);
	border-radius: 8px;
}

.shortcut-row kbd {
	display: inline-block;
	padding: 6px 12px;
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 6px;
	font-family: monospace;
	font-size: 13px;
	font-weight: 600;
	color: var(--color-main-text);
	min-width: 80px;
	text-align: center;
	box-shadow: 0 2px 4px rgb(0 0 0 / 10%);
}

.shortcut-row span {
	flex: 1;
	font-size: 14px;
	color: var(--color-main-text);
}

/* Tips List */
.tips-list {
	margin: 0;
	padding: 0 0 0 24px;
	list-style: none;
}

.tips-list li {
	margin-bottom: 12px;
	font-size: 14px;
	line-height: 1.6;
	color: var(--color-main-text);
	position: relative;
	padding-inline-start: 8px;
}

.tips-list li::before {
	content: '💡';
	position: absolute;
	inset-inline-start: -24px;
}

.tips-list li:last-child {
	margin-bottom: 0;
}

/* Mobile Responsive */
@media (width <= 768px) {
	.help-panel {
		max-width: 100%;
		max-height: 100vh;
		border-radius: 0;
		margin: 0;
	}

	.help-header {
		border-radius: 0;
		padding: 16px 20px;
	}

	.help-header h2 {
		font-size: 20px;
	}

	.help-content {
		padding: 20px;
	}

	.help-grid {
		grid-template-columns: 1fr;
	}

	.help-section {
		margin-bottom: 24px;
	}

	.shortcut-row {
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	.shortcut-row kbd {
		min-width: 60px;
	}
}

/* RTL Support */
[dir="rtl"] .help-item {
	flex-direction: row-reverse;
}

[dir="rtl"] .tips-list {
	padding: 0 24px 0 0;
}

[dir="rtl"] .tips-list li {
	padding-inline: 0 8px;
}

[dir="rtl"] .tips-list li::before {
	inset-inline: auto -24px;
}

/* Theme-aware colors */
.theme--dark .help-icon {
	background: rgba(var(--color-primary-element-rgb), 0.2);
}

.theme--dark .help-item:hover {
	box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
	.help-panel {
		animation: none;
	}

	.help-item {
		transition: none;
	}
}

/* Scrollbar styling */
.help-content::-webkit-scrollbar {
	width: 8px;
}

.help-content::-webkit-scrollbar-track {
	background: var(--color-background-dark);
	border-radius: 4px;
}

.help-content::-webkit-scrollbar-thumb {
	background: var(--color-primary-element);
	border-radius: 4px;
}

.help-content::-webkit-scrollbar-thumb:hover {
	background: var(--color-primary-element-hover);
}
</style>
