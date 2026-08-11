/**
 * The MSAA setting has to reach the renderer that implements it.
 *
 * `enableAntialiasing` is offered in Personal Settings, defaulted in
 * `viewer-config.js`, restored from saved settings by `App.vue`, bound onto
 * `<ThreeViewer>` as `:enable-antialiasing`, and declared there as a prop —
 * five places, none of which is the one that matters. `WebGLRenderer` was
 * constructed with a hardcoded `antialias: true`, so the toggle persisted a
 * value nothing ever read: turning it off changed the stored settings, the
 * checkbox and nothing else.
 *
 * Vue reports none of this. A declared prop that no expression mentions is
 * simply never read, and a control wired to it looks correct at every point
 * along the chain.
 *
 * Checked by reading the source: `antialias` can only be set when the context
 * is created, so the assertion is about how `WebGLRenderer` is constructed, and
 * jsdom has no WebGL context to construct one against.
 */
const { readFileSync } = require('fs')
const { join } = require('path')
const { parse } = require('@vue/compiler-sfc')

const VIEWER = join(__dirname, '..', '..', 'src', 'components', 'ThreeViewer.vue')

/**
 * The component's script, with comments blanked so that a note *about* a prop
 * does not read as a use of it.
 *
 * @return {string} script content, comments replaced by equivalent whitespace
 */
function scriptWithoutComments() {
	const { descriptor } = parse(readFileSync(VIEWER, 'utf8'))
	const script = (descriptor.script?.content ?? '') + '\n' + (descriptor.scriptSetup?.content ?? '')
	return script.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
}

/**
 * The option object passed to `new THREE.WebGLRenderer({ … })`.
 *
 * @param {string} script - component script
 * @return {string} the text between the constructor's braces
 */
function rendererOptions(script) {
	const at = script.indexOf('new THREE.WebGLRenderer(')
	expect(at).toBeGreaterThan(-1)
	const open = script.indexOf('{', at)
	let depth = 0
	for (let i = open; i < script.length; i++) {
		if (script[i] === '{') depth++
		else if (script[i] === '}') {
			depth--
			if (depth === 0) return script.slice(open + 1, i)
		}
	}
	throw new Error('unterminated WebGLRenderer options')
}

describe('the antialiasing setting', () => {
	it('is read by the component that declares it', () => {
		const script = scriptWithoutComments()
		const declaration = /enableAntialiasing\s*:\s*\{/.exec(script)

		expect(declaration).not.toBeNull()

		const elsewhere = script.slice(0, declaration.index)
			+ script.slice(declaration.index + declaration[0].length)

		expect(elsewhere).toMatch(/\benableAntialiasing\b/)
	})

	it('decides how the renderer is constructed', () => {
		const options = rendererOptions(scriptWithoutComments())

		expect(options).toMatch(/antialias\s*:/)
		expect(options).not.toMatch(/antialias\s*:\s*(true|false)\s*[,}]/)
	})
})
