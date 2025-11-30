<template>
	<div class="folder-hierarchy-item">
		<!-- Current folder card -->
		<div
			class="folder-card"
			:class="{ 'has-children': hasFilteredChildren, 'has-files': has3DFiles }"
			@click="handleFolderClick">
			<div class="folder-thumbnail">
				<FolderIcon :size="48" />
			</div>
			<div class="folder-info">
				<div class="folder-name" :title="folder.name || t('threedviewer', 'Root')">
					{{ folder.name || t('threedviewer', 'Root') }}
				</div>
				<div class="folder-meta">
					<!-- Backend already filters, so count all files and children as-is -->
					<span v-if="hasFiles && hasChildren">
						{{ getFilesArray.length }} {{ t('threedviewer', '3D files') }}, {{ folder.children.length }} {{ t('threedviewer', 'folders') }}
					</span>
					<span v-else-if="hasFiles">
						{{ getFilesArray.length }} {{ t('threedviewer', '3D files') }}
					</span>
					<span v-else-if="hasChildren">
						{{ folder.children.length }} {{ t('threedviewer', 'folders') }}
					</span>
					<span v-else>
						0 {{ t('threedviewer', 'items') }}
					</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import FolderIcon from 'vue-material-design-icons/Folder.vue'
import FileIcon from 'vue-material-design-icons/File.vue'

export default {
	name: 'FolderHierarchy',
	components: {
		FolderIcon,
		FileIcon,
		FolderHierarchy: () => import('./FolderHierarchy.vue'),
	},
	props: {
		folder: {
			type: Object,
			required: true,
		},
	},
	emits: ['navigate-folder', 'select-file'],
	computed: {
		hasChildren() {
			return this.folder.children && Array.isArray(this.folder.children) && this.folder.children.length > 0
		},
		hasFiles() {
			// Handle both array and object formats
			if (!this.folder.files) return false
			if (Array.isArray(this.folder.files)) {
				return this.folder.files.length > 0
			}
			// If it's an object, check if it has any enumerable properties
			if (typeof this.folder.files === 'object') {
				return Object.keys(this.folder.files).length > 0
			}
			return false
		},
		getFilesArray() {
			// Convert files to array if it's an object
			if (!this.folder.files) return []
			if (Array.isArray(this.folder.files)) {
				return this.folder.files
			}
			if (typeof this.folder.files === 'object') {
				// Convert object to array
				return Object.values(this.folder.files)
			}
			return []
		},
		// These computed properties are kept for backward compatibility but simplified
		// since backend already filters
		has3DFiles() {
			return this.hasFiles
		},
		filteredChildren() {
			return this.hasChildren ? this.folder.children : []
		},
		hasFilteredChildren() {
			return this.hasChildren
		},
		filtered3DFiles() {
			return this.hasFiles ? this.getFilesArray : []
		},
	},
	mounted() {
		// Debug: Log folder data to see what backend is sending
		if (this.folder && (!this.hasFiles && !this.hasChildren)) {
			console.log('Folder with 0 items:', {
				name: this.folder.name,
				path: this.folder.path,
				files: this.folder.files,
				children: this.folder.children,
				hasFiles: this.hasFiles,
				hasChildren: this.hasChildren,
			})
		}
	},
	methods: {
		handleFolderClick() {
			// Always navigate to the folder (click to open, not expand)
			this.$emit('navigate-folder', this.folder)
		},
		selectFile(file) {
			this.$emit('select-file', file)
		},
	},
}
</script>

<style scoped lang="scss">
.folder-hierarchy-item {
	width: 100%;
	margin-bottom: 12px;
}

.folder-card {
	background: var(--color-main-background, #fff);
	border: 2px solid var(--color-border, #ddd);
	border-radius: 8px;
	padding: 16px;
	cursor: pointer;
	transition: all 0.2s ease;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	position: relative;
	width: 100%;

	&:hover {
		border-color: var(--color-primary, #0082c9);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	&.has-files {
		// Folders with files get a different style
		border-left: 4px solid var(--color-primary, #0082c9);
	}
}

.folder-thumbnail {
	width: 80px;
	height: 80px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--color-background-dark, #f5f5f5);
	border-radius: 4px;
}

.folder-info {
	width: 100%;
	text-align: center;
}

.folder-name {
	font-weight: 500;
	font-size: 14px;
	color: var(--color-main-text, #333);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	margin-bottom: 4px;
}

.folder-meta {
	font-size: 12px;
	color: var(--color-text-maxcontrast, #666);
	display: flex;
	justify-content: center;
}

.file-card {
	background: var(--color-main-background, #fff);
	border: 2px solid var(--color-border, #ddd);
	border-radius: 8px;
	padding: 16px;
	cursor: pointer;
	transition: all 0.2s ease;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;

	&:hover {
		border-color: var(--color-primary, #0082c9);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}
}

.file-thumbnail {
	position: relative;
	width: 80px;
	height: 80px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--color-background-dark, #f5f5f5);
	border-radius: 4px;

	.file-extension {
		position: absolute;
		bottom: 4px;
		right: 4px;
		background: var(--color-primary, #0082c9);
		color: white;
		font-size: 10px;
		font-weight: bold;
		padding: 2px 6px;
		border-radius: 3px;
	}
}

.file-info {
	width: 100%;
	text-align: center;
}

.file-name {
	font-weight: 500;
	font-size: 14px;
	color: var(--color-main-text, #333);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
