/**
 * The tools panel at a phone's width: every row stays inside the panel.
 */
import { test, expect } from '@playwright/test'
import { startServer, openViewer, stlCube } from './helpers/viewerServer'

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

// A Pixel 8's Chrome viewport
test.use({ viewport: { width: 411, height: 784 } })

test('the export row fits the panel on a phone, Export button and all', async ({ page }) => {
	await page.route('**/apps/threedviewer/settings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: {} }) }))
	await openViewer(page, server.url, { id: 7171, name: 'cube.stl', body: stlCube(10) })
	await page.locator('.slide-out-panel').getByText('Export', { exact: true }).first().click()
	const exportButton = page.locator('.export-btn')
	await expect(exportButton).toBeVisible()

	const edges = await page.evaluate(() => {
		const panel = document.querySelector('.slide-out-panel')!.getBoundingClientRect()
		const rows = [...document.querySelectorAll('.slide-out-panel .tool-row')]
			.filter((row) => (row as HTMLElement).offsetParent)
			.map((row) => row.getBoundingClientRect().right)
		return { panelRight: panel.right, rowRights: rows, buttonRight: document.querySelector('.export-btn')!.getBoundingClientRect().right }
	})
	expect(edges.buttonRight).toBeLessThanOrEqual(edges.panelRight)
	for (const right of edges.rowRights) {
		expect(right).toBeLessThanOrEqual(edges.panelRight)
	}
})
