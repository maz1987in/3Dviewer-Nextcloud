const THREE = require('three')
const {
	NOTE_FILTERS,
	DIMMED_OPACITY,
	isResolved,
	countByState,
	matchesFilter,
	markerLook,
	applyMarkerLook,
	segments,
	expandMentions,
} = require('../../../src/utils/noteReview.js')
const { mentionUserData, formatNoteTime } = require('../../../src/utils/noteThreadFormat.js')

const open = { id: 'a', meta: { noteId: 1, state: 'open' } }
const resolved = { id: 'b', meta: { noteId: 2, state: 'resolved' } }
const unsaved = { id: 'c', meta: { noteId: null, saveState: 'new' } }
const legacy = { id: 'd' }

describe('state and the list filter', () => {
	test('only a note the server says is resolved is resolved', () => {
		expect(isResolved(resolved)).toBe(true)
		expect(isResolved(open)).toBe(false)
		expect(isResolved(unsaved)).toBe(false)
		expect(isResolved(legacy)).toBe(false)
		expect(isResolved(null)).toBe(false)
	})

	test('the filters are All, Open and Resolved, in that order', () => {
		expect(NOTE_FILTERS).toEqual(['all', 'open', 'resolved'])
	})

	test('counts add up: every note is open or resolved', () => {
		expect(countByState([open, resolved, unsaved, legacy, resolved])).toEqual({ all: 5, open: 3, resolved: 2 })
		expect(countByState([])).toEqual({ all: 0, open: 0, resolved: 0 })
	})

	test('each filter shows the notes it names', () => {
		const items = [open, resolved, unsaved]

		expect(items.filter((i) => matchesFilter(i, 'all'))).toEqual(items)
		expect(items.filter((i) => matchesFilter(i, 'open'))).toEqual([open, unsaved])
		expect(items.filter((i) => matchesFilter(i, 'resolved'))).toEqual([resolved])
	})

	test('a filter nobody has heard of shows everything rather than nothing', () => {
		expect(matchesFilter(resolved, 'archived')).toBe(true)
	})
})

describe('markers of resolved notes', () => {
	test('an open note is drawn as it always was', () => {
		expect(markerLook(open, false)).toBe('normal')
		expect(markerLook(open, true)).toBe('normal')
	})

	test('a resolved note is hidden until resolved notes are asked for, then dimmed', () => {
		expect(markerLook(resolved, false)).toBe('hidden')
		expect(markerLook(resolved, true)).toBe('dim')
	})

	function marker(opacity = 0.9, transparent = true) {
		return new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({ opacity, transparent }))
	}

	test('hiding and dimming change the marker, and normal puts back exactly what it had', () => {
		const point = marker(0.9, true)
		const line = marker(1, false)

		applyMarkerLook([point, line], 'hidden')
		expect([point.visible, line.visible]).toEqual([false, false])

		applyMarkerLook([point, line], 'dim')
		expect([point.visible, line.visible]).toEqual([true, true])
		expect(point.material.opacity).toBeCloseTo(0.9 * DIMMED_OPACITY)
		expect(line.material.opacity).toBeCloseTo(DIMMED_OPACITY)
		expect(line.material.transparent).toBe(true)

		applyMarkerLook([point, line], 'dim')
		expect(point.material.opacity).toBeCloseTo(0.9 * DIMMED_OPACITY)

		applyMarkerLook([point, line], 'normal')
		expect(point.material.opacity).toBeCloseTo(0.9)
		expect(line.material.opacity).toBe(1)
		expect(line.material.transparent).toBe(false)
	})

	test('a marker that is missing, or has no material, is skipped', () => {
		const bare = new THREE.Group()

		expect(() => applyMarkerLook([null, undefined, bare], 'hidden')).not.toThrow()
		expect(bare.visible).toBe(false)
	})
})

describe('mentions in a text', () => {
	const names = { sara: 'Sara Ahmed', 'omar k': 'Omar Khan' }

	test('a mention reads as the display name, not the id', () => {
		expect(expandMentions('Please check @sara before Friday', names)).toBe('Please check @Sara Ahmed before Friday')
	})

	test('a quoted id with a space is a mention too', () => {
		expect(expandMentions('Over to @"omar k" now', names)).toBe('Over to @Omar Khan now')
	})

	test('punctuation after a mention is kept and is not part of the id', () => {
		expect(expandMentions('Thanks @sara.', names)).toBe('Thanks @Sara Ahmed.')
		expect(expandMentions('(@sara), @sara!', names)).toBe('(@Sara Ahmed), @Sara Ahmed!')
	})

	test('an @ that names nobody the server knows is plain text', () => {
		expect(expandMentions('Hello @nobody', names)).toBe('Hello @nobody')
		expect(expandMentions('Hello @sara', {})).toBe('Hello @sara')
		expect(expandMentions('Hello @sara', undefined)).toBe('Hello @sara')
	})

	test('an email address is not a mention', () => {
		expect(expandMentions('Write to sara@sara.example', names)).toBe('Write to sara@sara.example')
	})

	test('names that are object keys of every object are not found by accident', () => {
		expect(expandMentions('@constructor and @toString', names)).toBe('@constructor and @toString')
	})

	test('a list from the server where an empty object was meant is no names', () => {
		expect(expandMentions('Hi @sara', [])).toBe('Hi @sara')
	})

	test('a text with several mentions is cut into plain and mention pieces', () => {
		expect(segments('A @sara B @"omar k"', names)).toEqual([
			{ text: 'A ', mention: false },
			{ text: '@Sara Ahmed', mention: true },
			{ text: ' B ', mention: false },
			{ text: '@Omar Khan', mention: true },
		])
	})

	test('a display name that looks like markup stays text', () => {
		const pieces = segments('Hi @sara', { sara: '<img src=x onerror=alert(1)>' })

		expect(pieces[1]).toEqual({ text: '@<img src=x onerror=alert(1)>', mention: true })
	})

	test('something that is not text gives no pieces', () => {
		expect(segments(undefined, names)).toEqual([])
		expect(segments(null, names)).toEqual([])
	})

	test('the editor is given each person to draw, keyed by id', () => {
		expect(mentionUserData(names)).toEqual({
			sara: { id: 'sara', label: 'Sara Ahmed', source: 'users', icon: 'icon-user' },
			'omar k': { id: 'omar k', label: 'Omar Khan', source: 'users', icon: 'icon-user' },
		})
		expect(mentionUserData(undefined)).toEqual({})
	})
})

describe('time', () => {
	test('a timestamp is shown in the reader\'s locale', () => {
		expect(formatNoteTime(1_800_000_000)).toMatch(/2027/)
	})

	test('a value that is not a time is shown as nothing', () => {
		expect(formatNoteTime(0)).toBe('')
		expect(formatNoteTime(null)).toBe('')
		expect(formatNoteTime(undefined)).toBe('')
		expect(formatNoteTime(Number.NaN)).toBe('')
	})
})
