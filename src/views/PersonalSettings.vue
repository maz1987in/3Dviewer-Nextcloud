<template>
	<NcSettingsSection
		:title="t('threedviewer', '3D Viewer Configuration')"
		:description="t('threedviewer', 'Customize your 3D viewing experience. These settings apply only to you.')"
		:doc-url="docUrl">
		<div v-if="loading" class="loading-spinner">
			<span class="icon-loading-small" /> {{ t('threedviewer', 'Loading settings...') }}
		</div>

		<div v-else class="threedviewer-settings">
			<!-- Header with Logo -->
			<div class="settings-header">
				<div class="app-logo">
					<img :src="logoUrl" alt="3D Viewer Logo">
				</div>
				<div class="header-content">
					<h2>{{ t('threedviewer', '3D Viewer') }}</h2>
					<p>{{ t('threedviewer', 'Configure your personal viewing preferences') }}</p>
				</div>
			</div>

			<!-- Config Sections -->
			<div v-for="(section, key) in configSections" :key="key" class="settings-group">
				<h3>{{ section.title }}</h3>
				<p v-if="section.description" class="section-description">
					{{ section.description }}
				</p>

				<div v-for="(field, fieldKey) in section.fields" :key="fieldKey" class="setting-field">
					<!-- Boolean Toggle -->
					<div v-if="field.type === 'boolean'" class="setting-row">
						<div class="setting-label">
							<NcCheckboxRadioSwitch
								:checked="getValue(key, fieldKey, field.default)"
								@update:checked="val => updateValue(key, fieldKey, val)">
								{{ field.label }}
							</NcCheckboxRadioSwitch>
							<span v-if="field.description" class="setting-description">{{ field.description }}</span>
						</div>
					</div>

					<!-- Color Picker -->
					<div v-else-if="field.type === 'color'" class="setting-row">
						<div class="setting-label">
							<label>{{ field.label }}</label>
							<span v-if="field.description" class="setting-description">{{ field.description }}</span>
						</div>
						<input
							type="color"
							:value="getValue(key, fieldKey, field.default)"
							@input="e => updateValue(key, fieldKey, e.target.value)">
					</div>

					<!-- Number Input -->
					<div v-else-if="field.type === 'number'" class="setting-row">
						<div class="setting-label">
							<label :for="`setting-${key}-${fieldKey}`">{{ field.label }}</label>
							<span v-if="field.description" class="setting-description">{{ field.description }}</span>
						</div>
						<NcTextField
							:id="`setting-${key}-${fieldKey}`"
							class="setting-input-number"
							:value="getValue(key, fieldKey, field.default)"
							type="number"
							:label="field.label"
							:hide-label="true"
							:step="field.step || 1"
							:min="field.min"
							:max="field.max"
							@update:value="val => updateValue(key, fieldKey, Number(val))" />
					</div>

					<!-- Select Input -->
					<div v-else-if="field.type === 'select'" class="setting-row">
						<div class="setting-label">
							<label>{{ field.label }}</label>
							<span v-if="field.description" class="setting-description">{{ field.description }}</span>
						</div>
						<NcSelect
							:value="{ label: field.options.find(o => o.value === getValue(key, fieldKey, field.default))?.label || getValue(key, fieldKey, field.default), value: getValue(key, fieldKey, field.default) }"
							:options="field.options"
							@input="val => updateValue(key, fieldKey, val.value)" />
					</div>

					<!-- Custom Re-index Field -->
					<div v-else-if="field.type === 'custom-reindex'" class="setting-row">
						<div class="setting-label">
							<label>{{ field.label }}</label>
							<span v-if="field.description" class="setting-description">{{ field.description }}</span>
							<span class="setting-description occ-hint">
								{{ t('threedviewer', 'Alternatively, use the command line:') }}
								<code>occ threedviewer:index-files [user_id]</code>
							</span>
						</div>
						<NcButton
							type="secondary"
							:disabled="reindexing"
							@click="reindexFiles">
							<template #icon>
								<Loading v-if="reindexing" :size="20" class="spin" />
								<Sync v-else :size="20" />
							</template>
							{{ t('threedviewer', 'Re-index now') }}
						</NcButton>
					</div>
				</div>
			</div>

			<!-- Actions -->
			<div class="settings-actions">
				<NcButton
					type="primary"
					:disabled="saving"
					@click="saveSettings">
					<template #icon>
						<Loading v-if="saving" :size="20" class="spin" />
						<ContentSave v-else :size="20" />
					</template>
					{{ t('threedviewer', 'Save settings') }}
				</NcButton>

				<NcButton
					type="tertiary"
					:disabled="saving"
					@click="resetSettings">
					<template #icon>
						<History :size="20" />
					</template>
					{{ t('threedviewer', 'Reset to defaults') }}
				</NcButton>
			</div>
		</div>
	</NcSettingsSection>
</template>

<script>
import { NcSettingsSection, NcButton, NcCheckboxRadioSwitch, NcTextField, NcSelect } from '@nextcloud/vue'
import { generateUrl, imagePath } from '@nextcloud/router'
import axios from '@nextcloud/axios'
import { showSuccess, showError } from '@nextcloud/dialogs'
import ContentSave from 'vue-material-design-icons/ContentSave.vue'
import Sync from 'vue-material-design-icons/Sync.vue'
import History from 'vue-material-design-icons/History.vue'
import Loading from 'vue-material-design-icons/Loading.vue'

// Import default config to use as reference and defaults
import {
	CAMERA_SETTINGS,
	GRID_SETTINGS,
	PERFORMANCE_SETTINGS,
	CONTROLLER_SETTINGS,
	THEME_SETTINGS,
	LIGHTING_SETTINGS,
	ANIMATION_SETTINGS,
	INTERACTION_SETTINGS,
} from '../config/viewer-config.js'

export default {
	name: 'PersonalSettings',
	components: {
		NcSettingsSection,
		NcButton,
		NcCheckboxRadioSwitch,
		NcTextField,
		NcSelect,
		ContentSave,
		Sync,
		History,
		Loading,
	},
	data() {
		return {
			docUrl: 'https://github.com/maz1987in/3Dviewer-Nextcloud',
			logoUrl: imagePath('threedviewer', 'app-dark.svg'),
			loading: true,
			saving: false,
			reindexing: false,
			userSettings: {}, // Holds the user's overrides

			// Define structure for the UI form
			configSections: {
				appearance: {
					title: this.t('threedviewer', 'Appearance'),
					description: this.t('threedviewer', 'Customize the look and feel of the viewer.'),
					fields: {
						'theme.mode': {
							label: this.t('threedviewer', 'Theme'),
							description: this.t('threedviewer', 'Choose between Light, Dark, or Auto (System) theme.'),
							type: 'select',
							default: THEME_SETTINGS.mode,
							options: [
								{ value: 'auto', label: this.t('threedviewer', 'Auto (System)') },
								{ value: 'light', label: this.t('threedviewer', 'Light') },
								{ value: 'dark', label: this.t('threedviewer', 'Dark') },
							],
						},
					},
				},
				camera: {
					title: this.t('threedviewer', 'Camera'),
					description: this.t('threedviewer', 'Configure default camera behavior and properties.'),
					fields: {
						'camera.fov': {
							label: this.t('threedviewer', 'Field of View'),
							description: this.t('threedviewer', 'Vertical field of view in degrees. Higher values show more of the scene.'),
							type: 'number',
							default: CAMERA_SETTINGS.fov,
							min: 30,
							max: 120,
						},
						'camera.near': {
							label: this.t('threedviewer', 'Near Clipping Plane'),
							description: this.t('threedviewer', 'Objects closer than this distance will not be rendered.'),
							type: 'number',
							default: CAMERA_SETTINGS.near,
							step: 0.1,
						},
						'camera.far': {
							label: this.t('threedviewer', 'Far Clipping Plane'),
							description: this.t('threedviewer', 'Objects further than this distance will not be rendered.'),
							type: 'number',
							default: CAMERA_SETTINGS.far,
							step: 10,
						},
					},
				},
				grid: {
					title: this.t('threedviewer', 'Grid'),
					description: this.t('threedviewer', 'Customize the reference grid appearance.'),
					fields: {
						'grid.visible': {
							label: this.t('threedviewer', 'Show Grid'),
							description: this.t('threedviewer', 'Display the reference grid by default.'),
							type: 'boolean',
							default: GRID_SETTINGS.visible,
						},
						'axes.visible': {
							label: this.t('threedviewer', 'Show Axes'),
							description: this.t('threedviewer', 'Display the XYZ axes helper by default.'),
							type: 'boolean',
							default: true,
						},
						'grid.defaultSize': {
							label: this.t('threedviewer', 'Grid Size'),
							description: this.t('threedviewer', 'Default size of the grid in units.'),
							type: 'number',
							default: GRID_SETTINGS.defaultSize,
						},
						'grid.opacity': {
							label: this.t('threedviewer', 'Grid Opacity'),
							description: this.t('threedviewer', 'Transparency of the grid lines (0.0 to 1.0).'),
							type: 'number',
							default: GRID_SETTINGS.opacity,
							step: 0.1,
							min: 0,
							max: 1,
						},
					},
				},
				performance: {
					title: this.t('threedviewer', 'Performance'),
					description: this.t('threedviewer', 'Settings to optimize rendering performance.'),
					fields: {
						'performance.maxFrameRate': {
							label: this.t('threedviewer', 'Max Frame Rate'),
							description: this.t('threedviewer', 'Limit FPS to save battery or reduce load (15-120 FPS).'),
							type: 'number',
							default: PERFORMANCE_SETTINGS.maxFrameRate,
							min: 15,
							max: 120,
						},
						'performance.enableShadows': {
							label: this.t('threedviewer', 'Enable Shadows'),
							description: this.t('threedviewer', 'Render dynamic shadows (disabling improves performance).'),
							type: 'boolean',
							default: PERFORMANCE_SETTINGS.enableShadows,
						},
						'performance.enableAntialiasing': {
							label: this.t('threedviewer', 'Anti-aliasing'),
							description: this.t('threedviewer', 'Smooth jagged edges (disabling improves performance).'),
							type: 'boolean',
							default: PERFORMANCE_SETTINGS.enableAntialiasing,
						},
					},
				},
				navigation: {
					title: this.t('threedviewer', 'Navigation'),
					description: this.t('threedviewer', 'Configure camera movement and auto-rotation.'),
					fields: {
						'interaction.zoomSpeed': {
							label: this.t('threedviewer', 'Zoom Speed'),
							description: this.t('threedviewer', 'Adjust the zoom sensitivity for mouse wheel and touch gestures.'),
							type: 'number',
							default: INTERACTION_SETTINGS.zoomSpeed,
							step: 0.1,
							min: 0.1,
							max: 5.0,
						},
						'interaction.panSpeed': {
							label: this.t('threedviewer', 'Pan Speed'),
							description: this.t('threedviewer', 'Adjust the panning sensitivity.'),
							type: 'number',
							default: INTERACTION_SETTINGS.panSpeed,
							step: 0.1,
							min: 0.1,
							max: 5.0,
						},
						'interaction.enableDamping': {
							label: this.t('threedviewer', 'Smooth Movement'),
							description: this.t('threedviewer', 'Enable momentum and smooth stopping for camera movement.'),
							type: 'boolean',
							default: INTERACTION_SETTINGS.enableDamping,
						},
						'animation.autoRotate.enabled': {
							label: this.t('threedviewer', 'Auto Rotate'),
							description: this.t('threedviewer', 'Automatically rotate the model when idle.'),
							type: 'boolean',
							default: ANIMATION_SETTINGS.autoRotate.enabled,
						},
						'animation.autoRotate.speed': {
							label: this.t('threedviewer', 'Rotation Speed'),
							description: this.t('threedviewer', 'Speed of auto-rotation.'),
							type: 'number',
							default: ANIMATION_SETTINGS.autoRotate.speed,
							step: 0.1,
							min: 0.1,
							max: 10,
						},
					},
				},
				controller: {
					title: this.t('threedviewer', 'Camera Controller'),
					description: this.t('threedviewer', 'Settings for the on-screen navigation controller.'),
					fields: {
						'controller.defaultVisible': {
							label: this.t('threedviewer', 'Show Controller by Default'),
							description: this.t('threedviewer', 'Whether the circular navigation controller is visible when opening a model.'),
							type: 'boolean',
							default: CONTROLLER_SETTINGS.defaultVisible,
						},
						'controller.persistPosition': {
							label: this.t('threedviewer', 'Save Controller Position'),
							description: this.t('threedviewer', 'Remember where you moved the controller on the screen.'),
							type: 'boolean',
							default: CONTROLLER_SETTINGS.persistPosition,
						},
					},
				},
				lighting: {
					title: this.t('threedviewer', 'Lighting'),
					description: this.t('threedviewer', 'Adjust default lighting conditions.'),
					fields: {
						'lighting.ambient.intensity': {
							label: this.t('threedviewer', 'Ambient Light Intensity'),
							description: this.t('threedviewer', 'Brightness of the global ambient light.'),
							type: 'number',
							default: LIGHTING_SETTINGS.ambient.intensity,
							step: 0.1,
							min: 0,
							max: 5,
						},
						'lighting.directional.intensity': {
							label: this.t('threedviewer', 'Directional Light Intensity'),
							description: this.t('threedviewer', 'Brightness of the main directional light source.'),
							type: 'number',
							default: LIGHTING_SETTINGS.directional.intensity,
							step: 0.1,
							min: 0,
							max: 5,
						},
					},
				},
				maintenance: {
					title: this.t('threedviewer', 'Maintenance'),
					description: this.t('threedviewer', 'Manage file indexing and database operations.'),
					fields: {
						// Custom field for re-indexing
						'maintenance.reindex': {
							type: 'custom-reindex',
							label: this.t('threedviewer', 'Re-index Files'),
							description: this.t('threedviewer', 'Manually trigger a re-scan of your 3D files if they are not showing up correctly.'),
						},
					},
				},
			}, // End of configSections
		}
	},
	mounted() {
		this.fetchSettings()
	},
	methods: {
		t(app, text) {
			return OC.L10N.translate(app, text)
		},

		async fetchSettings() {
			try {
				const response = await axios.get(generateUrl('/apps/threedviewer/settings'))
				let settings = response.data.settings || {}
				// Ensure settings is an object, not an array (PHP empty array -> JSON [])
				if (Array.isArray(settings)) {
					settings = {}
				}
				this.userSettings = settings
			} catch (e) {
				console.error('Error loading settings', e)
				showError(this.t('threedviewer', 'Could not load settings'))
			} finally {
				this.loading = false
			}
		},

		getValue(section, key, defaultValue) {
			// Check if we have a user override
			const value = this.getNestedValue(this.userSettings, key)

			if (value !== undefined) {
				return value
			}
			return defaultValue
		},

		getNestedValue(obj, path) {
			return path.split('.').reduce((prev, curr) => prev ? prev[curr] : undefined, obj)
		},

		setNestedValue(obj, path, value) {
			const keys = path.split('.')
			const lastKey = keys.pop()
			const deepObj = keys.reduce((prev, curr) => {
				if (!prev[curr]) prev[curr] = {}
				return prev[curr]
			}, obj)
			deepObj[lastKey] = value
		},

		updateValue(section, key, value) {
			// Create a copy to avoid reactivity issues with deep objects if needed
			const newSettings = JSON.parse(JSON.stringify(this.userSettings))
			this.setNestedValue(newSettings, key, value)
			this.userSettings = newSettings
		},

		async saveSettings() {
			this.saving = true
			try {
				await axios.put(generateUrl('/apps/threedviewer/settings'), {
					settings: this.userSettings,
				})
				showSuccess(this.t('threedviewer', 'Settings saved'))
			} catch (e) {
				console.error('Error saving settings', e)
				showError(this.t('threedviewer', 'Could not save settings'))
			} finally {
				this.saving = false
			}
		},

		async reindexFiles() {
			this.reindexing = true
			try {
				const url = generateUrl('/apps/threedviewer/api/files/index')
				await axios.post(url)
				showSuccess(this.t('threedviewer', 'Files indexed successfully'))
			} catch (e) {
				console.error('Error reindexing files', e)
				showError(this.t('threedviewer', 'Could not re-index files'))
			} finally {
				this.reindexing = false
			}
		},

		async resetSettings() {
			if (!confirm(this.t('threedviewer', 'Are you sure you want to reset all settings to defaults?'))) {
				return
			}

			this.saving = true
			try {
				await axios.delete(generateUrl('/apps/threedviewer/settings'))
				this.userSettings = {}
				showSuccess(this.t('threedviewer', 'Settings reset to defaults'))
			} catch (e) {
				console.error('Error resetting settings', e)
				showError(this.t('threedviewer', 'Could not reset settings'))
			} finally {
				this.saving = false
			}
		},
	},
}
</script>

<style scoped>
.loading-spinner {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 20px;
}

.threedviewer-settings {
	display: flex;
	flex-direction: column;
	gap: 24px;
	margin-top: 16px;
	max-width: 800px;
}

.settings-header {
	display: flex;
	align-items: center;
	gap: 20px;
	margin-bottom: 10px;
	padding: 20px;
	background: var(--color-main-background);
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
}

.app-logo img {
	width: 64px;
	height: 64px;
	/* Handle dark mode for the dark icon if necessary, though app-dark is usually for light mode */
	/* filter: invert(1) in dark mode if needed, but usually we trust the theme */
}

.header-content h2 {
	margin: 0 0 8px 0;
	font-size: 24px;
	font-weight: bold;
	color: var(--color-main-text);
}

.header-content p {
	margin: 0;
	color: var(--color-text-maxcontrast);
	font-size: 16px;
}

.settings-group {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
	padding: 20px;
	background-color: var(--color-main-background);
}

.settings-group h3 {
	margin-top: 0;
	margin-bottom: 8px;
	font-size: 18px;
	font-weight: 600;
	color: var(--color-main-text);
}

.section-description {
	color: var(--color-text-maxcontrast);
	margin-bottom: 20px;
	font-size: 14px;
	line-height: 1.5;
}

.setting-field {
	margin-bottom: 20px;
	padding-bottom: 20px;
	border-bottom: 1px solid var(--color-border);
}

.setting-field:last-child {
	margin-bottom: 0;
	padding-bottom: 0;
	border-bottom: none;
}

.setting-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 32px;
	min-height: 44px;
}

.setting-label {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex: 1;
	/* Ensure label takes up most space but leaves room for input */
	min-width: 60%;
}

.setting-label label {
	font-weight: 600;
	color: var(--color-main-text);
}

.setting-description {
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}

.setting-input-number {
	max-width: 100px;
}

/* Adjustments for specific inputs */
input[type="color"] {
	cursor: pointer;
	height: 34px;
	width: 60px;
	padding: 2px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius);
	background: var(--color-main-background);
}

.settings-actions {
	display: flex;
	gap: 12px;
	margin-top: 24px;
	padding-top: 20px;
	border-top: 1px solid var(--color-border);
	position: sticky;
	bottom: 0;
	background: var(--color-main-background);
	z-index: 100;
	padding-bottom: 20px; /* Add padding at bottom since it's sticky */
}

.spin {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

.occ-hint {
	display: block;
	margin-top: 4px;
	font-style: italic;
}

.occ-hint code {
	background: var(--color-background-dark);
	padding: 2px 4px;
	border-radius: 4px;
	font-family: monospace;
	font-style: normal;
}
</style>
