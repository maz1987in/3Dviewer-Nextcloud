<template>
	<div class="note-review-bar">
		<div class="note-filters" role="group" :aria-label="t('threedviewer', 'Show notes')">
			<button v-for="choice in choices"
				:key="choice.id"
				type="button"
				class="note-filter"
				:class="{ 'is-active': modelValue === choice.id }"
				:aria-pressed="modelValue === choice.id ? 'true' : 'false'"
				:data-filter="choice.id"
				@click="$emit('update:modelValue', choice.id)">
				{{ choice.label }}
				<span class="note-filter-count">{{ counts[choice.id] }}</span>
			</button>
		</div>
		<label v-if="counts.resolved > 0" class="note-show-resolved">
			<input type="checkbox"
				:checked="showResolved"
				@change="$emit('update:showResolved', $event.target.checked)">
			{{ t('threedviewer', 'Show resolved notes in the scene') }}
		</label>
	</div>
</template>

<script>
import { computed } from 'vue'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'

/**
 * The notes list's filter — All, Open, Resolved, each with how many notes it shows — and
 * the switch that decides whether resolved notes still have a marker in the scene.
 */
export default {
	name: 'NoteReviewBar',
	props: {
		/** The filter in force: 'all', 'open' or 'resolved' */
		modelValue: { type: String, default: 'all' },
		/** { all, open, resolved } */
		counts: { type: Object, required: true },
		/** Whether resolved notes' markers are drawn, dimmed, rather than hidden */
		showResolved: { type: Boolean, default: false },
	},

	emits: ['update:modelValue', 'update:showResolved'],
	setup() {
		const choices = computed(() => [
			{ id: 'all', label: t('threedviewer', 'All') },
			{ id: 'open', label: t('threedviewer', 'Open') },
			{ id: 'resolved', label: t('threedviewer', 'Resolved') },
		])

		return { choices }
	},
}
</script>

<style scoped>
.note-review-bar {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.note-filters {
	display: flex;
	gap: 6px;
}

.note-filter.note-filter {
	display: inline-flex;
	flex: 1;
	gap: 6px;
	align-items: center;
	justify-content: center;
	height: 30px;
	padding: 0 8px;
	background: transparent;
	border: 2px solid var(--tdv-hud-border);
	border-radius: 15px;
	color: var(--tdv-hud-text-secondary);
	font-family: inherit;
	font-size: var(--tdv-font-size-secondary);
	cursor: pointer;
}

.note-filter.note-filter:hover,
.note-filter.note-filter:focus-visible {
	background: var(--tdv-hud-hover-bg);
	color: var(--tdv-hud-text);
}

.note-filter.note-filter.is-active {
	border-color: var(--tdv-hud-text);
	color: var(--tdv-hud-text);
	font-weight: var(--tdv-font-weight-bold);
}

.note-filter-count {
	padding: 0 6px;
	background: var(--tdv-hud-chip-bg);
	border-radius: 9px;
	font-size: 11px;
}

.note-show-resolved {
	display: flex;
	gap: 8px;
	align-items: center;
	color: var(--tdv-hud-text-secondary);
	font-size: var(--tdv-font-size-secondary);
}
</style>
