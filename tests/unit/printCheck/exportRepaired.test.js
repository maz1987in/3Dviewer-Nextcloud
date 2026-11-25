/**
 * Handing the repaired model over: the name it takes, a download, a save next to the model
 * that never replaces a file, and what it says when the server refuses.
 */
import { exportRepairedModel, repairedName } from '../../../src/printCheck/exportRepaired.js'
import { saveNewFile } from '../../../src/utils/davFiles.js'

jest.mock('@nextcloud/l10n', () => ({ translate: (_app, text, vars = {}) => text.replace(/{(\w+)}/g, (_, key) => String(vars[key])) }), { virtual: true })
jest.mock('../../../src/utils/davFiles.js', () => ({
	...jest.requireActual('../../../src/utils/davFiles.js'),
	saveNewFile: jest.fn(),
}))
jest.mock('../../../src/utils/logger.js', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }))

const FILE = { blob: new Blob(['solid']), extension: 'stl' }

function setup(file = FILE) {
	const notify = jest.fn()
	const download = jest.fn()
	const check = { buildRepairedFile: jest.fn().mockResolvedValue(file) }
	const run = (extra = {}) => exportRepairedModel({ check, format: 'stl', save: false, userId: 'alice', folder: '/models', modelName: 'bracket.v2.stl', notify, download, ...extra })
	return { notify, download, check, run }
}

beforeEach(() => jest.clearAllMocks())

test('the name is the model\'s, without its last extension, then (repaired)', () => {
	expect(repairedName('bracket.stl')).toBe('bracket (repaired)')
	expect(repairedName('bracket.v2.stl')).toBe('bracket.v2 (repaired)')
	expect(repairedName('noextension')).toBe('noextension (repaired)')
	expect(repairedName('')).toBe('model (repaired)')
	expect(repairedName(undefined)).toBe('model (repaired)')
})

test('a download is named for the model and says so', async () => {
	const { run, download, notify, check } = setup()
	await run({ format: '3mf' })
	expect(check.buildRepairedFile).toHaveBeenCalledWith('3mf')
	expect(download).toHaveBeenCalledWith(FILE.blob, 'bracket.v2 (repaired).stl')
	expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', message: 'Model exported as bracket.v2 (repaired).stl' }))
	expect(saveNewFile).not.toHaveBeenCalled()
})

test('a save asks for a name nothing in the folder has, so it never replaces a file', async () => {
	saveNewFile.mockImplementation(async (userId, folder, nameFor) => nameFor(['bracket.v2.stl', 'bracket.v2 (repaired).stl']))
	const { run, download, notify } = setup()
	await run({ save: true })
	expect(saveNewFile).toHaveBeenCalledWith('alice', '/models', expect.any(Function), FILE.blob)
	expect(download).not.toHaveBeenCalled()
	expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', message: 'Saved bracket.v2 (repaired) (2).stl next to the model', timeout: 5000 }))
})

test('the first save has the plain name', async () => {
	saveNewFile.mockImplementation(async (userId, folder, nameFor) => nameFor(['bracket.v2.stl']))
	const { run, notify } = setup()
	await run({ save: true })
	expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'Saved bracket.v2 (repaired).stl next to the model' }))
})

test('a full Nextcloud says so and says to download instead', async () => {
	saveNewFile.mockRejectedValue(Object.assign(new Error('Insufficient Storage'), { response: { status: 507 } }))
	const { run, notify, download } = setup()
	await run({ save: true })
	expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'There isn\'t enough space in your Nextcloud to save it. Download it instead.' }))
	expect(download).not.toHaveBeenCalled()
})

test('a folder that no longer takes files says so', async () => {
	saveNewFile.mockRejectedValue(Object.assign(new Error('Forbidden'), { response: { status: 403 } }))
	const { run, notify } = setup()
	await run({ save: true })
	expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'You can no longer add files to this folder. Download it instead.' }))
})

test('a repaired model with nothing in it is not written', async () => {
	const { run, notify, download } = setup(null)
	await run({ format: '3mf' })
	expect(download).not.toHaveBeenCalled()
	expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'This model has no surfaces to save as 3MF.' }))
})

test('a file that could not be made says why', async () => {
	const { run, notify, check } = setup()
	check.buildRepairedFile.mockRejectedValue(new Error('out of memory'))
	await run()
	expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'out of memory' }))
})
