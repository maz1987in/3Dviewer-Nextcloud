<template>
	<div @click.stop>
		<NcAppNavigationItem
			:name="file.name"
			:to="null"
			:class="{ 'selected': file.id === selectedFileId }"
			@click.native.prevent.stop="handleClick">
			<template #icon>
				<StarIcon v-if="file.isFavorite" />
				<FileIcon v-else />
			</template>
		</NcAppNavigationItem>
	</div>
</template>

<script>
import NcAppNavigationItem from '@nextcloud/vue/dist/Components/NcAppNavigationItem.js'
import FileIcon from 'vue-material-design-icons/File.vue'
import StarIcon from 'vue-material-design-icons/Star.vue'

export default {
	name: 'FileItem',
	components: {
		NcAppNavigationItem,
		FileIcon,
		StarIcon,
	},
	props: {
		file: {
			type: Object,
			required: true,
		},
		selectedFileId: {
			type: Number,
			default: null,
		},
	},
	methods: {
		handleClick(event) {
			// Prevent any default navigation behavior
			event.preventDefault()
			event.stopPropagation()
			// Emit select-file event to parent
			this.$emit('select-file', this.file)
		},
	},
}
</script>

<style scoped>
:deep(.selected) {
	> .app-navigation-entry {
		background: var(--color-primary-light, lightgrey);
		font-weight: bold;
	}
}
</style>
