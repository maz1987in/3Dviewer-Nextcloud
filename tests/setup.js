/**
 * Globals jsdom does not install, supplied from Node so tests run the same code a
 * browser does.
 *
 * jsdom ships no TextDecoder or TextEncoder. Without them the binary model parsers
 * would have to carry their own fallback decoder, and every test would exercise that
 * fallback while browsers took the real path — the two disagree on any name outside
 * ASCII. Node's implementations are the same UTF-8 decoders browsers expose, so
 * installing them here keeps one code path under test.
 */
const { TextDecoder, TextEncoder } = require('node:util')

if (typeof globalThis.TextDecoder === 'undefined') {
	globalThis.TextDecoder = TextDecoder
}
if (typeof globalThis.TextEncoder === 'undefined') {
	globalThis.TextEncoder = TextEncoder
}
