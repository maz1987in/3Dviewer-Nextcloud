/**
 * Prepares the server for the specs: uploads the models over WebDAV, makes public links to
 * some of them, and signs in once so each spec starts as a logged-in user.
 *
 * The user exists already (the workflow creates it with occ); this file only uses it.
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
	AUTH_FILE, BASE_URL, INDEX, MODELS, PASSWORD, PROJECT_ROOT, USER, writeState,
	type ModelKind, type State,
} from './env'

const AUTHORIZATION = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64')
const DAV = `${BASE_URL}/remote.php/dav/files/${encodeURIComponent(USER)}`

async function upload(kind: ModelKind) {
	const model = MODELS[kind]
	const body = fs.readFileSync(path.join(PROJECT_ROOT, 'tests', 'fixtures', model.fixture))
	const response = await fetch(`${DAV}/${model.remote}`, {
		method: 'PUT',
		headers: { Authorization: AUTHORIZATION },
		body,
	})
	if (![201, 204].includes(response.status)) {
		throw new Error(`Uploading ${model.remote} failed: ${response.status} ${await response.text()}`)
	}
}

async function fileId(kind: ModelKind): Promise<number> {
	const response = await fetch(`${DAV}/${MODELS[kind].remote}`, {
		method: 'PROPFIND',
		headers: { Authorization: AUTHORIZATION, Depth: '0', 'Content-Type': 'application/xml' },
		body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>',
	})
	const match = (await response.text()).match(/<oc:fileid>(\d+)<\/oc:fileid>/)
	if (!match) {
		throw new Error(`No file id for ${MODELS[kind].remote}: PROPFIND answered ${response.status}`)
	}
	return Number(match[1])
}

/** A read-only public link to one of the uploaded files, made once however often the suite runs */
async function share(kind: ModelKind): Promise<string> {
	const api = `${BASE_URL}/ocs/v2.php/apps/files_sharing/api/v1/shares`
	const headers = { Authorization: AUTHORIZATION, 'OCS-APIRequest': 'true', Accept: 'application/json' }
	const remote = `/${MODELS[kind].remote}`

	const existing = await (await fetch(`${api}?path=${encodeURIComponent(remote)}`, { headers })).json()
	const link = existing.ocs?.data?.find((item: { share_type: number }) => item.share_type === 3)
	if (link) {
		return link.token
	}

	const response = await fetch(api, {
		method: 'POST',
		headers,
		body: new URLSearchParams({ path: remote, shareType: '3', permissions: '1' }),
	})
	const created = await response.json()
	if (!created.ocs?.data?.token) {
		throw new Error(`Sharing ${remote} failed: ${response.status} ${JSON.stringify(created)}`)
	}
	return created.ocs.data.token
}

export default async function globalSetup() {
	const kinds = Object.keys(MODELS) as ModelKind[]
	for (const kind of kinds) {
		await upload(kind)
	}

	const fileIds = {} as State['fileIds']
	for (const kind of kinds) {
		fileIds[kind] = await fileId(kind)
	}
	// A page the logged-out visitor opens, for the model that needs no decoder and the one
	// that needs the biggest one: the share page's policy is built by the server, apart from
	// the Files app's.
	const shares: State['shares'] = {}
	for (const kind of ['stl', 'step'] as const) {
		shares[kind] = await share(kind)
	}
	writeState({ fileIds, shares })

	const browser = await chromium.launch()
	try {
		const page = await browser.newPage()
		await page.goto(`${INDEX}/login`)
		await page.locator('input[name="user"]').fill(USER)
		await page.locator('input[name="password"]').fill(PASSWORD)
		await page.locator('button[type="submit"]').click()
		await page.waitForURL(/\/apps\//)
		await page.context().storageState({ path: AUTH_FILE })
	} finally {
		await browser.close()
	}
}
