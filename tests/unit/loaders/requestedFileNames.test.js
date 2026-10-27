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

	it('tries a file: URL\'s decoded name first, the name its companion was fetched by', () => {
		expect(requestedFileNames('file:///C:/My%20Textures/wood%20grain.jpg')).toEqual(['wood grain.jpg', 'wood%20grain.jpg'])
	})

	it('tries any other reference\'s name as written first', () => {
		expect(requestedFileNames('textures/wood%20grain.jpg')).toEqual(['wood%20grain.jpg', 'wood grain.jpg'])
	})

	it('drops a file: URL\'s query and fragment, as the declaration does', () => {
		expect(requestedFileNames('file:///C:/x/wood.jpg?v=2#top')).toEqual(['wood.jpg'])
		expect(requestedFileNames('file:///C:/x/wood%20grain.jpg#top')).toEqual(['wood grain.jpg', 'wood%20grain.jpg'])
	})

	it('keeps # and ? in any other reference, where they may be part of the name', () => {
		expect(requestedFileNames('C:\\x\\wood#1.jpg')).toEqual(['wood#1.jpg'])
		expect(requestedFileNames('textures/what?.png')).toEqual(['what?.png'])
	})

	it('takes the last segment of a reference whose separators are encoded, as it was fetched by', () => {
		expect(requestedFileNames('..%2F..%2Fmaps%2Fwood.png')).toEqual(['..%2F..%2Fmaps%2Fwood.png', '../../maps/wood.png', 'wood.png'])
		expect(requestedFileNames('%2Fhome%2Fanna%2Fwood.png')).toContain('wood.png')
		expect(requestedFileNames('C:%5Cx%5Cwood.png')).toContain('wood.png')
		expect(requestedFileNames('https://cloud.example.com/apps/..%2F..%2Fmaps%2Fwood%20grain.png')).toContain('wood grain.png')
	})

	it('does not split a file: URL\'s name on an encoded separator, as no file name holds one', () => {
		expect(requestedFileNames('file:///C:/x/a%2Fwood.png')).toEqual(['a/wood.png', 'a%2Fwood.png'])
	})

	it('keeps a malformed escape as written', () => {
		expect(requestedFileNames('file:///C:/x/100%.png')).toEqual(['100%.png'])
	})
})
