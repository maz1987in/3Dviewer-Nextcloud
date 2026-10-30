<template>
	<div class="point-cloud-controls">
		<p v-if="thinned" class="tdv-secondary point-cloud-note" role="status">
			{{ thinned }}
		</p>
		<div class="tool-group">
			<label for="tdv-colour-by" class="tool-label-small">{{ t('threedviewer', 'Colour by') }}</label>
			<!-- Choosing only restyles the view, so a change may apply at once -->
			<select id="tdv-colour-by"
				class="clip-dropdown"
				:value="colourBy"
				@change="$emit('set-colour-by', $event.target.value)">
				<option v-for="mode in modes" :key="mode" :value="mode">
					{{ label(mode) }}
				</option>
			</select>
		</div>
		<div class="tool-group">
			<label for="tdv-point-size" class="tool-label-small">{{ t('threedviewer', 'Point size') }}</label>
			<input id="tdv-point-size"
				class="clipping-slider"
				type="range"
				:min="size.min"
				:max="size.max"
				:step="size.step"
				:value="pointSize"
				:aria-valuetext="t('threedviewer', '{size} px', { size: pointSize })"
				@input="$emit('set-point-size', parseFloat($event.target.value))">
		</div>
		<!-- What the gated tools elsewhere in the panel point at (aria-describedby) -->
		<div class="point-cloud-unavailable">
			<span id="tdv-unavailable-heading" class="tool-label-small">{{ t('threedviewer', 'Not available for scans') }}</span>
			<ul aria-labelledby="tdv-unavailable-heading">
				<li v-for="item in unavailable" :id="`tdv-unavailable-${item.key}`" :key="item.key">
					{{ item.label }}: {{ item.note }}
				</li>
			</ul>
		</div>
	</div>
</template>

<script>
import { thinningNote } from '../pointclouds/budget.js'
import { availableColourBy } from '../pointclouds/colourBy.js'
import { POINT_SIZE } from '../pointclouds/limits.js'
import { POINT_CLOUD_UNAVAILABLE } from '../pointclouds/unavailable.js'

/**
 * The tools panel's controls for a scan. Loaded as its own chunk, only when a scan opens,
 * with the list of the tools that are off for it: the panel's gated controls are
 * described by that list's lines, so they say why without carrying the words themselves.
 */
export default {
	name: 'PointCloudControls',

	props: {
		// The cloud's userData.tdvPointCloud, without its points
		meta: { type: Object, required: true },
		colourBy: { type: String, required: true },
		pointSize: { type: Number, required: true },
		// Which way is up, from useFileUp; null until it is offered
		upState: { type: Object, default: null },
	},

	emits: ['set-colour-by', 'set-point-size', 'set-up'],

	data() {
		return { size: POINT_SIZE, unavailable: POINT_CLOUD_UNAVAILABLE }
	},

	computed: {
		modes() {
			return availableColourBy(this.meta)
		},

		thinned() {
			return thinningNote(this.meta.count, this.meta.total)
		},
	},

	methods: {
		label(mode) {
			switch (mode) {
			case 'file': return this.t('threedviewer', 'File colours')
			case 'height': return this.t('threedviewer', 'Height')
			case 'intensity': return this.t('threedviewer', 'Intensity')
			case 'classification': return this.t('threedviewer', 'Classification')
			default: return this.t('threedviewer', 'Single colour')
			}
		},
	},
}
</script>

<style scoped>
.point-cloud-note {
	margin: 0 0 6px;
}

.point-cloud-unavailable ul {
	margin: 4px 0 0;
	padding-inline-start: 18px;
	color: var(--tdv-color-text-secondary);
	font-size: var(--tdv-font-size-secondary);
}

.point-cloud-unavailable li + li {
	margin-top: 4px;
}
</style>
