/**
 * The bundle-size budgets match the files the build writes. A budget whose pattern matches
 * nothing is skipped, so a pattern that misses a real file name silently stops checking it.
 */
const { readFileSync } = require('fs')
const { join } = require('path')

const SCRIPT = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'check-bundle-size.mjs'), 'utf8')

/** The regular expression literal on the line naming a budget. */
function patternOf(name) {
	const line = SCRIPT.split('\n').find((text) => text.includes(`name: '${name}'`))
	const [, body, flags] = /pattern: \/(.+?)\/([a-z]*),/.exec(line)
	return new RegExp(body, flags)
}

test('the print-check worker budget matches any hash rollup writes, dashes and underscores included', () => {
	const pattern = patternOf('print-check-worker')
	expect(pattern.test('print-check-worker-CSZDQAB_.mjs')).toBe(true)
	expect(pattern.test('print-check-worker-a-b9_Z.mjs')).toBe(true)
	expect(pattern.test('print-check-worker-gcode-Ab12.chunk.mjs')).toBe(false)
})
