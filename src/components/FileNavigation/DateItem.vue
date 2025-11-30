<template>
	<div @click.stop>
		<!-- Year Level -->
		<NcAppNavigationItem
			v-if="year.type === 'year'"
			:name="year.name"
			:to="null"
			:class="{ 'selected': isYearExpanded }"
			@click.native.prevent.stop="toggleYearExpand">
			<template #icon>
				<CalendarIcon />
			</template>
			<template #actions>
				<span class="file-count">{{ year.months?.length || 0 }}</span>
			</template>
		</NcAppNavigationItem>
		<div v-if="isYearExpanded && year.months" class="year-months">
			<!-- Month Level -->
			<DateItem
				v-for="month in year.months"
				:key="`${year.year}-${month.month}`"
				:year="{ ...year, months: undefined }"
				:month="month"
				:selected-file-id="selectedFileId"
				@select-file="$emit('select-file', $event)"
				@navigate-date="$emit('navigate-date', $event)" />
		</div>

		<!-- Month Level -->
		<div v-if="month" class="month-item" @click.stop>
			<NcAppNavigationItem
				:name="month.name"
				:to="null"
				:class="{ 'selected': isMonthExpanded }"
				@click.native.prevent.stop="toggleMonthExpand">
				<template #icon>
					<CalendarIcon />
				</template>
				<template #actions>
					<span class="file-count">{{ month.files?.length || 0 }}</span>
				</template>
			</NcAppNavigationItem>
			<!-- Files are shown in main content, not in navigation -->
		</div>
	</div>
</template>

<script>
import NcAppNavigationItem from '@nextcloud/vue/dist/Components/NcAppNavigationItem.js'
import CalendarIcon from 'vue-material-design-icons/Calendar.vue'

export default {
	name: 'DateItem',
	components: {
		NcAppNavigationItem,
		CalendarIcon,
		DateItem: () => import('./DateItem.vue'),
	},
	props: {
		year: {
			type: Object,
			required: true,
		},
		month: {
			type: Object,
			default: null,
		},
		selectedFileId: {
			type: Number,
			default: null,
		},
	},
	data() {
		return {
			isYearExpanded: false,
			isMonthExpanded: false,
		}
	},
	methods: {
		toggleYearExpand(event) {
			// Prevent any default navigation behavior
			if (event) {
				event.preventDefault()
				event.stopPropagation()
			}
			this.isYearExpanded = !this.isYearExpanded
			// Emit navigation event for year (show all months' files)
			if (this.year.months) {
				const allFiles = []
				this.year.months.forEach(month => {
					if (month.files) {
						allFiles.push(...month.files)
					}
				})
				this.$emit('navigate-date', {
					year: this.year.year,
					month: null,
					files: allFiles,
				})
			}
		},
		toggleMonthExpand(event) {
			// Prevent any default navigation behavior
			if (event) {
				event.preventDefault()
				event.stopPropagation()
			}
			this.isMonthExpanded = !this.isMonthExpanded
			// Emit navigation event to show files in main content
			this.$emit('navigate-date', {
				year: this.year.year,
				month: this.month.month,
				files: this.month.files || [],
			})
		},
	},
}
</script>

<style scoped>
.year-months,
.month-files {
	padding-left: 20px;
}

.month-item {
	margin-left: 0;
}

.file-count {
	opacity: 0.6;
	font-size: 0.9em;
}
</style>
