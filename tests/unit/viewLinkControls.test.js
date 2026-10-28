/**
 * The bookmark's "Copy link" sits beside its Remove, and must not look like it: Remove's
 * class turns a button red on hover.
 */
const { readFileSync } = require('fs')
const { join } = require('path')

const PANEL = readFileSync(join(__dirname, '..', '..', 'src', 'components', 'SlideOutToolPanel.vue'), 'utf8')

it("draws a bookmark's Copy link as a link, not as Remove", () => {
	const button = /<button[^>]*@click="emit\('copy-bookmark-link', i\)"[^>]*>/.exec(PANEL.replace(/\n\s*/g, ' '))[0]
	expect(button).toContain('bookmark-link')
	expect(button).not.toContain('bookmark-delete')
})
