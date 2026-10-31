<template>
	<div class="point-cloud-stats">
		<div class="stat-row">
			<span>{{ t('threedviewer', 'Points') }}:</span>
			<span class="tdv-value stat-value">{{ stats.pointCount.toLocaleString() }}</span>
		</div>
		<p v-if="thinned" class="tdv-secondary point-cloud-stats-note">
			{{ thinned }}
		</p>
		<div class="stat-row">
			<span>{{ t('threedviewer', 'Attributes') }}:</span>
			<span class="tdv-value stat-value">{{ attributes }}</span>
		</div>
	</div>
</template>

<script>
import { thinningNote } from '../pointclouds/budget.js'

/**
 * The statistics panel's geometry rows for a scan: its points, how much of it is shown,
 * and what each point records. Loaded as its own chunk, only when a scan opens.
 */
export default {
	name: 'PointCloudStats',

	props: {
		// useModelStats' statistics for a scan
		stats: { type: Object, required: true },
	},

	computed: {
		thinned() {
			return thinningNote(this.stats.pointCount, this.stats.pointTotal)
		},

		attributes() {
			const names = {
				color: this.t('threedviewer', 'Colours'),
				intensity: this.t('threedviewer', 'Intensity'),
				classification: this.t('threedviewer', 'Classification'),
			}
			const keys = this.stats.pointAttributes ?? []
			return keys.length ? keys.map((key) => names[key]).join(', ') : this.t('threedviewer', 'Positions only')
		},
	},
}
</script>

<style scoped>
.point-cloud-stats-note {
	margin: 0 0 6px;
}
</style>
