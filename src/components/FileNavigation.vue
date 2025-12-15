<template>
	<NcAppNavigation @click.stop>
		<template #list>
			<!-- Sort Mode Selector -->
			<NcAppNavigationItem
				v-for="mode in sortModes"
				:key="mode.id"
				:name="mode.name"
				:to="null"
				:class="{ 'active': currentSort === mode.id }"
				@click.native.prevent.stop="changeSort(mode.id, $event)">
				<template #icon>
					<component :is="mode.icon" />
				</template>
			</NcAppNavigationItem>

			<div class="app-navigation-divider" />

			<!-- Loading Indicator -->
			<h2 v-if="loading"
				class="icon-loading-small loading-icon" />

			<!-- Empty State -->
			<NcEmptyContent v-else-if="!loading && hasNoFiles && !indexing"
				:title="t('threedviewer', 'No 3D files found')">
				<template #icon>
					<FileIcon :size="20" />
				</template>
			</NcEmptyContent>

			<!-- Indexing State -->
			<NcEmptyContent v-else-if="indexing"
				:title="t('threedviewer', 'Indexing files...')">
				<template #icon>
					<h2 class="icon-loading-small" />
				</template>
			</NcEmptyContent>

			<!-- Navigation sidebar only shows sort mode options -->
			<!-- Folders, types, dates, and files are shown in main content area -->
		</template>
	</NcAppNavigation>
</template>

<script>
import NcAppNavigation from '@nextcloud/vue/dist/Components/NcAppNavigation.js'
import NcAppNavigationItem from '@nextcloud/vue/dist/Components/NcAppNavigationItem.js'
import NcEmptyContent from '@nextcloud/vue/dist/Components/NcEmptyContent.js'

import FolderIcon from 'vue-material-design-icons/Folder.vue'
import FileIcon from 'vue-material-design-icons/File.vue'
import CalendarIcon from 'vue-material-design-icons/Calendar.vue'
import StarIcon from 'vue-material-design-icons/Star.vue'
import FileTypeIcon from 'vue-material-design-icons/FileCode.vue'
import ViewDashboardIcon from 'vue-material-design-icons/ViewDashboard.vue'

// FolderItem, TypeItem, DateItem are not used in navigation sidebar
// They are only used for emitting navigation events

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

export default {
	name: 'FileNavigation',
	emits: ['navigate-all', 'navigate-viewer'],
	components: {
		NcAppNavigation,
		NcAppNavigationItem,
		NcEmptyContent,
		FolderIcon,
		FileIcon,
		CalendarIcon,
		StarIcon,
		FileTypeIcon,
		ViewDashboardIcon,
	},

	props: {
		selectedFileId: {
			type: Number,
			default: null,
		},
		defaultSort: {
			type: String,
			default: 'folders',
		},
		restoreSortState: {
			type: Function,
			default: null,
		},
	},

	data() {
		return {
			currentSort: this.defaultSort,
			loading: false,
			folderItems: [],
			typeItems: [],
			dateItems: [],
			favoriteFiles: [],
			indexing: false,
			indexTriggered: false,
		}
	},

	computed: {
		sortModes() {
			return [
				{ id: 'viewer', name: this.t('threedviewer', 'Viewer'), icon: ViewDashboardIcon },
				{ id: 'folders', name: this.t('threedviewer', 'By Folders'), icon: FolderIcon },
				{ id: 'type', name: this.t('threedviewer', 'By Type'), icon: FileTypeIcon },
				{ id: 'date', name: this.t('threedviewer', 'By Added Date'), icon: CalendarIcon },
				{ id: 'favorites', name: this.t('threedviewer', 'Favorites'), icon: StarIcon },
			]
		},
		hasNoFiles() {
			switch (this.currentSort) {
			case 'viewer':
				return false // Viewer mode doesn't show file list
			case 'folders':
				return this.folderItems.length === 0
			case 'type':
				return this.typeItems.length === 0
			case 'date':
				return this.dateItems.length === 0
			case 'favorites':
				return this.favoriteFiles.length === 0
			default:
				return true
			}
		},
	},

	async mounted() {
		// Don't load files if in viewer mode
		if (this.currentSort !== 'viewer') {
			await this.loadFiles()
			// Emit initial navigation with folder/type/date structure
			// Don't include files for folders/type/date modes - show structure first
			this.$emit('navigate-all', {
				sort: this.currentSort,
				folders: this.currentSort === 'folders' ? this.folderItems : null,
				types: this.currentSort === 'type' ? this.typeItems : null,
				dates: this.currentSort === 'date' ? this.dateItems : null,
				files: this.currentSort === 'favorites' ? this.favoriteFiles : [], // Empty for folders/type/date, only files for favorites
			})
		}
	},

	methods: {
		async loadFiles() {
			this.loading = true
			try {
				const url = generateUrl('/apps/threedviewer/api/files/list')
				const response = await axios.get(url, {
					params: {
						sort: this.currentSort,
					},
				})

				this.updateDataFromResponse(response.data)

				// If no files found and we haven't triggered indexing yet, trigger it automatically
				if (this.hasNoFiles && !this.indexTriggered && !this.indexing) {
					await this.triggerIndexing()
				}
			} catch (error) {
				console.error('Failed to load files:', error)
			} finally {
				this.loading = false
			}
		},

		async triggerIndexing() {
			if (this.indexing || this.indexTriggered) {
				return
			}

			this.indexing = true
			this.indexTriggered = true

			try {
				const url = generateUrl('/apps/threedviewer/api/files/index')
				await axios.post(url)

				// Reload files after indexing
				await this.loadFiles()
			} catch (error) {
				console.error('Failed to trigger indexing:', error)
				// Reset flag on error so user can try again
				this.indexTriggered = false
			} finally {
				this.indexing = false
			}
		},

		updateDataFromResponse(data) {
			switch (this.currentSort) {
			case 'viewer':
				// Viewer mode doesn't load files
				break
			case 'folders':
				this.folderItems = Array.isArray(data) ? data : []
				break
			case 'type':
				this.typeItems = Array.isArray(data) ? data : []
				break
			case 'date':
				this.dateItems = Array.isArray(data) ? data : []
				break
			case 'favorites':
				this.favoriteFiles = data?.files || []
				break
			}
		},

		setActiveSort(sort, { persist = false } = {}) {
			if (!sort || this.currentSort === sort) {
				return
			}
			this.currentSort = sort
			if (persist) {
				this.saveSortPreference(sort)
			}
		},

		async changeSort(mode, event, forceReload = false) {
			// Prevent any default navigation behavior
			if (event) {
				event.preventDefault()
				event.stopPropagation()
			}

			// Always allow switching to viewer mode, even if already in viewer mode
			// This allows users to return to viewer from file browser
			if (mode === 'viewer') {
				this.currentSort = mode
				this.saveSortPreference(mode)
				this.$emit('navigate-viewer')
				return
			}

			// If already in this mode and not forcing reload, return early
			if (this.currentSort === mode && !forceReload) {
				return
			}

			// Allow parent to restore previous state (e.g., return to last folder view) without reloading
			if (this.restoreSortState && this.restoreSortState(mode)) {
				this.currentSort = mode
				this.saveSortPreference(mode)
				return
			}

			this.currentSort = mode
			this.saveSortPreference(mode)

			// Load files first, then emit navigation event
			await this.loadFiles()

			// Emit navigation event with folder/type/date structure for main content
			// Don't include files for folders/type/date modes - show structure first
			this.$emit('navigate-all', {
				sort: mode,
				folders: mode === 'folders' ? this.folderItems : null,
				types: mode === 'type' ? this.typeItems : null,
				dates: mode === 'date' ? this.dateItems : null,
				files: mode === 'favorites' ? this.favoriteFiles : [], // Empty for folders/type/date, only files for favorites
			})
		},

		getAllFilesForSort(sort) {
			switch (sort) {
			case 'folders':
				return this.getAllFilesFromFolders(this.folderItems)
			case 'type':
				return this.typeItems.flatMap(type => type.files || [])
			case 'date':
				return this.dateItems.flatMap(year =>
					(year.months || []).flatMap(month => month.files || []),
				)
			case 'favorites':
				return this.favoriteFiles
			default:
				return []
			}
		},

		getAllFilesFromFolders(items) {
			const files = []
			items.forEach(item => {
				if (item.files) {
					files.push(...item.files)
				}
				if (item.children) {
					files.push(...this.getAllFilesFromFolders(item.children))
				}
			})
			return files
		},

		saveSortPreference(sort) {
			const url = generateUrl('/apps/threedviewer/config')
			axios.put(url, {
				values: {
					file_sort: sort,
				},
			}).catch(error => {
				console.error('Failed to save sort preference:', error)
			})
		},
	},
}
</script>

<style scoped lang="scss">
.loading-icon {
	margin: 20px auto;
	text-align: center;
}

.app-navigation-divider {
	border-bottom: 1px solid var(--color-border);
	margin: 8px 0;
}

/* stylelint-disable selector-pseudo-class-no-unknown */
:deep(.active) {
	> .app-navigation-entry {
		background: var(--color-primary-light, lightgrey);
		font-weight: bold;
	}
}
/* stylelint-enable selector-pseudo-class-no-unknown */
</style>
