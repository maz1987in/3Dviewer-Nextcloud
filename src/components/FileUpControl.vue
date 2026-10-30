<template>
	<div class="file-up-control tool-group">
		<template v-if="state.canEdit">
			<label for="tdv-up" class="tool-label-small">{{ t('threedviewer', 'Which way is up') }}</label>
			<select id="tdv-up"
				class="clip-dropdown"
				:value="state.up"
				aria-describedby="tdv-up-note"
				@change="$emit('set-up', $event.target.value)">
				<option v-for="value in ups" :key="value" :value="value">
					{{ label(value) }}
				</option>
			</select>
			<p id="tdv-up-note" class="tdv-secondary file-up-note">
				{{ t('threedviewer', 'Saved with the file for everyone who can see it.') }}
			</p>
		</template>
		<template v-else>
			<span class="tool-label-small">{{ t('threedviewer', 'Which way is up') }}</span>
			<span class="tdv-value">{{ label(state.up) }}</span>
			<p class="tdv-secondary file-up-note">
				{{ t('threedviewer', 'Only people who can edit this file can change this.') }}
			</p>
		</template>
		<!-- Always present, so a screen reader hears each change of it -->
		<p class="tdv-secondary file-up-note" role="status">
			{{ statusText }}
		</p>
	</div>
</template>

<script>
import { UPS } from '../pointclouds/upValues.js'

/**
 * Which way is up for a scan, saved with the file like its unit (FileUnitControl). Scans
 * come out of scanners, drones and phone apps every way up; the choice turns the model for
 * viewing, never the file.
 */
export default {
	name: 'FileUpControl',

	props: {
		// useFileUp's state
		state: { type: Object, required: true },
	},

	emits: ['set-up'],

	data() {
		return { ups: UPS }
	},

	computed: {
		statusText() {
			switch (this.state.status) {
			case 'saving':
				return this.t('threedviewer', 'Saving…')
			case 'saved':
				return this.t('threedviewer', 'Saved')
			case 'failed':
				return this.t('threedviewer', 'Couldn\'t save. Try again.')
			default:
				return ''
			}
		},
	},

	methods: {
		label(value) {
			switch (value) {
			case '-y': return this.t('threedviewer', '−Y up')
			case '+z': return this.t('threedviewer', '+Z up')
			case '-z': return this.t('threedviewer', '−Z up')
			default: return this.t('threedviewer', '+Y up')
			}
		},
	},
}
</script>

<style scoped>
.file-up-note {
	margin: 2px 0 0;
}
</style>
