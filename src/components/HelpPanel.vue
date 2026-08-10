<template>
	<div class="help-panel-backdrop" @click="close">
		<div ref="panelRef"
			class="help-panel"
			role="dialog"
			aria-modal="true"
			aria-labelledby="help-title"
			tabindex="-1"
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
							<ViewerIcon class="help-icon" name="controller" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Toggle Controller') }}</h4>
								<p>{{ t('threedviewer', 'Show or hide the 3D navigation controller from the top toolbar. The controller is draggable and can be positioned anywhere on screen.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="resetView" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Rotation Mode') }}</h4>
								<p>{{ t('threedviewer', 'Click or drag on the circular ring to rotate the model. Click farther from center for faster rotation.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="panMode" :size="18" />
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
							<ViewerIcon class="help-icon" name="panMode" :size="18" />
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
							<ViewerIcon class="help-icon" name="resetView" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Reset View') }}</h4>
								<p>{{ t('threedviewer', 'Reset camera to initial position and zoom level.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="measurement" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Fit to View') }}</h4>
								<p>{{ t('threedviewer', 'Automatically adjust camera to fit the entire model on screen.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="resetView" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Auto-Rotate') }}</h4>
								<p>{{ t('threedviewer', 'Automatically rotate the model continuously. You can still zoom while rotating.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="visibility" :size="18" />
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
							<ViewerIcon class="help-icon" name="projection" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Axes') }}</h4>
								<p>{{ t('threedviewer', 'Show or hide coordinate axes (Red=X, Green=Y, Blue=Z).') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="wireframe" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Wireframe') }}</h4>
								<p>{{ t('threedviewer', 'Toggle wireframe mode to see the model\'s edge structure.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="palette" :size="18" />
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
							<ViewerIcon class="help-icon" name="measurement" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Measurement') }}</h4>
								<p>{{ t('threedviewer', 'Click on two points to measure distance. Switch units between mm, cm, m, inches, and feet.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="annotation" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Annotation') }}</h4>
								<p>{{ t('threedviewer', 'Click on the model to add text notes. Edit or delete annotations as needed.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="comparison" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Comparison') }}</h4>
								<p>{{ t('threedviewer', 'Compare two 3D models side-by-side. Select a second model to compare with the current one.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="crossSection" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Cross-Section') }}</h4>
								<p>{{ t('threedviewer', 'Slice through the model along X, Y, or Z axes. Adjust position with the slider and flip direction to view either side.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="explode" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Exploded View') }}</h4>
								<p>{{ t('threedviewer', 'For multi-mesh models, spread parts outward from center. Adjust the explosion factor with the slider. Only available when the model has 2 or more meshes.') }}</p>
							</div>
						</div>
					</div>
				</section>

				<!-- SLICER & EXPORT Section -->
				<section class="help-section">
					<h3>{{ t('threedviewer', 'SLICER & EXPORT') }}</h3>
					<div class="help-grid">
						<div class="help-item">
							<ViewerIcon class="help-icon" name="sendToSlicer" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Send to Slicer') }}</h4>
								<p>{{ t('threedviewer', 'Export and send the model to a desktop slicer app (PrusaSlicer, Cura, BambuStudio, etc.). Choose STL, OBJ, or PLY format before sending. A temporary share link is created automatically.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="package" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Export Model') }}</h4>
								<p>{{ t('threedviewer', 'Download the model as GLB (with textures), STL (for 3D printing), or OBJ (universal format). Large models show a triangle count warning before export.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="camera" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Screenshot') }}</h4>
								<p>{{ t('threedviewer', 'Capture a PNG screenshot of the current view. Also available in the modal file preview.') }}</p>
							</div>
						</div>
					</div>
				</section>

				<!-- SETTINGS Section -->
				<section class="help-section">
					<h3>{{ t('threedviewer', 'SETTINGS') }}</h3>
					<div class="help-grid">
						<div class="help-item">
							<ViewerIcon class="help-icon" name="performance" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Performance') }}</h4>
								<p>{{ t('threedviewer', 'Cycle through quality modes: Auto (detects your device), Low, Balanced, High, Ultra. Affects rendering quality and frame rate.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="themeAuto" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Theme') }}</h4>
								<p>{{ t('threedviewer', 'Choose theme: Auto (follows system), Light, or Dark mode.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="hint" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Lighting Presets') }}</h4>
								<p>{{ t('threedviewer', 'Quick-switch between 5 lighting setups: Default, Studio, Outdoor, Dramatic, and Flat. Each adjusts ambient, directional, and point lights.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="bookmark" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Bookmarks') }}</h4>
								<p>{{ t('threedviewer', 'Save camera positions with display state (grid, axes, wireframe). Click a bookmark to restore the view. Bookmarks persist in your browser.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="statistics" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Model Statistics') }}</h4>
								<p>{{ t('threedviewer', 'View detailed information: vertices, faces, materials, textures, and dimensions.') }}</p>
							</div>
						</div>
						<div class="help-item">
							<ViewerIcon class="help-icon" name="database" :size="18" />
							<div class="help-text">
								<h4>{{ t('threedviewer', 'Dependency Cache') }}</h4>
								<p>{{ t('threedviewer', 'Textures and materials are cached locally in your browser for faster reloads. Configure max size, expiration, or clear the cache in Personal Settings.') }}</p>
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
						<!--
							From the same table the tools panel prints its row hints from, so this
							list cannot fall behind the shortcuts that exist — which it had, listing
							two of them while the panel offered none.
						-->
						<div v-for="shortcut in toolShortcuts" :key="shortcut.key" class="shortcut-row">
							<kbd>{{ shortcut.key.toUpperCase() }}</kbd>
							<span>{{ shortcutLabels[shortcut.event] }}</span>
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
						<li>{{ t('threedviewer', 'Dependencies (MTL files, textures) are cached locally for faster reloads. Configure in Personal Settings.') }}</li>
						<li>{{ t('threedviewer', 'Auto mode detects your device capabilities for optimal performance.') }}</li>
						<li>{{ t('threedviewer', 'All formats supported: {formats}', { formats: supportedFormats }) }}</li>
						<li>{{ t('threedviewer', 'Send to Slicer creates a temporary 24-hour share link — the file is auto-cleaned after use.') }}</li>
					</ul>
				</section>
			</div>
		</div>
	</div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import ViewerIcon from './ViewerIcon.vue'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { FORMATS_DISPLAY_LIST } from '../config/viewer-config.js'
import { useFocusTrap } from '../composables/useFocusTrap.js'
import { TOOL_SHORTCUTS } from '../utils/toolShortcuts.js'

export default {
	name: 'HelpPanel',

	components: {
		ViewerIcon,
	},

	emits: ['close'],

	setup(props, { emit }) {
		const panelRef = ref(null)
		const focusTrap = useFocusTrap(panelRef)

		const close = () => {
			emit('close')
		}

		// Handle Escape key to close
		const handleKeydown = (event) => {
			if (event.key === 'Escape') {
				close()
			}
		}

		onMounted(() => {
			if (typeof window !== 'undefined') {
				window.addEventListener('keydown', handleKeydown)
			}
			// Panel is only mounted when open; activate trap once template is ready.
			nextTick(() => focusTrap.activate())
		})

		onBeforeUnmount(() => {
			if (typeof window !== 'undefined') {
				window.removeEventListener('keydown', handleKeydown)
			}
			focusTrap.deactivate()
		})

		return {
			t,
			panelRef,
			close,
			supportedFormats: FORMATS_DISPLAY_LIST,
			toolShortcuts: TOOL_SHORTCUTS,
			// What each shortcut does, in this panel's words. Keyed by the event so a key
			// that moves in the table moves here with it.
			shortcutLabels: {
				'reset-view': t('threedviewer', 'Reset the view'),
				'fit-to-view': t('threedviewer', 'Fit the model to the view'),
				'toggle-measurement': t('threedviewer', 'Toggle measurement mode'),
				'toggle-stats': t('threedviewer', 'Toggle model statistics'),
				'take-screenshot': t('threedviewer', 'Take a screenshot'),
				'toggle-help': t('threedviewer', 'Open this help'),
			},
		}
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
	background: var(--tdv-color-surface);
	color: var(--tdv-color-text);
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
	border-bottom: 1px solid var(--tdv-color-border);
	background: var(--tdv-color-surface);
	border-radius: 12px 12px 0 0;
}

.help-header h2 {
	margin: 0;
	font-size: 22px;
	font-weight: 600;
	color: var(--tdv-color-text);
}

.close-btn.close-btn {
	background: transparent;
	border: none;
	color: var(--tdv-color-text);
	font-size: 32px;
	line-height: 1;
	cursor: pointer;
	padding: 4px 8px;
	border-radius: 6px;
	transition: background 0.2s ease;
}

.close-btn.close-btn:hover {
	background: var(--tdv-color-hover-bg);
}

.close-btn.close-btn:focus-visible {
	outline: 2px solid var(--tdv-color-primary);
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
	color: var(--tdv-color-primary-text);
	margin: 0 0 16px;
	padding-bottom: 8px;
	border-bottom: 2px solid var(--tdv-color-primary);
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
	background: var(--tdv-color-hover-bg);
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
	background: var(--tdv-color-primary-light);
	border-radius: 8px;
}

.help-text {
	flex: 1;
}

.help-text h4 {
	margin: 0 0 6px;
	font-size: 15px;
	font-weight: 600;
	color: var(--tdv-color-text);
}

.help-text p {
	margin: 0;
	font-size: 13px;
	line-height: 1.5;
	color: var(--tdv-color-text-secondary);
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
	background: var(--tdv-color-hover-bg);
	border-radius: 8px;
}

.shortcut-row kbd {
	display: inline-block;
	padding: 6px 12px;
	background: var(--tdv-color-surface-sunken);
	border: 1px solid var(--tdv-color-border);
	border-radius: 6px;
	font-family: monospace;
	font-size: 13px;
	font-weight: 600;
	color: var(--tdv-color-text);
	min-width: 80px;
	text-align: center;
	box-shadow: 0 2px 4px rgb(0 0 0 / 10%);
}

.shortcut-row span {
	flex: 1;
	font-size: 14px;
	color: var(--tdv-color-text);
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
	color: var(--tdv-color-text);
	position: relative;
	padding-inline-start: 8px;
}

.tips-list li::before {
	content: '';
	position: absolute;
	inset-inline-start: -16px;
	top: 8px;
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--tdv-color-primary);
}

.tips-list li:last-child {
	margin-bottom: 0;
}

/* Mobile Responsive */
@media (width <= 768px) {
	.help-panel-backdrop {
		padding: 0;
		align-items: stretch;
		justify-content: stretch;
		top: 50px;
		height: calc(100vh - 50px);
		bottom: auto;
	}

	.help-panel {
		max-width: 100%;
		width: 100%;
		max-height: 100%;
		height: 100%;
		border-radius: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
	}

	.help-header {
		border-radius: 0;
		padding: 10px 12px;
		position: relative;
		background: var(--tdv-color-surface);
		border-bottom: 1px solid var(--tdv-color-border);
		flex-shrink: 0;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.help-header h2 {
		font-size: 16px;
		margin: 0;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}

	.close-btn.close-btn {
		font-size: 22px;
		padding: 6px;
		min-width: 32px;
		min-height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border-radius: 4px;
	}

	.help-content {
		padding: 12px;
		overflow-y: auto;
		flex: 1;
		-webkit-overflow-scrolling: touch;
	}

	.help-section {
		margin-bottom: 16px;
	}

	.help-section:last-child {
		margin-bottom: 0;
	}

	.help-section h3 {
		font-size: 14px;
		margin: 0 0 8px;
		padding-bottom: 4px;
		font-weight: 600;
	}

	.help-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.help-item {
		padding: 8px;
		gap: 8px;
		flex-direction: row;
		align-items: flex-start;
	}

	.help-icon {
		font-size: 18px;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
	}

	.help-text {
		flex: 1;
		min-width: 0;
	}

	.help-text h4 {
		font-size: 13px;
		margin: 0 0 2px;
		font-weight: 600;
		line-height: 1.3;
	}

	.help-text p {
		font-size: 11px;
		line-height: 1.3;
		margin: 0;
	}

	.shortcuts-table {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.shortcut-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
	}

	.shortcut-row kbd {
		min-width: 50px;
		padding: 2px 6px;
		font-size: 10px;
		flex-shrink: 0;
	}

	.shortcut-row span {
		font-size: 11px;
		flex: 1;
		min-width: 0;
	}

	.tips-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tips-list li {
		margin-bottom: 6px;
		font-size: 11px;
		line-height: 1.3;
		padding: 4px 0 4px 20px;
		position: relative;
	}

	.tips-list li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 8px;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--tdv-color-primary);
	}

	.tips-list li:last-child {
		margin-bottom: 0;
	}
}

/* Very small screens */
@media (width <= 400px) {
	.help-header {
		padding: 8px 10px;
		min-height: 40px;
	}

	.help-header h2 {
		font-size: 14px;
	}

	.close-btn.close-btn {
		font-size: 18px;
		min-width: 28px;
		min-height: 28px;
		padding: 4px;
	}

	.help-content {
		padding: 10px;
	}

	.help-section {
		margin-bottom: 12px;
	}

	.help-section h3 {
		font-size: 13px;
	}

	.help-item {
		padding: 6px;
		gap: 6px;
	}

	.help-icon {
		font-size: 16px;
		width: 24px;
		height: 24px;
	}

	.help-text h4 {
		font-size: 12px;
	}

	.help-text p {
		font-size: 10px;
	}

	.shortcut-row {
		padding: 4px 6px;
		gap: 6px;
	}

	.shortcut-row kbd {
		min-width: 40px;
		padding: 2px 4px;
		font-size: 9px;
	}

	.shortcut-row span {
		font-size: 10px;
	}

	.tips-list li {
		font-size: 10px;
		padding: 3px 0 3px 18px;
	}

	.tips-list li::before {
		font-size: 9px;
		top: 3px;
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
	/* `--color-primary-element-rgb` is not a variable Nextcloud publishes — it appears
	   nowhere among the 267 primary-variable references in @nextcloud/vue — and an
	   unresolvable var() takes the whole declaration with it, so this icon has had no
	   tint at all. color-mix asks for the same 20% of the primary without needing the
	   colour pre-split into components. */
	background: color-mix(in srgb, var(--tdv-color-primary) 20%, transparent);
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
	background: var(--tdv-color-surface-sunken);
	border-radius: 4px;
}

.help-content::-webkit-scrollbar-thumb {
	background: var(--tdv-color-primary);
	border-radius: 4px;
}

.help-content::-webkit-scrollbar-thumb:hover {
	background: var(--tdv-color-primary-hover);
}
</style>
