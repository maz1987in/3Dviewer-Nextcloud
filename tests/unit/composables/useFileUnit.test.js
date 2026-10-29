import * as THREE from 'three'
import { useFileUnit } from '../../../src/composables/useFileUnit.js'

/** An API double whose answers the test resolves by hand. */
function deferredApi() {
	const calls = { get: [], setUnit: [] }
	const api = {
		get: jest.fn(() => new Promise((resolve, reject) => calls.get.push({ resolve, reject }))),
		setUnit: jest.fn((unit) => new Promise((resolve, reject) => calls.setUnit.push({ unit, resolve, reject }))),
	}
	return { api, calls }
}

describe('useFileUnit', () => {
	it('describes a format that records its unit without a request', async () => {
		const unit = useFileUnit()
		unit.describe('a.glb', new THREE.Group())
		const { api } = deferredApi()

		expect(await unit.load(api)).toBe(false)
		expect(api.get).not.toHaveBeenCalled()
		expect(unit.state.value).toMatchObject({ millimetres: 1000, key: 'm', suffix: 'm', source: 'file', changeable: false, canEdit: false })
	})

	it('describes a unitless file by its default until the server answers', () => {
		const unit = useFileUnit()
		unit.describe('a.stl', new THREE.Group())

		expect(unit.chosen.value).toBeNull()
		expect(unit.state.value).toMatchObject({ millimetres: 1, key: 'mm', source: 'default', changeable: true, canEdit: false, status: '' })
	})

	it('applies the unit the server has for the file', async () => {
		const unit = useFileUnit()
		unit.describe('a.stl', new THREE.Group())
		const { api, calls } = deferredApi()

		const loading = unit.load(api)
		calls.get[0].resolve({ canEdit: true, unit: 'in' })

		expect(await loading).toBe(true)
		expect(unit.chosen.value).toBe('in')
		expect(unit.state.value).toMatchObject({ millimetres: 25.4, key: 'in', suffix: 'in', source: 'chosen', canEdit: true })
	})

	it('reports no change when the server has no unit, but takes the rights', async () => {
		const unit = useFileUnit()
		unit.describe('a.stl', null)
		const { api, calls } = deferredApi()

		const loading = unit.load(api)
		calls.get[0].resolve({ canEdit: true, unit: null })

		expect(await loading).toBe(false)
		expect(unit.state.value).toMatchObject({ source: 'default', canEdit: true })
	})

	it('ignores an answer for a model that has since been replaced', async () => {
		const unit = useFileUnit()
		unit.describe('a.stl', null)
		const { api, calls } = deferredApi()

		const loading = unit.load(api)
		unit.describe('b.stl', null)
		calls.get[0].resolve({ canEdit: true, unit: 'in' })

		expect(await loading).toBe(false)
		expect(unit.chosen.value).toBeNull()
		expect(unit.state.value).toMatchObject({ key: 'mm', canEdit: false })
	})

	it('treats a failed read as no unit set', async () => {
		const unit = useFileUnit()
		unit.describe('a.stl', null)
		const { api, calls } = deferredApi()

		const loading = unit.load(api)
		calls.get[0].reject(new Error('Network Error'))

		expect(await loading).toBe(false)
		expect(unit.state.value).toMatchObject({ key: 'mm', source: 'default', canEdit: false })
	})

	it('says it is saving, then saved', async () => {
		const unit = useFileUnit()
		unit.describe('a.stl', null)
		const { api, calls } = deferredApi()
		const loading = unit.load(api)
		calls.get[0].resolve({ canEdit: true, unit: null })
		await loading

		const saving = unit.set('ft')
		expect(unit.state.value.status).toBe('saving')
		expect(calls.setUnit[0].unit).toBe('ft')
		calls.setUnit[0].resolve({ canEdit: true, unit: 'ft' })

		expect(await saving).toBe(true)
		expect(unit.chosen.value).toBe('ft')
		expect(unit.state.value).toMatchObject({ millimetres: 304.8, key: 'ft', source: 'chosen', status: 'saved' })
	})

	it('keeps the unit in force when saving fails', async () => {
		const unit = useFileUnit()
		unit.describe('a.stl', null)
		const { api, calls } = deferredApi()
		const loading = unit.load(api)
		calls.get[0].resolve({ canEdit: true, unit: 'in' })
		await loading

		const saving = unit.set('cm')
		calls.setUnit[0].reject(new Error('Request failed with status code 500'))

		expect(await saving).toBe(false)
		expect(unit.chosen.value).toBe('in')
		expect(unit.state.value).toMatchObject({ key: 'in', millimetres: 25.4, status: 'failed' })
	})

	it('saves nothing without the rights or before a file is loaded', async () => {
		const unit = useFileUnit()
		expect(await unit.set('in')).toBe(false)

		unit.describe('a.stl', null)
		const { api, calls } = deferredApi()
		const loading = unit.load(api)
		calls.get[0].resolve({ canEdit: false, unit: null })
		await loading

		expect(await unit.set('in')).toBe(false)
		expect(api.setUnit).not.toHaveBeenCalled()
	})

	it('resets to no file', () => {
		const unit = useFileUnit()
		unit.describe('a.stl', null)
		unit.reset()

		expect(unit.state.value).toBeNull()
		expect(unit.chosen.value).toBeNull()
	})

	/** A unit loaded for a.stl that the user may change. */
	async function editable(unitKey = null) {
		const unit = useFileUnit()
		unit.describe('a.stl', null)
		const { api, calls } = deferredApi()
		const loading = unit.load(api)
		calls.get[0].resolve({ canEdit: true, unit: unitKey })
		await loading
		return { unit, api, calls }
	}

	const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

	it('sends only the latest of quick picks, once the one in flight is answered', async () => {
		const { unit, api, calls } = await editable()

		const first = unit.set('cm')
		const second = unit.set('m')
		const third = unit.set('in')
		expect(api.setUnit).toHaveBeenCalledTimes(1)
		calls.setUnit[0].resolve({ canEdit: true, unit: 'cm' })
		await flush()

		expect(api.setUnit.mock.calls.map(([key]) => key)).toEqual(['cm', 'in'])
		expect(unit.state.value.status).toBe('saving')
		calls.setUnit[1].resolve({ canEdit: true, unit: 'in' })

		expect(await Promise.all([first, second, third])).toEqual([true, true, true])
		expect(unit.chosen.value).toBe('in')
		expect(unit.state.value).toMatchObject({ key: 'in', status: 'saved' })
	})

	it('does not report a later pick as failed when an earlier one failed', async () => {
		const { unit, calls } = await editable()

		const first = unit.set('cm')
		unit.set('in')
		calls.setUnit[0].reject(new Error('Network Error'))
		await flush()
		calls.setUnit[1].resolve({ canEdit: true, unit: 'in' })

		expect(await first).toBe(true)
		expect(unit.state.value).toMatchObject({ key: 'in', status: 'saved' })
	})

	it('keeps what the server holds when the last pick fails after an earlier one saved', async () => {
		const { unit, calls } = await editable()

		const saving = unit.set('cm')
		unit.set('in')
		calls.setUnit[0].resolve({ canEdit: true, unit: 'cm' })
		await flush()
		calls.setUnit[1].reject(new Error('Network Error'))

		expect(await saving).toBe(true)
		expect(unit.chosen.value).toBe('cm')
		expect(unit.state.value).toMatchObject({ key: 'cm', status: 'failed' })
	})

	it('turns read-only when the server says the user may no longer edit the file', async () => {
		const { unit, api, calls } = await editable()

		const saving = unit.set('in')
		calls.setUnit[0].reject(Object.assign(new Error('Request failed with status code 403'), { response: { status: 403 } }))

		expect(await saving).toBe(false)
		expect(unit.state.value).toMatchObject({ canEdit: false, status: 'failed', key: 'mm' })
		expect(await unit.set('cm')).toBe(false)
		expect(api.setUnit).toHaveBeenCalledTimes(1)
	})
})
