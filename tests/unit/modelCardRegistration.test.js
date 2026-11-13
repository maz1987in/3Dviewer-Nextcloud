/**
 * The card is found by Nextcloud's own widget renderer.
 *
 * The entry registers the widget without `@nextcloud/vue`'s `registerWidget`, because
 * importing that drags the reference picker (about 570 KB) into a script that is 3 KB. What
 * makes that safe is that both write to, and `renderWidget` reads from, one registry on
 * `window`. This renders through the real `renderWidget` and `isWidgetRegistered`, so it
 * fails the day the library keeps its widgets somewhere else.
 */
// The library's widget registry, from the file that holds it: the package's index also loads the
// reference picker's components and stylesheets, which Jest cannot parse and this has no use for.
// The file exports its functions under shortened names, so they are found by their own.
const registry = require('../../node_modules/@nextcloud/vue/dist/chunks/widgets.mjs')
const inRegistry = (name) => Object.values(registry).find((fn) => typeof fn === 'function' && fn.name === name)
const renderWidget = inRegistry('renderWidget')
const destroyWidget = inRegistry('destroyWidget')
const isWidgetRegistered = inRegistry('isWidgetRegistered')
const hasInteractiveView = inRegistry('hasInteractiveView')
const { WIDGET_ID, renderModelCard, destroyModelCard } = require('../../src/reference/modelCard.js')
const { registerModelWidget } = require('../../src/reference/registerWidget.js')

const RICH_OBJECT = {
	id: 31,
	name: 'Engine block.stl',
	description: 'STL · 2 KB',
	thumbnail: null,
	link: 'https://cloud.example.com/apps/threedviewer/f/31',
	hasView: false,
}

afterEach(() => {
	delete window._vue_richtext_widgets[WIDGET_ID]
})

describe('registering the card', () => {
	it('finds the library\'s renderer, so the checks below cannot pass vacuously', () => {
		expect([renderWidget, destroyWidget, isWidgetRegistered, hasInteractiveView].every((fn) => typeof fn === 'function')).toBe(true)
	})

	it('makes Nextcloud render the card for the model type', () => {
		expect(isWidgetRegistered(WIDGET_ID)).toBe(false)

		registerModelWidget(WIDGET_ID, renderModelCard, destroyModelCard)
		const el = document.createElement('div')
		renderWidget(el, { richObjectType: WIDGET_ID, richObject: RICH_OBJECT, accessible: true, interactive: false })

		expect(isWidgetRegistered(WIDGET_ID)).toBe(true)
		expect(el.querySelector('.threedviewer-reference-name').textContent).toBe('Engine block.stl')
	})

	it('has no interactive view, so hosts show the card itself', () => {
		registerModelWidget(WIDGET_ID, renderModelCard, destroyModelCard)

		expect(hasInteractiveView(WIDGET_ID)).toBe(false)
	})

	it('is cleaned up through Nextcloud when the host is done with it', () => {
		registerModelWidget(WIDGET_ID, renderModelCard, destroyModelCard)
		const el = document.createElement('div')
		renderWidget(el, { richObjectType: WIDGET_ID, richObject: RICH_OBJECT, accessible: true, interactive: false })

		destroyWidget(WIDGET_ID, el)

		expect(el.childElementCount).toBe(0)
	})

	it('keeps the first registration when the script is loaded twice', () => {
		const first = jest.fn()
		registerModelWidget(WIDGET_ID, first, () => {})
		registerModelWidget(WIDGET_ID, renderModelCard, destroyModelCard)

		renderWidget(document.createElement('div'), { richObjectType: WIDGET_ID, richObject: RICH_OBJECT, accessible: true, interactive: false })

		expect(first).toHaveBeenCalledTimes(1)
	})

	it('does not disturb the widgets other apps registered', () => {
		const other = { id: 'other_widget', callback: jest.fn(), onDestroy: jest.fn() }
		window._vue_richtext_widgets.other_widget = other

		registerModelWidget(WIDGET_ID, renderModelCard, destroyModelCard)

		expect(window._vue_richtext_widgets.other_widget).toBe(other)
		delete window._vue_richtext_widgets.other_widget
	})
})
