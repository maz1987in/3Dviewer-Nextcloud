/**
 * How many splats a device is asked to draw, and what the person is told when a capture
 * is thinned.
 */
import { SPLAT_BUDGET } from '../../../src/splats/limits.js'
import { splatBudgetFor, splatCeilingFor, splatThinningNote } from '../../../src/splats/splatBudget.js'

test('a budget for each kind of device', () => {
	expect(splatBudgetFor('desktop')).toBe(8_000_000)
	expect(splatBudgetFor('tablet')).toBe(3_000_000)
	expect(splatBudgetFor('phone')).toBe(1_500_000)
	expect(SPLAT_BUDGET.thumbnail).toBe(500_000)
})

// Spark reads the whole file before it is thinned, so a phone or a tablet opens less of one
test('the largest splat each kind of device opens', () => {
	expect(splatCeilingFor('desktop')).toBe(1024 ** 3)
	expect(splatCeilingFor('tablet')).toBe(512 * 1024 ** 2)
	expect(splatCeilingFor('phone')).toBe(256 * 1024 ** 2)
	expect(splatCeilingFor('unknown')).toBe(1024 ** 3)
})

test('the thinning note', () => {
	expect(splatThinningNote(1000, 4000)).toBe('Showing 1 in 4 splats')
	expect(splatThinningNote(3000, 4000)).toBe('Showing 3,000 of 4,000 splats')
	expect(splatThinningNote(10, 10)).toBeNull()
})
