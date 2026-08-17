/**
 * Deciding whether a release actually reached the Nextcloud App Store.
 *
 * Kept apart from the fetching so it can be tested against the shapes the store
 * really returns, the way `pr-ready-lib.mjs` is: the last gate in this repository
 * that had no tests was wrong twice.
 */

/**
 * The store's record of one version of one app.
 *
 * @param {object[]} apps - the store index, as `apps.json` returns it
 * @param {string} appId - the app's store id
 * @param {string} version - the version to look for
 * @return {object|null} the release, or null if the app or the version is absent
 */
export function findRelease(apps, appId, version) {
	const app = (apps ?? []).find((a) => a.id === appId)
	return app?.releases?.find((r) => r.version === version) ?? null
}

/**
 * Every version the store lists for an app, newest first as the store orders them.
 *
 * @param {object[]} apps - the store index
 * @param {string} appId - the app's store id
 * @return {string[]|null} the versions, or null if the app is not listed
 */
export function listedVersions(apps, appId) {
	const app = (apps ?? []).find((a) => a.id === appId)
	return app ? (app.releases ?? []).map((r) => r.version) : null
}

/**
 * Whether the store is serving the release that was just published, and serving it
 * as the manifest describes it.
 *
 * Presence is the check that would have caught v3.5.0. The rest are conditions a
 * release can be listed under and still be wrong: a platform range narrower than the
 * manifest's is live and invisible to admins on the versions it drops, and a download
 * URL for another tag is a listing for a different build.
 *
 * @param {object} input - what to check
 * @param {object[]} input.apps - the store index
 * @param {string} input.appId - the app's store id
 * @param {string} input.version - the version just published
 * @param {string} input.tag - the git tag it was released under
 * @param {string} input.declaredPlatformSpec - the range built from appinfo/info.xml
 * @return {{ok: boolean, problems: string[]}} the verdict and every reason for it
 */
export function assess({ apps, appId, version, tag, declaredPlatformSpec }) {
	const problems = []
	const versions = listedVersions(apps, appId)

	if (versions === null) {
		return { ok: false, problems: [`the store has no app called "${appId}" — it is not listed at all`] }
	}

	const release = findRelease(apps, appId, version)
	if (!release) {
		problems.push(`the store does not list ${version}. It lists: ${versions.join(', ') || '(nothing)'}`)
		return { ok: false, problems }
	}

	if (release.isNightly) {
		problems.push(`${version} is recorded as a nightly, so no stable instance will offer it`)
	}

	if (!release.signature) {
		problems.push(`${version} carries no signature`)
	}

	if (declaredPlatformSpec && release.rawPlatformVersionSpec !== declaredPlatformSpec) {
		problems.push(
			`platform range is "${release.rawPlatformVersionSpec}", `
			+ `where appinfo/info.xml declares "${declaredPlatformSpec}" — `
			+ 'the release is live but invisible to the server versions the difference drops',
		)
	}

	if (tag && !String(release.download ?? '').includes(`/${tag}/`)) {
		problems.push(`download URL does not come from ${tag}: ${release.download}`)
	}

	return { ok: problems.length === 0, problems }
}
