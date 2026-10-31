/**
 * @jest-environment node
 */
/**
 * Reading a splat: Spark parses it, the loader thins it to the device and gives it a box
 * the rest of the viewer can measure. Spark is stood in for here; it runs for real in
 * tests/playwright/splats.spec.ts.
 */
import * as THREE from 'three'
import { PackedSplats, SplatFileType, SplatMesh } from '@sparkjsdev/spark'
import { loadSplat } from '../../../src/splats/loadSplat.js'
import { EmptySplatError, SplatError } from '../../../src/splats/splatErrors.js'
import { evenIndices, splatBounds } from '../../../src/splats/splatBounds.js'

jest.mock('@sparkjsdev/spark', () => {
	const at = (i) => [i % 10, Math.floor(i / 10) % 10, Math.floor(i / 100)]
	class PackedSplats {

		static made = []
		static numSplats = 1000
		static sh = false
		static fail = null
		static hold = null

		constructor(options = {}) {
			this.options = options
			this.disposed = false
			PackedSplats.made.push(this)
			if (options.packedArray) {
				// Made from rows, as thinning makes one: each row's first word is the splat it was
				this.numSplats = options.numSplats
				this.packedArray = options.packedArray
				this.extra = options.extra
				this.centres = Array.from({ length: this.numSplats }, (_, i) => at(options.packedArray[i * 4]))
				this.initialized = Promise.resolve(this)
				return
			}
			const count = PackedSplats.numSplats
			this.centres = Array.from({ length: count }, (_, i) => at(i))
			this.numSplats = count
			this.packedArray = Uint32Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? i / 4 : 0))
			this.extra = PackedSplats.sh ? { sh1: new Uint32Array(count * 2).fill(7) } : {}
			this.splatEncoding = { rgbMin: 0, rgbMax: 1 }
			this.initialized = (PackedSplats.hold ?? Promise.resolve()).then(() => {
				if (PackedSplats.fail) {
					throw PackedSplats.fail
				}
				return this
			})
		}

		getSplat(i) {
			return { center: new (jest.requireActual('three').Vector3)(...this.centres[i]) }
		}

		dispose() {
			this.disposed = true
		}

	}
	class SplatMesh extends jest.requireActual('three').Object3D {

		static onMake = null
		static fail = null

		constructor({ packedSplats }) {
			super()
			this.packedSplats = packedSplats
			this.disposed = false
			SplatMesh.onMake?.(this)
			this.initialized = SplatMesh.fail ? Promise.reject(SplatMesh.fail) : Promise.resolve(this)
		}

		dispose() {
			this.disposed = true
			this.packedSplats.dispose()
		}

	}
	return { PackedSplats, SplatMesh, SplatFileType: { SPLAT: 'splat', KSPLAT: 'ksplat' } }
})

const bytes = new Uint8Array(8)

beforeEach(() => {
	PackedSplats.made = []
	PackedSplats.numSplats = 1000
	PackedSplats.sh = false
	PackedSplats.fail = null
	PackedSplats.hold = null
	SplatMesh.onMake = null
	SplatMesh.fail = null
})

test('a .splat is named as one; a .spz and a .ply are left for Spark to recognise', async () => {
	await loadSplat(bytes, { format: 'splat', budget: 8_000_000 })
	await loadSplat(bytes, { format: 'spz', budget: 8_000_000 })

	expect(PackedSplats.made[0].options).toMatchObject({ fileBytes: bytes, fileType: SplatFileType.SPLAT, fileName: 'splat.splat' })
	expect(PackedSplats.made[1].options.fileType).toBeUndefined()
	expect(PackedSplats.made[1].options.fileName).toBe('splat.spz')
})

test('under the budget, the splats are drawn as Spark read them', async () => {
	const root = await loadSplat(bytes, { format: 'ply', budget: 8_000_000 })
	const mesh = root.children.find((c) => c instanceof SplatMesh)

	expect(mesh.packedSplats).toBe(PackedSplats.made[0])
	expect(PackedSplats.made[0].disposed).toBe(false)
	expect(root.userData.tdvSplat).toEqual({ format: 'ply', count: 1000, total: 1000, unit: 'm', defaultUp: '+y', up: '+y' })
})

test('thins to the budget', async () => {
	PackedSplats.numSplats = 4000

	const root = await loadSplat(bytes, { format: 'spz', budget: 1000 })
	const read = PackedSplats.made[0]
	const drawn = root.children.find((c) => c instanceof SplatMesh).packedSplats

	expect(drawn).not.toBe(read)
	expect(drawn.numSplats).toBe(1000)
	expect(Array.from({ length: 1000 }, (_, i) => drawn.packedArray[i * 4])).toEqual(Array.from(evenIndices(4000, 1000)))
	expect(read.disposed).toBe(true)
	expect(root.userData.tdvSplat).toEqual({ format: 'spz', count: 1000, total: 4000, unit: 'm', defaultUp: '+y', up: '+y' })
})

test('a thinned splat keeps the colour that changes with the view', async () => {
	PackedSplats.numSplats = 4000
	PackedSplats.sh = true

	const root = await loadSplat(bytes, { format: 'ply', budget: 1000 })
	const drawn = root.children.find((c) => c instanceof SplatMesh).packedSplats

	expect(drawn.extra.sh1).toHaveLength(2000)
	expect(drawn.extra.sh1.every((word) => word === 7)).toBe(true)
})

test('a Blob is streamed to Spark, never copied whole on the page', async () => {
	const blob = new Blob([bytes])

	await loadSplat(blob, { format: 'splat', budget: 8_000_000 })

	const { options } = PackedSplats.made[0]
	expect(options.fileBytes).toBeUndefined()
	expect(options.stream).toBeInstanceOf(ReadableStream)
	expect(options.streamLength).toBe(8)
	expect(options).toMatchObject({ fileType: SplatFileType.SPLAT, fileName: 'splat.splat' })
})

test('the root carries a box the rest of the viewer can measure, and nothing draws it', async () => {
	const root = await loadSplat(bytes, { format: 'splat', budget: 8_000_000 })
	const box = root.getObjectByName('tdv-splat-bounds')

	expect(box).toBeInstanceOf(THREE.Mesh)
	expect(box.visible).toBe(false)
	expect(box.layers.isEnabled(31)).toBe(true)
	expect(box.layers.isEnabled(0)).toBe(false)
	expect(box.userData.tdvBoundsProxy).toBe(true)
	expect(new THREE.Box3().setFromObject(root).equals(splatBounds(PackedSplats.made[0]))).toBe(true)
})

test('a file with no splats', async () => {
	PackedSplats.numSplats = 0

	await expect(loadSplat(bytes, { format: 'spz', budget: 1000 })).rejects.toBeInstanceOf(EmptySplatError)
})

test('a file Spark refuses keeps Spark\'s error as the cause', async () => {
	const refusal = new Error('Invalid SPZ header')
	PackedSplats.fail = refusal

	const error = await loadSplat(bytes, { format: 'spz', budget: 1000 }).catch((e) => e)

	expect(error).toBeInstanceOf(SplatError)
	expect(error.cause).toBe(refusal)
})

test('abort drops a late result and disposes it', async () => {
	let finish
	PackedSplats.hold = new Promise((resolve) => { finish = resolve })
	const controller = new AbortController()

	const loading = loadSplat(bytes, { format: 'splat', budget: 1000, signal: controller.signal })
	// Once Spark is parsing
	while (!PackedSplats.made.length) {
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
	controller.abort()

	await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
	expect(PackedSplats.made[0].disposed).toBe(false)
	finish()
	await PackedSplats.made[0].initialized
	await Promise.resolve()
	expect(PackedSplats.made[0].disposed).toBe(true)
})

test('an aborted signal stops before Spark is asked', async () => {
	const controller = new AbortController()
	controller.abort()

	await expect(loadSplat(bytes, { format: 'splat', budget: 1000, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
	expect(PackedSplats.made).toHaveLength(0)
})

test('a cancel that comes as the splats become a mesh still frees them', async () => {
	const controller = new AbortController()
	SplatMesh.onMake = () => controller.abort()

	await expect(loadSplat(bytes, { format: 'splat', budget: 1000, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
	await Promise.resolve()
	expect(PackedSplats.made[0].disposed).toBe(true)
})

test('a mesh Spark can\'t make is a splat that couldn\'t be read', async () => {
	const refusal = new Error('texture too large')
	SplatMesh.fail = refusal

	const error = await loadSplat(bytes, { format: 'spz', budget: 1000 }).catch((e) => e)

	expect(error).toBeInstanceOf(SplatError)
	expect(error.cause).toBe(refusal)
})
