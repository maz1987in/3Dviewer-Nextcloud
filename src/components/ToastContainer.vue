<template>
	<div class="toast-container" role="status" aria-live="polite">
		<transition-group name="toast-fade" tag="div">
			<div v-for="t in toasts" :key="t.id" class="toast" :class="t.type" @click="$emit('dismiss', t.id)" :aria-label="t.title">
				<strong class="title">{{ t.title }}</strong>
				<div class="msg">{{ t.message }}</div>
				<button type="button" class="close" :aria-label="t('threedviewer','Dismiss')" @click.stop="$emit('dismiss', t.id)">×</button>
			</div>
		</transition-group>
	</div>
</template>

<script>
export default {
	name: 'ToastContainer',
	props: {
		toasts: { type: Array, required: true },
	},
}
</script>

<style scoped>
.toast-container {
	position: fixed;
	top: 12px;
	right: 12px;
	z-index: 2000;
	max-width: 320px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.toast-fade-enter-active, .toast-fade-leave-active { transition: all .25s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity:0; transform: translateY(-6px); }
.toast {
	background: var(--color-main-background,#2d2d2d);
	color: var(--color-main-text,#fff);
	padding: 10px 12px 10px 12px;
	border-radius: 6px;
	box-shadow: 0 4px 14px rgba(0,0,0,.35);
	font-size: 13px;
	line-height: 1.3;
	cursor: pointer;
	position: relative;
	overflow: hidden;
}
.toast.success { border-left: 4px solid var(--color-success,#2e7d32); }
.toast.error { border-left: 4px solid var(--color-error,#d32f2f); }
.toast.info { border-left: 4px solid var(--color-primary-element,#1976d2); }
.toast .title { display:block; font-weight:600; margin-bottom:2px; }
.toast .close { position:absolute; top:4px; right:6px; background:transparent; border:none; color:currentColor; font-size:16px; cursor:pointer; padding:0; }
.toast .close:focus-visible { outline:2px solid var(--color-primary-element,#1976d2); outline-offset:2px; }
</style>
