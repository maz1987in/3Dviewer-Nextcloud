/**
 * @jest-environment node
 */
/**
 * The OCCT runtime must not need `unsafe-eval`.
 *
 * `occt-import-js` is an emscripten build whose embind glue writes each C++ binding's
 * JavaScript caller as source text and compiles it with `new Function`. Nextcloud's
 * Content Security Policy blocks that, and since Nextcloud 34 an app can no longer ask
 * for it to be allowed — so STEP, IGES, BREP and FCSTD all failed with
 * `EvalError: call to Function() blocked by CSP` (#169). The build rewrites the glue to
 * use closures instead; this pins that the rewrite still applies to the installed
 * version of the dependency, and that what it produces really runs without eval.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stripDynamicExecution } from '../../../scripts/occt-no-eval.mjs'

const DIST = path.resolve(process.cwd(), 'node_modules/occt-import-js/dist')
const glue = () => fs.readFileSync(path.join(DIST, 'occt-import-js.js'), 'utf8')

/**
 * Load a copy of the glue in a child process that forbids compiling code from strings —
 * the same restriction the browser applies under a CSP without `unsafe-eval` — and read a
 * file through it.
 *
 * The bytes are not a STEP file, and that is enough: the four `Read*File` bindings are
 * compiled while the module starts, and passing a params object makes the C++ side call
 * back into JavaScript, which is the glue's other eval site. A read that comes back as a
 * plain `success: false` has been through both.
 *
 * @param {string} source - The glue to run
 * @return {{status: number, output: string}}
 */
function readUnderEvalBan(source) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'occt-no-eval-'))
	try {
		fs.writeFileSync(path.join(dir, 'glue.cjs'), source)
		fs.writeFileSync(path.join(dir, 'run.cjs'), `
			require('./glue.cjs')({
				locateFile: (name) => ${JSON.stringify(DIST + path.sep)} + name,
				printErr() {},
			}).then((occt) => {
				const result = occt.ReadStepFile(new Uint8Array([1, 2, 3]), { linearDeflection: 0.001 })
				console.log('RESULT ' + JSON.stringify(result))
			}).catch((e) => {
				console.log('FAILED ' + e.name + ': ' + e.message)
				process.exit(1)
			})
		`)
		const child = spawnSync(
			process.execPath,
			['--disallow-code-generation-from-strings', path.join(dir, 'run.cjs')],
			{ encoding: 'utf8' },
		)
		return { status: child.status, output: child.stdout + child.stderr }
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
}

describe('stripDynamicExecution', () => {
	// Without this the test below could pass for the wrong reason — on a future version
	// of the dependency that stopped using eval by itself, or a Node that stopped
	// enforcing the flag.
	it('is needed: the glue as published fails where eval is forbidden', () => {
		const { status, output } = readUnderEvalBan(glue())
		expect(output).toMatch(/EvalError/)
		expect(status).not.toBe(0)
	})

	it('produces glue that starts and reads a file where eval is forbidden', () => {
		const { status, output } = readUnderEvalBan(stripDynamicExecution(glue()))
		expect(output).toContain('RESULT {"success":false}')
		expect(status).toBe(0)
	})

	it('leaves no call that compiles a function from text', () => {
		expect(stripDynamicExecution(glue())).not.toMatch(/newFunc\(Function\b/)
	})

	// A dependency bump that reshapes the glue must stop the build, not ship a viewer
	// whose CAD formats fail only in the browser and only under a strict CSP.
	it('refuses glue it does not recognise rather than passing it through', () => {
		expect(() => stripDynamicExecution('var Module = {}')).toThrow(/occt-import-js/)
	})
})
