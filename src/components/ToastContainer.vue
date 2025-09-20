<template>
	<div class="toast-container" role="status" aria-live="polite">
		<transition-group name="toast-fade" tag="div">
			<div 
				v-for="toast in toasts" 
				:key="toast.id" 
				class="toast" 
				:class="toast.type" 
				@click="$emit('dismiss', toast.id)" 
				:aria-label="toast.title"
				@mouseenter="pauseAutoHide(toast.id)"
				@mouseleave="resumeAutoHide(toast.id)"
			>
				<strong class="title">{{ toast.title }}</strong>
				<div class="msg">{{ toast.message }}</div>
				<div v-if="toast.timeout > 0" class="progress-bar" :style="{ '--progress': toast.progress + '%' }"></div>
				<button type="button" class="close" :aria-label="t('threedviewer','Dismiss')" @click.stop="$emit('dismiss', toast.id)">×</button>
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
	data() {
		return {
			timers: new Map(),
			progressIntervals: new Map(),
		}
	},
	watch: {
		toasts: {
			handler(newToasts, oldToasts) {
				// Clean up timers for removed toasts
				if (oldToasts) {
					oldToasts.forEach(oldToast => {
						if (!newToasts.find(toast => toast.id === oldToast.id)) {
							this.clearToastTimer(oldToast.id)
						}
					})
				}
				
				// Set up auto-hide for new toasts
				newToasts.forEach(toast => {
					if (toast.timeout && toast.timeout > 0 && !this.timers.has(toast.id)) {
						this.setupAutoHide(toast)
					}
				})
			},
			immediate: true,
		}
	},
	beforeDestroy() {
		// Clean up all timers
		this.timers.forEach(timer => clearTimeout(timer))
		this.progressIntervals.forEach(interval => clearInterval(interval))
	},
	methods: {
		setupAutoHide(toast) {
			const duration = toast.timeout || 5000 // Default 5 seconds
			let remaining = duration
			
			// Update progress every 50ms for smooth animation
			const progressInterval = setInterval(() => {
				remaining -= 50
				const progress = Math.max(0, Math.min(100, ((duration - remaining) / duration) * 100))
				
				// Update the toast object directly (Vue reactivity)
				const toastIndex = this.toasts.findIndex(t => t.id === toast.id)
				if (toastIndex !== -1) {
					this.$set(this.toasts[toastIndex], 'progress', progress)
				}
			}, 50)
			
			this.progressIntervals.set(toast.id, progressInterval)
			
			// Set up the dismiss timer
			const timer = setTimeout(() => {
				this.$emit('dismiss', toast.id)
				this.clearToastTimer(toast.id)
			}, duration)
			
			this.timers.set(toast.id, timer)
		},
		
		clearToastTimer(toastId) {
			const timer = this.timers.get(toastId)
			if (timer) {
				clearTimeout(timer)
				this.timers.delete(toastId)
			}
			
			const progressInterval = this.progressIntervals.get(toastId)
			if (progressInterval) {
				clearInterval(progressInterval)
				this.progressIntervals.delete(toastId)
			}
		},
		
		pauseAutoHide(toastId) {
			const timer = this.timers.get(toastId)
			const progressInterval = this.progressIntervals.get(toastId)
			
			if (timer && progressInterval) {
				clearTimeout(timer)
				clearInterval(progressInterval)
				
				// Store the paused state
				this.$set(this.toasts.find(t => t.id === toastId), 'paused', true)
			}
		},
		
		resumeAutoHide(toastId) {
			const toast = this.toasts.find(t => t.id === toastId)
			if (toast && toast.paused && toast.timeout > 0) {
				this.$set(toast, 'paused', false)
				this.setupAutoHide(toast)
			}
		},
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

/* Progress bar for auto-hide */
.toast .progress-bar {
	position: absolute;
	bottom: 0;
	left: 0;
	height: 3px;
	background: rgba(255, 255, 255, 0.3);
	width: 100%;
	border-radius: 0 0 6px 6px;
	overflow: hidden;
}

.toast .progress-bar::after {
	content: '';
	position: absolute;
	top: 0;
	left: 0;
	height: 100%;
	width: var(--progress, 0%);
	background: currentColor;
	opacity: 0.7;
	transition: width 0.05s linear;
}

/* Different colors for different toast types */
.toast.success .progress-bar::after { background: var(--color-success, #2e7d32); }
.toast.error .progress-bar::after { background: var(--color-error, #d32f2f); }
.toast.info .progress-bar::after { background: var(--color-primary-element, #1976d2); }

/* Dark theme adjustments */
.dark-theme .toast .progress-bar {
	background: rgba(0, 0, 0, 0.3);
}

/* Accessibility - hide progress bar when reduced motion is preferred */
@media (prefers-reduced-motion: reduce) {
	.toast .progress-bar::after {
		transition: none;
	}
}
</style>
