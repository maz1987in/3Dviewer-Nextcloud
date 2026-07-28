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
 * Usage:
 *   npm run pr:ready              # the PR for the current branch
 *   npm run pr:ready -- 137       # a specific PR
 */
import { execFileSync } from 'child_process'

/**
 * Every check that must be present and successful.
 *
 * Add a workflow here only if its summary job runs unconditionally on pull_request.
 * Requiring one that a paths filter can stop from reporting would block every merge that
 * does not touch those paths.
 */
const REQUIRED = [
	'eslint',
	'jest-tests',
	'node',
	'php-lint-summary',
	'phpunit-summary',
	'phpunit-integration-summary',
	'static-psalm-analysis-summary',
]

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

const rollup = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : []

const PASSING = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const WAITING = new Set(['PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED', 'WAITING', 'REQUESTED'])
const FAILING = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])

/**
 * The one state worth acting on, out of the two shapes GitHub returns.
 *
 * A CheckRun carries `status` plus a `conclusion` that stays an empty string until it
 * finishes; a legacy commit status carries `state` and no status at all. Reading
 * `conclusion || state` misses the running CheckRun entirely — it reported UNKNOWN for
 * every queued job, and this script called that a failure.
 *
 * @param {object} check - one statusCheckRollup entry
 * @return {string} an upper-case state
 */
function stateOf(check) {
	const conclusion = (check.conclusion || '').toUpperCase()
	if (conclusion !== '') {
		return conclusion
	}

	const status = (check.status || '').toUpperCase()
	if (status !== '' && status !== 'COMPLETED') {
		return status
	}

	return (check.state || '').toUpperCase() || 'UNKNOWN'
}

const byName = new Map(rollup.map((check) => [check.name || check.context, stateOf(check)]))

const missing = REQUIRED.filter((name) => !byName.has(name))
const failing = REQUIRED.filter((name) => FAILING.has(byName.get(name)))
const waiting = REQUIRED.filter((name) => WAITING.has(byName.get(name)))
// Neither passing, running nor failing: a state this script does not recognise. It
// blocks, because the whole rule is that an unclear answer is not a green light.
const unclear = REQUIRED.filter((name) => byName.has(name)
	&& !PASSING.has(byName.get(name))
	&& !WAITING.has(byName.get(name))
	&& !FAILING.has(byName.get(name)))

// Everything else on the PR, so a failure outside the required set is still visible.
const otherFailing = rollup
	.filter((check) => !REQUIRED.includes(check.name))
	.filter((check) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(stateOf(check)))
	.map((check) => check.name)

console.log(`\nPR #${pr.number}  ${pr.title}`)
console.log(`${DIM}${rollup.length} checks reported, ${REQUIRED.length} required${RESET}\n`)

for (const name of REQUIRED) {
	const state = byName.get(name)
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
