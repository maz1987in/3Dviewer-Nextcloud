/**
 * The "3D" tab is registered with whichever Files sidebar the server has: the legacy one
 * of Nextcloud 31 and 32 (`OCA.Files.Sidebar.registerTab`), the web-component one of 33 to
 * 35 (a registry on `window`). One script serves both, and shows the tab for a model and for
 * nothing else.
 */

jest.mock('@nextcloud/auth', () => ({ getCurrentUser: jest.fn(() => ({ uid: 'alice' })) }))
jest.mock('@nextcloud/l10n', () => ({ translate: (app, text) => text, translatePlural: (app, one, many) => many }))
jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))


let auth

/**
 * Load the entry afresh, as the page does once.
 */
function loadEntry() {
	require('../../../src/files-sidebar.js')
}

/** The legacy sidebar's `Tab`, which keeps the options it was made with. */
class LegacyTab {
	constructor(options) {
		Object.assign(this, options)
	}
}

beforeEach(() => {
	// A fresh module registry: the entry registers when it loads, and the modules it loads
	// later (the tab) are the ones this test stood in for
	jest.resetModules()
	delete window._nc_files_scope
	delete window.OCA
	auth = require('@nextcloud/auth')
	auth.getCurrentUser.mockReturnValue({ uid: 'alice' })
})

describe('on Nextcloud 33 and later', () => {
	const registered = () => [...window._nc_files_scope.v4_0.filesSidebarTabs.values()]

	it('registers one web-component tab, named 3D, with the app\'s icon', () => {
		loadEntry()

		expect(registered()).toHaveLength(1)
		expect(registered()[0]).toMatchObject({
			id: 'threedviewer',
			displayName: '3D',
			tagName: 'threedviewer-files-sidebar-tab',
			order: expect.any(Number),
		})
		expect(registered()[0].iconSvgInline).toContain('<svg')
		expect(typeof registered()[0].onInit).toBe('function')
	})

	it('has a tag name the sidebar accepts: lower case, with a dash, starting with the app id', () => {
		loadEntry()

		expect(registered()[0].tagName).toMatch(/^threedviewer-[a-z0-9-]+$/)
	})

	it.each(['a.stl', 'A.GLB', 'scan.las', 'plan.ifc', 'toolpath.gcode', 'splat.spz', 'part.v2.step'])('shows the tab for %s', (basename) => {
		loadEntry()

		expect(registered()[0].enabled({ node: { type: 'file', basename } })).toBe(true)
	})

	it.each(['notes.txt', 'photo.png', 'a.mtl', 'noextension', '.stl-not'])('does not show it for %s', (basename) => {
		loadEntry()

		expect(registered()[0].enabled({ node: { type: 'file', basename } })).toBe(false)
	})

	it('does not show it for a folder, even one named like a model', () => {
		loadEntry()

		expect(registered()[0].enabled({ node: { type: 'folder', basename: 'parts.stl' } })).toBe(false)
	})

	it('does not show it to someone who is not signed in, as on a public share page', () => {
		auth.getCurrentUser.mockReturnValue(null)
		loadEntry()

		expect(registered()[0].enabled({ node: { type: 'file', basename: 'a.stl' } })).toBe(false)
	})

	it('does not throw for a context without a node', () => {
		loadEntry()

		expect(registered()[0].enabled({})).toBe(false)
	})

	it('defines the web component the first time it is shown, and only once', async () => {
		const define = jest.spyOn(window.customElements, 'define').mockImplementation(() => {})
		jest.spyOn(window.customElements, 'get').mockReturnValueOnce(undefined).mockReturnValue(class {})
		jest.doMock('../../../src/stats/tabElement.js', () => ({ createTabElement: () => class Tab {} }))
		loadEntry()

		await registered()[0].onInit()
		await registered()[0].onInit()

		expect(define).toHaveBeenCalledTimes(1)
		expect(define).toHaveBeenCalledWith('threedviewer-files-sidebar-tab', expect.any(Function))
		jest.restoreAllMocks()
	})

	it('leaves a tab another script registered under the same id alone', () => {
		window._nc_files_scope = { v4_0: { filesSidebarTabs: new Map([['threedviewer', { id: 'threedviewer', displayName: 'theirs' }]]) } }
		loadEntry()

		expect(registered()).toEqual([{ id: 'threedviewer', displayName: 'theirs' }])
	})
})

describe('on Nextcloud 31 and 32', () => {
	let registerTab

	beforeEach(() => {
		registerTab = jest.fn()
		window.OCA = { Files: { Sidebar: { registerTab, Tab: LegacyTab } } }
	})

	it('registers a legacy tab and nothing in the web-component registry', () => {
		loadEntry()

		expect(registerTab).toHaveBeenCalledTimes(1)
		expect(registerTab.mock.calls[0][0]).toBeInstanceOf(LegacyTab)
		expect(registerTab.mock.calls[0][0]).toMatchObject({ id: 'threedviewer', name: '3D', iconSvg: expect.stringContaining('<svg') })
		expect(window._nc_files_scope?.v4_0?.filesSidebarTabs?.size ?? 0).toBe(0)
	})

	it('shows the tab for a model file and for nothing else', () => {
		loadEntry()
		const { enabled } = registerTab.mock.calls[0][0]

		expect(enabled({ name: 'a.stl', isDirectory: () => false })).toBe(true)
		expect(enabled({ name: 'notes.txt', isDirectory: () => false })).toBe(false)
		expect(enabled({ name: 'parts.stl', isDirectory: () => true })).toBe(false)
		expect(enabled(null)).toBe(false)
		expect(enabled({ name: 'a.stl' })).toBe(false)
	})

	it('does not show it to someone who is not signed in', () => {
		auth.getCurrentUser.mockReturnValue(null)
		loadEntry()

		expect(registerTab.mock.calls[0][0].enabled({ name: 'a.stl', isDirectory: () => false })).toBe(false)
	})

	it('mounts the tab in the element the sidebar gives it, with the file and whether it is showing', async () => {
		const mountLegacyTab = jest.fn(() => ({ update: jest.fn(), setActive: jest.fn(), destroy: jest.fn() }))
		jest.doMock('../../../src/stats/legacyMount.js', () => ({ mountLegacyTab }))
		loadEntry()
		const tab = registerTab.mock.calls[0][0]
		const element = document.createElement('div')
		const fileInfo = { id: 7, name: 'a.stl', path: '/models' }

		// The sidebar can say the tab shows before the tab's code has loaded
		tab.setIsActive(true)
		await tab.mount(element, fileInfo)

		expect(mountLegacyTab).toHaveBeenCalledWith(element, fileInfo, true)
	})

	it('passes on the sidebar\'s other calls to the mounted tab, and tolerates them before it exists', async () => {
		const mounted = { update: jest.fn(), setActive: jest.fn(), destroy: jest.fn() }
		jest.doMock('../../../src/stats/legacyMount.js', () => ({ mountLegacyTab: () => mounted }))
		loadEntry()
		const tab = registerTab.mock.calls[0][0]

		expect(() => {
			tab.update({ id: 1 })
			tab.setIsActive(false)
			tab.destroy()
		}).not.toThrow()
		await tab.mount(document.createElement('div'), { id: 7 })
		tab.update({ id: 8 })
		tab.setIsActive(true)
		tab.destroy()

		expect(mounted.update).toHaveBeenCalledWith({ id: 8 })
		expect(mounted.setActive).toHaveBeenCalledWith(true)
		expect(mounted.destroy).toHaveBeenCalledTimes(1)
	})

	it('replaces a tab it mounted before when it is mounted again', async () => {
		const first = { update: jest.fn(), setActive: jest.fn(), destroy: jest.fn() }
		const second = { update: jest.fn(), setActive: jest.fn(), destroy: jest.fn() }
		const mountLegacyTab = jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
		jest.doMock('../../../src/stats/legacyMount.js', () => ({ mountLegacyTab }))
		loadEntry()
		const tab = registerTab.mock.calls[0][0]

		await tab.mount(document.createElement('div'), { id: 1 })
		await tab.mount(document.createElement('div'), { id: 2 })

		expect(first.destroy).toHaveBeenCalledTimes(1)
		expect(second.destroy).not.toHaveBeenCalled()
	})
})

describe('when the tab registers', () => {
	const setReadyState = (value) => Object.defineProperty(document, 'readyState', { configurable: true, get: () => value })

	afterEach(() => {
		delete document.readyState
	})

	it('waits for DOMContentLoaded while the document is still loading or interactive, which is when a module script runs', () => {
		const registerTab = jest.fn()
		for (const state of ['loading', 'interactive']) {
			jest.resetModules()
			registerTab.mockClear()
			setReadyState(state)
			window.OCA = { Files: {} }

			loadEntry()
			expect(registerTab).not.toHaveBeenCalled()
			expect(window._nc_files_scope?.v4_0?.filesSidebarTabs?.size ?? 0).toBe(0)

			// The Files app's own scripts have run by now: the legacy sidebar is there
			window.OCA.Files.Sidebar = { registerTab, Tab: LegacyTab }
			window.dispatchEvent(new Event('DOMContentLoaded'))

			expect(registerTab).toHaveBeenCalledTimes(1)
			window.dispatchEvent(new Event('load'))
			expect(registerTab).toHaveBeenCalledTimes(1)
		}
	})

	it('registers at load when DOMContentLoaded had passed already', () => {
		setReadyState('interactive')
		window.OCA = { Files: {} }
		loadEntry()

		window.dispatchEvent(new Event('load'))

		expect(window._nc_files_scope.v4_0.filesSidebarTabs.has('threedviewer')).toBe(true)
	})
})

describe('a sidebar that has neither', () => {
	it('registers for the web-component sidebar, which is the newer one', () => {
		window.OCA = { Files: {} }

		loadEntry()

		expect(window._nc_files_scope.v4_0.filesSidebarTabs.has('threedviewer')).toBe(true)
	})

	it('does not take a `Sidebar` without a Tab class for the legacy one', () => {
		window.OCA = { Files: { Sidebar: { registerTab: jest.fn() } } }

		loadEntry()

		expect(window.OCA.Files.Sidebar.registerTab).not.toHaveBeenCalled()
		expect(window._nc_files_scope.v4_0.filesSidebarTabs.has('threedviewer')).toBe(true)
	})
})
