/**
 * Mount a single-file component from its real source, for a test.
 *
 * Jest has no `.vue` transform here, so a component is read out of its file: the template
 * as it ships, and the script with each `import` replaced by what the test hands in for
 * that module. `vue` itself is always the real one. What is checked is the template and
 * the options that ship, with only the modules around them stood in for.
 */
const { readFileSync } = require('fs')
const { join } = require('path')
const vue = require('vue')
const { parse } = require('@vue/compiler-sfc')
const { stripHtmlComments } = require('./stripHtmlComments.js')

const SRC = join(__dirname, '..', '..', '..', 'src')

/**
 * The component's options, with its imports bound to `modules`.
 *
 * @param {string} name - File name in src/components, without `.vue`; or a path under
 *   src with a folder, such as `views/AdminSettings`
 * @param {object} modules - Module specifier → its stand-in (named exports as keys, the
 *   default export under `default`)
 * @return {object} Component options, template included
 */
function loadSfc(name, modules = {}) {
	// Split into blocks by Vue's own SFC parser, as the build does
	const file = name.includes('/') ? join(SRC, `${name}.vue`) : join(SRC, 'components', `${name}.vue`)
	const { descriptor } = parse(readFileSync(file, 'utf8'))
	const template = stripHtmlComments(descriptor.template.content)
	let script = descriptor.script.content

	const bindings = []
	script = script.replace(/^import\s+([\s\S]+?)\s+from\s+'([^']+)'\s*$/gm, (_, clause, specifier) => {
		const module = specifier === 'vue' ? vue : modules[specifier]
		if (!module) {
			throw new Error(`${name}.vue imports ${specifier}; pass a stand-in for it`)
		}
		const named = /\{([^}]*)\}/.exec(clause)
		const defaultName = clause.replace(/\{[^}]*\}/, '').replace(',', '').trim()
		if (defaultName) {
			bindings.push([defaultName, module.default ?? module])
		}
		if (named) {
			for (const part of named[1].split(',').map(p => p.trim()).filter(Boolean)) {
				const [imported, local = imported] = part.split(/\s+as\s+/)
				bindings.push([local, module[imported]])
			}
		}
		return ''
	})
	script = script.replace(/export default\s+/, 'return ')

	const options = new Function(...bindings.map(([local]) => local), script)(...bindings.map(([, value]) => value))
	return { ...options, template }
}

/**
 * Mount a component with props held in a reactive object, so a test can change them.
 *
 * @param {string} name - As for loadSfc
 * @param {object} props - Initial props
 * @param {object} [modules] - Stand-ins for the component's imports
 * @return {{ host: HTMLElement, props: object, events: Array<[string, Array]>, unmount: Function }}
 */
function mountSfc(name, props = {}, modules = {}) {
	const component = loadSfc(name, modules)
	const host = document.createElement('div')
	document.body.appendChild(host)
	const state = vue.reactive({ ...props })
	const events = []
	const listeners = Object.fromEntries((component.emits || []).map((event) => [
		`on${event.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())}`,
		(...args) => events.push([event, args]),
	]))

	const app = vue.createApp({ render: () => vue.h(component, { ...state, ...listeners }) })
	app.config.globalProperties.t = (appName, text, vars = {}) => text.replace(/{(\w+)}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`))
	app.config.globalProperties.n = (appName, singular, plural, count) => (count === 1 ? singular : plural).replace('%n', String(count))
	app.mount(host)
	return { host, props: state, events, unmount: () => app.unmount() }
}

module.exports = { loadSfc, mountSfc }
