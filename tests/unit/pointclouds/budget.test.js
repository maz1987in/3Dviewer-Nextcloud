/**
 * How many points a device is asked to draw: fewer on phones and tablets, and on any
 * device that says it has little memory.
 */
import { pointBudget, thinningNote } from '../../../src/pointclouds/budget.js'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

test('a phone', () => {
	expect(pointBudget({ userAgent: IPHONE, maxTouchPoints: 5, coarsePointer: true, screenMin: 390 })).toBe(2_000_000)
	expect(pointBudget({ userAgent: DESKTOP, userAgentData: { mobile: true }, coarsePointer: false, screenMin: 900 })).toBe(2_000_000)
})

test('an iPad, which says it is a Mac', () => {
	expect(pointBudget({ userAgent: MAC, maxTouchPoints: 5, coarsePointer: false, screenMin: 820 })).toBe(4_000_000)
	expect(pointBudget({ userAgent: DESKTOP, maxTouchPoints: 10, coarsePointer: true, screenMin: 800 })).toBe(4_000_000)
})

test('a desktop', () => {
	expect(pointBudget({ userAgent: DESKTOP, maxTouchPoints: 0, coarsePointer: false, screenMin: 1080 })).toBe(20_000_000)
	expect(pointBudget({ userAgent: MAC, maxTouchPoints: 0, coarsePointer: false, screenMin: 900 })).toBe(20_000_000)
})

test('little memory caps any device at the tablet budget', () => {
	expect(pointBudget({ userAgent: DESKTOP, maxTouchPoints: 0, coarsePointer: false, screenMin: 1080, deviceMemory: 4 })).toBe(4_000_000)
	expect(pointBudget({ userAgent: IPHONE, maxTouchPoints: 5, coarsePointer: true, screenMin: 390, deviceMemory: 2 })).toBe(2_000_000)
	expect(pointBudget({ userAgent: DESKTOP, maxTouchPoints: 0, coarsePointer: false, screenMin: 1080, deviceMemory: 8 })).toBe(20_000_000)
})

test('the thinning note', () => {
	expect(thinningNote(250, 1000)).toBe('Showing 1 in 4 points')
	expect(thinningNote(900, 1000)).toBe('Showing 900 of 1,000 points')
	expect(thinningNote(10, 10)).toBeNull()
})
