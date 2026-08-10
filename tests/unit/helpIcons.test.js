/**
 * The help panel shows the picture the control shows.
 *
 * Its rows explain the controls in the tools panel and on the 3D controller, and each row
 * carries an icon so the reader can find the thing being described. The icons were chosen
 * for the help panel separately from the icons on the controls, so several of them named a
 * different picture: "Fit to View" was drawn with the ruler, "Export Model" with a parcel,
 * "Auto-Rotate" and "Rotation Mode" both with the reset arrow, "Camera Projection" with an
 * eye, and "Axes" with the projection icon.
 *
 * That is worse than no icon. A reader who has just seen the tools panel is looking for a
 * shape, and the help panel answers with a different one — which is only findable by
 * opening both at once and comparing them row by row, since each panel is coherent on its
 * own.
 *
 * So where the help panel repeats a control's label, it has to repeat its icon. Rows with
 * no counterpart — the tips, the gestures, the toggles that are switches rather than rows —
 * are free to pick, and are not checked here.
 */

const { readFileSync } = require('fs')
const { join } = require('path')

const SRC = join(__dirname, '..', '..', 'src', 'components')
const HELP = readFileSync(join(SRC, 'HelpPanel.vue'), 'utf8')
const PANEL = readFileSync(join(SRC, 'SlideOutToolPanel.vue'), 'utf8')

/** The translated string in a `t('threedviewer', '…')` call, unescaped. */
const label = (call) => call.replace(/\\'/g, '\'')

/**
 * Every row of a component: the icon it draws and the label it prints.
 *
 * Both panels write the icon immediately before the text, so a row is one `ViewerIcon`
 * followed by the first label after it.
 *
 * @param {string} text - the component's source
 * @param {RegExp} row - matches an icon name then a label, in that order
 * @return {Map<string, string>} label to icon name
 */
function rows(text, row) {
	return new Map([...text.matchAll(row)].map((m) => [label(m[2]), m[1]]))
}

const helpRows = rows(HELP, /<ViewerIcon class="help-icon" name="(\w+)"[^>]*\/>\s*<div class="help-text">\s*<h4>\{\{ t\('threedviewer', '((?:[^'\\]|\\')*)'\) \}\}<\/h4>/g)
const panelRows = rows(PANEL, /<ViewerIcon class="tool-icon" name="(\w+)"[^>]*\/>\s*<span class="tool-label">\{\{ t\('threedviewer', '((?:[^'\\]|\\')*)'\)/g)

/** Labels the help panel and the tools panel both use. */
const shared = [...helpRows.keys()].filter((title) => panelRows.has(title))

describe('a help row that names a control', () => {
	it('finds rows in both panels, so this guard cannot pass vacuously', () => {
		expect(helpRows.size).toBeGreaterThan(10)
		expect(panelRows.size).toBeGreaterThan(10)
		expect(shared.length).toBeGreaterThan(8)
	})

	it.each(shared)('draws %s with the icon the control draws', (title) => {
		expect(helpRows.get(title)).toBe(panelRows.get(title))
	})
})

/**
 * And an icon slot holds an icon.
 *
 * `help-icon` and `tool-icon` are the picture beside a row, laid out as a 40px tinted tile.
 * Three of them were characters — `±` for zoom, `⌂` for reset position, `⊞` for the grid —
 * which is the defect the emoji sweep was about, in the ranges it did not cover: a shape
 * the font vendor chose, at whatever weight it draws, beside a set of 20px Material icons
 * inheriting the row's colour.
 */
describe('an icon slot', () => {
	const SLOTS = /<(\w+)[^>]*\bclass="(?:help-icon|tool-icon)"/g

	it.each([['HelpPanel.vue', HELP], ['SlideOutToolPanel.vue', PANEL]])(
		'holds an icon in %s',
		(name, text) => {
			const notIcons = [...text.matchAll(SLOTS)]
				.map((m) => m[1])
				.filter((tag) => tag !== 'ViewerIcon')
			expect(notIcons).toEqual([])
		},
	)
})
