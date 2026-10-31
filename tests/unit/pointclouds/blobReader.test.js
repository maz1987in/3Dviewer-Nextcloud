/**
 * @jest-environment node
 */
/**
 * Reading a scan without holding it in the JS heap: windows and ranges from a Blob, and a
 * download that becomes a Blob, refused up front when it is over the ceiling.
 */
import { readRange, readScanBody, readWindows, ScanTooLargeError } from '../../../src/pointclouds/blobReader.js'

const bytes = (n) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 256))

test('windows cover the blob exactly once, the last one short', async () => {
	const seen = []
	for await (const { offset, bytes: chunk } of readWindows(new Blob([bytes(10)]), { windowBytes: 4 })) {
		seen.push([offset, Array.from(chunk)])
	}

	expect(seen).toEqual([[0, [0, 1, 2, 3]], [4, [4, 5, 6, 7]], [8, [8, 9]]])
})

test('windows can start part way in', async () => {
	const offsets = []
	for await (const { offset } of readWindows(new Blob([bytes(10)]), { windowBytes: 4, start: 6 })) {
		offsets.push(offset)
	}

	expect(offsets).toEqual([6])
})

test('an aborted read stops', async () => {
	const controller = new AbortController()
	controller.abort()
	const read = async () => {
		for await (const window of readWindows(new Blob([bytes(10)]), { windowBytes: 4, signal: controller.signal })) {
			void window
		}
	}

	await expect(read()).rejects.toMatchObject({ name: 'AbortError' })
})

test('a range', async () => {
	const view = await readRange(new Blob([bytes(10)]), 3, 4)

	expect(view.byteLength).toBe(4)
	expect(view.getUint8(0)).toBe(3)
})

test('a download becomes a Blob, counting bytes as they come', async () => {
	const counted = []
	const response = new Response(new Blob([bytes(1000)]), { headers: { 'content-length': '1000' } })

	const body = await readScanBody(response, { onBytes: (n) => counted.push(n) })

	expect(body).toBeInstanceOf(Blob)
	expect(body.size).toBe(1000)
	expect(counted.at(-1)).toBe(1000)
})

test('a scan over the ceiling is refused before its body is read', async () => {
	const response = new Response(new Blob([bytes(10)]), { headers: { 'content-length': String(3 * 1024 ** 3) } })

	await expect(readScanBody(response)).rejects.toBeInstanceOf(ScanTooLargeError)
	await expect(readScanBody(new Response('x', { headers: { 'content-length': String(3 * 1024 ** 3) } }))).rejects.toThrow('This scan is 3 GB. The viewer opens scans up to 2 GB.')
	expect(response.bodyUsed).toBe(false)
})

test('a scan that sends no length is stopped once it passes the ceiling', async () => {
	const response = new Response(new Blob([bytes(64)]))

	await expect(readScanBody(response, { ceiling: 32 })).rejects.toBeInstanceOf(ScanTooLargeError)
})

test('a custom refusal, whether the length is sent or not', async () => {
	class Refusal extends Error {}
	const tooLarge = (size) => new Refusal(`too large: ${size}`)

	await expect(readScanBody(new Response('x', { headers: { 'content-length': '64' } }), { ceiling: 32, tooLarge })).rejects.toThrow('too large: 64')
	await expect(readScanBody(new Response(new Blob([bytes(64)])), { ceiling: 32, tooLarge })).rejects.toBeInstanceOf(Refusal)
})

// A fetch cancelled part way through its body fails the stream with a network error in
// some browsers, not an AbortError; the viewer must still take it as a cancellation
test('a download cancelled part way is a cancellation, not a failure', async () => {
	const controller = new AbortController()
	const body = new ReadableStream({
		pull(stream) {
			controller.abort()
			stream.error(new TypeError('Failed to fetch'))
		},
	})

	await expect(readScanBody(new Response(body), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
})

test('a download that fails on its own is still a failure', async () => {
	const body = new ReadableStream({ pull(stream) { stream.error(new TypeError('Failed to fetch')) } })

	await expect(readScanBody(new Response(body), { signal: new AbortController().signal })).rejects.toThrow('Failed to fetch')
})
