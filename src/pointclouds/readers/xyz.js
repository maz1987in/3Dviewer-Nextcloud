/**
 * XYZ: a point per line of text, as x y z, then r g b (0–255, or 0–1) or an intensity.
 * Separators are whatever the exporter chose: spaces, tabs, commas or semicolons. Lines
 * that aren't numbers (a count, a column header, # comments) are skipped.
 *
 * The same extension is a chemistry format: an atom count, a comment, then `C 0.1 0.2 0.3`
 * per atom. Such a file is refused as not a scan rather than drawn as a few dots.
 *
 * Text has no point count up front, so the sink thins by reservoir past the budget.
 */
import { checkLineLength, readWindows } from '../blobReader.js'
import { PointSink } from '../pointSink.js'
import { NotAScanError, ScanError } from '../scanFormats.js'

const SEPARATORS = /[\s,;]+/
/** Lines looked at to decide the columns. */
const SNIFF_LINES = 50

/**
 * @param {string} line - One line
 * @return {?number[]} Its numbers, or null when any token isn't one
 */
function numbers(line) {
	const trimmed = line.trim()
	if (trimmed === '' || trimmed[0] === '#' || trimmed[0] === '/') {
		return null
	}
	const tokens = trimmed.split(SEPARATORS)
	const values = new Array(tokens.length)
	for (let i = 0; i < tokens.length; i++) {
		const v = Number(tokens[i])
		if (tokens[i] === '' || !Number.isFinite(v)) {
			return null
		}
		values[i] = v
	}
	return values
}

/**
 * A chemistry file: a lone integer, a free comment line, then atoms, each an element
 * symbol and three numbers.
 *
 * @param {string[]} lines - The file's first lines
 * @return {boolean} Whether it is one
 */
function isChemistry(lines) {
	if (lines.length < 3 || !/^\s*\d+\s*$/.test(lines[0])) {
		return false
	}
	const atom = lines[2].trim().split(SEPARATORS)
	return atom.length >= 4 && /^[A-Za-z]{1,3}$/.test(atom[0]) && atom.slice(1, 4).every((v) => Number.isFinite(Number(v)))
}

/**
 * How to read each line, from the first numeric ones: the most common column count wins.
 *
 * @param {number[][]} rows - Numeric lines from the start of the file
 * @return {{columns: number, color: boolean, colorScale: number, intensity: boolean, intensityScale: number}} The layout
 */
function layoutOf(rows) {
	const counts = new Map()
	for (const row of rows) {
		counts.set(row.length, (counts.get(row.length) ?? 0) + 1)
	}
	const columns = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
	if (columns < 3) {
		throw new ScanError('its lines have fewer than three numbers')
	}
	const same = rows.filter((row) => row.length === columns)
	const color = columns >= 6
	const intensity = columns === 4 || columns === 5
	const maxOf = (from, to) => Math.max(...same.flatMap((row) => row.slice(from, to)))
	return {
		columns,
		color,
		// 0–1 floats when every colour seen is
		colorScale: color && maxOf(3, 6) <= 1 ? 255 : 1,
		intensity,
		intensityScale: intensity && maxOf(3, 4) <= 1 ? 65535 : 1,
	}
}

const clamp = (v, max) => Math.min(max, Math.max(0, Math.round(v)))

/**
 * @param {Blob} blob - The file
 * @param {object} options - How to read it
 * @param {number} options.budget - Points kept at most
 * @param {function(number): void} [options.onProgress] - Told the fraction read
 * @param {AbortSignal} [options.signal] - Stops the read
 * @param {number} [options.windowBytes] - Bytes decoded at a time
 * @return {Promise<{sink: object, unit: null, format: string}>} The points
 */
export async function read(blob, { budget, onProgress = () => {}, signal, windowBytes = 8 * 1024 ** 2 }) {
	const decoder = new TextDecoder()
	let rest = ''
	let sink = null
	let layout = null
	const head = []
	const pending = []

	const addRow = (row) => {
		const r = layout.color ? clamp(row[3] * layout.colorScale, 255) : 0
		const g = layout.color ? clamp(row[4] * layout.colorScale, 255) : 0
		const b = layout.color ? clamp(row[5] * layout.colorScale, 255) : 0
		const i = layout.intensity ? clamp(row[3] * layout.intensityScale, 65535) : 0
		sink.add(row[0], row[1], row[2], r, g, b, i)
	}
	const start = () => {
		if (isChemistry(head)) {
			throw new NotAScanError()
		}
		layout = layoutOf(pending)
		sink = new PointSink({ budget, attributes: { color: layout.color, intensity: layout.intensity } })
		for (const row of pending) {
			if (row.length >= layout.columns) {
				addRow(row)
			}
		}
		pending.length = 0
	}
	const line = (text) => {
		if (head.length < 3 && text.trim() !== '') {
			head.push(text)
		}
		const row = numbers(text)
		// A lone integer is a count header, not a point
		if (row === null || row.length < 3) {
			return
		}
		if (layout === null) {
			pending.push(row)
			if (pending.length >= SNIFF_LINES) {
				start()
			}
		} else if (row.length >= layout.columns) {
			addRow(row)
		}
	}

	for await (const { offset, bytes } of readWindows(blob, { windowBytes, signal })) {
		const text = rest + decoder.decode(bytes, { stream: true })
		const lines = text.split('\n')
		rest = lines.pop()
		checkLineLength(rest)
		for (const text of lines) {
			line(text)
		}
		onProgress(Math.min(1, (offset + bytes.length) / blob.size))
	}
	line(rest + decoder.decode())
	if (layout === null) {
		if (pending.length === 0) {
			if (isChemistry(head)) {
				throw new NotAScanError()
			}
			throw new ScanError('it has no points')
		}
		start()
	}
	if (blob.size === 0) {
		onProgress(1)
	}
	return { sink: sink.finish(), unit: null, format: 'xyz' }
}
