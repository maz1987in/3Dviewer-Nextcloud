/**
 * Where the FBX loader takes a texture from.
 *
 * three's FBXLoader turns an image embedded in a Video node's Content into a blob: URL
 * (binary FBX) or a data: URL (ASCII FBX) and loads the texture from it, through the
 * loading manager's URL modifier. Looked up by name, such a URL matched no companion and
 * the texture got the 1x1 placeholder, so an FBX with embedded textures rendered
 * untextured in the viewer and in the background worker.
 */

import FbxLoader from '../../../src/loaders/types/fbx.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const PLACEHOLDER_PREFIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAf'

describe('FbxLoader.resolveTextureUrl', () => {
	const loader = new FbxLoader()

	it('loads an embedded image from the blob: URL three made for it', () => {
		const url = 'blob:https://cloud.example.com/0b6c3c4e-5d1e-4c43-9a51-6a1d1f0e2a7b'

		expect(loader.resolveTextureUrl(url, new Map(), [])).toBe(url)
	})

	it('loads an embedded image from the data: URL three made for it', () => {
		const url = 'data:image/png;base64,iVBORw0KGgo/AAAA+/x=='

		expect(loader.resolveTextureUrl(url, new Map(), [])).toBe(url)
	})

	it('still maps a named texture to its companion', () => {
		const dataUris = new Map([['wood.png', 'data:image/png;base64,V09PRA==']])

		expect(loader.resolveTextureUrl('textures/wood.png', dataUris, [new File(['x'], 'wood.png')]))
			.toBe('data:image/png;base64,V09PRA==')
	})

	it('maps a texture named by an absolute path or a file: URL by its decoded name', () => {
		const dataUris = new Map([
			['wood.png', 'data:image/png;base64,V09PRA=='],
			['wood grain.png', 'data:image/png;base64,R1JBSU4='],
		])
		const files = [new File(['x'], 'wood.png'), new File(['x'], 'wood grain.png')]

		expect(loader.resolveTextureUrl('C:\\Users\\anna\\wood.png', dataUris, files)).toBe('data:image/png;base64,V09PRA==')
		expect(loader.resolveTextureUrl('/home/anna/wood.png', dataUris, files)).toBe('data:image/png;base64,V09PRA==')
		expect(loader.resolveTextureUrl('file:///C:/My%20Textures/wood%20grain.png', dataUris, files))
			.toBe('data:image/png;base64,R1JBSU4=')
	})

	it('still gives a named texture that was not shipped the placeholder', () => {
		expect(loader.resolveTextureUrl('missing.png', new Map(), []).startsWith(PLACEHOLDER_PREFIX)).toBe(true)
	})
})
