<template>
	<!--
		Teleported for the same reason as SlicerModal: Nextcloud gives `#content-vue` a
		backdrop-filter, which makes it the containing block for anything fixed inside it.
	-->
	<Teleport to="body">
		<div class="version-picker-backdrop" @click="$emit('cancel')">
			<div ref="dialogRef"
				class="tdv-dialog version-picker"
				role="dialog"
				aria-modal="true"
				aria-labelledby="version-picker-title"
				tabindex="-1"
				@click.stop
				@keydown.esc.stop="$emit('cancel')">
				<div class="tdv-dialog-header">
					<h2 id="version-picker-title" class="version-picker-title">
						{{ t('threedviewer', 'Earlier versions') }}
					</h2>
					<button type="button"
						class="tdv-btn tdv-btn--icon version-picker-close"
						:aria-label="t('threedviewer', 'Close')"
						:title="t('threedviewer', 'Close')"
						@click="$emit('cancel')">
						<ViewerIcon name="close" :size="18" />
					</button>
				</div>

				<div class="tdv-dialog-body" aria-live="polite">
					<p v-if="multiFile" class="tdv-secondary">
						{{ t('threedviewer', 'Supporting files such as textures are loaded as they are now.') }}
					</p>
					<p v-if="loading" class="tdv-secondary">
						{{ t('threedviewer', 'Loading versions…') }}
					</p>
					<p v-else-if="error" class="version-picker-error">
						{{ t('threedviewer', "Couldn't load the versions") }}
					</p>
					<p v-else-if="!versions.length" class="tdv-secondary">
						{{ t('threedviewer', 'No earlier versions') }}
					</p>
					<ul v-else class="version-list">
						<li v-for="version in versions" :key="version.id">
							<button type="button"
								class="version-row"
								@click="$emit('pick', version)">
								<span class="version-date">{{ formatVersionDate(version.mtime) }}</span>
								<span class="tdv-secondary version-details">{{ details(version) }}</span>
							</button>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import ViewerIcon from './ViewerIcon.vue'
import { useFocusTrap } from '../composables/useFocusTrap.js'
import { formatVersionDate } from '../utils/fileVersions.js'

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB']

export default {
	name: 'VersionPickerDialog',
	components: {
		ViewerIcon,
	},
	props: {
		versions: { type: Array, default: () => [] },
		loading: { type: Boolean, default: false },
		error: { type: Boolean, default: false },
		multiFile: { type: Boolean, default: false },
	},
	emits: ['pick', 'cancel'],
	setup() {
		const dialogRef = ref(null)
		const focusTrap = useFocusTrap(dialogRef)

		// The trap remembers what had focus and gives it back on close, so it goes first:
		// focusing the dialog before it would make the dialog the thing to go back to
		onMounted(async () => {
			await nextTick()
			focusTrap.activate()
		})
		onBeforeUnmount(() => focusTrap.deactivate())

		/**
		 * @param {number} bytes - A size
		 * @return {string} It in B, KB, MB or GB
		 */
		const formatSize = (bytes) => {
			let size = bytes
			let unit = 0
			while (size >= 1024 && unit < SIZE_UNITS.length - 1) {
				size /= 1024
				unit++
			}
			return `${Math.round(size * 10) / 10} ${SIZE_UNITS[unit]}`
		}

		/**
		 * @param {object} version - A version from listVersions
		 * @return {string} Its size, author and label, as many as it has
		 */
		const details = (version) => [formatSize(version.size), version.author, version.label].filter(Boolean).join(' · ')

		return { dialogRef, details, formatVersionDate }
	},
}
</script>

<style scoped>
.version-picker-backdrop {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 20px;
	background: rgb(0 0 0 / 35%);
}

.version-picker {
	display: flex;
	flex-direction: column;
	width: 100%;
	max-height: 80vh;
	color: var(--tdv-color-text);
}

.version-picker:focus-visible {
	outline: 2px solid var(--tdv-color-primary);
	outline-offset: 2px;
}

.version-picker-title {
	margin: 0;
	font-size: inherit;
	font-weight: inherit;
}

.version-picker .tdv-dialog-body {
	overflow: auto;
}

.version-picker-error {
	color: var(--tdv-color-error);
}

.version-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.version-row.version-row {
	display: flex;
	flex-direction: column;
	gap: 2px;
	align-items: flex-start;
	width: 100%;
	margin: 0;
	padding: 12px;
	border: 1px solid var(--tdv-color-border);
	border-radius: var(--tdv-radius-panel);
	background: transparent;
	color: var(--tdv-color-text);
	text-align: start;
	cursor: pointer;
}

.version-row.version-row:hover,
.version-row.version-row:focus-visible {
	border-color: var(--tdv-color-primary);
	background: var(--tdv-color-hover-bg);
}

.version-date {
	font-weight: var(--tdv-font-weight-bold);
}
</style>
