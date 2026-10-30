/**
 * Choosing an export format does not start an export.
 *
 * The format select used to emit `export-model` from its `change` handler. A closed select
 * fires `change` on every ArrowDown in Chrome and Firefox on Windows and Linux, so a keyboard
 * user moving through the list wrote a GLB file with the first key (WCAG 3.2.2, On Input).
 * The select now only chooses, and an Export button exports.
 *
 * Read out of the component's source, as the other panel tests are, so the wiring checked is
 * the wiring that ships.
 */

const { readFileSync } = require('fs')
const { join } = require('path')
const { stripHtmlComments } = require('./helpers/stripHtmlComments.js')

const PANEL = readFileSync(
	join(__dirname, '..', '..', 'src', 'components', 'SlideOutToolPanel.vue'),
	'utf8',
)

const template = stripHtmlComments(PANEL.slice(PANEL.indexOf('<template>'), PANEL.indexOf('</template>\n\n<script>')))
const select = /<select\b[^>]*class="export-select"[\s\S]*?<\/select>/.exec(template)[0]
const button = /<button\b[^>]*class="export-btn"[^>]*>[\s\S]*?<\/button>/.exec(template)[0]

describe('the export format select', () => {
	it('only chooses: nothing listens to its change or input', () => {
		expect(select).not.toMatch(/@change|@input|v-on:/)
		expect(select).toContain('v-model="exportFormat"')
	})

	it('starts on GLB, with no placeholder entry to pass through', () => {
		expect(PANEL).toMatch(/const exportFormat = ref\('glb'\)/)
		expect(select).not.toMatch(/<option value="">/)
		expect(select.match(/<option\b/g).length).toBeGreaterThan(5)
	})

	it('keeps its name and is not editable while an export runs or without a model', () => {
		expect(select).toContain(':aria-label="t(\'threedviewer\', \'Export model format\')"')
		expect(select).toContain(':disabled="!modelLoaded || exporting"')
		expect(select).toContain(':aria-busy=')
	})
})

describe('the Export button', () => {
	it('is a real button that does not submit anything', () => {
		expect(button).toContain('type="button"')
	})

	it('is named by its text, in the group the select shares', () => {
		expect(button).toContain("t('threedviewer', 'Export')")
		expect(template).toMatch(/class="tool-row" role="group" :aria-label="t\('threedviewer', 'Export Model'\)"/)
	})

	it('exports in the chosen format', () => {
		expect(button).toContain('@click="startExport"')
		expect(PANEL).toMatch(/emit\('export-model', exportFormat\.value\)/)
	})

	it('is off without a model and while an export runs, without dropping focus', () => {
		expect(button).toContain(':disabled="!modelLoaded"')
		// aria-disabled, not disabled, while running: a disabled button loses the keyboard's place
		expect(button).toMatch(/:aria-disabled="exporting (\|\| pointCloud )?\?/)
		expect(PANEL).toMatch(/if \(props\.exporting \|\| !props\.modelLoaded( \|\| props\.pointCloud)?\) return/)
	})

	it('shows no hover or pressed look while an export runs', () => {
		expect(PANEL).toMatch(/\.export-btn\.export-btn:hover:not\(:disabled, \[aria-disabled="true"\]\)\s*\{/)
		expect(PANEL).toMatch(/\.export-btn\.export-btn:active:not\(\[aria-disabled="true"\]\)\s*\{/)
	})
})

describe('the Record turntable button', () => {
	const record = /<button\b[^>]*@click="emit\('record-turntable'\)"[^>]*>[\s\S]*?<\/button>/.exec(template)[0]

	it('is a real button, named by its text', () => {
		expect(record).toContain('type="button"')
		expect(record).toContain("t('threedviewer', 'Record turntable')")
	})

	it('is disabled without a model, and where the browser cannot record video, with a title that says so', () => {
		expect(record).toContain(':disabled="!modelLoaded || !canRecordVideo"')
		expect(record).toContain(":title=\"canRecordVideo ? undefined : t('threedviewer', 'This browser can\\'t record video')\"")
	})
})
