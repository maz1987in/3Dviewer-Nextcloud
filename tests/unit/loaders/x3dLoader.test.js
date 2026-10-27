/**
 * The X3D loader maps an ImageTexture through three's TextureLoader.
 *
 * It used to decode each texture into an `new Image()` of its own. The background
 * thumbnail worker has no Image, so a textured X3D failed there with "Image is not
 * defined"; three's ImageLoader is what the worker replaces with a bitmap decoder. On the
 * page TextureLoader still decodes through an <img>, as before.
 */

import * as THREE from 'three'
import X3dLoader from '../../../src/loaders/types/x3d.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const QUAD = `<?xml version="1.0" encoding="UTF-8"?>
<X3D profile="Interchange" version="3.3"><Scene><Shape>
<Appearance><Material diffuseColor="0.8 0.8 0.8"/><ImageTexture url='"textures/checker.png" "https://example.invalid/checker.png"'/></Appearance>
<IndexedFaceSet coordIndex="0 1 2 3 -1" texCoordIndex="0 1 2 3 -1"><Coordinate point="0 0 0 1 0 0 1 1 0 0 1 0"/><TextureCoordinate point="0 0 1 0 1 1 0 1"/></IndexedFaceSet>
</Shape></Scene></X3D>`

/** A 1×1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const buffer = text => new TextEncoder().encode(text).buffer

/**
 * @param {object} object3D - Loaded model
 * @return {THREE.Material[]} The material of every mesh
 */
function materials(object3D) {
	const found = []
	object3D.traverse((child) => {
		if (child.isMesh) {
			found.push(child.material)
		}
	})
	return found
}

describe('X3D loader textures', () => {
	let load
	let image

	beforeEach(() => {
		load = jest.spyOn(THREE.TextureLoader.prototype, 'load')
		image = global.Image
	})

	afterEach(() => {
		load.mockRestore()
		global.Image = image
	})

	it('loads a handed texture through TextureLoader, with no Image global', async () => {
		delete global.Image

		const result = await new X3dLoader().loadModel(buffer(QUAD), {
			THREE,
			additionalFiles: [new File([PNG], 'checker.png', { type: 'image/png' })],
		})

		const [material] = materials(result.object3D)
		expect(material.map).toBeInstanceOf(THREE.Texture)
		expect(material.map.colorSpace).toBe(THREE.SRGBColorSpace)
		expect(load).toHaveBeenCalledTimes(1)
		// The handed file, as a data: URI; never the URL the model wrote
		expect(load.mock.calls[0][0]).toMatch(/^data:image\/png;base64,/)
	})

	it('maps a url written as an absolute path or a file: URL by its decoded name', async () => {
		const absolute = QUAD.replace(
			'"textures/checker.png" "https://example.invalid/checker.png"',
			'"file:///C:/My%20Textures/checker%20board.png"',
		)

		const result = await new X3dLoader().loadModel(buffer(absolute), {
			THREE,
			additionalFiles: [new File([PNG], 'checker board.png', { type: 'image/png' })],
		})

		const [material] = materials(result.object3D)
		expect(material.map).toBeInstanceOf(THREE.Texture)
		expect(load.mock.calls[0][0]).toMatch(/^data:image\/png;base64,/)
	})

	it('leaves a texture it was not handed off, without loading anything', async () => {
		const result = await new X3dLoader().loadModel(buffer(QUAD), { THREE, additionalFiles: [] })

		const [material] = materials(result.object3D)
		expect(material.map).toBeNull()
		expect(load).not.toHaveBeenCalled()
	})
})
