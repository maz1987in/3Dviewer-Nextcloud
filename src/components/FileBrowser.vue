<template>
	<div class="file-browser">
		<!-- Header -->
		<div class="file-browser-header">
			<h2>{{ displayTitle }}</h2>
			<span v-if="filteredFiles.length > 0" class="file-count">{{ filteredFiles.length }} {{ t('threedviewer', 'files') }}</span>
		</div>

		<!-- Breadcrumbs -->
		<div v-if="hasBreadcrumbs" class="breadcrumbs-wrapper">
			<div class="breadcrumbs-content">
				<NcBreadcrumbs>
					<NcBreadcrumb
						v-for="(item, index) in breadcrumbItems"
						:key="`breadcrumb-${index}`"
						:name="item.label"
						:title="item.label"
						:href="index < breadcrumbItems.length - 1 ? `#breadcrumb-${index}` : null"
						:disable-drop="true"
						@click.native="handleBreadcrumbClick(index, item, $event)" />
				</NcBreadcrumbs>
				<!-- View Toggle (always show in breadcrumb area) -->
				<div v-if="showViewToggle" class="view-toggle">
					<button
						v-if="viewMode === 'grid'"
						:class="{ 'active': viewMode === 'grid' }"
						:aria-label="t('threedviewer', 'Switch to list view')"
						:title="t('threedviewer', 'Switch to list view')"
						@click.stop.prevent="setViewMode('list')">
						<svg width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="currentColor">
							<rect x="1"
								y="1"
								width="6"
								height="6"
								rx="1" />
							<rect x="9"
								y="1"
								width="6"
								height="6"
								rx="1" />
							<rect x="1"
								y="9"
								width="6"
								height="6"
								rx="1" />
							<rect x="9"
								y="9"
								width="6"
								height="6"
								rx="1" />
						</svg>
					</button>
					<button
						v-else
						:class="{ 'active': viewMode === 'list' }"
						:aria-label="t('threedviewer', 'Switch to grid view')"
						:title="t('threedviewer', 'Switch to grid view')"
						@click.stop.prevent="setViewMode('grid')">
						<svg width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="currentColor">
							<rect x="1"
								y="2"
								width="14"
								height="2"
								rx="0.5" />
							<rect x="1"
								y="7"
								width="14"
								height="2"
								rx="0.5" />
							<rect x="1"
								y="12"
								width="14"
								height="2"
								rx="0.5" />
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Breadcrumb area (always show, even without breadcrumbs) for view toggle -->
		<div v-else class="breadcrumbs-wrapper">
			<div class="breadcrumbs-content">
				<!-- View Toggle (always show in breadcrumb area when no breadcrumbs) -->
				<div v-if="showViewToggle" class="view-toggle" style="margin-left: auto;">
					<button
						v-if="viewMode === 'grid'"
						:class="{ 'active': viewMode === 'grid' }"
						:aria-label="t('threedviewer', 'Switch to list view')"
						:title="t('threedviewer', 'Switch to list view')"
						@click.stop.prevent="setViewMode('list')">
						<svg width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="currentColor">
							<rect x="1"
								y="1"
								width="6"
								height="6"
								rx="1" />
							<rect x="9"
								y="1"
								width="6"
								height="6"
								rx="1" />
							<rect x="1"
								y="9"
								width="6"
								height="6"
								rx="1" />
							<rect x="9"
								y="9"
								width="6"
								height="6"
								rx="1" />
						</svg>
					</button>
					<button
						v-else
						:class="{ 'active': viewMode === 'list' }"
						:aria-label="t('threedviewer', 'Switch to grid view')"
						:title="t('threedviewer', 'Switch to grid view')"
						@click.stop.prevent="setViewMode('grid')">
						<svg width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="currentColor">
							<rect x="1"
								y="2"
								width="14"
								height="2"
								rx="0.5" />
							<rect x="1"
								y="7"
								width="14"
								height="2"
								rx="0.5" />
							<rect x="1"
								y="12"
								width="14"
								height="2"
								rx="0.5" />
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Loading State -->
		<div v-if="loading" class="file-browser-loading">
			<h2 class="icon-loading-small" />
			<p>{{ t('threedviewer', 'Loading files...') }}</p>
		</div>

		<!-- Folders/Types/Dates Grid (only show when no specific folder/type/date is selected) -->
		<template v-else-if="!loading && (folders || types || dates) && !currentPath && !currentType && !currentDate">
			<div :key="`overview-container-${viewMode}`" :class="viewMode === 'list' ? 'file-list' : 'file-grid'">
				<!-- Folders - Show hierarchical structure -->
				<template v-if="folders">
					<FolderHierarchy
						v-for="folder in folders"
						:key="folder.path || 'root'"
						:folder="folder"
						@navigate-folder="navigateFolder"
						@select-file="selectFile" />
				</template>

				<!-- Types -->
				<template v-if="types">
					<div
						v-for="type in types"
						:key="type.extension"
						class="folder-card"
						@click="navigateType(type)">
						<div class="folder-thumbnail">
							<FileTypeIcon :size="48" />
						</div>
						<div class="folder-info">
							<div class="folder-name" :title="type.name">
								{{ type.name }}
							</div>
							<div class="folder-meta">
								<span>{{ type.files?.length || 0 }} {{ t('threedviewer', 'files') }}</span>
							</div>
						</div>
					</div>
				</template>

				<!-- Dates - Show years -->
				<template v-if="dates">
					<div
						v-for="year in dates"
						:key="year.year"
						class="folder-card"
						@click="navigateDate(year)">
						<div class="folder-thumbnail">
							<CalendarIcon :size="48" />
						</div>
						<div class="folder-info">
							<div class="folder-name" :title="year.name">
								{{ year.name }}
							</div>
							<div class="folder-meta">
								<span>{{ year.months?.length || 0 }} {{ t('threedviewer', 'months') }}</span>
							</div>
						</div>
					</div>
				</template>
			</div>
		</template>

		<!-- Months Grid (show when a year is selected but no month) -->
		<template v-else-if="!loading && currentDate && currentDate.year && !currentDate.month && dates">
			<div :key="`months-container-${viewMode}`" :class="viewMode === 'list' ? 'file-list' : 'file-grid'">
				<template v-for="year in dates" :key="year.year">
					<template v-if="year.year === currentDate.year && year.months">
						<div
							v-for="month in year.months"
							:key="month.name"
							class="folder-card"
							@click="navigateMonth(year.year, month)">
							<div class="folder-thumbnail">
								<CalendarIcon :size="48" />
							</div>
							<div class="folder-info">
								<div class="folder-name" :title="month.name">
									{{ month.name }}
								</div>
								<div class="folder-meta">
									<span>{{ month.files?.length || 0 }} {{ t('threedviewer', 'files') }}</span>
								</div>
							</div>
						</div>
					</template>
				</template>
			</div>
		</template>

		<!-- Empty State -->
		<NcEmptyContent v-else-if="!loading && filteredFiles.length === 0 && !folders && !types && !dates && !currentPath && !currentType && !(currentDate && currentDate.year && !currentDate.month) && !currentDate"
			:title="t('threedviewer', 'No 3D files found')">
			<template #icon>
				<FileIcon :size="20" />
			</template>
		</NcEmptyContent>

		<!-- File Grid/List (show files and subfolders when a folder/type/date is selected) -->
		<div v-else-if="!loading && (currentPath || currentType || (currentDate && currentDate.month))"
			:key="`file-container-${viewMode}`"
			:class="viewMode === 'list' ? 'file-list' : 'file-grid'"
			:tabindex="viewMode === 'list' ? 0 : -1"
			@keydown="handleKeydown">
			<!-- Show subfolders if available -->
			<template v-if="folders && folders.length > 0">
				<FolderHierarchy
					v-for="folder in folders"
					:key="folder.path || 'root'"
					:folder="folder"
					@navigate-folder="navigateFolder"
					@select-file="selectFile" />
			</template>

			<!-- Show files - Grid View -->
			<template v-if="filteredFiles.length > 0 && viewMode === 'grid'" :key="'grid-template'">
				<div
					v-for="file in filteredFiles"
					:key="`grid-${file.id}`"
					class="file-card"
					:class="{ 'selected': file.id === selectedFileId }"
					@click="selectFile(file)">
					<div class="file-thumbnail">
						<FileIcon :size="48" />
						<div class="file-extension">
							{{ file.extension.toUpperCase() }}
						</div>
					</div>
					<div class="file-info">
						<div class="file-name" :title="file.name">
							{{ file.name }}
						</div>
						<div class="file-meta">
							<span v-if="file.size">{{ formatFileSize(file.size) }}</span>
							<span v-if="file.mtime" class="file-date">{{ formatDate(file.mtime) }}</span>
						</div>
					</div>
				</div>
			</template>

			<!-- Show files - List View -->
			<template v-if="filteredFiles.length > 0 && viewMode === 'list'" :key="'list-template'">
				<div
					v-for="(file, index) in filteredFiles"
					:key="`list-${file.id}`"
					class="file-list-item"
					:class="{ 'selected': file.id === selectedFileId, 'focused': focusedIndex === index }"
					:tabindex="0"
					@click="selectFile(file)"
					@keydown.enter="selectFile(file)"
					@keydown.space.prevent="selectFile(file)"
					@focus="focusedIndex = index">
					<div class="file-list-thumbnail">
						<FileIcon :size="32" />
						<div class="file-extension-small">
							{{ file.extension.toUpperCase() }}
						</div>
					</div>
					<div class="file-list-info">
						<div class="file-list-name" :title="file.name">
							{{ file.name }}
						</div>
						<div class="file-list-meta">
							<span v-if="file.size" class="file-size">{{ formatFileSize(file.size) }}</span>
							<span v-if="file.mtime" class="file-date">{{ formatDate(file.mtime) }}</span>
						</div>
					</div>
				</div>
			</template>

			<!-- Empty state if no files and no folders -->
			<div v-if="(!folders || folders.length === 0) && filteredFiles.length === 0" class="file-browser-empty">
				<p>{{ t('threedviewer', 'No 3D files in this folder') }}</p>
			</div>
		</div>
	</div>
</template>

<script>
import NcEmptyContent from '@nextcloud/vue/dist/Components/NcEmptyContent.js'
import NcBreadcrumbs from '@nextcloud/vue/dist/Components/NcBreadcrumbs.js'
import NcBreadcrumb from '@nextcloud/vue/dist/Components/NcBreadcrumb.js'
import FileIcon from 'vue-material-design-icons/File.vue'
import FileTypeIcon from 'vue-material-design-icons/FileCode.vue'
import CalendarIcon from 'vue-material-design-icons/Calendar.vue'
import FolderHierarchy from './FileBrowser/FolderHierarchy.vue'
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

export default {
	name: 'FileBrowser',
	components: {
		NcEmptyContent,
		NcBreadcrumbs,
		NcBreadcrumb,
		FileIcon,
		FileTypeIcon,
		CalendarIcon,
		FolderHierarchy,
	},
	props: {
		files: {
			type: Array,
			default: () => [],
		},
		folders: {
			type: Array,
			default: null,
		},
		types: {
			type: Array,
			default: null,
		},
		dates: {
			type: Array,
			default: null,
		},
		sort: {
			type: String,
			default: null,
		},
		loading: {
			type: Boolean,
			default: false,
		},
		currentPath: {
			type: String,
			default: null,
		},
		currentType: {
			type: String,
			default: null,
		},
		currentDate: {
			type: Object,
			default: null,
		},
		selectedFileId: {
			type: Number,
			default: null,
		},
	},
	emits: [
		'select-file',
		'navigate-folder',
		'navigate-type',
		'navigate-date',
		'navigate-all',
	],
	data() {
		// Start with localStorage value, will be updated from settings in mounted
		const savedViewMode = localStorage.getItem('threedviewer:fileBrowserView')
		return {
			viewMode: savedViewMode === 'list' ? 'list' : (savedViewMode === 'grid' ? 'grid' : 'grid'),
			focusedIndex: -1, // For keyboard navigation
			userSettings: {}, // Store user settings
			settingsLoaded: false, // Track if settings have been loaded
		}
	},
	computed: {
		// Backend already filters - just return files as-is
		filteredFiles() {
			// Ensure files is an array
			if (!Array.isArray(this.files)) {
				return []
			}
			// Backend already filters out images and only returns 3D files
			return this.files
		},
		displayTitle() {
			if (this.currentPath) {
				return this.currentPath || this.t('threedviewer', 'Root')
			}
			if (this.currentType) {
				return `${this.t('threedviewer', 'Type')}: ${this.currentType.toUpperCase()}`
			}
			if (this.currentDate) {
				if (this.currentDate.month) {
					return `${this.currentDate.year} - ${this.currentDate.month}`
				}
				return this.currentDate.year
			}
			if (this.sort === 'folders') {
				return this.t('threedviewer', 'Folders')
			}
			if (this.sort === 'type') {
				return this.t('threedviewer', 'File Types')
			}
			if (this.sort === 'date') {
				return this.t('threedviewer', 'By Date')
			}
			if (this.sort === 'favorites') {
				return this.t('threedviewer', 'Favorites')
			}
			return this.t('threedviewer', 'All Files')
		},
		breadcrumbItems() {
			const items = []

			// Ensure sort is defined
			if (!this.sort) {
				return items
			}

			// Root breadcrumb based on sort mode
			if (this.sort === 'folders') {
				items.push({
					label: this.t('threedviewer', 'Folders'),
					type: 'root',
					sort: 'folders',
				})
			} else if (this.sort === 'type') {
				items.push({
					label: this.t('threedviewer', 'File Types'),
					type: 'root',
					sort: 'type',
				})
			} else if (this.sort === 'date') {
				items.push({
					label: this.t('threedviewer', 'By Date'),
					type: 'root',
					sort: 'date',
				})
			} else if (this.sort === 'favorites') {
				items.push({
					label: this.t('threedviewer', 'Favorites'),
					type: 'root',
					sort: 'favorites',
				})
			}

			// Add folder path breadcrumbs
			if (this.currentPath) {
				const pathParts = this.currentPath.split('/').filter(part => part.length > 0)
				let currentPath = ''
				pathParts.forEach((part, index) => {
					currentPath += (currentPath ? '/' : '') + part
					items.push({
						label: part,
						type: 'folder',
						path: currentPath,
						name: part,
					})
				})
			}

			// Add type breadcrumb
			if (this.currentType) {
				items.push({
					label: this.currentType.toUpperCase(),
					type: 'type',
					extension: this.currentType,
				})
			}

			// Add date breadcrumbs
			if (this.currentDate) {
				if (this.currentDate.year) {
					items.push({
						label: this.currentDate.year.toString(),
						type: 'date',
						year: this.currentDate.year,
						month: null,
					})
				}
				if (this.currentDate.month) {
					items.push({
						label: this.currentDate.month,
						type: 'date',
						year: this.currentDate.year,
						month: this.currentDate.month,
					})
				}
			}

			return items
		},
		hasBreadcrumbs() {
			// Check if we have valid breadcrumb items to display
			return this.breadcrumbItems && Array.isArray(this.breadcrumbItems) && this.breadcrumbItems.length > 0
		},
		showViewToggle() {
			// Show toggle when we have files, folders, types, or dates to display
			// This allows switching views for any content
			const hasFiles = this.filteredFiles.length > 0
			const hasFolders = this.folders && this.folders.length > 0
			const hasTypes = this.types && this.types.length > 0
			const hasDates = this.dates && this.dates.length > 0
			return hasFiles || hasFolders || hasTypes || hasDates
		},
	},
	watch: {
		viewMode(newVal, oldVal) {
			// View mode changed - Vue will handle the re-render automatically
		},
		// Watch for changes in userSettings to update view mode if setting changes
		'userSettings.fileBrowser.defaultView'(newVal) {
			if (this.settingsLoaded && newVal) {
				const settingViewMode = newVal === 'list' ? 'list' : 'grid'
				// Only update if it's different from current view
				if (this.viewMode !== settingViewMode) {
					this.viewMode = settingViewMode
					localStorage.setItem('threedviewer:fileBrowserView', settingViewMode)
				}
			}
		},
	},
	mounted() {
		// Load user settings to get default view preference
		this.loadUserSettings()
	},
	methods: {
		async loadUserSettings() {
			try {
				const response = await axios.get(generateUrl('/apps/threedviewer/settings'))
				const settings = response.data.settings || {}
				this.userSettings = settings
				this.settingsLoaded = true

				// Get the default view from settings (this is the source of truth)
				const defaultView = settings?.fileBrowser?.defaultView || 'grid'
				const settingViewMode = defaultView === 'list' ? 'list' : 'grid'

				// Always use the setting as the default
				// The setting is the source of truth - if user changes it, we should respect it
				// localStorage is only used if settings haven't loaded yet
				this.viewMode = settingViewMode
				// Update localStorage to match the setting so it persists
				localStorage.setItem('threedviewer:fileBrowserView', settingViewMode)
			} catch (error) {
				console.warn('Failed to load user settings, using localStorage or default view', error)
				this.settingsLoaded = true // Mark as loaded even on error to prevent retries
				// If settings fail to load, keep the current viewMode (from localStorage or default 'grid')
				const savedViewMode = localStorage.getItem('threedviewer:fileBrowserView')
				if (savedViewMode) {
					this.viewMode = savedViewMode === 'list' ? 'list' : 'grid'
				} else {
					this.viewMode = 'grid' // Final fallback
				}
			}
		},
		setViewMode(mode) {
			if (mode === 'grid' || mode === 'list') {
				this.viewMode = mode
				// Save to localStorage - this represents an explicit user choice
				localStorage.setItem('threedviewer:fileBrowserView', mode)
				// Reset focus when switching views
				this.focusedIndex = -1
			}
		},
		handleKeydown(event) {
			if (this.viewMode !== 'list' || this.filteredFiles.length === 0) {
				return
			}

			const files = this.filteredFiles
			let newIndex = this.focusedIndex

			switch (event.key) {
			case 'ArrowDown':
				event.preventDefault()
				newIndex = this.focusedIndex < files.length - 1 ? this.focusedIndex + 1 : 0
				this.focusedIndex = newIndex
				// Focus the element
				this.$nextTick(() => {
					const items = this.$el.querySelectorAll('.file-list-item')
					if (items[newIndex]) {
						items[newIndex].focus()
					}
				})
				break
			case 'ArrowUp':
				event.preventDefault()
				newIndex = this.focusedIndex > 0 ? this.focusedIndex - 1 : files.length - 1
				this.focusedIndex = newIndex
				// Focus the element
				this.$nextTick(() => {
					const items = this.$el.querySelectorAll('.file-list-item')
					if (items[newIndex]) {
						items[newIndex].focus()
					}
				})
				break
			case 'Home':
				event.preventDefault()
				this.focusedIndex = 0
				this.$nextTick(() => {
					const items = this.$el.querySelectorAll('.file-list-item')
					if (items[0]) {
						items[0].focus()
					}
				})
				break
			case 'End':
				event.preventDefault()
				this.focusedIndex = files.length - 1
				this.$nextTick(() => {
					const items = this.$el.querySelectorAll('.file-list-item')
					if (items[files.length - 1]) {
						items[files.length - 1].focus()
					}
				})
				break
			}
		},
		selectFile(file) {
			this.$emit('select-file', file)
		},
		async navigateFolder(folder) {
			// Fetch files and subfolders from backend for this specific folder
			try {
				const url = generateUrl('/apps/threedviewer/api/files/list')
				const response = await axios.get(url, {
					params: {
						sort: 'folders',
						folder: folder.path || '',
					},
				})
				// Ensure files is an array
				let files = response.data?.files || []
				if (!Array.isArray(files) && typeof files === 'object') {
					files = Object.values(files)
				}
				// Ensure folders is an array
				let subfolders = response.data?.folders || []
				if (!Array.isArray(subfolders) && typeof subfolders === 'object') {
					subfolders = Object.values(subfolders)
				}

				// Emit with both files and subfolders
				this.$emit('navigate-folder', {
					path: folder.path,
					name: folder.name,
					files,
					subfolders,
				})
			} catch (error) {
				console.error('Failed to fetch folder files:', error)
				// Fallback to using files from folder object
				const allFiles = this.getAllFilesFromFolder(folder)
				this.$emit('navigate-folder', {
					path: folder.path,
					name: folder.name,
					files: allFiles,
					subfolders: folder.children || [],
				})
			}
		},
		getAllFilesFromFolder(folder) {
			const files = []
			// Add direct files - handle both array and object formats
			if (folder.files) {
				if (Array.isArray(folder.files)) {
					files.push(...folder.files)
				} else if (typeof folder.files === 'object') {
					// Convert object to array
					files.push(...Object.values(folder.files))
				}
			}
			// Recursively get files from children
			if (folder.children && Array.isArray(folder.children)) {
				folder.children.forEach(child => {
					files.push(...this.getAllFilesFromFolder(child))
				})
			}
			return files
		},
		navigateType(type) {
			this.$emit('navigate-type', {
				extension: type.extension,
				name: type.name,
				files: type.files || [],
			})
		},
		navigateDate(year) {
			// When clicking a year, show months (not files)
			this.$emit('navigate-date', {
				year: year.year,
				month: null,
				files: [],
			})
		},
		navigateMonth(year, month) {
			// When clicking a month, show files
			this.$emit('navigate-date', {
				year,
				month: month.name,
				files: month.files || [],
			})
		},
		formatFileSize(bytes) {
			if (!bytes) return ''
			const sizes = ['B', 'KB', 'MB', 'GB']
			if (bytes === 0) return '0 B'
			const i = Math.floor(Math.log(bytes) / Math.log(1024))
			return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
		},
		formatDate(timestamp) {
			if (!timestamp) return ''
			const date = new Date(timestamp * 1000)
			return date.toLocaleDateString()
		},
		handleBreadcrumbClick(index, item, event) {
			// Don't navigate if it's the last (current) item
			if (index >= this.breadcrumbItems.length - 1) {
				return
			}

			if (event) {
				event.preventDefault()
				event.stopPropagation()
			}

			this.navigateBreadcrumbByItem(item, index)
		},
		navigateBreadcrumbByItem(item, index) {
			// Navigate based on item type
			if (item.type === 'root') {
				// Navigate back to root view
				// Emit navigate-all with a flag to indicate we need to reload from FileNavigation
				// Pass null for folders/types/dates to trigger reload in App.vue
				this.$emit('navigate-all', {
					sort: item.sort,
					folders: null, // Explicitly null to trigger reload
					types: null,
					dates: null,
					files: item.sort === 'favorites' ? this.files : [],
					fromBreadcrumb: true, // Flag to indicate this is from breadcrumb click
					resetState: true,
				})
			} else if (item.type === 'folder') {
				// Navigate to parent folder - always fetch from backend to ensure we have the latest data
				// This ensures we get both files and subfolders correctly
				this.navigateFolder({
					path: item.path,
					name: item.name,
				})
			} else if (item.type === 'type') {
				// Navigate to type
				const type = this.types?.find(t => t.extension === item.extension)
				if (type) {
					this.navigateType(type)
				}
			} else if (item.type === 'date') {
				// Navigate to date
				if (item.month) {
					// Navigate to month - show files
					const year = this.dates?.find(d => d.year === item.year)
					if (year && year.months) {
						const month = year.months.find(m => m.name === item.month)
						if (month) {
							this.navigateMonth(item.year, month)
						}
					}
				} else {
					// Navigate to year - show months
					const year = this.dates?.find(d => d.year === item.year)
					if (year) {
						this.navigateDate(year)
					}
				}
			}
		},
	},
}
</script>

<style scoped lang="scss">
.file-browser {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	background: var(--color-main-background, #fff);
	margin: 0;
	padding: 0;
}

.file-browser-header {
	padding: 12px;
	border-bottom: 1px solid var(--color-border, #ddd);
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding-left: 40px;

	h2 {
		margin: 0;
		font-size: 24px;
		font-weight: 600;
		color: var(--color-main-text, #333);
		height: 44px;
		display: flex;
		align-items: center;
		transform: translateY(-6px);
	}

	.file-count {
		color: var(--color-text-maxcontrast, #666);
		font-size: 14px;
	}

.view-toggle {
	display: flex !important;
	gap: 4px;
	background: var(--color-background-dark, #f5f5f5);
	border-radius: 6px;
	padding: 2px;
	flex-shrink: 0;
	opacity: 1 !important;
	visibility: visible !important;
	position: relative !important;
	z-index: 1000 !important;
	margin-left: auto !important;

		button {
			background: transparent;
			border: none;
			padding: 6px 8px;
			cursor: pointer;
			border-radius: 4px;
			color: var(--color-text-maxcontrast, #666);
			display: flex;
			align-items: center;
			justify-content: center;
			transition: all 0.2s ease;

			&:hover {
				background: var(--color-background-hover, #e5e5e5);
				color: var(--color-main-text, #333);
			}

			&.active {
				background: var(--color-primary-element, #0082c9);
				color: white;

				&:hover {
					background: var(--color-primary-element-hover, #006ba3);
				}
			}

			&:focus {
				outline: 2px solid var(--color-primary-element, #0082c9);
				outline-offset: 2px;
			}
		}
	}
}

.breadcrumbs-wrapper {
	border-bottom: 1px solid var(--color-border, #ddd);
	background: var(--color-background-dark, #f5f5f5);
}

.breadcrumbs-content {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	width: 100%;
}

.view-toggle-header {
	padding: 12px 20px;
	padding-left: 40px;
	border-bottom: 1px solid var(--color-border, #ddd);
	background: var(--color-background-dark, #f5f5f5);
	display: flex;
	justify-content: flex-end;
}

.file-browser-loading {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 16px;
	color: var(--color-text-maxcontrast, #666);

	h2 {
		margin: 0;
	}

	p {
		margin: 0;
	}
}

.file-grid {
	flex: 1;
	overflow-y: auto;
	padding: 20px;
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	gap: 12px;
	align-content: flex-start;
	grid-auto-rows: minmax(190px, auto);
	max-height: calc(100vh - 100px);
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

	&:hover {
		border-color: var(--color-primary, #0082c9);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	&.selected {
		border-color: var(--color-primary, #0082c9);
		background: var(--color-primary-light, #e6f3ff);
	}
}

/* List view styling for folder cards (types, dates, folders) */
.file-list .folder-card {
	flex-direction: row;
	align-items: center;
	justify-content: flex-start;
	padding: 12px 20px;
	border: none;
	border-bottom: 1px solid var(--color-border, #e5e5e5);
	border-radius: 0;
	box-shadow: none;
	gap: 12px;
	background: var(--color-main-background, #fff);
	cursor: pointer;
	transition: all 0.15s ease;

	&:hover {
		background: var(--color-background-hover, #f5f5f5);
		border-color: transparent;
		border-bottom-color: var(--color-border, #e5e5e5);
		transform: none;
		box-shadow: none;
	}

	&.selected {
		background: var(--color-primary-light, #e6f3ff);
		border-left: 3px solid var(--color-primary-element, #0082c9);
		padding-left: 17px;
		border-bottom-color: var(--color-border, #e5e5e5);
	}

	.folder-thumbnail {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-background-dark, #f5f5f5);
		border-radius: 4px;
		position: relative;
	}

	.folder-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
		text-align: left;
	}

	.folder-name {
		font-weight: 500;
		font-size: 14px;
		color: var(--color-main-text, #333);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		width: 100%;
		line-height: 1.3;
	}

	.folder-meta {
		font-size: 12px;
		color: var(--color-text-maxcontrast, #666);
		line-height: 1.3;
		text-align: left;
		justify-content: flex-start;
		display: flex;
	}
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

	&.selected {
		border-color: var(--color-primary, #0082c9);
		background: var(--color-primary-light, #e6f3ff);
	}
}

.folder-thumbnail {
	position: relative;
	width: 80px;
	height: 80px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--color-background-dark, #f5f5f5);
	border-radius: 4px;
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

.file-info,
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

.file-name {
	font-weight: 500;
	font-size: 14px;
	color: var(--color-main-text, #333);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	margin-bottom: 4px;
	line-height: 1.3;
}

.folder-meta {
	display: flex;
	justify-content: center;
	gap: 8px;
	font-size: 12px;
	color: var(--color-text-maxcontrast, #666);
}

.file-meta {
	display: flex;
	justify-content: center;
	gap: 8px;
	font-size: 12px;
	color: var(--color-text-maxcontrast, #666);
	line-height: 1.3;

	.file-date {
		&::before {
			content: '•';
			margin-right: 8px;
		}
	}
}

/* List View Styles */
.file-list {
	flex: 1;
	overflow-y: auto;
	padding: 0;
	display: flex;
	flex-direction: column;
	max-height: calc(100vh - 100px);
	outline: none;
}

.file-list-item {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 20px;
	border-bottom: 1px solid var(--color-border, #e5e5e5);
	cursor: pointer;
	transition: all 0.15s ease;
	background: var(--color-main-background, #fff);

	&:hover {
		background: var(--color-background-hover, #f5f5f5);
	}

	&.selected {
		background: var(--color-primary-light, #e6f3ff);
		border-left: 3px solid var(--color-primary-element, #0082c9);
		padding-left: 17px; // Adjust for border
	}

	&.focused {
		outline: 2px solid var(--color-primary-element, #0082c9);
		outline-offset: -2px;
	}

	&:focus {
		outline: 2px solid var(--color-primary-element, #0082c9);
		outline-offset: -2px;
	}

	&:last-child {
		border-bottom: none;
	}
}

.file-list .folder-card:last-child {
	border-bottom: none;
}

/* Override FolderHierarchy styles in list view */
/* stylelint-disable selector-pseudo-class-no-unknown */
.file-list :deep(.folder-hierarchy-item) {
	margin-bottom: 0;
}

.file-list :deep(.folder-hierarchy-item .folder-card) {
	flex-direction: row;
	align-items: center;
	justify-content: flex-start;
	padding: 12px 20px;
	border: none;
	border-bottom: 1px solid var(--color-border, #e5e5e5);
	border-radius: 0;
	box-shadow: none;
	gap: 16px;
	width: 100%;

	&:hover {
		background: var(--color-background-hover, #f5f5f5);
		border-color: transparent;
		border-bottom-color: var(--color-border, #e5e5e5);
		transform: none;
		box-shadow: none;
	}

	&.selected {
		background: var(--color-primary-light, #e6f3ff);
		border-left: 3px solid var(--color-primary-element, #0082c9);
		padding-left: 17px;
		border-bottom-color: var(--color-border, #e5e5e5);
	}

	.folder-thumbnail {
		width: 48px;
		height: 48px;
		flex-shrink: 0;
	}

	.folder-info {
		flex: 1;
		min-width: 0;
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.folder-name {
		font-weight: 500;
		font-size: 14px;
		color: var(--color-main-text, #333);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-bottom: 0;
	}

	.folder-meta {
		font-size: 12px;
		color: var(--color-text-maxcontrast, #666);
		justify-content: flex-start;
	}
}

.file-list :deep(.folder-hierarchy-item:last-child .folder-card) {
	border-bottom: none;
}
/* stylelint-enable selector-pseudo-class-no-unknown */

.file-list-thumbnail {
	position: relative;
	width: 48px;
	height: 48px;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--color-background-dark, #f5f5f5);
	border-radius: 4px;

	.file-extension-small {
		position: absolute;
		bottom: 2px;
		right: 2px;
		background: var(--color-primary, #0082c9);
		color: white;
		font-size: 8px;
		font-weight: bold;
		padding: 1px 4px;
		border-radius: 2px;
	}
}

.file-list-info {
	flex: 1;
	min-width: 0; // Allow text truncation
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.file-list-name {
	font-weight: 500;
	font-size: 14px;
	color: var(--color-main-text, #333);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.file-list-meta {
	display: flex;
	gap: 12px;
	font-size: 12px;
	color: var(--color-text-maxcontrast, #666);

	.file-size {
		font-weight: 500;
	}

	.file-date {
		&::before {
			content: '•';
			margin-right: 8px;
		}
	}
}
</style>
