/**
 * The comparison table's lengths carry their unit. The original and comparison columns
 * had one and the delta column did not, so "+12.00" next to "1.20 m" read as either.
 */
const { readFileSync } = require('fs')
const { join } = require('path')
const { parse } = require('@vue/compiler-sfc')

const template = parse(readFileSync(join(__dirname, '..', '..', 'src', 'components', 'ThreeViewer.vue'), 'utf8')).descriptor.template.content

test('every length in the comparison table, delta included, is followed by its unit', () => {
	const cells = template.split('\n').filter((line) => line.includes('diffLength('))
	// x, y, z and the diagonal; original, comparison and delta for each
	expect(cells).toHaveLength(12)
	for (const cell of cells) {
		expect(cell.trim()).toMatch(/\}\} \{\{ statsUnitConfig\.suffix \}\}$/)
	}
	expect(cells.filter((cell) => cell.includes('formatDeltaFloat(diffLength('))).toHaveLength(4)
})
