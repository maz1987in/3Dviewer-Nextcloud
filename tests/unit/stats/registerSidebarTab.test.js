/**
 * The tab is found by Nextcloud's own sidebar.
 *
 * The registration writes to the registry `@nextcloud/files` keeps on `window`, rather than
 * importing the library's `registerSidebarTab` (139 KB with its dependencies, in a script
 * every Files page loads). What makes that safe is that both write to, and the server's
 * sidebar reads from, one registry. This reads the tab back through the library's own
 * `getSidebarTabs` and `registerSidebarTab`, so it fails the day the library keeps its
 * registry somewhere else, or accepts the tab differently.
 */

// The library checks a tab's icon with is-svg, which ships as an ES module Jest does not
// transform; what it checks is the library's business, not this test's.
jest.mock('is-svg', () => ({ __esModule: true, default: () => true }))
jest.mock('@nextcloud/logger', () => ({
	getLoggerBuilder: () => ({ setApp: () => ({ detectUser: () => ({ build: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() }) }) }) }),
}))

const library = require('../../../node_modules/@nextcloud/files/dist/ui/sidebar/SidebarTab.mjs')
const { registerSidebarTab } = require('../../../src/stats/registerSidebarTab.js')
const { TAB_ICON_SVG } = require('../../../src/stats/tabIcon.js')

const TAB = {
	id: 'threedviewer',
	displayName: '3D',
	iconSvgInline: TAB_ICON_SVG,
	order: 70,
	tagName: 'threedviewer-files-sidebar-tab',
	enabled: () => true,
	onInit: async () => {},
}

// jsdom has no CSS.escape, which the library checks a tab's id against
globalThis.CSS ??= { escape: (value) => String(value) }

beforeEach(() => {
	// The library holds the registry it found when it loaded, so the registry is emptied, not replaced
	window._nc_files_scope?.v4_0?.filesSidebarTabs?.clear()
})

describe('registerSidebarTab', () => {
	it('puts the tab where the library lists the registered tabs', () => {
		registerSidebarTab(TAB)

		expect(library.getSidebarTabs()).toEqual([TAB])
	})

	it('lists it beside tabs other apps registered through the library', () => {
		library.registerSidebarTab({ ...TAB, id: 'other', tagName: 'other-tab', iconSvgInline: '<svg/>' })
		registerSidebarTab(TAB)

		expect(library.getSidebarTabs().map((tab) => tab.id)).toEqual(['other', 'threedviewer'])
	})

	it('registers a tab once, as the library does, however many scripts ask', () => {
		registerSidebarTab(TAB)
		registerSidebarTab({ ...TAB, displayName: 'second' })

		expect(library.getSidebarTabs()).toHaveLength(1)
		expect(library.getSidebarTabs()[0].displayName).toBe('3D')
	})

	it('is a tab the library would have accepted itself', () => {
		expect(() => library.registerSidebarTab({ ...TAB, id: 'another' })).not.toThrow()
	})
})

describe('the tab\'s icon', () => {
	it('is an SVG in currentColor, so it follows the theme', () => {
		expect(TAB_ICON_SVG.startsWith('<svg')).toBe(true)
		expect(TAB_ICON_SVG).toContain('fill="currentColor"')
		expect(TAB_ICON_SVG).not.toMatch(/fill="#/)
	})

	it('is small enough for a script every Files page loads', () => {
		expect(TAB_ICON_SVG.length).toBeLessThan(3000)
	})
})
