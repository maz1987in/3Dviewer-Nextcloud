/**
 * Which part of the file browser renders for a given navigation state.
 *
 * The browser's body is one `v-if` / `v-else-if` chain: loading, the Folders/Types/Dates
 * overview, a year's months, the empty state, and the file grid. The grid was reachable
 * only once a folder, type or month was selected, so the Favorites view — a flat list
 * with none of those — fell through every branch. Its header counted the files and the
 * body stayed blank (#205). Nobody saw it while the backend returned no favorites at all.
 *
 * The chain is read out of the component, not copied into the test, so the conditions
 * checked here are the ones that ship.
 */

const { readFileSync } = require('fs')
const { join } = require('path')

const SOURCE = readFileSync(
	join(__dirname, '..', '..', 'src', 'components', 'FileBrowser.vue'),
	'utf8',
)

/**
 * The top-level conditional chain that starts at the loading spinner, in order.
 *
 * @return {Array<{name: string, test: Function}>} each branch and its condition
 */
function bodyBranches() {
	const start = SOURCE.indexOf('\t\t<div v-if="loading"')
	// Whole opening tags of the template's top-level children (indented two tabs).
	// Attribute values are matched as quoted strings, since they contain `>`.
	const tags = SOURCE.slice(start).matchAll(/^\t\t<([\w-]+)((?:[^>"]|"[^"]*")*)>/gm)
	const branches = []
	for (const [, tag, attrs] of tags) {
		const m = attrs.match(/\bv-(if|else-if|else)\b(?:="([^"]*)")?/)
		if (!m) continue
		if (branches.length > 0 && m[1] === 'if') break
		const [, kind, expr] = m
		const cls = (attrs.match(/(?:^|\s)class="([^"]*)"/) || [])[1]
		const viewClass = (attrs.match(/'file-list' : '(file-grid)'/) || [])[1]
		branches.push({
			name: viewClass || cls || tag,
			// The expression comes from the component's own source, not from input.
			// eslint-disable-next-line no-new-func
			test: kind === 'else' ? () => true : new Function('s', `with (s) { return (${expr}) }`),
		})
		if (kind === 'else') break
	}
	return branches
}

function rendered(state) {
	const base = {
		loading: false,
		folders: null,
		types: null,
		dates: null,
		currentPath: null,
		currentType: null,
		currentDate: null,
		filteredFiles: [],
	}
	const s = { ...base, ...state }
	return bodyBranches().find(b => b.test(s))?.name
}

const MODEL = { id: 162, name: 'chair.stl', extension: 'stl' }

test('the chain is found', () => {
	expect(bodyBranches().map(b => b.name)).toEqual([
		'file-browser-loading',
		'template',
		'template',
		'NcEmptyContent',
		'file-grid',
	])
})

test('the Favorites list renders its files', () => {
	expect(rendered({ filteredFiles: [MODEL] })).toBe('file-grid')
})

test('an empty Favorites list shows the empty state', () => {
	expect(rendered({ filteredFiles: [] })).toBe('NcEmptyContent')
})

test('the Folders overview still renders the overview, not the grid', () => {
	expect(rendered({ folders: [{ name: 'models' }] })).toBe('template')
})

test('a selected folder still renders its files', () => {
	expect(rendered({ folders: [], currentPath: 'models', filteredFiles: [MODEL] })).toBe('file-grid')
})

test('a year in the Dates view still lists its months, not the grid', () => {
	const dates = [{ year: 2026, months: [] }]
	expect(rendered({ dates, currentDate: { year: 2026 } })).toBe('template')
})
