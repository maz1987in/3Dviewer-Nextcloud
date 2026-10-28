/**
 * The filament estimate: walls and top and bottom solid to a fixed depth, the inside at
 * the infill percentage. A rough figure, labelled as one.
 */
import { estimateFilament } from '../../../src/printCheck/filament.js'

test('10 mm cube at 20% PLA', () => {
	// V 1000, A 600, shell 720, material 720 + 280 × 0.2 = 776 mm³
	const { grams, metres } = estimateFilament({ volumeMm3: 1000, areaMm2: 600, infillPercent: 20, density: 1.24 })
	expect(grams).toBeCloseTo(0.96224, 4)
	expect(metres).toBeCloseTo(0.32262, 4)
})

test('100% infill uses the whole volume', () => {
	expect(estimateFilament({ volumeMm3: 1000, areaMm2: 600, infillPercent: 100, density: 1.24 }).grams).toBeCloseTo(1.24, 9)
})

test('0% infill uses only the shell', () => {
	expect(estimateFilament({ volumeMm3: 1000, areaMm2: 600, infillPercent: 0, density: 1.24 }).grams).toBeCloseTo(0.8928, 9)
})

test('a part thinner than the shell is solid', () => {
	// A 10 × 10 × 1 plate: area 240, so area × 1.2 = 288 > 100 mm³
	expect(estimateFilament({ volumeMm3: 100, areaMm2: 240, infillPercent: 20, density: 1.24 }).grams).toBeCloseTo(0.124, 9)
})
