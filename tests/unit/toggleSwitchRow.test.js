/**
 * The tools panel's switches are switches.
 *
 * Grid, Axes, Wireframe and the animation Loop were `<label @click.prevent>` around a bare
 * track. A label with no control inside takes no keyboard focus, so a keyboard user could
 * not reach them, and a screen reader announced neither a switch nor whether it was on. The
 * G-code "Only this layer" row had been written as a real button; the other four were not.
 *
 * All five are now the one ToggleSwitchRow, so what these tests pin is the row itself — the
 * role, the state, the name, the event — and that the panel uses it for every switch rather
 * than writing a sixth by hand. The component is mounted from its real template and script,
 * read out of the file, so what is checked is what ships.
 */

const { readFileSync, readdirSync, statSync } = require('fs')
const { join } = require('path')
const { createApp, reactive, nextTick } = require('vue')
const { stripHtmlComments } = require('./helpers/stripHtmlComments.js')

const COMPONENTS = join(__dirname, '..', '..', 'src', 'components')
const SOURCE = readFileSync(join(COMPONENTS, 'ToggleSwitchRow.vue'), 'utf8')
const PANEL = readFileSync(join(COMPONENTS, 'SlideOutToolPanel.vue'), 'utf8')

const TEMPLATE = stripHtmlComments(/<template>([\s\S]*?)<\/template>\s*<script>/.exec(SOURCE)[1])
// The script is a plain `export default {…}` with no imports, so it can be read as a value
const OPTIONS = new Function(`return ${/export default (\{[\s\S]*?\n\})\n<\/script>/.exec(SOURCE)[1]}`)()

/**
 * Mount one row, with its props held in a reactive object so a test can change them.
 *
 * @param {object} props - the row's props
 * @return {object} the button, the props, and the toggle events received
 */
function mountRow(props) {
	const host = document.createElement('div')
	document.body.appendChild(host)
	const state = reactive({ ...props })
	const toggles = []

	createApp({
		components: { ToggleSwitchRow: { ...OPTIONS, template: TEMPLATE } },
		setup: () => ({ state, onToggle: () => toggles.push('toggle') }),
		template: '<ToggleSwitchRow :checked="state.checked" :label="state.label" :compact="state.compact" @toggle="onToggle" />',
	}).mount(host)

	return { button: host.querySelector('button'), state, toggles }
}

afterEach(() => {
	document.body.replaceChildren()
})

describe('the row', () => {
	it('is a button, so it takes Tab and answers Enter and Space', () => {
		const { button } = mountRow({ checked: false, label: 'Grid' })
		expect(button.tagName).toBe('BUTTON')
		// Not `submit`: a button in a form would submit it
		expect(button.getAttribute('type')).toBe('button')
	})

	it('says it is a switch', () => {
		const { button } = mountRow({ checked: false, label: 'Grid' })
		expect(button.getAttribute('role')).toBe('switch')
	})

	it('says whether it is on, from the prop', async () => {
		const { button, state } = mountRow({ checked: false, label: 'Grid' })
		expect(button.getAttribute('aria-checked')).toBe('false')

		state.checked = true
		await nextTick()
		expect(button.getAttribute('aria-checked')).toBe('true')

		state.checked = false
		await nextTick()
		expect(button.getAttribute('aria-checked')).toBe('false')
	})

	it('is named by its visible text', () => {
		const { button } = mountRow({ checked: true, label: 'Wireframe' })
		const track = button.querySelector('.toggle-switch')
		// Everything that is not the track is the name, so the two cannot disagree
		expect(button.textContent.trim()).toBe('Wireframe')
		expect(track.textContent).toBe('')
		expect(button.hasAttribute('aria-label')).toBe(false)
	})

	it('hides the track from a screen reader, and shows the state on it for everyone else', async () => {
		const { button, state } = mountRow({ checked: false, label: 'Grid' })
		const track = button.querySelector('.toggle-switch')
		expect(track.getAttribute('aria-hidden')).toBe('true')
		expect(track.classList.contains('on')).toBe(false)

		state.checked = true
		await nextTick()
		expect(track.classList.contains('on')).toBe(true)
	})

	it('emits toggle on a click, once', () => {
		const { button, toggles } = mountRow({ checked: false, label: 'Grid' })
		button.click()
		expect(toggles).toEqual(['toggle'])
	})

	it('keeps the classes the forced-colours sheet and the layout name', () => {
		const { button } = mountRow({ checked: false, label: 'Loop', compact: true })
		expect(button.classList.contains('toggle-row')).toBe(true)
		expect(button.classList.contains('toggle-row--button')).toBe(true)
		expect(button.classList.contains('toggle-row--compact')).toBe(true)
	})

	it('is as wide as its content when it sits beside a button in a flex row', () => {
		// At the full width of a panel row it takes the whole flex row and squeezes Play
		const rule = /\.toggle-row\.toggle-row\.toggle-row--compact\s*\{([^}]*)\}/.exec(SOURCE)[1]
		expect(rule).toMatch(/width:\s*auto/)
		expect(rule).toMatch(/flex-shrink:\s*0/)
	})

	it('shows a focus ring, and does not leave it to the browser', () => {
		expect(SOURCE).toMatch(/\.toggle-row\.toggle-row:focus-visible\s*\{[^}]*outline:/)
	})
})

describe('the panel', () => {
	const SWITCHES = [
		['grid', 'Grid', 'toggle-grid'],
		['axes', 'Axes', 'toggle-axes'],
		['wireframe', 'Wireframe', 'toggle-wireframe'],
		['gcodeSingleLayer', 'Only this layer', 'toggle-gcode-single-layer'],
		['isAnimationLooping', 'Loop', 'toggle-animation-loop'],
	]

	it.each(SWITCHES)('shows %s as a switch labelled "%s" that emits %s', (prop, label, event) => {
		const row = new RegExp(
			// A switch a scan turns off emits nothing for one (pointclouds/unavailable.js)
			`<ToggleSwitchRow[^>]*:checked="${prop}"[^>]*:label="t\\('threedviewer', '${label}'\\)"[^>]*@toggle="(?:pointCloud \\|\\| )?emit\\('${event}'\\)"`,
		)
		expect(PANEL).toMatch(row)
	})

	it('registers the component it uses', () => {
		expect(PANEL).toMatch(/components: \{[^}]*ToggleSwitchRow/)
	})

	it('does not build a switch by hand', () => {
		expect(PANEL).not.toMatch(/class="toggle-switch"/)
		expect(PANEL).not.toMatch(/role="switch"/)
	})
})

describe('the pattern that failed', () => {
	/**
	 * Every component's source.
	 *
	 * @param {string} dir - directory to walk
	 * @return {string[]} absolute paths
	 */
	const vueFiles = (dir) => readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) return vueFiles(full)
		return full.endsWith('.vue') ? [full] : []
	})

	it('is not written again: no label carries a click handler', () => {
		// A label with no control inside takes no keyboard focus; whatever it does with a
		// pointer, a keyboard user cannot do
		const offenders = vueFiles(join(COMPONENTS, '..'))
			.filter((file) => /<label\b[^>]*@click/.test(stripHtmlComments(readFileSync(file, 'utf8'))))
		expect(offenders).toEqual([])
	})
})
