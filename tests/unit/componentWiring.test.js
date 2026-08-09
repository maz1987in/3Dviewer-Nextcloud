/**
 * Every binding lands on the component that declares it, and every event a component
 * sends is heard where it is used.
 *
 * `App.vue`'s template is one element deep and hundreds of lines long: `<SlideOutToolPanel>`
 * carries fifty-odd bindings and `<ThreeViewer>` forty more, so a binding written a few lines
 * off sits inside the wrong element's attribute list and reads perfectly well in a diff. That
 * has now happened three times on this branch:
 *
 *   - `:tools-panel-open` went onto the tools panel instead of the viewer;
 *   - `:measurement-mode`, `:annotation-mode` and `:comparison-mode` went onto the viewer,
 *     which ignored them, instead of the tools panel, whose rows are drawn from them — so no
 *     tool row ever showed its Active state;
 *   - the viewer's panels emitted `toggle-measurement` and `toggle-annotation` at a parent
 *     listening for them on a different child, so both panels' close buttons did nothing.
 *
 * Vue reports none of this. An unknown binding falls through to the rendered element as an
 * attribute, and an emit nobody listens for is simply dropped. Both are silent, and both look
 * right at the call site.
 *
 * Only components reachable from `App.vue` are checked — the tree the app actually renders.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join, basename } = require('path')
const { parse } = require('@vue/compiler-sfc')

const SRC = join(__dirname, '..', '..', 'src')

/**
 * Every file under a directory matching an extension.
 *
 * @param {string} dir - directory to walk
 * @param {RegExp} pattern - which files to keep
 * @return {string[]} absolute file paths
 */
function filesUnder(dir, pattern) {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) return filesUnder(full, pattern)
		return pattern.test(full) ? [full] : []
	})
}

/**
 * The top-level keys of a component's `props: { ... }` block.
 *
 * @param {string} source - the component's source
 * @return {string[]} declared prop names
 */
function declaredProps(source) {
	const start = source.search(/\n\tprops:\s*\{/)
	if (start === -1) return []
	const names = []
	let depth = 0
	for (let i = source.indexOf('{', start); i < source.length; i++) {
		if (source[i] === '{') { depth++; continue }
		if (source[i] === '}') { depth--; if (depth === 0) break; continue }
		if (depth !== 1) continue
		const key = /^\n\t\t([A-Za-z_$][\w$]*)\s*:/.exec(source.slice(i))
		if (key) { names.push(key[1]); i += key[0].length - 1 }
	}
	return names
}

/**
 * The events a component actually sends, as opposed to the ones it declares.
 *
 * @param {string} source - the component's source
 * @return {string[]} event names passed to an emit call
 */
function emittedEvents(source) {
	return [...new Set(
		[...source.matchAll(/(?:\$emit|\bemit)\(\s*'([^']+)'/g)].map((m) => m[1]),
	)]
}

const components = new Map(
	filesUnder(join(SRC, 'components'), /\.vue$/)
		.concat([join(SRC, 'App.vue')])
		.map((file) => {
			const source = readFileSync(file, 'utf8')
			return [basename(file, '.vue'), {
				name: basename(file, '.vue'),
				source,
				props: declaredProps(source),
				emitted: emittedEvents(source),
				ast: parse(source).descriptor.template?.ast,
			}]
		}),
)

/** `fooBar` as a template would spell it. */
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/**
 * Every element in a template, flattened.
 *
 * @param {object} node - a template AST node
 * @return {object[]} the node and its descendants
 */
function elements(node) {
	if (!node) return []
	return [node, ...(node.children || []).flatMap(elements)]
}

/**
 * Each place a known component is used, with the bindings written on it.
 *
 * @param {object} parent - the component whose template is being read
 * @return {object[]} one entry per usage
 */
function usagesIn(parent) {
	return elements(parent.ast)
		.filter((node) => node.type === 1 && components.has(node.tag))
		.map((node) => ({
			parent: parent.name,
			child: components.get(node.tag),
			// `:foo="x"` and `foo="x"` alike; `@foo` and directives are separated out.
			bound: node.props
				.filter((p) => p.type === 6 || (p.type === 7 && p.name === 'bind' && p.arg?.content))
				.map((p) => (p.type === 6 ? p.name : p.arg.content)),
			listened: node.props
				.filter((p) => p.type === 7 && p.name === 'on' && p.arg?.content)
				.map((p) => kebab(p.arg.content)),
		}))
}

/** The components App.vue actually renders, directly or through another. */
const reachable = (() => {
	const seen = new Set(['App'])
	const queue = ['App']
	while (queue.length) {
		for (const usage of usagesIn(components.get(queue.pop()))) {
			if (!seen.has(usage.child.name)) { seen.add(usage.child.name); queue.push(usage.child.name) }
		}
	}
	return seen
})()

const usages = [...reachable].flatMap((name) => usagesIn(components.get(name)))

/**
 * Attributes that belong to the rendered element rather than to the component, and are
 * meant to fall through.
 */
const NATIVE = /^(class|style|id|ref|key|slot|title|role|tabindex|disabled|hidden|type|name|value|placeholder|for|href|src|alt|width|height|aria-|data-)/

describe('component wiring', () => {
	it('reaches the tree the app renders, so this guard is not checking an empty set', () => {
		expect(usages.length).toBeGreaterThan(10)
		expect(reachable).toContain('ThreeViewer')
		expect(reachable).toContain('SlideOutToolPanel')
	})

	it.each(usages.map((u) => [`${u.parent} > ${u.child.name}`, u]))(
		'%s binds only props that component declares',
		(_label, usage) => {
			const undeclared = usage.bound
				.filter((name) => !NATIVE.test(name))
				.filter((name) => !usage.child.props.some((prop) => kebab(prop) === kebab(name)))
			expect(undeclared).toEqual([])
		},
	)

	it.each(usages.map((u) => [`${u.parent} > ${u.child.name}`, u]))(
		'%s listens for every event that component sends',
		(_label, usage) => {
			const unheard = usage.child.emitted
				.map(kebab)
				.filter((event) => !usage.listened.includes(event))
			expect(unheard).toEqual([])
		},
	)
})
