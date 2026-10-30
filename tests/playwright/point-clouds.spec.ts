/**
 * Scans in the full viewer: they open as points, a chemistry .xyz says it isn't one, and
 * Cancel loading stops a scan being read. The readers themselves are pinned by the Jest
 * tests in tests/unit/pointclouds/.
 */
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer, openViewer } from './helpers/viewerServer'

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/pointclouds')
const CUBE_RGB = { id: 7601, name: 'cube-rgb.xyz', body: fs.readFileSync(path.join(FIXTURES, 'cube-rgb.xyz')) }
const MOLECULE = { id: 7602, name: 'molecule.xyz', body: fs.readFileSync(path.join(FIXTURES, 'molecule.xyz')) }

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

/** What the full viewer holds: whether its model is a scan, and how many points. */
const scene = (page: Page) => page.evaluate(() => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	const root = viewer.modelRoot
	return { points: Boolean(root?.isPoints), count: root?.userData?.tdvPointCloud?.count ?? null }
})

test('an XYZ scan opens as points', async ({ page }) => {
	const { errors } = await openViewer(page, server.url, CUBE_RGB)

	await expect(page.locator('canvas').first()).toBeVisible()
	expect(await scene(page)).toEqual({ points: true, count: 1000 })
	expect(errors).toEqual([])
})

test('a chemistry .xyz says it lists atoms', async ({ page }) => {
	const { errors } = await openViewer(page, server.url, MOLECULE, { user: 'alice', loads: false })

	await expect(page.locator('.error-display')).toContainText('This .xyz file lists atoms, not a scan, so it can\'t be shown here.')
	expect(await scene(page)).toEqual({ points: false, count: null })
	expect(errors).toEqual([])
})

test('cancel while a scan is read leaves no model and no error', async ({ page }) => {
	// Large enough that reading it outlasts the click
	const lines = Array.from({ length: 1_500_000 }, (_, i) => `${i % 1000} ${(i / 1000) | 0} ${i % 7}`).join('\n')
	const { errors } = await openViewer(page, server.url, { id: 7603, name: 'big.xyz', body: lines }, { user: 'alice', loads: false })

	await page.getByRole('button', { name: 'Cancel loading' }).click()

	await expect(page.locator('.loading')).toBeHidden({ timeout: 10000 })
	await expect(page.locator('.error-display')).toHaveCount(0)
	// Long enough for a read that wasn't stopped to have landed
	await page.waitForTimeout(3000)
	expect(await scene(page)).toEqual({ points: false, count: null })
	expect(errors).toEqual([])
})
