/**
 * The embed page another site frames: the model with only the embed's own controls, or
 * a plain message once the share may no longer be embedded. The server's side, which
 * shares may be shown and who may frame them, is pinned by the PHP HTTP tests.
 */
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import { startServer, openViewer, stlCube, type Viewer } from './helpers/viewerServer'

const MODEL = { id: 7501, name: 'cube.stl', body: stlCube(10) }
const SHARE_URL = 'https://cloud.example/s/embtok'
const DOWNLOAD_URL = 'https://cloud.example/s/embtok/download'
const EMBED: Viewer = { user: null, publicToken: 'embtok', embed: { shareUrl: SHARE_URL, downloadUrl: DOWNLOAD_URL } }

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

const open = (page: Page, viewer: Viewer = EMBED) => openViewer(page, server.url, MODEL, viewer)

/** A `view` value as the app writes it: version 1, base64url JSON with one-letter keys. */
const link = (view: object) => `1.${Buffer.from(JSON.stringify(view)).toString('base64url')}`

test('the embed shows the model with only its own controls', async ({ page }) => {
	const { errors } = await open(page)

	await expect(page.locator('canvas')).toBeVisible()
	await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Download' })).toHaveAttribute('href', DOWNLOAD_URL)
	const openIn = page.getByRole('link', { name: 'Open in Nextcloud' })
	await expect(openIn).toHaveAttribute('href', SHARE_URL)
	await expect(openIn).toHaveAttribute('target', '_blank')
	await expect(openIn).toHaveAttribute('rel', 'noopener noreferrer')
	for (const name of ['Screenshot', 'Model info', 'Copy link to this view']) {
		await expect(page.getByRole('button', { name })).toHaveCount(0)
	}
	expect(errors).toEqual([])
})

test('no download when the share hides it', async ({ page }) => {
	const { errors } = await open(page, { ...EMBED, embed: { shareUrl: SHARE_URL, downloadUrl: null } })

	await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0)
	expect(errors).toEqual([])
})

test('a gone share says so', async ({ page }) => {
	const { errors } = await open(page, { ...EMBED, embed: 'gone' })

	await expect(page.locator('[role="status"]')).toHaveText('This model is no longer shared')
	await expect(page.locator('canvas')).toHaveCount(0)
	expect(errors).toEqual([])
})

test('a failed load does not say the share is gone', async ({ page }) => {
	const { errors } = await open(page, { ...EMBED, embed: 503 })

	await expect(page.locator('[role="status"]')).toHaveText('Couldn\'t load the model. Try again later.')
	await expect(page.locator('canvas')).toHaveCount(0)
	expect(errors).toEqual([])
})

test('a view in the embed code sets the camera', async ({ page }) => {
	const { errors } = await open(page, { ...EMBED, query: `view=${link({ c: { p: [30, 40, 50], t: [5, 5, 5], z: 1, o: 0 } })}` })

	const inModel = await page.evaluate(() => {
		// As view-links.spec.ts reads the light viewer: through the root vnode on its container
		const viewer = (document.querySelector('#threedviewer-public') as any)._vnode.component.subTree.component.proxy
		const model = viewer.linkModel
		model.updateWorldMatrix(true, false)
		return { position: model.worldToLocal(viewer.camera.position.clone()).toArray(), target: model.worldToLocal(viewer.controls.target.clone()).toArray() }
	})
	inModel.position.forEach((v: number, i: number) => expect(v).toBeCloseTo([30, 40, 50][i], 3))
	inModel.target.forEach((v: number, i: number) => expect(v).toBeCloseTo([5, 5, 5][i], 3))
	expect(errors).toEqual([])
})

test('full screen from the keyboard', async ({ page }) => {
	await open(page)
	const button = page.getByRole('button', { name: 'Full screen' })
	await expect(button).toHaveAttribute('aria-pressed', 'false')

	await button.focus()
	await page.keyboard.press('Enter')

	await expect(button).toHaveAttribute('aria-pressed', 'true')
	await page.keyboard.press('Enter')
	await expect(button).toHaveAttribute('aria-pressed', 'false')
})

// Spark draws a splat with workers it starts from blob: URLs, which the embed page's
// policy allows (lib/Listener/CspListener.php); none of it may be refused
test('a splat embeds', async ({ page }) => {
	const policy: string[] = []
	page.on('console', (message) => { if (message.text().includes('Content Security Policy')) policy.push(message.text()) })
	const splat = { id: 7511, name: 'grid.spz', body: fs.readFileSync('tests/fixtures/splats/grid.spz') }
	const { errors } = await openViewer(page, server.url, splat, EMBED)

	await expect.poll(() => page.evaluate(() => {
		const viewer = (document.querySelector('#threedviewer-public') as any)?._vnode?.component?.subTree?.component?.proxy
		let count = null
		viewer?.scene?.traverse((child: any) => { if (child.userData?.tdvSplat) count = child.userData.tdvSplat.count })
		return { count, spark: Boolean(viewer?.scene?.getObjectByName('tdv-spark')) }
	}), { timeout: 20000 }).toEqual({ count: 1000, spark: true })
	expect(policy).toEqual([])
	expect(errors).toEqual([])
})
