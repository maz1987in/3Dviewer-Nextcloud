/**
 * The state-reading half of the merge gate, kept apart so it can be tested.
 *
 * This logic has now been wrong twice, both times in the same direction — a state that
 * was not understood being folded into one that was. First every queued CheckRun read as
 * a failure, because a CheckRun carries `status` while a legacy commit status carries
 * `state`. Then a superseded run read as a failure, because a name can appear in the
 * rollup more than once.
 *
 * A gate that blocks a ready pull request is not a safe failure. It is the failure that
 * teaches people to merge past it, which costs more than the checks were ever worth. So
 * the parts that decide are pure functions here, with tests, rather than inline in a
 * script that only runs against live GitHub.
 */

/**
 * Every check that must be present and successful.
 *
 * Add a workflow here only if its summary job runs unconditionally on pull_request.
 * Requiring one that a paths filter can stop from reporting would block every merge that
 * does not touch those paths.
 */
export const REQUIRED = [
	'eslint',
	'jest-tests',
	'node',
	'php-lint-summary',
	'phpunit-summary',
	'phpunit-integration-summary',
	'static-psalm-analysis-summary',
]

export const PASSING = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
export const WAITING = new Set(['PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED', 'WAITING', 'REQUESTED'])
export const FAILING = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])

/**
 * States that block on a check outside the required set.
 *
 * Narrower than FAILING on purpose: a required check needing attention has to stop the
 * merge, but ACTION_REQUIRED on something optional is a notice, not a verdict.
 */
export const OTHER_BLOCKING = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT'])

/**
 * The one state worth acting on, out of the two shapes GitHub returns.
 *
 * A CheckRun carries `status` plus a `conclusion` that stays an empty string until it
 * finishes; a legacy commit status carries `state` and no status at all. Reading
 * `conclusion || state` misses the running CheckRun entirely — it reported UNKNOWN for
 * every queued job, and this gate called that a failure.
 *
 * @param {object} check - one statusCheckRollup entry
 * @return {string} an upper-case state
 */
export function stateOf(check) {
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

/**
 * When a rollup entry finished, for ordering two entries of the same name.
 *
 * A running entry has no completedAt, so it falls back to when it started — which is
 * later than the completedAt of the run it superseded, and that is exactly the ordering
 * wanted. Anything unparseable sorts first, so a dated entry always wins over it.
 *
 * @param {object} check - one statusCheckRollup entry
 * @return {number} milliseconds since the epoch, or 0
 */
export function timeOf(check) {
	return Date.parse(check.completedAt || check.startedAt || '') || 0
}

/**
 * One entry per check name: the most recent.
 *
 * Every workflow in this repo uses a concurrency group with `cancel-in-progress`, so a
 * push that supersedes a running job leaves a CANCELLED entry in the rollup beside the
 * SUCCESS from the run that replaced it. Both carry the same name. Reading all of them
 * reports the superseded one as a failure and blocks a pull request that is ready —
 * which is what happened on #140 after a force-push.
 *
 * Ties keep the later entry in array order, since GitHub returns the rollup oldest-first.
 *
 * @param {object[]} rollup - statusCheckRollup entries
 * @return {Map<string, object>} the newest entry for each name
 */
export function latestPerName(rollup) {
	const latest = new Map()

	for (const check of rollup) {
		const name = check.name || check.context
		if (name === undefined || name === null || name === '') {
			continue
		}

		const previous = latest.get(name)
		if (previous === undefined || timeOf(check) >= timeOf(previous)) {
			latest.set(name, check)
		}
	}

	return latest
}

/**
 * Everything the gate has to say about a pull request's checks.
 *
 * @param {object[]} rollup - statusCheckRollup entries
 * @return {{states: Map<string, string>, missing: string[], failing: string[], waiting: string[], unclear: string[], otherFailing: string[], superseded: number}}
 */
export function assess(rollup) {
	const entries = Array.isArray(rollup) ? rollup : []
	const latest = latestPerName(entries)

	/** @type {Map<string, string>} */
	const states = new Map()
	for (const [name, check] of latest) {
		states.set(name, stateOf(check))
	}

	const missing = REQUIRED.filter((name) => !states.has(name))
	const failing = REQUIRED.filter((name) => FAILING.has(states.get(name)))
	const waiting = REQUIRED.filter((name) => WAITING.has(states.get(name)))
	// Neither passing, running nor failing: a state this gate does not recognise. It
	// blocks, because the whole rule is that an unclear answer is not a green light.
	const unclear = REQUIRED.filter((name) => states.has(name)
		&& !PASSING.has(states.get(name))
		&& !WAITING.has(states.get(name))
		&& !FAILING.has(states.get(name)))

	// Everything else on the pull request, so a failure outside the required set is
	// still visible rather than silently tolerated.
	const otherFailing = [...states.entries()]
		.filter(([name]) => !REQUIRED.includes(name))
		.filter(([, state]) => OTHER_BLOCKING.has(state))
		.map(([name]) => name)

	return {
		states,
		missing,
		failing,
		waiting,
		unclear,
		otherFailing,
		superseded: entries.length - latest.size,
	}
}
