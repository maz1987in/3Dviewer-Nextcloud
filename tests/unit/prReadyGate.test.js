/**
 * The merge gate's state reading.
 *
 * The gate decides whether a pull request may be merged, and it had no tests while being
 * wrong twice — each time by folding a state it did not model into one it did. Both
 * regressions are pinned below with the shapes GitHub actually returns.
 *
 * A gate that blocks a ready pull request is not a safe failure: it is the one that
 * teaches people to merge past it.
 */
import { assess, latestPerName, stateOf, timeOf } from '../../scripts/pr-ready-lib.mjs'

/** A CheckRun as `gh pr view --json statusCheckRollup` returns it. */
const run = (name, conclusion, status = 'COMPLETED', times = {}) => ({
	__typename: 'CheckRun',
	name,
	status,
	conclusion,
	startedAt: times.startedAt ?? '2026-07-28T05:00:00Z',
	completedAt: times.completedAt ?? (conclusion ? '2026-07-28T05:01:00Z' : ''),
})

/** Every required check, passing. */
const allRequiredPassing = () => [
	run('eslint', 'SUCCESS'),
	run('jest-tests', 'SUCCESS'),
	run('node', 'SUCCESS'),
	run('php-lint-summary', 'SUCCESS'),
	run('phpunit-summary', 'SUCCESS'),
	run('phpunit-integration-summary', 'SUCCESS'),
	run('static-psalm-analysis-summary', 'SUCCESS'),
]

describe('stateOf', () => {
	it('reads a finished CheckRun from its conclusion', () => {
		expect(stateOf(run('eslint', 'SUCCESS'))).toBe('SUCCESS')
	})

	// The first regression: a CheckRun carries `status`, not `state`, and its conclusion
	// is an empty string until it finishes. Reading `conclusion || state` returned
	// UNKNOWN for every queued job, which the gate then called a failure.
	it('reads a queued CheckRun from its status rather than calling it unknown', () => {
		expect(stateOf(run('eslint', '', 'QUEUED'))).toBe('QUEUED')
		expect(stateOf(run('eslint', '', 'IN_PROGRESS'))).toBe('IN_PROGRESS')
	})

	it('reads a legacy commit status from its state', () => {
		expect(stateOf({ __typename: 'StatusContext', context: 'ci/legacy', state: 'SUCCESS' })).toBe('SUCCESS')
	})

	it('says UNKNOWN when there is nothing to read', () => {
		expect(stateOf({})).toBe('UNKNOWN')
	})
})

describe('timeOf', () => {
	it('prefers when a check finished', () => {
		expect(timeOf(run('eslint', 'SUCCESS', 'COMPLETED', {
			startedAt: '2026-07-28T05:00:00Z',
			completedAt: '2026-07-28T05:09:00Z',
		}))).toBe(Date.parse('2026-07-28T05:09:00Z'))
	})

	it('falls back to when it started, so a running check outranks the one it replaced', () => {
		const superseded = run('eslint', 'CANCELLED', 'COMPLETED', { completedAt: '2026-07-28T05:31:45Z' })
		const running = run('eslint', '', 'IN_PROGRESS', { startedAt: '2026-07-28T05:31:48Z', completedAt: '' })

		expect(timeOf(running)).toBeGreaterThan(timeOf(superseded))
	})

	it('sorts an undated entry first, so any dated entry beats it', () => {
		expect(timeOf({ name: 'eslint' })).toBe(0)
	})
})

describe('latestPerName', () => {
	// The second regression, from PR #140. Every workflow here uses a concurrency group
	// with cancel-in-progress, so a force-push leaves a CANCELLED entry beside the
	// SUCCESS of the run that replaced it — both under the same name.
	it('keeps the newest entry when a run was superseded by a later one', () => {
		const rollup = [
			run('Block unconventional commits', 'CANCELLED', 'COMPLETED', { completedAt: '2026-07-28T05:31:45Z' }),
			run('Block unconventional commits', 'SUCCESS', 'COMPLETED', { completedAt: '2026-07-28T05:31:55Z' }),
		]

		const latest = latestPerName(rollup)

		expect(latest.size).toBe(1)
		expect(stateOf(latest.get('Block unconventional commits'))).toBe('SUCCESS')
	})

	it('does not depend on the order the entries arrive in', () => {
		const cancelled = run('eslint', 'CANCELLED', 'COMPLETED', { completedAt: '2026-07-28T05:31:45Z' })
		const success = run('eslint', 'SUCCESS', 'COMPLETED', { completedAt: '2026-07-28T05:31:55Z' })

		expect(stateOf(latestPerName([cancelled, success]).get('eslint'))).toBe('SUCCESS')
		expect(stateOf(latestPerName([success, cancelled]).get('eslint'))).toBe('SUCCESS')
	})

	it('keeps a genuine later failure rather than an earlier success', () => {
		const rollup = [
			run('eslint', 'SUCCESS', 'COMPLETED', { completedAt: '2026-07-28T05:00:00Z' }),
			run('eslint', 'FAILURE', 'COMPLETED', { completedAt: '2026-07-28T05:10:00Z' }),
		]

		expect(stateOf(latestPerName(rollup).get('eslint'))).toBe('FAILURE')
	})

	it('reads a legacy commit status by its context', () => {
		const latest = latestPerName([{ context: 'ci/legacy', state: 'SUCCESS' }])

		expect([...latest.keys()]).toEqual(['ci/legacy'])
	})
})

describe('assess', () => {
	it('passes a pull request whose required checks all succeeded', () => {
		const result = assess(allRequiredPassing())

		expect(result.missing).toEqual([])
		expect(result.failing).toEqual([])
		expect(result.waiting).toEqual([])
		expect(result.unclear).toEqual([])
		expect(result.otherFailing).toEqual([])
	})

	// The rule the whole gate exists for: a check that is not there has not passed.
	it('treats an absent required check as a problem rather than as silence', () => {
		const result = assess(allRequiredPassing().filter((check) => check.name !== 'eslint'))

		expect(result.missing).toEqual(['eslint'])
	})

	it('does not block on a superseded run of a check that later succeeded', () => {
		const result = assess([
			...allRequiredPassing(),
			run('Block unconventional commits', 'CANCELLED', 'COMPLETED', { completedAt: '2026-07-28T05:31:45Z' }),
			run('Block unconventional commits', 'SUCCESS', 'COMPLETED', { completedAt: '2026-07-28T05:31:55Z' }),
		])

		expect(result.otherFailing).toEqual([])
		expect(result.superseded).toBe(1)
	})

	it('still blocks on a check outside the required set that really failed', () => {
		const result = assess([...allRequiredPassing(), run('CodeQL', 'FAILURE')])

		expect(result.otherFailing).toEqual(['CodeQL'])
	})

	it('reports a required check that is still running as waiting, not as failed', () => {
		const rollup = allRequiredPassing()
		rollup[0] = run('eslint', '', 'QUEUED')

		const result = assess(rollup)

		expect(result.waiting).toEqual(['eslint'])
		expect(result.failing).toEqual([])
	})

	it('blocks on a state it does not recognise instead of assuming the best', () => {
		const rollup = allRequiredPassing()
		rollup[0] = run('eslint', 'SOMETHING_NEW')

		const result = assess(rollup)

		expect(result.unclear).toEqual(['eslint'])
		expect(result.failing).toEqual([])
		expect(result.waiting).toEqual([])
	})

	it('treats an empty rollup as every required check missing', () => {
		expect(assess([]).missing).toHaveLength(7)
		expect(assess(undefined).missing).toHaveLength(7)
	})
})
