<template>
	<!--
		Teleported for the same reason as the modals: `#content-vue` carries a
		backdrop-filter, so a fixed overlay inside it is fixed to the app content rather
		than to the page. These offsets are written to clear Nextcloud's header and the
		viewer's bar, and inside that box the header was counted twice — the panel opened
		66px below the bar where the rule asks for 16.
	-->
	<Teleport to="body">
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
					<div v-if="toast.timeout > 0" class="progress-bar" :style="{ '--progress': (progressValues[toast.id] || 0) + '%' }" />
					<button type="button"
						class="close"
						:aria-label="t('threedviewer','Dismiss')"
						@click.stop="$emit('dismiss', toast.id)">
						×
					</button>
				</div>
			</transition-group>
		</div>
	</Teleport>
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
			progressValues: {}, // { [toastId]: number } — local state, avoids mutating prop
			pausedState: {}, // { [toastId]: boolean }
		}
	},
	watch: {
		toasts: {
			deep: true,
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
					if (toast.timeout && toast.timeout > 0 && !this._timers.has(toast.id)) {
						this.setupAutoHide(toast)
					}
				})
			},
			immediate: true,
		},
	},
	created() {
		// Keep Maps outside reactive data — Vue 3 proxy breaks Map.has()/Map.get()
		this._timers = new Map()
		this._progressIntervals = new Map()
	},
	beforeUnmount() {
		// Clean up all timers
		this._timers.forEach(timer => clearTimeout(timer))
		this._progressIntervals.forEach(interval => clearInterval(interval))
	},
	methods: {
		setupAutoHide(toast) {
			const duration = toast.timeout || 5000 // Default 5 seconds
			let remaining = duration

			// Update progress every 50ms for smooth animation
			const progressInterval = setInterval(() => {
				remaining -= 50
				const progress = Math.max(0, Math.min(100, ((duration - remaining) / duration) * 100))

				// Track progress locally (avoids mutating the toasts prop)
				this.progressValues[toast.id] = progress
			}, 50)

			this._progressIntervals.set(toast.id, progressInterval)

			// Set up the dismiss timer
			const timer = setTimeout(() => {
				this.$emit('dismiss', toast.id)
				this.clearToastTimer(toast.id)
			}, duration)

			this._timers.set(toast.id, timer)
		},

		clearToastTimer(toastId) {
			const timer = this._timers.get(toastId)
			if (timer) {
				clearTimeout(timer)
				this._timers.delete(toastId)
			}

			const progressInterval = this._progressIntervals.get(toastId)
			if (progressInterval) {
				clearInterval(progressInterval)
				this._progressIntervals.delete(toastId)
			}

			// Clean up local state
			delete this.progressValues[toastId]
			delete this.pausedState[toastId]
		},

		pauseAutoHide(toastId) {
			const timer = this._timers.get(toastId)
			const progressInterval = this._progressIntervals.get(toastId)

			if (timer && progressInterval) {
				clearTimeout(timer)
				clearInterval(progressInterval)

				// Track paused state locally (avoids mutating the toasts prop)
				this.pausedState[toastId] = true
			}
		},

		resumeAutoHide(toastId) {
			const toast = this.toasts.find(t => t.id === toastId)
			if (toast && this.pausedState[toastId] && toast.timeout > 0) {
				this.pausedState[toastId] = false
				this.setupAutoHide(toast)
			}
		},
	},
}
</script>

<style scoped>
.toast-container {
	position: fixed;

	/*
	 * Below Nextcloud's header and the viewer's own bar, not 10px into the second one.
	 * Toasts appear at the top right, which is where the bar keeps Help and the Tools
	 * button — so a "Model loaded" notice arriving on page load landed on top of the
	 * primary action and swallowed clicks meant for it until the toast timed out.
	 */
	top: calc(var(--tdv-nc-header-height) + var(--tdv-topbar-height) + 8px);
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
	background: var(--tdv-color-surface);
	color: var(--tdv-color-text);
	padding: 10px 12px;
	border-radius: 6px;
	box-shadow: 0 4px 14px rgb(0 0 0 / 35%);
	font-size: 13px;
	line-height: 1.3;
	cursor: pointer;
	position: relative;
	overflow: hidden;
}
.toast.success { border-inline-start: 4px solid var(--tdv-color-success); }
.toast.error { border-inline-start: 4px solid var(--tdv-color-error); }
.toast.info { border-inline-start: 4px solid var(--tdv-color-primary); }
.toast.warning { border-inline-start: 4px solid var(--tdv-color-warning); }
.toast .title { display:block; font-weight:600; margin-bottom:2px; }
.toast .close { position:absolute; top:4px; inset-inline-end:6px; background:transparent; border:none; color:currentcolor; font-size:16px; cursor:pointer; padding:0; }
.toast .close:focus-visible { outline:2px solid var(--tdv-color-primary); outline-offset:2px; }

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
.toast.success .progress-bar::after { background: var(--tdv-color-success); }
.toast.error .progress-bar::after { background: var(--tdv-color-error); }
.toast.info .progress-bar::after { background: var(--tdv-color-primary); }
.toast.warning .progress-bar::after { background: var(--tdv-color-warning); }

/* Dark theme adjustments */
.theme--dark .toast .progress-bar {
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

[dir="rtl"] .toast.success { border-inline-end: 4px solid var(--tdv-color-success); }
[dir="rtl"] .toast.error { border-inline-end: 4px solid var(--tdv-color-error); }
[dir="rtl"] .toast.info { border-inline-end: 4px solid var(--tdv-color-primary); }
[dir="rtl"] .toast.warning { border-inline-end: 4px solid var(--tdv-color-warning); }

[dir="rtl"] .toast .close {
	inset-inline: 6px auto;
}
</style>
