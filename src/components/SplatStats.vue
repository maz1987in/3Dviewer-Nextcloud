<template>
	<div class="splat-stats">
		<div class="stat-row">
			<span>{{ t('threedviewer', 'Splats') }}:</span>
			<span class="tdv-value stat-value">{{ stats.splatCount.toLocaleString() }}</span>
		</div>
		<p v-if="thinned" class="tdv-secondary splat-stats-note">
			{{ thinned }}
		</p>
	</div>
</template>

<script>
import { splatThinningNote } from '../splats/splatBudget.js'

/**
 * The statistics panel's geometry rows for a splat: its splats, and how much of it is
 * shown. Loaded as its own chunk, only when a splat opens.
 */
export default {
	name: 'SplatStats',

	props: {
		// useModelStats' statistics for a splat
		stats: { type: Object, required: true },
	},

	computed: {
		thinned() {
			return splatThinningNote(this.stats.splatCount, this.stats.splatTotal)
		},
	},
}
</script>

<style scoped>
.splat-stats-note {
	margin: 0 0 6px;
}
</style>
