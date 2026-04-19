/**
 * Unit tests for the dotbim (.bim) loader.
 *
 * Exercises the pure build() path — parsed JSON → THREE.Group — so we can
 * run in jsdom without requiring a full Three.js render context.
 */
import { TextDecoder, TextEncoder } from 'node:util'
import DotBimLoader from '../../../src/loaders/types/dotbim.js'

// Older jest-environment-jsdom versions don't expose TextDecoder/TextEncoder
// as globals; our loadModel() path decodes the ArrayBuffer with TextDecoder
// and our test helper encodes fixture strings. In production browsers both
// are standard Web APIs.
if (typeof globalThis.TextDecoder === 'undefined') {
	globalThis.TextDecoder = TextDecoder
}
if (typeof globalThis.TextEncoder === 'undefined') {
	globalThis.TextEncoder = TextEncoder
}

function makeLoader() {
	return new DotBimLoader()
}

// A minimal valid dotbim document: one quad mesh referenced by two
// translated+rotated element instances with different colors.
const MINIMAL_DOC = {
	schema_version: '1.0.0',
	meshes: [
		{
			mesh_id: 0,
			coordinates: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
			indices: [0, 1, 2, 0, 2, 3],
		},
	],
	elements: [
		{
			mesh_id: 0,
			vector: { x: 0, y: 0, z: 0 },
			rotation: { qx: 0, qy: 0, qz: 0, qw: 1 },
			guid: '76e051c5-1cb4-4d1e-8c23-2a3b4c5d6e7f',
			type: 'Plate',
			color: { r: 255, g: 100, b: 50, a: 255 },
			info: { Name: 'FloorPanel_A' },
		},
		{
			mesh_id: 0,
			vector: { x: 2, y: 0, z: 0 },
			rotation: { qx: 0, qy: 0, qz: 0.7071, qw: 0.7071 },
			guid: 'aa11bb22-cc33-dd44-ee55-ff6677889900',
			type: 'Plate',
			color: { r: 50, g: 200, b: 100, a: 200 },
			info: {},
		},
	],
	info: { Author: 'test' },
}

describe('dotbim parser', () => {
	test('instances a shared mesh_id across multiple elements', () => {
		const { group, meshCount, elementCount } = makeLoader().build(MINIMAL_DOC)
		expect(meshCount).toBe(1)
		expect(elementCount).toBe(2)
		expect(group.children.length).toBe(2)
	})

	test('applies element translation + rotation from vector + quaternion', () => {
		const { group } = makeLoader().build(MINIMAL_DOC)
		const [a, b] = group.children
		expect(a.position.x).toBe(0)
		expect(b.position.x).toBe(2)
		// First element has identity quaternion.
		expect(a.quaternion.w).toBe(1)
		// Second element has a 90° Z rotation.
		expect(b.quaternion.z).toBeCloseTo(0.7071, 3)
		expect(b.quaternion.w).toBeCloseTo(0.7071, 3)
	})

	test('element color is applied as material color (rgba → hex)', () => {
		const { group } = makeLoader().build(MINIMAL_DOC)
		const [a] = group.children
		// r=255, g=100, b=50 → 0xff6432
		expect(a.material.color.getHex()).toBe(0xff6432)
	})

	test('element with a<255 is rendered transparent', () => {
		const { group } = makeLoader().build(MINIMAL_DOC)
		const [, b] = group.children
		expect(b.material.transparent).toBe(true)
		expect(b.material.opacity).toBeCloseTo(200 / 255, 3)
	})

	test('tolerates null rotation (legacy exporters)', () => {
		const doc = JSON.parse(JSON.stringify(MINIMAL_DOC))
		doc.elements[0].rotation = null
		const { group } = makeLoader().build(doc)
		expect(group.children[0].quaternion.w).toBe(1)
	})

	test('tolerates omitted rotation entirely', () => {
		const doc = JSON.parse(JSON.stringify(MINIMAL_DOC))
		delete doc.elements[0].rotation
		const { group } = makeLoader().build(doc)
		expect(group.children[0].quaternion.w).toBe(1)
	})

	test('skips element when mesh_id has no matching mesh', () => {
		const doc = JSON.parse(JSON.stringify(MINIMAL_DOC))
		doc.elements.push({
			mesh_id: 999,
			vector: { x: 0, y: 0, z: 0 },
			rotation: { qx: 0, qy: 0, qz: 0, qw: 1 },
			color: { r: 0, g: 0, b: 0, a: 255 },
		})
		const { group, elementCount } = makeLoader().build(doc)
		expect(elementCount).toBe(2)
		expect(group.children.length).toBe(2)
	})

	test('stores metadata (guid, type, info) on mesh userData.dotbim', () => {
		const { group } = makeLoader().build(MINIMAL_DOC)
		const a = group.children[0]
		expect(a.userData.dotbim.guid).toBe('76e051c5-1cb4-4d1e-8c23-2a3b4c5d6e7f')
		expect(a.userData.dotbim.type).toBe('Plate')
		expect(a.userData.dotbim.info.Name).toBe('FloorPanel_A')
	})

	// Node's Buffer.from(...).buffer returns the full backing ArrayBuffer
	// (shared across many Buffers), not a tight slice of just our bytes.
	// Wrap into an isolated ArrayBuffer so TextDecoder only sees our payload.
	function bufOf(str) {
		const enc = new TextEncoder()
		return enc.encode(str).buffer
	}

	test('loadModel rejects non-JSON input', async () => {
		await expect(makeLoader().loadModel(bufOf('not json at all'), { THREE: null }))
			.rejects.toThrow(/JSON parse failed/)
	})

	test('loadModel rejects JSON missing meshes/elements', async () => {
		await expect(makeLoader().loadModel(bufOf('{"schema_version":"1.0.0"}'), { THREE: null }))
			.rejects.toThrow(/missing required/)
	})
})
