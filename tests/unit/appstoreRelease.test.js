/**
 * The app store publish check.
 *
 * `release.yml` pushes the built artifact to the Nextcloud App Store through a step
 * marked `continue-on-error`, so the step reported success while publishing nothing:
 * v3.5.0 was tagged, released on GitHub, and absent from the store, with every job,
 * step and workflow run green. The only way to find out was to ask the store.
 *
 * This is that question, asked in code. It checks more than presence, because a
 * release can be listed and still be wrong in ways nobody would look for: a platform
 * range that does not match the manifest is live and invisible to a slice of admins,
 * and a download URL pointing at another tag is a listing for a different build.
 */
import { assess, findRelease } from '../../scripts/appstore-release-lib.mjs'

/** A release as the store's apps.json returns it. */
const release = (over = {}) => ({
	version: '3.5.0',
	isNightly: false,
	signature: 'AAAA',
	rawPlatformVersionSpec: '>=31 <=34',
	download: 'https://github.com/maz1987in/3Dviewer-Nextcloud/releases/download/v3.5.0/threedviewer-v3.5.0.tar.gz',
	...over,
})

/** The store index, as a list of apps. */
const store = (releases) => [
	{ id: 'someotherapp', releases: [{ version: '1.0.0' }] },
	{ id: 'threedviewer', releases },
]

const subject = (over = {}) => ({
	apps: store([release(), { version: '3.4.0' }]),
	appId: 'threedviewer',
	version: '3.5.0',
	tag: 'v3.5.0',
	declaredPlatformSpec: '>=31 <=34',
	...over,
})

describe('findRelease', () => {
	it('finds the version among an app\'s releases', () => {
		expect(findRelease(store([release()]), 'threedviewer', '3.5.0').version).toBe('3.5.0')
	})

	it('returns null when the app is not in the index', () => {
		expect(findRelease(store([release()]), 'nosuchapp', '3.5.0')).toBeNull()
	})

	it('returns null when the app is listed without that version', () => {
		expect(findRelease(store([{ version: '3.4.0' }]), 'threedviewer', '3.5.0')).toBeNull()
	})
})

describe('assess', () => {
	it('passes a release that is listed and correct', () => {
		const { ok, problems } = assess(subject())
		expect(problems).toEqual([])
		expect(ok).toBe(true)
	})

	it('fails when the version is absent — the case that shipped', () => {
		const { ok, problems } = assess(subject({ apps: store([{ version: '3.4.0' }]) }))
		expect(ok).toBe(false)
		expect(problems.join(' ')).toMatch(/3\.5\.0/)
		expect(problems.join(' ')).toMatch(/3\.4\.0/)
	})

	it('fails when the app is not listed at all', () => {
		const { ok, problems } = assess(subject({ apps: [{ id: 'someotherapp', releases: [] }] }))
		expect(ok).toBe(false)
		expect(problems.join(' ')).toMatch(/not listed/i)
	})

	it('fails a platform range that does not match the manifest', () => {
		const { ok, problems } = assess(subject({
			apps: store([release({ rawPlatformVersionSpec: '>=31 <=33' })]),
		}))
		expect(ok).toBe(false)
		expect(problems.join(' ')).toMatch(/>=31 <=33/)
	})

	it('fails a download URL pointing at another tag', () => {
		const { ok, problems } = assess(subject({
			apps: store([release({ download: 'https://example.invalid/releases/download/v3.4.0/x.tar.gz' })]),
		}))
		expect(ok).toBe(false)
		expect(problems.join(' ')).toMatch(/v3\.5\.0/)
	})

	it('fails a release the store recorded as a nightly', () => {
		const { ok } = assess(subject({ apps: store([release({ isNightly: true })]) }))
		expect(ok).toBe(false)
	})

	it('fails a release with no signature', () => {
		const { ok, problems } = assess(subject({ apps: store([release({ signature: null })]) }))
		expect(ok).toBe(false)
		expect(problems.join(' ')).toMatch(/signature/i)
	})

	it('reports every problem at once rather than the first', () => {
		const { problems } = assess(subject({
			apps: store([release({ isNightly: true, signature: null, rawPlatformVersionSpec: 'x' })]),
		}))
		expect(problems.length).toBeGreaterThanOrEqual(3)
	})
})
