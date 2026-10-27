/**
 * A template's source without its HTML comments, for tests that read markup out of a
 * component to assert on it.
 *
 * Removing comments once can leave a new one behind (`<!<!-- x -->--` becomes `<!--`), so
 * the removal is repeated until the text stops changing. It is for reading this
 * repository's own components in tests, not for making untrusted markup safe.
 *
 * @param {string} text - markup
 * @return {string} the markup with every comment removed
 */
function stripHtmlComments(text) {
	let current = text
	let previous
	do {
		previous = current
		let out = ''
		let from = 0
		for (;;) {
			const start = current.indexOf('<!--', from)
			if (start === -1) {
				out += current.slice(from)
				break
			}
			out += current.slice(from, start)
			const end = current.indexOf('-->', start + 4)
			if (end === -1) {
				// An unclosed comment runs to the end of the text
				break
			}
			from = end + 3
		}
		current = out
	} while (current !== previous)
	return current
}

module.exports = { stripHtmlComments }
