<template>
	<div class="file-unit">
		<template v-if="unit.canEdit">
			<label :for="controlId" class="file-unit-label">{{ t('threedviewer', 'File units') }}</label>
			<select :id="controlId"
				class="file-unit-select"
				:class="selectClass"
				:value="pending ?? unit.key"
				:aria-describedby="`${controlId}-source ${controlId}-hint`"
				@change="choose($event.target.value)">
				<option v-for="choice in choices" :key="choice.key" :value="choice.key">
					{{ choice.name }}
				</option>
			</select>
			<p :id="`${controlId}-source`" class="tdv-secondary file-unit-note">
				{{ sourceText }}
			</p>
			<p :id="`${controlId}-hint`" class="tdv-secondary file-unit-note">
				{{ t('threedviewer', 'Saved with the file for everyone who can open it') }}
			</p>
		</template>
		<template v-else>
			<p class="file-unit-line">
				<span class="file-unit-label">{{ t('threedviewer', 'File units') }}</span>
				<span class="file-unit-value">{{ unitName }}</span>
			</p>
			<p class="tdv-secondary file-unit-note">
				{{ sourceText }}
			</p>
		</template>
		<p role="status" class="tdv-secondary file-unit-status">
			{{ statusText }}
		</p>
	</div>
</template>

<script>
import { FILE_UNITS } from '../utils/sourceUnits.js'

/**
 * The unit a model's file is in: a select for people who can edit the file, and the unit
 * with where it comes from for everyone else. The stats panel and the Print check card
 * both show it, each passing the class its own selects use.
 */
export default {
	name: 'FileUnitControl',

	props: {
		// useFileUnit's state
		unit: { type: Object, required: true },
		controlId: { type: String, required: true },
		selectClass: { type: String, default: '' },
	},

	emits: ['set'],

	data() {
		// The unit just picked, shown until the save settles; then the one in force
		return { pending: null }
	},

	computed: {
		names() {
			return {
				mm: this.t('threedviewer', 'Millimetres'),
				cm: this.t('threedviewer', 'Centimetres'),
				m: this.t('threedviewer', 'Metres'),
				in: this.t('threedviewer', 'Inches'),
				ft: this.t('threedviewer', 'Feet'),
				'us-ft': this.t('threedviewer', 'US survey feet'),
			}
		},

		choices() {
			return Object.keys(FILE_UNITS).map((key) => ({ key, name: this.names[key] }))
		},

		unitName() {
			return (this.unit.key && this.names[this.unit.key]) || this.unit.suffix
		},

		sourceText() {
			if (this.unit.source === 'file') {
				return this.t('threedviewer', 'From the file')
			}
			if (this.unit.source === 'chosen') {
				return this.t('threedviewer', 'Set for this file')
			}
			return this.t('threedviewer', 'Assumed, because this file doesn\'t record a unit')
		},

		statusText() {
			switch (this.unit.status) {
			case 'saving':
				return this.t('threedviewer', 'Saving…')
			case 'saved':
				return this.t('threedviewer', 'Saved')
			case 'failed':
				return this.t('threedviewer', 'Couldn\'t save the units')
			default:
				return ''
			}
		},
	},

	watch: {
		'unit.status'(status) {
			if (status !== 'saving') {
				this.pending = null
			}
		},
	},

	methods: {
		choose(key) {
			this.pending = key
			this.$emit('set', key)
			// Nothing was sent (the rights went, say): show the unit in force again
			this.$nextTick(() => {
				if (this.unit.status !== 'saving') {
					this.pending = null
				}
			})
		},
	},
}
</script>

<style scoped>
.file-unit {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.file-unit p {
	margin: 0;
}

.file-unit-line {
	display: flex;
	justify-content: space-between;
	gap: 8px;
}
</style>
