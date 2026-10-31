<template>
	<div class="splat-controls">
		<p v-if="thinned" class="tdv-secondary splat-note" role="status">
			{{ thinned }}
		</p>
		<FileUpControl v-if="upState" :state="upState" @set-up="$emit('set-up', $event)" />
		<!-- What the gated tools elsewhere in the panel point at (aria-describedby) -->
		<div class="splat-unavailable">
			<span id="tdv-unavailable-heading" class="tool-label-small">{{ t('threedviewer', 'Not available for splats') }}</span>
			<ul aria-labelledby="tdv-unavailable-heading">
				<li v-for="item in unavailable" :id="`tdv-unavailable-${item.key}`" :key="item.key">
					{{ item.label }}: {{ item.note }}
				</li>
			</ul>
		</div>
	</div>
</template>

<script>
import { splatThinningNote } from '../splats/splatBudget.js'
import { SPLAT_UNAVAILABLE } from '../splats/unavailable.js'
import FileUpControl from './FileUpControl.vue'

/**
 * The tools panel's controls for a splat. Loaded as its own chunk, only when a splat
 * opens, with the list of the tools that are off for it: the panel's gated controls are
 * described by that list's lines, so they say why without carrying the words themselves.
 */
export default {
	name: 'SplatControls',

	components: { FileUpControl },

	props: {
		// What ThreeViewer's model-loaded meta says of the splat
		meta: { type: Object, required: true },
		// Which way is up, from useFileUp; null until it is offered
		upState: { type: Object, default: null },
	},

	emits: ['set-up'],

	data() {
		return { unavailable: SPLAT_UNAVAILABLE }
	},

	computed: {
		thinned() {
			return splatThinningNote(this.meta.count, this.meta.total)
		},
	},
}
</script>

<style scoped>
.splat-note {
	margin: 0 0 6px;
}

.splat-unavailable ul {
	margin: 4px 0 0;
	padding-inline-start: 18px;
	color: var(--tdv-color-text-secondary);
	font-size: var(--tdv-font-size-secondary);
}

.splat-unavailable li + li {
	margin-top: 4px;
}
</style>
