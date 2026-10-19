/**
 * @jest-environment node
 */
/**
 * The rhino3dm runtime must not need `unsafe-eval` (#204).
 *
 * `rhino3dm.js` is an emscripten/embind build whose glue compiles each binding's caller
 * with `new Function`. Nextcloud's Content Security Policy blocks that, so the 3DM
 * loader's worker failed to start and the viewer spun forever. `copy-decoders.mjs` now
 * rewrites the glue as it copies it out of `node_modules`; this pins that the rewrite
 * still applies to the installed version, and that a real file decodes through the
 * loader's own worker code with code generation from strings forbidden — the same
 * restriction the browser applies under a CSP without `unsafe-eval`.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stripDynamicExecution } from '../../../scripts/rhino3dm-no-eval.mjs'

const ROOT = process.cwd()
const RHINO = path.join(ROOT, 'node_modules/rhino3dm')
const LOADER = path.join(ROOT, 'node_modules/three/examples/jsm/loaders/3DMLoader.js')
const FIXTURE = path.join(ROOT, 'tests/fixtures/shapes.3dm')
const glue = () => fs.readFileSync(path.join(RHINO, 'rhino3dm.js'), 'utf8')

/**
 * The body of three's `Rhino3dmWorker`, cut the way Rhino3dmLoader cuts it before
 * putting it in its worker: between the function's first `{` and its last `}`.
 *
 * @return {string} the worker's statements
 */
function workerBody() {
	const source = fs.readFileSync(LOADER, 'utf8')
	const start = source.indexOf('function Rhino3dmWorker() {')
	const end = source.lastIndexOf('\n}\n', source.indexOf('export { Rhino3dmLoader }'))
	if (start < 0 || end < start) {
		throw new Error('Rhino3dmWorker not found in 3DMLoader.js')
	}
	const fn = source.slice(start, end + 2)
	return fn.substring(fn.indexOf('{') + 1, fn.lastIndexOf('}'))
}

/**
 * Run the glue and the loader's worker code in a child process, send it the `init` and
 * `decode` messages Rhino3dmLoader sends, and report what it posts back.
 *
 * Counters are spliced into the two rewritten sites when they are present, so the test
 * can tell whether the decode actually went through them.
 *
 * @param {string} source - The glue to run
 * @param {boolean} banEval - Forbid compiling code from strings, as the CSP does
 * @return {{status: number, output: string, result: object|null}}
 */
function decode(source, banEval) {
	const counted = source
		.replace('var invokerFn=function(...args){', '$&globalThis.__invokers=(globalThis.__invokers||0)+1;')
		.replace('var invokerFunction=function(handle,methodName,destructorsRef,args){', '$&globalThis.__methodCallers=(globalThis.__methodCallers||0)+1;')
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhino3dm-no-eval-'))
	try {
		fs.writeFileSync(path.join(dir, 'worker.cjs'), [
			'globalThis.self = globalThis',
			'const posted = []',
			'self.postMessage = (message) => posted.push(message)',
			'/* rhino3dm.js */',
			counted,
			'/* worker */',
			workerBody(),
			`
			const fs = require('fs')
			// The worker's start-up runs in a promise, so a blocked compile surfaces here.
			process.on('unhandledRejection', (e) => console.log('REJECTED ' + (e && e.name) + ': ' + (e && e.message)))
			onmessage({ data: { type: 'init', libraryConfig: { wasmBinary: fs.readFileSync(${JSON.stringify(path.join(RHINO, 'rhino3dm.wasm'))}) } } })
			const bytes = fs.readFileSync(${JSON.stringify(FIXTURE)})
			const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
			onmessage({ data: { type: 'decode', id: 1, buffer, subdivisionLevel: 0 } })
			const started = Date.now()
			const wait = setInterval(() => {
				// The worker also posts warnings; the answer is a decode or an error.
				const answer = posted.find((m) => m.type === 'decode' || m.type === 'error')
				if (!answer && Date.now() - started < 20000) return
				clearInterval(wait)
				if (!answer) {
					console.log('NO ANSWER')
					process.exit(1)
				}
				console.log('RESULT ' + JSON.stringify({
					answer,
					warnings: posted.filter((m) => m.type === 'warning').map((m) => m.data),
					invokers: globalThis.__invokers || 0,
					methodCallers: globalThis.__methodCallers || 0,
				}))
			}, 50)
			`,
		].join('\n'))
		const child = spawnSync(
			process.execPath,
			[...(banEval ? ['--disallow-code-generation-from-strings'] : []), path.join(dir, 'worker.cjs')],
			{ encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 },
		)
		const output = child.stdout + child.stderr
		const line = output.split('\n').find((l) => l.startsWith('RESULT '))
		return { status: child.status, output, result: line ? JSON.parse(line.slice('RESULT '.length)) : null }
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
}

describe('rhino3dm stripDynamicExecution', () => {
	// Without this the test below could pass for the wrong reason: a rhino3dm that
	// stopped using eval by itself, or a Node that stopped enforcing the flag.
	it('is needed: the glue as published never answers where eval is forbidden', () => {
		const { status, output } = decode(glue(), true)
		expect(output).toMatch(/EvalError|Code generation from strings disallowed/)
		expect(output).toContain('NO ANSWER')
		expect(status).not.toBe(0)
	}, 60000)

	it('decodes exactly what the published glue decodes, with eval forbidden', () => {
		const reference = decode(glue(), false).result
		const rewritten = decode(stripDynamicExecution(glue()), true)

		expect(reference?.answer.type).toBe('decode')
		expect(rewritten.status).toBe(0)
		expect(rewritten.result.answer).toEqual(reference.answer)
		expect(rewritten.result.warnings).toEqual(reference.warnings)
		// The fixture's mesh decodes. Its Brep sphere has no render mesh, so the loader
		// skips it with a warning, in both runs.
		expect(rewritten.result.answer.data.objects.map((o) => o.objectType)).toEqual(['Mesh'])
		// Both rewritten sites carried the decode, not only the one that registers bindings.
		expect(rewritten.result.invokers).toBeGreaterThan(0)
		expect(rewritten.result.methodCallers).toBeGreaterThan(0)
	}, 120000)

	it('leaves no code compiled from text', () => {
		expect(stripDynamicExecution(glue())).not.toMatch(/new Function\b|\beval\(/)
	})

	// A dependency bump that reshapes the glue must stop the build, not ship a 3DM loader
	// that hangs only in the browser and only under a strict CSP.
	it('refuses glue it does not recognise rather than passing it through', () => {
		expect(() => stripDynamicExecution('var Module = {}')).toThrow(/rhino3dm/)
	})
})
