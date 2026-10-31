/**
 * @jest-environment node
 */
/**
 * What a splat's download is held to: this device's ceiling for a .splat or .spz from the
 * start, and for a PLY once its header says it is a splat.
 */
import fs from 'node:fs'
import path from 'node:path'
import { plyDownloadLimit, splatDownloadLimit } from '../../../src/splats/downloadLimit.js'
import { SplatTooLargeError } from '../../../src/splats/splatErrors.js'
import { currentDeviceClass } from '../../../src/pointclouds/budget.js'

jest.mock('../../../src/pointclouds/budget.js', () => ({ currentDeviceClass: jest.fn(() => 'desktop') }))

const head = (dir, name) => new Uint8Array(fs.readFileSync(path.join(__dirname, '../../fixtures', dir, name))).subarray(0, 64 * 1024)

test('a splat\'s download is held to this device\'s ceiling, with a splat\'s refusal', () => {
	currentDeviceClass.mockReturnValue('tablet')
	const { ceiling, tooLarge } = splatDownloadLimit()

	expect(ceiling).toBe(512 * 1024 ** 2)
	expect(tooLarge(600 * 1024 ** 2)).toBeInstanceOf(SplatTooLargeError)
	expect(tooLarge(600 * 1024 ** 2).message).toBe('This splat is 600 MB. The viewer opens splats up to 512 MB on this device.')
})

test('a PLY is held to it once its header says it is a splat, and only then', () => {
	currentDeviceClass.mockReturnValue('desktop')

	expect(plyDownloadLimit(head('splats', 'grid.ply'))?.ceiling).toBe(1024 ** 3)
	expect(plyDownloadLimit(head('splats', 'grid-sh3.ply'))?.ceiling).toBe(1024 ** 3)
	expect(plyDownloadLimit(head('pointclouds', 'points-binary-le.ply'))).toBeNull()
	expect(plyDownloadLimit(new TextEncoder().encode('not a ply at all'))).toBeNull()
})
