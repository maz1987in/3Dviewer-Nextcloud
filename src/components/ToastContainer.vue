<template>
	<div class="toast-container" role="status" aria-live="polite">
		<transition-group name="toast-fade" tag="div">
			<div
				v-for="toast in toasts"
				:key="toast.id"
				class="toast"
				:class="toast.type"
				:aria-label="toast.title"
				@click="$emit('dismiss', toast.id)"
				@mouseenter="pauseAutoHide(toast.id)"
				@mouseleave="resumeAutoHide(toast.id)">
				<strong class="title">{{ toast.title }}</strong>
				<div class="msg">
					{{ toast.message }}
				</div>
				<div v-if="toast.timeout > 0" class="progress-bar" :style="{ '--progress': toast.progress + '%' }" />
				<button type="button"
					class="close"
					:aria-label="t('threedviewer','Dismiss')"
					@click.stop="$emit('dismiss', toast.id)">
					×
				</button>
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
	emits: ['dismiss'],
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
		},
	},
	beforeUnmount() {
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
	top: 60px;
	inset-inline-end: 12px;
	z-index: 10000;
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
	padding: 10px 12px;
	border-radius: 6px;
	box-shadow: 0 4px 14px rgb(0 0 0 / 35%);
	font-size: 13px;
	line-height: 1.3;
	cursor: pointer;
	position: relative;
	overflow: hidden;
}
.toast.success { border-inline-start: 4px solid var(--color-success,#2e7d32); }
.toast.error { border-inline-start: 4px solid var(--color-error,#d32f2f); }
.toast.info { border-inline-start: 4px solid var(--color-primary-element,#1976d2); }
.toast.warning { border-inline-start: 4px solid var(--color-warning,#ff9800); }
.toast .title { display:block; font-weight:600; margin-bottom:2px; }
.toast .close { position:absolute; top:4px; inset-inline-end:6px; background:transparent; border:none; color:currentcolor; font-size:16px; cursor:pointer; padding:0; }
.toast .close:focus-visible { outline:2px solid var(--color-primary-element,#1976d2); outline-offset:2px; }

/* Progress bar for auto-hide */
.toast .progress-bar {
	position: absolute;
	bottom: 0;
	inset-inline-start: 0;
	height: 3px;
	background: rgb(255 255 255 / 30%);
	width: 100%;
	border-radius: 0 0 6px 6px;
	overflow: hidden;
}

.toast .progress-bar::after {
	content: '';
	position: absolute;
	top: 0;
	inset-inline-start: 0;
	height: 100%;
	width: var(--progress, 0%);
	background: currentcolor;
	opacity: 0.7;
	transition: width 0.05s linear;
}

/* Different colors for different toast types */
.toast.success .progress-bar::after { background: var(--color-success, #2e7d32); }
.toast.error .progress-bar::after { background: var(--color-error, #d32f2f); }
.toast.info .progress-bar::after { background: var(--color-primary-element, #1976d2); }
.toast.warning .progress-bar::after { background: var(--color-warning, #ff9800); }

/* Dark theme adjustments */
.dark-theme .toast .progress-bar {
	background: rgb(0 0 0 / 30%);
}

/* Accessibility - hide progress bar when reduced motion is preferred */
@media (prefers-reduced-motion: reduce) {
	.toast .progress-bar::after {
		transition: none;
	}
}

/* RTL (Right-to-Left) Support */
[dir="rtl"] .toast-container {
	inset-inline: 12px auto;
}

[dir="rtl"] .toast {
	border-inline-start: none;
	border-inline-end: 4px solid;
}

[dir="rtl"] .toast.success { border-inline-end: 4px solid var(--color-success,#2e7d32); }
[dir="rtl"] .toast.error { border-inline-end: 4px solid var(--color-error,#d32f2f); }
[dir="rtl"] .toast.info { border-inline-end: 4px solid var(--color-primary-element,#1976d2); }
[dir="rtl"] .toast.warning { border-inline-end: 4px solid var(--color-warning,#ff9800); }

[dir="rtl"] .toast .close {
	inset-inline: 6px auto;
}
</style>
