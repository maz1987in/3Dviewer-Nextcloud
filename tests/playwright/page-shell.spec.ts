/**
 * The page the viewer is mounted in, as Nextcloud lays it out. @nextcloud/vue's NcContent
 * moves its "skip to" links into #skip-actions, which Nextcloud's layouts give every page;
 * from 9.14, without it, a later update of the app throws inside Vue.
 */
import { test, expect } from '@playwright/test'
import { startServer, openViewer, stlCube } from './helpers/viewerServer'

let server: Awaited<ReturnType<typeof startServer>>

test.beforeAll(async () => {
	server = await startServer()
})

test.afterAll(async () => {
	await server.close()
})

test('the viewer mounts with no error inside Vue', async ({ page }) => {
	const thrown: string[] = []
	page.on('console', (message) => {
		if (message.type() === 'error' && message.text().startsWith('TypeError')) {
			thrown.push(message.text())
		}
	})
	await openViewer(page, server.url, { id: 7001, name: 'cube.stl', body: stlCube(10) })
	await page.waitForTimeout(1000)

	await expect(page.locator('#skip-actions')).toHaveCount(1)
	expect(thrown).toEqual([])
})
