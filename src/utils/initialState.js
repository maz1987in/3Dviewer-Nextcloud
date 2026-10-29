/**
 * Read a value the server put in the page with `IInitialState`.
 *
 * Reads the element directly rather than pulling in `@nextcloud/initial-state`, as
 * `usePublicShare` does: `<input id="initial-state-{app}-{key}" value="{base64 json}">`.
 *
 * @param {string} key - The key the server provided it under
 * @return {?(object|Array|string|number|boolean)} The value, or null when there is none
 *   or it is malformed
 */
export function readInitialState(key) {
	const el = typeof document !== 'undefined'
		? document.getElementById(`initial-state-threedviewer-${key}`)
		: null
	if (!el?.value) {
		return null
	}
	try {
		return JSON.parse(atob(el.value)) ?? null
	} catch (e) {
		return null
	}
}
