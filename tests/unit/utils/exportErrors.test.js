/**
 * What the viewer says when saving an export next to the model fails, by the server's answer.
 */
import { ExportSaveError, NothingToExportError, exportSaveFailure } from '../../../src/utils/exportErrors.js'

test('a full Nextcloud, a folder no longer open to new files, and anything else each get their own words', () => {
	expect(exportSaveFailure({ response: { status: 507 } })).toBe('There isn\'t enough space in your Nextcloud to save it. Download it instead.')
	expect(exportSaveFailure({ response: { status: 403 } })).toBe('You can no longer add files to this folder. Download it instead.')
	expect(exportSaveFailure({ response: { status: 401 } })).toBe('You can no longer add files to this folder. Download it instead.')
	expect(exportSaveFailure({ response: { status: 500 } })).toBe('Couldn\'t save the file next to the model. Download it instead.')
	expect(exportSaveFailure(new Error('Network Error'))).toBe('Couldn\'t save the file next to the model. Download it instead.')
	expect(exportSaveFailure(null)).toBe('Couldn\'t save the file next to the model. Download it instead.')
})

test('ExportSaveError keeps the failed request as its cause', () => {
	const cause = Object.assign(new Error('Insufficient Storage'), { response: { status: 507 } })
	const error = new ExportSaveError(cause)
	expect(error).toBeInstanceOf(Error)
	expect(error.name).toBe('ExportSaveError')
	expect(error.cause).toBe(cause)
	expect(error).not.toBeInstanceOf(NothingToExportError)
})
