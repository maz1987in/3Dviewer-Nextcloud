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
		}
	},

	watch: {
		active(val) {
			// Forward active prop changes to the Vue 3 app via re-render
			if (this._vue3App && this._vue3Render) {
				this._vue3Render()
			}
		},
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
				const [{ createApp, h }, { default: ViewerComponent }, { translate, translatePlural }] = await Promise.all([
					import('vue'),
					import('./ViewerComponent.vue'),
					import('@nextcloud/l10n'),
				])

				const self = this
				const app = createApp({
					render() {
						return h(ViewerComponent, {
							davPath: self.davPath,
							filename: self.filename,
							basename: self.basename,
							mime: self.mime,
							fileid: self.fileid,
							active: self.active,
							files: self.files,
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
				// Store render trigger for prop updates
				this._vue3Render = () => {
					// Force re-render by unmounting and remounting
					app.unmount()
					const newApp = createApp({
						render() {
							return h(ViewerComponent, {
								davPath: self.davPath,
								filename: self.filename,
								basename: self.basename,
								mime: self.mime,
								fileid: self.fileid,
								active: self.active,
								files: self.files,
								'onUpdate:loaded': (val) => self.$emit('update:loaded', val),
								onError: (err) => self.$emit('error', err),
								'onPush-toast': (msg) => self.$emit('push-toast', msg),
								'onModel-loaded': (meta) => self.$emit('model-loaded', meta),
							})
						},
					})
					newApp.config.globalProperties.t = translate
					newApp.config.globalProperties.n = translatePlural
					newApp.mount(container)
					self._vue3App = newApp
				}
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
