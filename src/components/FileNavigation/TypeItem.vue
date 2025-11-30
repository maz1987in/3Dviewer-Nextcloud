<template>
	<div @click.stop>
		<NcAppNavigationItem
			:name="type.name"
			:to="null"
			:class="{ 'selected': isExpanded }"
			@click.native.prevent.stop="toggleExpand">
			<template #icon>
				<FileTypeIcon />
			</template>
			<template #actions>
				<span class="file-count">{{ type.files?.length || 0 }}</span>
			</template>
		</NcAppNavigationItem>
		<!-- Files are shown in main content, not in navigation -->
	</div>
</template>

<script>
import NcAppNavigationItem from '@nextcloud/vue/dist/Components/NcAppNavigationItem.js'
import FileTypeIcon from 'vue-material-design-icons/FileCode.vue'

export default {
	name: 'TypeItem',
	components: {
		NcAppNavigationItem,
		FileTypeIcon,
	},
	props: {
		type: {
			type: Object,
			required: true,
		},
		selectedFileId: {
			type: Number,
			default: null,
		},
	},
	data() {
		return {
			isExpanded: false,
		}
	},
	methods: {
		toggleExpand(event) {
			// Prevent any default navigation behavior
			if (event) {
				event.preventDefault()
				event.stopPropagation()
			}
			this.isExpanded = !this.isExpanded
			// Emit navigation event to show files in main content
			this.$emit('navigate-type', {
				extension: this.type.extension,
				name: this.type.name,
				files: this.type.files || [],
			})
		},
	},
}
</script>

<style scoped>
.type-files {
	padding-left: 20px;
}

.file-count {
	opacity: 0.6;
	font-size: 0.9em;
}
</style>
