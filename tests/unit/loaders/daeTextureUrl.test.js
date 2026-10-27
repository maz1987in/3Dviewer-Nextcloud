/**
 * Where the COLLADA loader takes a texture from.
 *
 * An `<init_from>` exported on Windows names a path on the author's machine, or a
 * percent-encoded file: URL. The companion was fetched by its bare, decoded name, so the
 * loading manager maps a request to it by that name. Anything it was not given goes back
 * unchanged: on a page nothing loads it, and in the thumbnail worker the worker's
 * resolver refuses it.
 */

import * as THREE from 'three'
import DaeLoader from '../../../src/loaders/types/dae.js'

let colladaManager = null

jest.mock('three/examples/jsm/loaders/ColladaLoader.js', () => ({
	ColladaLoader: jest.fn().mockImplementation((manager) => {
		colladaManager = manager
		return {
			parse: () => {
				const { Group, Mesh, BoxGeometry } = jest.requireActual('three')
				const scene = new Group()
				scene.add(new Mesh(new BoxGeometry()))
				return { scene }
			},
		}
	}),
}))

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

/** A 1×1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

describe('DAE loader texture URLs', () => {
	beforeEach(async () => {
		colladaManager = null
		await new DaeLoader().loadModel(new TextEncoder().encode('<COLLADA/>').buffer, {
			THREE,
			additionalFiles: [
				new File([PNG], 'wood.png', { type: 'image/png' }),
				new File([PNG], 'wood grain.png', { type: 'image/png' }),
			],
		})
	})

	it.each([
		['relative', 'textures/wood.png'],
		['drive letter', 'C:\\Users\\anna\\Desktop\\textures\\wood.png'],
		['leading slash', '/home/anna/wood.png'],
		['UNC', '\\\\server\\share\\WOOD.PNG'],
		['file: URL', 'file:///C:/textures/wood.png'],
		['percent-encoded file: URL', 'file:///C:/My%20Textures/wood%20grain.png'],
	])('maps a %s request to the companion of that name', (_, url) => {
		expect(colladaManager.resolveURL(url)).toMatch(/^data:image\/png;base64,/)
	})

	it('hands back a request for a file it was not given, unchanged', () => {
		expect(colladaManager.resolveURL('C:\\textures\\other.png')).toBe('C:\\textures\\other.png')
		expect(colladaManager.resolveURL('file:///C:/x/other.png')).toBe('file:///C:/x/other.png')
	})
})
