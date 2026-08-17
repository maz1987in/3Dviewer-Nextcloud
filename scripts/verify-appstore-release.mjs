#!/usr/bin/env node
/**
 * Ask the Nextcloud App Store whether the release actually arrived.
 *
 * `release.yml` publishes through an action whose step is `continue-on-error`, so a
 * failed publish reports success at every level GitHub shows: the step, the job and
 * the run. v3.5.0 was tagged, built, released on GitHub and never published, and
 * nothing anywhere went red. This asks the store directly and fails the job when the
 * answer is no.
 *
 * Usage: node scripts/verify-appstore-release.mjs [--tag v3.5.0] [--timeout 600]
 *
 * The store publishes no per-app endpoint, so this downloads the platform index —
 * about 10 MB — once per attempt. Indexing is not instant after a push, hence the
 * poll rather than a single look.
 */
import { readFileSync } from 'node:fs'
import { assess } from './appstore-release-lib.mjs'

const APP_ID = 'threedviewer'

const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`)
	return i === -1 ? fallback : process.argv[i + 1]
}

/**
 * The version and supported server range this build declares.
 *
 * @return {{version: string, min: string, max: string, spec: string}} the manifest's claims
 */
function manifest() {
	const xml = readFileSync(new URL('../appinfo/info.xml', import.meta.url), 'utf8')
	const version = /<version>([^<]+)<\/version>/.exec(xml)?.[1]
	const platform = /<nextcloud\s+min-version="([^"]+)"\s+max-version="([^"]+)"/.exec(xml)
	if (!version || !platform) throw new Error('could not read version and platform range from appinfo/info.xml')
	return { version, min: platform[1], max: platform[2], spec: `>=${platform[1]} <=${platform[2]}` }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const { version, min, spec } = manifest()
const tag = arg('tag', `v${version}`)
const timeout = Number(arg('timeout', '600')) * 1000
const index = `https://apps.nextcloud.com/api/v1/platform/${min}.0.0/apps.json`

console.log(`[appstore] looking for ${APP_ID} ${version} (${tag}), expecting platform "${spec}"`)

const startedAt = Date.now()
let attempt = 0
let last = { ok: false, problems: ['no attempt completed'] }

while (Date.now() - startedAt < timeout) {
	attempt++
	try {
		const res = await fetch(index, { headers: { Accept: 'application/json' } })
		if (!res.ok) throw new Error(`store returned HTTP ${res.status}`)
		last = assess({ apps: await res.json(), appId: APP_ID, version, tag, declaredPlatformSpec: spec })
		if (last.ok) {
			console.log(`[appstore] OK — ${version} is published and matches the manifest (attempt ${attempt})`)
			process.exit(0)
		}
	} catch (error) {
		last = { ok: false, problems: [`could not read the store index: ${error.message}`] }
	}

	const waited = Math.round((Date.now() - startedAt) / 1000)
	console.log(`[appstore] attempt ${attempt} at ${waited}s: ${last.problems.join('; ')}`)
	if (Date.now() - startedAt + 30000 >= timeout) break
	await sleep(30000)
}

console.error('')
console.error(`[appstore] FAILED after ${Math.round((Date.now() - startedAt) / 1000)}s:`)
for (const problem of last.problems) console.error(`  - ${problem}`)
console.error('')
console.error('The GitHub release is unaffected and still stands. Publishing is what did not')
console.error('happen, so nothing needs reverting - the artifact can be pushed again, or')
console.error(`uploaded by hand from the ${tag} release page.`)
process.exit(1)
