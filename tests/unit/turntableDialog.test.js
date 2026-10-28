/**
 * The turntable dialog: its settings, its progress while recording, and what it offers
 * once a video is ready, including when it does not offer to save into Nextcloud.
 */
const { nextTick } = require('vue')
const { mountSfc } = require('./helpers/mountSfc.js')
const turntable = require('../../src/utils/turntable.js')

const davFiles = { canCreateIn: jest.fn(), listNames: jest.fn(), putFile: jest.fn() }
const MODULES = {
	'./ViewerIcon.vue': { default: { name: 'ViewerIcon', props: ['name', 'size'], template: '<i />' } },
	'../composables/useFocusTrap.js': { useFocusTrap: () => ({ activate: jest.fn(), deactivate: jest.fn() }) },
	'../utils/turntable.js': turntable,
	'../utils/davFiles.js': davFiles,
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const button = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label)

/** A recorder stand-in with the state useTurntable exposes. */
function recorderStub({ result = { blob: new Blob(['v'], { type: 'video/webm' }), extension: 'webm', complete: true } } = {}) {
	const { ref } = require('vue')
	return {
		isSupported: ref(true),
		isRecording: ref(false),
		progress: ref(0),
		stoppedReason: ref(null),
		record: jest.fn(() => Promise.resolve(result)),
		stop: jest.fn(),
	}
}

function mount(props) {
	return mountSfc('TurntableDialog', { modelName: 'cube.stl', userId: 'alice', dirPath: '/models', publicShare: false, ...props }, MODULES)
}

beforeEach(() => {
	jest.clearAllMocks()
	davFiles.canCreateIn.mockResolvedValue(true)
	davFiles.listNames.mockResolvedValue(['cube-turntable.webm'])
	davFiles.putFile.mockResolvedValue()
})
afterEach(() => document.body.replaceChildren())

test('starts with the defaults: 8 s, 720p, clockwise', () => {
	mount({ recorder: recorderStub() })
	expect(document.querySelector('#turntable-length').value).toBe('8')
	expect(document.body.textContent).toContain('8 s')
	expect(document.querySelector('#turntable-size').value).toBe('720p')
	expect(button('Clockwise').getAttribute('aria-pressed')).toBe('true')
	expect(button('Counter-clockwise').getAttribute('aria-pressed')).toBe('false')
})

test('Record records with the chosen settings, then offers Download and Save next to the model', async () => {
	const recorder = recorderStub()
	mount({ recorder })
	const length = document.querySelector('#turntable-length')
	length.value = '5'
	length.dispatchEvent(new Event('input'))
	const size = document.querySelector('#turntable-size')
	size.value = '1080p'
	size.dispatchEvent(new Event('change'))
	button('Counter-clockwise').click()
	await nextTick()
	button('Record').click()
	await flush()
	await flush()

	expect(recorder.record).toHaveBeenCalledWith({ seconds: 5, size: '1080p', direction: 'ccw' })
	expect(button('Download')).toBeTruthy()
	expect(button('Save next to the model')).toBeTruthy()
	expect(document.body.textContent).toContain('Recorded as WebM')
})

test('saving picks a free name next to the model', async () => {
	const recorder = recorderStub()
	const { events } = mount({ recorder })
	button('Record').click()
	await flush()
	await flush()
	button('Save next to the model').click()
	await flush()
	await flush()

	expect(davFiles.listNames).toHaveBeenCalledWith('alice', '/models')
	expect(davFiles.putFile).toHaveBeenCalledWith('alice', '/models', 'cube-turntable (2).webm', expect.any(Blob))
	expect(events).toContainEqual(['saved', ['cube-turntable (2).webm']])
})

test('the save option is hidden on public shares', async () => {
	mount({ recorder: recorderStub(), publicShare: true, userId: null })
	button('Record').click()
	await flush()
	await flush()
	expect(button('Download')).toBeTruthy()
	expect(button('Save next to the model')).toBeUndefined()
	expect(davFiles.canCreateIn).not.toHaveBeenCalled()
})

test('the save option is hidden without create permission', async () => {
	davFiles.canCreateIn.mockResolvedValue(false)
	mount({ recorder: recorderStub() })
	button('Record').click()
	await flush()
	await flush()
	expect(button('Save next to the model')).toBeUndefined()
})

test('stopped early shows why', async () => {
	const recorder = recorderStub({ result: { blob: new Blob(['v']), extension: 'mp4', complete: false } })
	recorder.stoppedReason.value = 'hidden'
	mount({ recorder })
	button('Record').click()
	await flush()
	await flush()
	expect(document.body.textContent).toContain('Stopped early: the tab was hidden')
	expect(document.body.textContent).toContain('Recorded as MP4')
})

test('while recording: progress and Stop', async () => {
	const recorder = recorderStub()
	recorder.isRecording.value = true
	recorder.progress.value = 0.25
	mount({ recorder })
	await nextTick()
	expect(document.body.textContent).toContain('Recording…')
	expect(document.querySelector('progress').value).toBe(0.25)
	expect(document.body.textContent).toContain('25 %')
	button('Stop').click()
	expect(recorder.stop).toHaveBeenCalled()
})

test('controls have names, and the direction toggles use aria-pressed', () => {
	mount({ recorder: recorderStub() })
	for (const control of document.querySelectorAll('input, select')) {
		expect(document.querySelector(`label[for="${control.id}"]`)).toBeTruthy()
	}
	expect([...document.querySelectorAll('button')].every((b) => b.getAttribute('type') === 'button')).toBe(true)
	const dialog = document.querySelector('[role="dialog"]')
	expect(dialog.getAttribute('aria-modal')).toBe('true')
	expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toContain('Record turntable')
	expect(document.querySelector('[aria-live="polite"]')).not.toBeNull()
})

test('the stage is announced, not every percent of the progress', async () => {
	const recorder = recorderStub()
	mount({ recorder })
	const announced = () => [...document.querySelectorAll('[aria-live="polite"]')].map((element) => element.textContent.replace(/\s+/g, ' ')).join(' ')
	const liveControls = () => [...document.querySelectorAll('[aria-live="polite"]')].some((element) => element.querySelector('progress, input, select, button'))

	recorder.isRecording.value = true
	recorder.progress.value = 0.25
	await nextTick()
	expect(announced()).toContain('Recording…')
	expect(announced()).not.toContain('25 %')
	expect(liveControls()).toBe(false)
})

test('when the video is ready, its format is announced', async () => {
	mount({ recorder: recorderStub() })
	button('Record').click()
	await flush()
	await flush()
	const announced = [...document.querySelectorAll('[aria-live="polite"]')].map((element) => element.textContent).join(' ')
	expect(announced).toContain('Recorded as WebM')
})

/** A recorder whose recording runs until the test ends it. */
function heldRecorder() {
	const recorder = recorderStub()
	let finish
	recorder.record = jest.fn(() => {
		recorder.isRecording.value = true
		return new Promise((resolve) => {
			finish = (result = { blob: new Blob(['v'], { type: 'video/webm' }), extension: 'webm', complete: true }) => {
				recorder.isRecording.value = false
				resolve(result)
			}
		})
	})
	return { recorder, finish: (result) => finish(result) }
}

test('focus moves to Stop while recording, then to Download, never to the page behind', async () => {
	const { recorder, finish } = heldRecorder()
	mount({ recorder })
	button('Record').focus()
	button('Record').click()
	await flush()
	expect(document.activeElement).toBe(button('Stop'))
	finish()
	await flush()
	await flush()
	expect(document.activeElement).toBe(button('Download'))
})

test('while saving, the dialog stays open and says so', async () => {
	let finishSave
	davFiles.putFile.mockImplementation(() => new Promise((resolve) => { finishSave = resolve }))
	const { events } = mount({ recorder: recorderStub() })
	button('Record').click()
	await flush()
	await flush()
	button('Save next to the model').click()
	await flush()
	const saving = button('Saving…')
	expect(saving).toBeTruthy()
	expect(saving.disabled).toBe(true)
	document.querySelector('.turntable-close').click()
	document.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
	document.querySelector('.turntable-backdrop').click()
	expect(events.filter(([name]) => name === 'close')).toEqual([])
	finishSave()
	await flush()
	expect(events).toContainEqual(['saved', ['cube-turntable (2).webm']])
})

test('a dialog that is gone when the recording ends asks nothing of the server', async () => {
	const { recorder, finish } = heldRecorder()
	const { unmount } = mount({ recorder })
	button('Record').click()
	await flush()
	unmount()
	finish()
	await flush()
	await flush()
	expect(davFiles.canCreateIn).not.toHaveBeenCalled()
})

test('a name taken between the listing and the save is not overwritten: the next free one is used', async () => {
	davFiles.listNames
		.mockResolvedValueOnce(['cube-turntable.webm'])
		.mockResolvedValueOnce(['cube-turntable.webm', 'cube-turntable (2).webm'])
	davFiles.putFile
		.mockRejectedValueOnce(Object.assign(new Error('Precondition Failed'), { response: { status: 412 } }))
		.mockResolvedValueOnce()
	const { events } = mount({ recorder: recorderStub() })
	button('Record').click()
	await flush()
	await flush()
	button('Save next to the model').click()
	await flush()
	await flush()
	await flush()
	expect(davFiles.putFile.mock.calls.map((call) => call[2])).toEqual(['cube-turntable (2).webm', 'cube-turntable (3).webm'])
	expect(events).toContainEqual(['saved', ['cube-turntable (3).webm']])
})
