const { stripHtmlComments } = require('./helpers/stripHtmlComments.js')

describe('stripHtmlComments', () => {
	it('removes a comment and leaves the markup around it', () => {
		expect(stripHtmlComments('<a><!-- note --><b></b></a>')).toBe('<a><b></b></a>')
	})

	it('removes every comment, across lines', () => {
		expect(stripHtmlComments('<!-- one\n two --><i></i><!-- three -->')).toBe('<i></i>')
	})

	it('leaves no comment behind when removing one joins the pieces of another', () => {
		expect(stripHtmlComments('<!<!-- x -->-- y -->z')).toBe('z')
		expect(stripHtmlComments('<!<!-- x -->--')).not.toContain('<!--')
	})

	it('drops an unclosed comment to the end, as a parser does', () => {
		expect(stripHtmlComments('<p></p><!-- never closed')).toBe('<p></p>')
	})

	it('returns text without comments unchanged', () => {
		expect(stripHtmlComments('<p class="a">x</p>')).toBe('<p class="a">x</p>')
	})
})
