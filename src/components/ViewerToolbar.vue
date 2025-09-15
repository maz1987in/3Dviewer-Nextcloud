<template>
	<div class="viewer-toolbar" role="toolbar" :aria-label="t('threedviewer', '3D viewer controls')">
		<button @click="$emit('reset-view')" :aria-label="t('threedviewer','Reset view')" class="tb" type="button">
			{{ t('threedviewer','Reset') }}
		</button>
		<button @click="$emit('toggle-grid')" :aria-pressed="grid" :aria-label="t('threedviewer','Toggle grid')" class="tb" type="button">
			{{ grid ? t('threedviewer','Grid on') : t('threedviewer','Grid off') }}
		</button>
		<button @click="$emit('toggle-axes')" :aria-pressed="axes" :aria-label="t('threedviewer','Toggle axes')" class="tb" type="button">
			{{ axes ? t('threedviewer','Axes on') : t('threedviewer','Axes off') }}
		</button>
		<button @click="$emit('toggle-wireframe')" :aria-pressed="wireframe" :aria-label="t('threedviewer','Toggle wireframe')" class="tb" type="button">
			{{ wireframe ? t('threedviewer','Wireframe on') : t('threedviewer','Wireframe off') }}
		</button>
		<label class="color-picker" :aria-label="t('threedviewer','Background color')">
			<input type="color" :value="background" @input="$emit('change-background', $event.target.value)" />
		</label>
	</div>
</template>

<script>
export default {
	name: 'ViewerToolbar',
	props: {
		grid: { type: Boolean, default: true },
		axes: { type: Boolean, default: true },
		wireframe: { type: Boolean, default: false },
		background: { type: String, default: '#f5f5f5' },
	},
}
</script>

<style scoped>
.viewer-toolbar {
	position: absolute;
	top: 8px;
	left: 8px;
	z-index: 10;
	background: rgba(0,0,0,0.45);
	backdrop-filter: blur(4px);
	padding: 4px 6px;
	border-radius: 6px;
	display: flex;
	gap: 4px;
	align-items: center;
}
.tb {
	font-size: 11px;
	line-height: 1;
	padding: 4px 6px;
	background: var(--color-primary-element, #1976d2);
	color: #fff;
	border: none;
	border-radius: 4px;
	cursor: pointer;
}
.tb[aria-pressed="true"] {
	background: var(--color-success, #2e7d32);
}
.tb:focus-visible {
	outline: 2px solid var(--color-primary-text, #fff);
	outline-offset: 2px;
}
.color-picker input[type="color"] {
	width: 28px;
	height: 28px;
	padding: 0;
	border: none;
	background: transparent;
	cursor: pointer;
}
</style>
