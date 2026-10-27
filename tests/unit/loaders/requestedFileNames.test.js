/**
 * A loader asks for a texture by the reference the model wrote, `C:\textures\wood.jpg`
 * or a percent-encoded `file:` URL, while its companion was fetched under the bare,
 * decoded name normaliseRef() gives it. These are the names the request is matched by.
 */
import { requestedFileNames } from '../../../src/loaders/BaseLoader.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

describe('requestedFileNames', () => {
	it('takes the last segment after either separator', () => {
		expect(requestedFileNames('C:\\Users\\anna\\textures\\wood.jpg')).toEqual(['wood.jpg'])
		expect(requestedFileNames('\\\\server\\share\\wood.jpg')).toEqual(['wood.jpg'])
		expect(requestedFileNames('/home/anna/wood.jpg')).toEqual(['wood.jpg'])
		expect(requestedFileNames('wood.jpg')).toEqual(['wood.jpg'])
	})

	it('adds the decoded name when the request is percent-encoded', () => {
		expect(requestedFileNames('file:///C:/My%20Textures/wood%20grain.jpg')).toEqual(['wood%20grain.jpg', 'wood grain.jpg'])
	})

	it('keeps a malformed escape as written', () => {
		expect(requestedFileNames('file:///C:/x/100%.png')).toEqual(['100%.png'])
	})
})
