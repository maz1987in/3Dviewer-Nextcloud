/**
 * The legacy sidebar (Nextcloud 31 and 32) hands a tab a FileInfo; this turns it into the
 * tab's props and keeps the mounted tab in step with the sidebar's calls.
 */
jest.mock('../../../src/css/design-system.css', () => ({}), { virtual: true })
jest.mock('../../../src/components/sidebar/ModelStatsTab.vue', () => ({
	__esModule: true,
	default: {
		name: 'FakeTab',
		props: ['fileId', 'name', 'dir', 'active'],
		render() {
			return require('vue').h('div', { class: 'fake-tab', 'data-file': this.fileId, 'data-active': String(this.active) }, this.name)
		},
	},
}), { virtual: true })

const { mountLegacyTab, propsFromFileInfo } = require('../../../src/stats/legacyMount.js')

afterEach(() => document.body.replaceChildren())

describe('propsFromFileInfo', () => {
	it('reads the id, the name and the folder the file is in', () => {
		expect(propsFromFileInfo({ id: 7, name: 'a.stl', path: '/models' })).toEqual({ fileId: 7, name: 'a.stl', dir: '/models' })
	})

	it('falls back to `dir`, then to the root', () => {
		expect(propsFromFileInfo({ id: '8', name: 'b.stl', dir: '/x' }).dir).toBe('/x')
		expect(propsFromFileInfo({ id: 9, name: 'c.stl' }).dir).toBe('/')
		expect(propsFromFileInfo({ id: 9, name: 'c.stl', path: '', dir: '' }).dir).toBe('/')
	})

	it('copes with nothing', () => {
		expect(propsFromFileInfo(null)).toEqual({ fileId: NaN, name: '', dir: '/' })
	})
})

describe('mountLegacyTab', () => {
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

	it('mounts the tab in the element the sidebar gave it, for the file, not showing until told', async () => {
		const element = document.createElement('div')
		document.body.appendChild(element)

		mountLegacyTab(element, { id: 7, name: 'a.stl', path: '/models' }, false)
		await tick()

		const tab = element.querySelector('.fake-tab')
		expect(tab.textContent).toBe('a.stl')
		expect(tab.dataset.file).toBe('7')
		expect(tab.dataset.active).toBe('false')
	})

	it('follows the sidebar: another file, shown, hidden, gone', async () => {
		const element = document.createElement('div')
		document.body.appendChild(element)
		const mounted = mountLegacyTab(element, { id: 7, name: 'a.stl', path: '/' }, false)
		await tick()

		mounted.setActive(true)
		await tick()
		expect(element.querySelector('.fake-tab').dataset.active).toBe('true')

		mounted.update({ id: 8, name: 'b.stl', path: '/' })
		await tick()
		expect(element.querySelector('.fake-tab').textContent).toBe('b.stl')
		expect(element.querySelector('.fake-tab').dataset.file).toBe('8')

		mounted.destroy()
		expect(element.querySelector('.fake-tab')).toBeNull()
		expect(element.children).toHaveLength(0)
	})
})
