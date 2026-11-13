/**
 * Put a reference widget in the registry `@nextcloud/vue` renders from.
 *
 * `@nextcloud/vue`'s `registerWidget` does this and no more: it creates `window._vue_richtext_widgets`
 * if no copy of the library has yet, and files the widget under its rich object type. Every
 * copy of the library reads the same object, at render time, so it does not matter which
 * loaded first or which version drew the page.
 *
 * @param {string} id - the rich object type the widget draws
 * @param {(el: HTMLElement, properties: object) => void} callback - draws the widget into `el`
 * @param {(el: HTMLElement) => void} onDestroy - cleans up after it
 */
export function registerModelWidget(id, callback, onDestroy) {
	window._vue_richtext_widgets ??= {}
	if (window._vue_richtext_widgets[id]) {
		// The script was added twice; the first registration is as good as this one
		return
	}
	window._vue_richtext_widgets[id] = {
		id,
		callback,
		onDestroy,
		// The card is the whole preview; opening the model is the button's job
		hasInteractiveView: false,
		fullWidth: false,
		isResizable: false,
	}
}
