/**
 * "Copy embed code" in the tools panel, for someone who can share the model: an iframe of
 * one of its public links, sized and, if asked, opening from the current angle. The
 * snippet's exact form is pinned in `tests/unit/utils/embedCode.test.js`.
 */
import { test, expect, type Page } from '@playwright/test'
import { startServer, openViewer, stlCube, type Viewer } from './helpers/viewerServer'

const MODEL = { id: 7601, name: 'cube.stl', body: stlCube(10) }
const ALICE: Viewer = { user: 'alice', embedEnabled: true }

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

const linkShare = (id: string, label: string, stime: number, over: object = {}) => ({
	id, share_type: 3, token: `tok${id}`, url: `https://cloud.test/s/tok${id}`, label, stime, expiration: null, password: null, hide_download: 0, permissions: 1, item_type: 'file', ...over,
})

/**
 * The model's link shares, and the permissions WebDAV gives this user on it. `asked`
 * counts the requests for each, so a test can wait for the answers before it looks for
 * a control that should not be there.
 */
async function open(page: Page, { shares = [] as object[], permissions = 'RGDNVW', viewer = ALICE } = {}) {
	const asked = { shares: 0, permissions: 0 }
	await page.route('**/apps/threedviewer/settings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: {} }) }))
	await page.route('**/ocs/v2.php/apps/files_sharing/api/v1/shares*', (route) => {
		asked.shares++
		return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ocs: { meta: { status: 'ok' }, data: shares } }) })
	})
	await page.route('**/remote.php/dav/files/alice/**', (route) => route.request().method() === 'PROPFIND' && ++asked.permissions
		? route.fulfill({ status: 207, contentType: 'application/xml', body: `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:response><d:href>/remote.php/dav/files/alice/models/cube.stl</d:href><d:propstat><d:prop><oc:permissions>${permissions}</oc:permissions></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>` })
		: route.fallback())
	return { ...await openViewer(page, server.url, MODEL, viewer), asked }
}

/** Until the answers that decide the control have been applied. */
async function settled(page: Page, asked: { shares: number, permissions: number }, permissionsAsked: boolean) {
	await expect.poll(() => asked.shares).toBeGreaterThan(0)
	await expect.poll(() => asked.permissions).toBe(permissionsAsked ? 1 : 0)
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50))))
}

const panel = (page: Page) => page.locator('.slide-out-panel')
const opener = (page: Page) => panel(page).getByRole('button', { name: /^Copy embed code/ })

test('copies an iframe for the one public link, from this angle', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	const { errors } = await open(page, { shares: [linkShare('31', 'Shop', 1761600000)] })

	await opener(page).click()
	await expect(panel(page).getByLabel('Public link')).toHaveCount(0)
	await panel(page).getByRole('button', { name: 'Copy', exact: true }).click()

	// The code's helpers load on the first copy, so the toast says when it is done
	await expect(page.getByText('Embed code copied')).toBeVisible()
	const code = await page.evaluate(() => navigator.clipboard.readText())
	expect(code).toMatch(/^<iframe src="http:\/\/127\.0\.0\.1:\d+\/index\.php\/apps\/threedviewer\/embed\/tok31\?view=1\.[A-Za-z0-9_-]+" width="640" height="480" title="cube\.stl" style="border: 0" allow="fullscreen" allowfullscreen loading="lazy"><\/iframe>$/)
	expect(errors).toEqual([])
})

test('several links: choose one', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	await open(page, { shares: [linkShare('31', 'Shop', 1761600000), linkShare('32', 'Blog', 1761700000)] })

	await opener(page).click()
	await panel(page).getByLabel('Public link').selectOption({ label: `Shop · ${new Date(1761600000 * 1000).toLocaleDateString('en-US')}` })
	await panel(page).getByLabel('Show the model from this angle').uncheck()
	await panel(page).getByRole('button', { name: 'Copy', exact: true }).click()

	await expect(page.getByText('Embed code copied')).toBeVisible()
	const code = await page.evaluate(() => navigator.clipboard.readText())
	expect(code).toContain('/embed/tok31" width=')
})

test('no link without a password: points to the Sharing sidebar', async ({ page }) => {
	await open(page, { shares: [linkShare('33', 'Locked', 1761600000, { password: '$2y$hash' })] })

	await opener(page).click()

	await expect(panel(page)).toContainText('Embedding needs a public link to this file without a password.')
	await expect(panel(page).getByRole('link', { name: 'Open the Sharing sidebar' })).toHaveAttribute('href', '/index.php/apps/files/files/7601?opendetails=true')
})

test('hidden when embedding is off', async ({ page }) => {
	const { asked } = await open(page, { shares: [linkShare('31', 'Shop', 1761600000)], viewer: { user: 'alice', embedEnabled: false } })
	await settled(page, asked, false)

	await expect(panel(page).getByRole('button', { name: /^Copy public link to this view/ })).toBeVisible()
	await expect(panel(page).getByRole('button', { name: /^Copy link to this view/ })).toBeVisible()
	await expect(opener(page)).toHaveCount(0)
})

test('hidden for someone who can\'t share the file', async ({ page }) => {
	const { asked } = await open(page, { shares: [linkShare('31', 'Shop', 1761600000)], permissions: 'GD' })
	await settled(page, asked, true)

	await expect(panel(page).getByRole('button', { name: /^Copy link to this view/ })).toBeVisible()
	await expect(opener(page)).toHaveCount(0)
})

test('hidden on a public page', async ({ page }) => {
	const { asked } = await open(page, { viewer: { user: null, publicToken: 'pubtok', embedEnabled: true } })

	expect(asked).toEqual({ shares: 0, permissions: 0 })
	await expect(panel(page).getByRole('button', { name: /^Copy link to this view/ })).toBeVisible()
	await expect(opener(page)).toHaveCount(0)
})
