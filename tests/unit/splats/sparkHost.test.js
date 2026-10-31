/**
 * @jest-environment node
 */
/**
 * A scene that holds a splat gets a SparkRenderer of its own, beside the model rather than
 * in it, and a way to wait for the sort before drawing a frame it renders itself.
 */
import * as THREE from 'three'
import { SparkRenderer } from '@sparkjsdev/spark'
import { attachSpark } from '../../../src/splats/sparkHost.js'

jest.mock('@sparkjsdev/spark', () => {
	class SparkRenderer extends jest.requireActual('three').Mesh {

		static made = []

		constructor(options) {
			super()
			this.options = options
			this.updates = []
			this.disposed = false
			SparkRenderer.made.push(this)
		}

		update(args) {
			let finish
			const done = new Promise((resolve) => { finish = resolve })
			this.updates.push({ args, finish })
			return done
		}

		dispose() {
			this.disposed = true
		}

	}
	return { SparkRenderer }
})

beforeEach(() => {
	SparkRenderer.made = []
})

test('the SparkRenderer joins the scene, not the model', async () => {
	const scene = new THREE.Scene()
	const renderer = {}

	const host = await attachSpark(scene, renderer)

	expect(SparkRenderer.made).toHaveLength(1)
	expect(host.spark.parent).toBe(scene)
	expect(host.spark.options.renderer).toBe(renderer)
})

test('prepare waits for the sort of that camera\'s view', async () => {
	const scene = new THREE.Scene()
	const camera = new THREE.PerspectiveCamera()
	const host = await attachSpark(scene, {})

	let done = false
	const preparing = host.prepare(camera).then(() => { done = true })
	await Promise.resolve()

	expect(host.spark.updates[0].args).toEqual({ scene, camera })
	expect(done).toBe(false)
	host.spark.updates[0].finish()
	await preparing
	expect(done).toBe(true)
})

test('dispose takes it out of the scene and frees it', async () => {
	const scene = new THREE.Scene()
	const host = await attachSpark(scene, {})

	host.dispose()

	expect(host.spark.parent).toBeNull()
	expect(host.spark.disposed).toBe(true)
})
