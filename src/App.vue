<template>
	<NcAppContent>
		<div id="viewer-wrapper">
			<ToastContainer :toasts="toasts" @dismiss="dismissToast" />
			<ViewerToolbar
				:grid="grid"
				:axes="axes"
				:wireframe="wireframe"
				:background="background"
				@reset-view="onReset"
				@toggle-grid="grid = !grid"
				@toggle-axes="axes = !axes"
				@toggle-wireframe="wireframe = !wireframe"
				@change-background="onBackgroundChange"
			/>
			<ThreeViewer
				:file-id="fileId"
				:show-grid="grid"
				:show-axes="axes"
				:wireframe="wireframe"
				:background="background"
				@model-loaded="onModelLoaded"
				@error="onError"
				ref="viewer"
			/>
		</div>
	</NcAppContent>
</template>

<script>
import NcAppContent from '@nextcloud/vue/dist/Components/NcAppContent.js'
import ToastContainer from './components/ToastContainer.vue'
import ThreeViewer from './components/ThreeViewer.vue'
import ViewerToolbar from './components/ViewerToolbar.vue'

export default {
	name: 'App',
	components: {
		NcAppContent,
		ToastContainer,
		ThreeViewer,
		ViewerToolbar,
	},
	data() {
		return {
			fileId: this.parseFileId(),
			grid: true,
			axes: true,
			wireframe: false,
			background: '#f5f5f5',
			lastError: null,
			modelMeta: null,
			toasts: [],
		}
	},
	methods: {
		parseFileId() {
			const params = new URLSearchParams(window.location.search)
			const id = params.get('fileId')
			return id ? Number(id) : null
		},
		onReset() {
			this.$refs.viewer?.resetView?.()
		},
		onBackgroundChange(val) {
			this.background = val
		},
		onModelLoaded(meta) {
			this.modelMeta = meta
			this.lastError = null
			this.pushToast({ type: 'success', title: this.tSuccessTitle(), message: this.tLoadedMessage(meta.filename) })
		},
		onError(msg) {
			this.lastError = msg
			console.error('Viewer error:', msg)
			this.pushToast({ type: 'error', title: this.tErrorTitle(), message: msg })
		},
		pushToast({ type = 'info', title, message }) {
			const id = Date.now() + Math.random()
			this.toasts.push({ id, type, title, message, timeout: 8000 })
		},
		dismissToast(id) {
			this.toasts = this.toasts.filter(t => t.id !== id)
		},
		tSuccessTitle() { return t('threedviewer', 'Model loaded') },
		tLoadedMessage(name) { return t('threedviewer', 'Loaded {file}', { file: name }) },
		tErrorTitle() { return t('threedviewer', 'Error loading model') },
	},
}
</script>

<style scoped lang="scss">
#viewer-wrapper {
	width: 100%;
	height: 100%;
	padding: 0;
}
</style>
