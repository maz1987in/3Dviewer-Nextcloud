/**
 * Which way is up for the open scan: its format's default until the server says what was
 * saved for the file, and saved for everyone by those who can edit it.
 */
import { useFileUp } from '../../../src/composables/useFileUp.js'

/** An API double whose answers the test resolves by hand. */
function deferredApi() {
	const calls = { get: [], setUp: [] }
	const api = {
		get: jest.fn(() => new Promise((resolve, reject) => calls.get.push({ resolve, reject }))),
		setUp: jest.fn((up) => new Promise((resolve, reject) => calls.setUp.push({ up, resolve, reject }))),
	}
	return { api, calls }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test('starts at the format\'s default, with no rights', () => {
	const up = useFileUp()
	up.describe('+z')

	expect(up.state.value).toEqual({ up: '+z', saved: null, defaultUp: '+z', canEdit: false, status: '' })
})

test('takes what was saved for the file, and who may change it', async () => {
	const up = useFileUp()
	up.describe('+y')
	const { api, calls } = deferredApi()

	const loading = up.load(api)
	calls.get[0].resolve({ canEdit: true, unit: null, up: '-z' })

	expect(await loading).toBe(true)
	expect(up.state.value).toMatchObject({ up: '-z', saved: '-z', canEdit: true })
})

test('nothing saved keeps the default', async () => {
	const up = useFileUp()
	up.describe('+z')
	const { api, calls } = deferredApi()

	const loading = up.load(api)
	calls.get[0].resolve({ canEdit: false, unit: null, up: null })

	expect(await loading).toBe(false)
	expect(up.state.value).toMatchObject({ up: '+z', saved: null, canEdit: false })
})

test('an answer for a scan since replaced is dropped', async () => {
	const up = useFileUp()
	up.describe('+y')
	const { api, calls } = deferredApi()

	const loading = up.load(api)
	up.describe('+z')
	calls.get[0].resolve({ canEdit: true, up: '-y' })

	expect(await loading).toBe(false)
	expect(up.state.value.up).toBe('+z')
})

test('picks made in quick succession save one at a time, ending on the last', async () => {
	const up = useFileUp()
	up.describe('+y')
	const { api, calls } = deferredApi()
	const loading = up.load(api)
	calls.get[0].resolve({ canEdit: true, up: null })
	await loading

	const first = up.set('+z')
	up.set('-z')
	up.set('-y')
	expect(up.state.value.status).toBe('saving')
	expect(calls.setUp).toHaveLength(1)
	calls.setUp[0].resolve({ canEdit: true, up: '+z' })
	await settle()
	expect(calls.setUp.map((call) => call.up)).toEqual(['+z', '-y'])
	calls.setUp[1].resolve({ canEdit: true, up: '-y' })

	expect(await first).toBe(true)
	expect(up.state.value).toMatchObject({ up: '-y', saved: '-y', status: 'saved' })
})

test('a 403 drops the right to change it, and keeps what was there', async () => {
	const up = useFileUp()
	up.describe('+y')
	const { api, calls } = deferredApi()
	const loading = up.load(api)
	calls.get[0].resolve({ canEdit: true, up: '+z' })
	await loading

	const saving = up.set('-y')
	calls.setUp[0].reject(Object.assign(new Error('Forbidden'), { response: { status: 403 } }))

	expect(await saving).toBe(false)
	expect(up.state.value).toMatchObject({ up: '+z', canEdit: false, status: 'failed' })
})

test('refuses a value that isn\'t a direction, or a save without rights', async () => {
	const up = useFileUp()
	up.describe('+y')

	expect(await up.set('+z')).toBe(false)
	const { api, calls } = deferredApi()
	const loading = up.load(api)
	calls.get[0].resolve({ canEdit: true, up: null })
	await loading
	expect(await up.set('sideways')).toBe(false)
	expect(api.setUp).not.toHaveBeenCalled()
})
