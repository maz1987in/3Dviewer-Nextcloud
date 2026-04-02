/**
 * Vue 2-compatible wrapper for the ViewerComponent.
 *
 * The Nextcloud Viewer app renders handler components with its own
 * bundled Vue 2 runtime. Our ViewerComponent is compiled by the Vue 3
 * SFC compiler, so the Viewer can't render it directly.
 *
 * This wrapper is a plain JS options object (not a .vue file) so it
 * won't be processed by the Vue 3 SFC compiler. The Viewer's Vue 2
 * runtime can create it normally. On mount, it dynamically imports
 * Vue 3 and the real ViewerComponent, then creates an isolated Vue 3
 * app inside its own DOM element.
 *
 * Props are bridged via a Vue 3 reactive() object that the Vue 3
 * render function tracks. A Vue 2 watcher syncs prop changes into it.
 */
export default {
	// Vue 2 render function — receives h (createElement) from Vue 2 runtime
	render(h) {
		return h('div', {
			ref: 'container',
			style: {
				width: '100%',
				height: '100vh',
			},
		})
	},

	// Accept all props the Viewer passes
	props: {
		davPath: { type: String, default: '' },
		filename: { type: String, default: '' },
		basename: { type: String, default: '' },
		mime: { type: String, default: '' },
		fileid: { type: [String, Number], default: '' },
		active: { type: Boolean, default: false },
		files: { type: Array, default: () => [] },
	},

	emits: ['update:loaded', 'error', 'push-toast', 'model-loaded'],

	data() {
		return {
			_vue3App: null,
			_bridge: null,
		}
	},

	watch: {
		// Sync all prop changes into the Vue 3 reactive bridge
		davPath(v) { if (this._bridge) this._bridge.davPath = v },
		filename(v) { if (this._bridge) this._bridge.filename = v },
		basename(v) { if (this._bridge) this._bridge.basename = v },
		mime(v) { if (this._bridge) this._bridge.mime = v },
		fileid(v) { if (this._bridge) this._bridge.fileid = v },
		active(v) { if (this._bridge) this._bridge.active = v },
		files(v) { if (this._bridge) this._bridge.files = v },
	},

	mounted() {
		this.mountVue3App()
	},

	// Vue 2 lifecycle hook name
	beforeDestroy() {
		if (this._vue3App) {
			this._vue3App.unmount()
			this._vue3App = null
		}
	},

	methods: {
		async mountVue3App() {
			try {
				const [{ createApp, reactive, h }, { default: ViewerComponent }] = await Promise.all([
					import('vue'),
					import('./ViewerComponent.vue'),
				])

				// Use global translation functions set by main.js
				const translate = window.t || ((appId, text) => text)
				const translatePlural = window.n || ((appId, singular) => singular)

				// Create a Vue 3 reactive bridge — the Vue 3 render function
				// tracks this object, so changes trigger re-renders automatically
				const bridge = reactive({
					davPath: this.davPath,
					filename: this.filename,
					basename: this.basename,
					mime: this.mime,
					fileid: this.fileid,
					active: this.active,
					files: this.files,
				})
				this._bridge = bridge

				const self = this
				const app = createApp({
					render() {
						return h(ViewerComponent, {
							davPath: bridge.davPath,
							filename: bridge.filename,
							basename: bridge.basename,
							mime: bridge.mime,
							fileid: bridge.fileid,
							active: bridge.active,
							files: bridge.files,
							'onUpdate:loaded': (val) => self.$emit('update:loaded', val),
							onError: (err) => self.$emit('error', err),
							'onPush-toast': (msg) => self.$emit('push-toast', msg),
							'onModel-loaded': (meta) => self.$emit('model-loaded', meta),
						})
					},
				})

				// Add translation functions
				app.config.globalProperties.t = translate
				app.config.globalProperties.n = translatePlural

				const container = this.$refs.container || this.$el
				app.mount(container)
				this._vue3App = app
			} catch (error) {
				console.error('[ThreeDViewer] Failed to mount Vue 3 viewer:', error)
				if (this.$el) {
					const errorDiv = document.createElement('div')
					errorDiv.style.cssText = 'padding: 20px; text-align: center; color: red;'
					errorDiv.textContent = 'Failed to load 3D viewer: ' + error.message
					this.$el.appendChild(errorDiv)
				}
			}
		},
	},
}
