/**
 * Raw control bytes have twice reached a green CI run in this repository: a
 * heredoc turned `\b` into a literal backspace inside a regex, and `\0\x01` into
 * a raw NUL and SOH inside a string literal. Both compiled, both passed their
 * tests, and neither was visible in a terminal — the NUL only surfaced because
 * git reported a `.js` file as `Bin 0 -> 2585 bytes` in a merge summary.
 *
 * A NUL also makes git treat the file as binary, so it stops producing diffs for
 * it: the file silently drops out of line-level review.
 *
 * Nothing here needs a control byte written literally. An escape sequence carries
 * the identical value and survives every editor, diff, and terminal.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../..')

// Where hand-written source lives. Binary assets sit under img/ and are not
// scanned; the extension filter below keeps binary fixtures out too.
const SCANNED = ['src', 'lib', 'tests', 'appinfo', 'scripts', 'templates']
const TEXT = /\.(js|mjs|cjs|vue|php|json|md|xml|ya?ml|css|scss|html)$/
const SKIP = new Set(['node_modules', 'vendor', 'vendor-bin', '.git'])

// Tab, LF and CR are the only C0 bytes that belong in text.
const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g

/**
 * Collect every scannable source file beneath a directory.
 *
 * @param {string} dir - absolute directory to descend
 * @param {string[]} found - accumulator
 * @return {string[]} absolute file paths
 */
function collect(dir, found = []) {
	if (!fs.existsSync(dir)) {
		return found
	}
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (SKIP.has(entry.name)) {
			continue
		}
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			collect(full, found)
		} else if (TEXT.test(entry.name)) {
			found.push(full)
		}
	}
	return found
}

describe('source files', () => {
	const files = SCANNED.flatMap((dir) => collect(path.join(ROOT, dir)))

	it('finds source to scan', () => {
		// Guards the guard: a wrong root or a tightened filter would otherwise
		// leave this suite passing over an empty list.
		expect(files.length).toBeGreaterThan(50)
	})

	it('contain no raw control bytes', () => {
		const offenders = []

		for (const file of files) {
			// Read as latin1 so every byte maps to exactly one character and the
			// offsets below stay byte-accurate.
			const text = fs.readFileSync(file, 'latin1')
			for (const match of text.matchAll(CONTROL)) {
				const line = text.slice(0, match.index).split('\n').length
				const byte = `0x${match[0].charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`
				offenders.push(`${path.relative(ROOT, file)}:${line} contains ${byte}`)
			}
		}

		expect(offenders).toEqual([])
	})
})
