/**
 * Every reason a reader can give for a scan it can't read is translated on the page.
 */
import fs from 'node:fs'
import path from 'node:path'
import { SCAN_REASONS, translateReason } from '../../../src/pointclouds/scanReasons.js'

const SRC = path.join(__dirname, '../../../src/pointclouds')
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []))

test('every reason a reader gives is translated', () => {
	const given = new Set()
	for (const file of files(SRC)) {
		const source = fs.readFileSync(file, 'utf8')
		expect([file, /new ScanError\(`/.test(source)]).toEqual([file, false])
		for (const [, reason] of source.matchAll(/new ScanError\('((?:[^'\\]|\\.)*)'/g)) {
			given.add(reason.replace(/\\'/g, '\''))
		}
	}
	expect(given.size).toBeGreaterThan(40)
	expect([...given].filter((reason) => !SCAN_REASONS.includes(reason))).toEqual([])
})

test('placeholders are filled in, and an unknown reason passes through', () => {
	expect(translateReason('LAZ point format {format} isn\'t supported', { format: 4 })).toBe('LAZ point format 4 isn\'t supported')
	expect(translateReason('something new')).toBe('something new')
})
