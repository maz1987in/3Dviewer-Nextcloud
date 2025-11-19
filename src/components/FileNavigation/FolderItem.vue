<template>
	<div @click.stop>
		<NcAppNavigationItem
			:name="item.name || t('threedviewer', 'Root')"
			:to="null"
			:class="{ 'selected': isExpanded }"
			@click.native.prevent.stop="toggleExpand">
			<template #icon>
				<FolderIcon />
			</template>
			<template #actions>
				<span class="file-count">{{ item.files?.length || 0 }}</span>
			</template>
		</NcAppNavigationItem>
		<div v-if="isExpanded" class="folder-children">
			<!-- Subfolders only - files shown in main content -->
			<FolderItem
				v-for="child in item.children"
				:key="child.path"
				:item="child"
				:selected-file-id="selectedFileId"
				@select-file="$emit('select-file', $event)"
				@navigate-folder="$emit('navigate-folder', $event)" />
		</div>
	</div>
</template>

<script>
import NcAppNavigationItem from '@nextcloud/vue/dist/Components/NcAppNavigationItem.js'
import FolderIcon from 'vue-material-design-icons/Folder.vue'

export default {
	name: 'FolderItem',
	components: {
		NcAppNavigationItem,
		FolderIcon,
		FolderItem: () => import('./FolderItem.vue'),
	},
	props: {
		item: {
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
			this.$emit('navigate-folder', {
				path: this.item.path,
				name: this.item.name,
				files: this.item.files || [],
			})
		},
	},
}
</script>

<style scoped>
.folder-children {
	padding-left: 20px;
}

.file-count {
	opacity: 0.6;
	font-size: 0.9em;
}
</style>

