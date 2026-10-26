import { isSkipped, markSkipped, clearSkips } from '../../../src/thumbnails/skipList.js'

const KEY = 'threedviewer:thumbnailSkips'

beforeEach(() => {
	localStorage.clear()
})

describe('skip list', () => {
	test('markSkipped then isSkipped is true for that version only', () => {
		markSkipped(7, 'etag-a')

		expect(isSkipped(7, 'etag-a')).toBe(true)
		expect(isSkipped(7, 'etag-b')).toBe(false)
		expect(isSkipped(8, 'etag-a')).toBe(false)
	})

	test('clearSkips empties the list', () => {
		markSkipped(1, 'a')
		markSkipped(2, 'b')

		clearSkips()

		expect(isSkipped(1, 'a')).toBe(false)
		expect(isSkipped(2, 'b')).toBe(false)
		expect(localStorage.getItem(KEY)).toBeNull()
	})

	test('keeps at most 2000 entries, dropping the oldest', () => {
		const seeded = {}
		for (let i = 0; i < 2000; i++) {
			seeded[`${i}:e`] = 1000 + i
		}
		localStorage.setItem(KEY, JSON.stringify(seeded))

		markSkipped(5000, 'new')

		const stored = JSON.parse(localStorage.getItem(KEY))
		expect(Object.keys(stored)).toHaveLength(2000)
		expect(isSkipped(0, 'e')).toBe(false)
		expect(isSkipped(1, 'e')).toBe(true)
		expect(isSkipped(5000, 'new')).toBe(true)
	})

	test('skip list survives a throwing localStorage', () => {
		const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
		const throwing = {
			getItem: () => { throw new Error('denied') },
			setItem: () => { throw new Error('denied') },
			removeItem: () => { throw new Error('denied') },
		}
		Object.defineProperty(window, 'localStorage', { value: throwing, configurable: true })
		try {
			expect(() => markSkipped(1, 'a')).not.toThrow()
			expect(() => clearSkips()).not.toThrow()
			expect(() => isSkipped(1, 'a')).not.toThrow()
			expect(isSkipped(1, 'a')).toBe(false)
		} finally {
			Object.defineProperty(window, 'localStorage', original)
		}
	})

	test('a corrupt stored value reads as an empty list', () => {
		localStorage.setItem(KEY, '{not json')

		expect(isSkipped(1, 'a')).toBe(false)
		markSkipped(1, 'a')
		expect(isSkipped(1, 'a')).toBe(true)
	})
})
