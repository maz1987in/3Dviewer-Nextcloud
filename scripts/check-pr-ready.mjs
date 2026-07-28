#!/usr/bin/env node
/**
 * Decides whether a pull request is safe to merge.
 *
 * The rule this encodes: a check that is not there has not passed.
 *
 * `gh pr checks` reports only the checks that exist. A workflow run that is queued and
 * has not started contributes no check at all, so a pull request whose entire test
 * matrix has yet to begin reports zero failing and zero pending — indistinguishable, to
 * anything counting buckets, from one where everything succeeded. A break reached main
 * that way: the eslint run sat at status=pending, contributed no check, and the merge
 * looked clean.
 *
 * So this compares what was reported against a set of checks that must be present, and
 * treats a missing one as a failure rather than as silence. The set is the summary jobs:
 * each aggregates its own matrix, runs on every pull request, and carries `if: always()`
 * so it reports even when the jobs beneath it are skipped by a paths filter.
 *
 * The same set is required by the repository ruleset on main, so GitHub enforces it on
 * the merge itself. This is for finding out before you get there.
 *
 * The deciding is in pr-ready-lib.mjs, which has tests. What is left here is fetching
 * and printing.
 *
 * Usage:
 *   npm run pr:ready              # the PR for the current branch
 *   npm run pr:ready -- 137       # a specific PR
 */
import { execFileSync } from 'child_process'
import { FAILING, PASSING, REQUIRED, WAITING, assess } from './pr-ready-lib.mjs'

const GREEN = '\u001b[32m'
const RED = '\u001b[31m'
const YELLOW = '\u001b[33m'
const DIM = '\u001b[2m'
const RESET = '\u001b[0m'

/**
 * @param {string[]} args - arguments for the gh CLI
 * @return {string} stdout
 */
function gh(args) {
	try {
		return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
	} catch (error) {
		const detail = (error.stderr || error.message || '').toString().trim()
		console.error(`${RED}gh ${args.join(' ')} failed${RESET}\n${detail}`)
		process.exit(2)
	}
}

/**
 * @param {number} ms - milliseconds to block for
 */
function sleep(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

const target = process.argv[2]
const view = ['pr', 'view', ...(target ? [target] : []), '--json', 'number,title,state,mergeable,mergeStateStatus,statusCheckRollup']

// GitHub computes mergeability on demand and answers UNKNOWN while it works, so a first
// reply of UNKNOWN means "ask again", not "no". Only a settled answer is worth acting on.
let pr = JSON.parse(gh(view))
for (let attempt = 0; pr.mergeable === 'UNKNOWN' && pr.state === 'OPEN' && attempt < 3; attempt += 1) {
	sleep(2000)
	pr = JSON.parse(gh(view))
}

if (pr.state !== 'OPEN') {
	console.log(`\nPR #${pr.number} is ${pr.state.toLowerCase()} — nothing left to gate.\n`)
	process.exit(0)
}

const { states, missing, failing, waiting, unclear, otherFailing, superseded } = assess(pr.statusCheckRollup)

console.log(`\nPR #${pr.number}  ${pr.title}`)
const supersededNote = superseded > 0 ? `, ${superseded} superseded by a later run` : ''
console.log(`${DIM}${states.size} checks reported, ${REQUIRED.length} required${supersededNote}${RESET}\n`)

for (const name of REQUIRED) {
	const state = states.get(name)
	if (state === undefined) {
		console.log(`  ${RED}ABSENT ${RESET} ${name}   ${DIM}never reported — not the same as passing${RESET}`)
	} else if (PASSING.has(state)) {
		console.log(`  ${GREEN}ok     ${RESET} ${name}`)
	} else if (WAITING.has(state)) {
		console.log(`  ${YELLOW}waiting${RESET} ${name}   ${DIM}${state}${RESET}`)
	} else if (FAILING.has(state)) {
		console.log(`  ${RED}FAILED ${RESET} ${name}   ${DIM}${state}${RESET}`)
	} else {
		console.log(`  ${YELLOW}unclear${RESET} ${name}   ${DIM}${state} — not a state this gate recognises${RESET}`)
	}
}

if (otherFailing.length > 0) {
	console.log(`\n  ${RED}also failing outside the required set:${RESET} ${otherFailing.join(', ')}`)
}

console.log(`\n  mergeable: ${pr.mergeable}   state: ${pr.mergeStateStatus}`)

const problems = []
if (missing.length > 0) {
	problems.push(`${missing.length} required check(s) never reported: ${missing.join(', ')}`)
}
if (failing.length > 0) {
	problems.push(`${failing.length} required check(s) failed: ${failing.join(', ')}`)
}
if (waiting.length > 0) {
	problems.push(`${waiting.length} required check(s) still running: ${waiting.join(', ')}`)
}
if (unclear.length > 0) {
	problems.push(`${unclear.length} required check(s) in an unrecognised state: ${unclear.join(', ')}`)
}
if (otherFailing.length > 0) {
	problems.push(`${otherFailing.length} other check(s) failed: ${otherFailing.join(', ')}`)
}
if (pr.mergeable !== 'MERGEABLE') {
	problems.push(`not mergeable (${pr.mergeable})`)
}

if (problems.length > 0) {
	console.log(`\n${RED}NOT READY${RESET}`)
	for (const problem of problems) {
		console.log(`  - ${problem}`)
	}
	console.log()
	process.exit(1)
}

console.log(`\n${GREEN}READY${RESET}  every required check reported and succeeded\n`)
