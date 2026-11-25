const {
	MAX_TEXT_CHARS,
	canMention,
	mentionToken,
	toDisplay,
	toStored,
	findTrigger,
	insertMention,
} = require('../../../src/utils/mentionText.js')

const people = { sara: 'Sara Ahmed', 'omar k': 'Omar Khan', 'bob.o@example.com': 'Bob' }

describe('which ids can be mentioned, and how they are written', () => {
	test('a bare id is written bare and one with a space is quoted', () => {
		expect(mentionToken('sara')).toBe('@sara')
		expect(mentionToken('bob.o@example.com')).toBe('@bob.o@example.com')
		expect(mentionToken("o'brien")).toBe("@o'brien")
		expect(mentionToken('omar k')).toBe('@"omar k"')
		expect(mentionToken('user/x')).toBe('@"user/x"')
		expect(mentionToken('émile')).toBe('@"émile"')
	})

	test('an id the server could not read back is not offered', () => {
		expect(canMention('sara')).toBe(true)
		expect(canMention('omar k')).toBe(true)
		expect(canMention('quote"id')).toBe(false)
		expect(canMention('line\nbreak')).toBe(false)
		expect(canMention('')).toBe(false)
		expect(canMention('x'.repeat(65))).toBe(false)
		expect(canMention(null)).toBe(false)
	})
})

describe('what the field shows and what is stored', () => {
	test('the stored text shows people by name', () => {
		expect(toDisplay('Please ask @sara and @"omar k".', people)).toBe('Please ask @Sara Ahmed and @Omar Khan.')
	})

	test('what is shown is turned back into ids', () => {
		expect(toStored('Please ask @Sara Ahmed and @Omar Khan.', people)).toBe('Please ask @sara and @"omar k".')
	})

	test('showing and storing are inverses for a text that mentions people', () => {
		const stored = '@sara, @"omar k": see the hole near @bob.o@example.com'

		expect(toStored(toDisplay(stored, people), people)).toBe(stored)
	})

	test('the longer name is looked for first, so one person is not read as another', () => {
		const names = { sara: 'Sara', sa2: 'Sara Ahmed' }

		expect(toStored('@Sara Ahmed and @Sara', names)).toBe('@sa2 and @sara')
	})

	test('a name that only starts like a known one is plain text', () => {
		expect(toStored('@Sarasota and @Sara Ahmedx', people)).toBe('@Sarasota and @Sara Ahmedx')
	})

	test('an email address with a known name after the @ is not a mention', () => {
		expect(toStored('write to x@Sara Ahmed', people)).toBe('write to x@Sara Ahmed')
	})

	test('a name that looks like another person\'s id is not turned into a second mention', () => {
		const names = { alice: 'bob', bob: 'Bob B.' }

		expect(toStored('@bob', names)).toBe('@alice')
	})

	test('names with characters that mean something in a pattern are matched as written', () => {
		const names = { dev: 'Dev (QA) [on-call] + co.' }

		expect(toStored('ping @Dev (QA) [on-call] + co. now', names)).toBe('ping @dev now')
	})

	test('without anyone known the text is untouched', () => {
		expect(toStored('@Sara Ahmed', {})).toBe('@Sara Ahmed')
		expect(toStored('@Sara Ahmed', undefined)).toBe('@Sara Ahmed')
		expect(toDisplay('@sara', {})).toBe('@sara')
	})

	test('a name whose person cannot be mentioned is not turned into a mention', () => {
		expect(toStored('@Odd', { 'od"d': 'Odd' })).toBe('@Odd')
	})

	test('the text limit is the server\'s', () => {
		expect(MAX_TEXT_CHARS).toBe(2000)
	})
})

describe('the @ being typed', () => {
	test('an @ at the start, or after a space or a bracket, starts a search', () => {
		expect(findTrigger('@sa', 3)).toEqual({ start: 0, query: 'sa' })
		expect(findTrigger('Ask @sa', 7)).toEqual({ start: 4, query: 'sa' })
		expect(findTrigger('(@sa', 4)).toEqual({ start: 1, query: 'sa' })
		expect(findTrigger('line one\n@', 10)).toEqual({ start: 9, query: '' })
	})

	test('a bare @ searches for everyone', () => {
		expect(findTrigger('Ask @', 5)).toEqual({ start: 4, query: '' })
	})

	test('only what is before the caret counts', () => {
		expect(findTrigger('Ask @sara later', 7)).toEqual({ start: 4, query: 'sa' })
	})

	test('a space ends the search, and an email address never starts one', () => {
		expect(findTrigger('Ask @sara ', 10)).toBeNull()
		expect(findTrigger('mail sara@exa', 13)).toBeNull()
		expect(findTrigger('no at sign', 10)).toBeNull()
	})

	test('a name with a space in it is searched for by its first word', () => {
		expect(findTrigger('@Sara A', 7)).toBeNull()
		expect(findTrigger('@Sara', 5)).toEqual({ start: 0, query: 'Sara' })
	})

	test('picking a person writes their name and leaves the caret after it', () => {
		const trigger = findTrigger('Ask @sa please', 7)

		expect(insertMention('Ask @sa please', trigger, 7, { id: 'sara', label: 'Sara Ahmed' })).toEqual({
			text: 'Ask @Sara Ahmed please',
			caret: 16,
		})
	})

	test('picking a person at the end of the text adds one space after them', () => {
		const trigger = findTrigger('Ask @', 5)

		expect(insertMention('Ask @', trigger, 5, { id: 'sara', label: 'Sara' })).toEqual({ text: 'Ask @Sara ', caret: 10 })
	})
})
