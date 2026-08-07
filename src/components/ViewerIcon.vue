<template>
	<svg class="viewer-icon"
		:width="size"
		:height="size"
		viewBox="0 0 24 24"
		fill="currentColor"
		aria-hidden="true"
		focusable="false">
		<path :d="path" />
	</svg>
</template>

<script>
import { computed } from 'vue'
import { ICON_PATHS } from '../config/icon-paths.js'
import { logger } from '../utils/logger.js'

export default {
	name: 'ViewerIcon',

	props: {
		/** A key of ICON_PATHS. */
		name: {
			type: String,
			required: true,
			validator: (value) => Object.hasOwn(ICON_PATHS, value),
		},
		/** Defaults to the design system's icon size. */
		size: { type: Number, default: 20 },
	},

	setup(props) {
		const path = computed(() => {
			const known = ICON_PATHS[props.name]
			if (known === undefined) {
				// An unknown name renders an empty icon, which reads on screen as a button
				// with nothing in it — indistinguishable from a styling problem. Say which
				// name was asked for, so the answer is in the console rather than in a
				// bisect. The prop validator already warns in development; this covers a
				// name computed at runtime.
				logger.warn('ViewerIcon', 'No path for icon name', { name: props.name })
				return ''
			}
			return known
		})

		return { path }
	},
}
</script>

<style scoped>
/*
 * Icons sit inside flex buttons whose other child is a text label. Without this the svg
 * is treated as inline text and picks up the line box's descender space, which pushes it
 * a couple of pixels off the label's centre.
 */
.viewer-icon {
	display: block;
	flex-shrink: 0;
}
</style>
