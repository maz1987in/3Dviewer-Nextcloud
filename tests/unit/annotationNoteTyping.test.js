/**
 * Typing a note survives a re-render of the panel it sits in.
 *
 * The note field is bound `:value="annotation.text"` — it has to be, because the composable
 * hands `annotations` out through `readonly()` and a `v-model` would write into a proxy that
 * ignores it. But `:value` alone leaves the DOM holding text the component does not know
 * about, and Vue's DOM patcher writes `el.value` back to the bound string on any re-render of
 * that subtree. Whatever had been typed and not yet committed is gone.
 *
 * With the commit on `change`, that window is the entire time the field has focus, and the
 * annotation panel does re-render while a note is being typed. On the running instance,
 * typing "Left bracket" one key at a time left the field reading "Annotation 1t": the stored
 * value, plus whichever character arrived after the last patch.
 *
 * The earlier check missed this because it used Playwright's `fill()`, which sets the value
 * and dispatches input and change together — no window at all. A stand-in more permissive
 * than the thing it replaces reports a success it has not earned. This test types.
 *
 * It mounts the field's real markup, read out of the component rather than copied into the
 * test, so the binding it checks cannot drift from the binding that ships.
 */

const { readFileSync } = require('fs')
const { join } = require('path')
const { createApp, reactive, ref, nextTick } = require('vue')

const SOURCE = readFileSync(
	join(__dirname, '..', '..', 'src', 'components', 'ThreeViewer.vue'),
	'utf8',
)

/** The note field exactly as the component declares it. */
const noteField = SOURCE.match(/<input\b[^>]*class="annotation-text-input"[^>]*>/s)?.[0]

/**
 * Mount the field over one annotation, in a component that re-renders on demand.
 *
 * @return {object} the input element, the annotation behind it, and a way to re-render
 */
function mountNoteField() {
	const host = document.createElement('div')
	document.body.appendChild(host)

	const annotation = reactive({ id: 'a1', text: 'Annotation 1' })
	const tick = ref(0)

	createApp({
		// `tick` stands for everything else in the panel that changes while a note is being
		// typed — the field has to survive the panel re-rendering around it.
		template: `<div><span>{{ tick }}</span>${noteField}</div>`,
		setup() {
			return {
				tick,
				annotation,
				t: (_app, text) => text,
				updateAnnotationText: (id, text) => {
					if (annotation.id === id) annotation.text = text
				},
			}
		},
	}).mount(host)

	return {
		input: host.querySelector('input'),
		annotation,
		rerender: async () => {
			tick.value++
			await nextTick()
		},
	}
}

/**
 * One keystroke: the browser puts the character in the DOM, then tells the page.
 *
 * @param {HTMLInputElement} input - the field being typed into
 * @param {string} char - the character typed
 */
function typeChar(input, char) {
	input.value += char
	input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

describe('the annotation note field', () => {
	it('is in the component, so this test is about shipped markup', () => {
		expect(noteField).toBeDefined()
	})

	it('keeps text typed since the last commit when the panel re-renders', async () => {
		const { input, rerender } = mountNoteField()
		input.value = ''

		for (const char of 'Left') {
			typeChar(input, char)
			// The panel re-renders between keystrokes: an annotation is saved, a sibling
			// value changes. The field must not be reverted underneath the caret.
			await rerender()
		}

		expect(input.value).toBe('Left')
	})

	it('gives the typed text to the composable, not just to the DOM', async () => {
		const { input, annotation, rerender } = mountNoteField()
		input.value = ''

		for (const char of 'Left bracket') typeChar(input, char)
		await rerender()

		expect(annotation.text).toBe('Left bracket')
	})
})
