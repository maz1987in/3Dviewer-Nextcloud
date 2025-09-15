import Vue from 'vue'
import App from './App.vue'

// Provide fallback translation helpers if not injected by Nextcloud runtime (e.g. Playwright harness)
// eslint-disable-next-line no-unused-vars
const safeT = typeof window !== 'undefined' && window.t ? window.t : (s, ...args) => {
	if (args && args.length) {
		return String(s).replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m))
	}
	return s
}
// eslint-disable-next-line no-unused-vars
const safeN = typeof window !== 'undefined' && window.n ? window.n : (s, p, n) => (n === 1 ? s : p)

Vue.mixin({ methods: { t: safeT, n: safeN } })

const View = Vue.extend(App)

/**
 * Programmatic bootstrap to allow test harness to control mount timing.
 * Exposed both as ESM named export and on window.ThreedViewer for resilience
 * against aggressive tree-shaking / minification.
 * @param {string} selector CSS selector of mount point
 * @param {object} [options] Extra options (future use)
 * @returns {Promise<Vue>|Vue} mounted root instance (Promise when waiting for element)
 */
export function bootstrapViewer (selector = '#threedviewer', options = {}) { // eslint-disable-line no-unused-vars
	const mountEl = typeof selector === 'string' ? document.querySelector(selector) : selector
	const performMount = (el) => {
		if (!el) throw new Error(`Mount element '${selector}' not found`)
		// Use element form to avoid Vue creating a new div and losing id
		const vm = new View()
		vm.$mount(el)
		// Ensure id persists (edge cases)
		const desiredId = typeof selector === 'string' && selector.startsWith('#') ? selector.slice(1) : (el.id || 'threedviewer')
		if (vm.$el && vm.$el.id !== desiredId) {
			vm.$el.id = desiredId
		}
		return vm
	}
	if (!mountEl) {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				try {
					const retry = typeof selector === 'string' ? document.querySelector(selector) : selector
					resolve(performMount(retry))
				} catch (e) { reject(e) }
			}, 0)
		})
	}
	return performMount(mountEl)
}

// Attach to window for test harness / non-ESM contexts
if (typeof window !== 'undefined') {
	window.ThreedViewer = Object.assign(window.ThreedViewer || {}, { bootstrapViewer })
}

// Auto-mount for production / normal usage unless explicitly disabled
if (typeof window !== 'undefined' && !window.__THREEDVIEWER_NO_AUTOMOUNT) {
	try {
		bootstrapViewer()
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[threedviewer] auto-mount failed', e)
	}
}
