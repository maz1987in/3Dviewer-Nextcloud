/**
 * A logged-in user opens models on a real Nextcloud with the app installed in custom_apps/,
 * the way the App Store installs it.
 *
 * STL needs nothing but the app's own bundle. STEP (OpenCascade) and 3DM (rhino3dm) each load
 * a WebAssembly decoder from the app's directory and start it under the server's
 * Content-Security-Policy, which is what #169, #188 and #204 broke. Every test also runs under
 * the guard in helpers.ts: no CSP violation, and no 404 for the app's own files.
 */
import {
	INDEX, MODELS, expect, expectModelShown, expectServed, expectStandaloneLoaded, readState, test,
} from './helpers'

for (const model of Object.values(MODELS)) {
	test.describe(`${model.kind.toUpperCase()}`, () => {
		test(`opens ${model.remote} from the Files app`, async ({ page, guard }) => {
			await page.goto(`${INDEX}/apps/files/`)
			// The app's script registers its handler with the Viewer app after the page has
			// painted. A click before that opens an empty Viewer, which is a race in the test,
			// not something a person who waits for the list to appear would meet.
			await page.waitForFunction(() => (window as any).OCA?.Viewer?.availableHandlers?.some((handler: { id: string }) => handler.id === 'threedviewer'))
			const row = page.locator(`[data-cy-files-list-row-name="${model.remote}"]`)
			await row.locator('[data-cy-files-list-row-name-link]').click()

			await expectModelShown(page)
			if (model.decoder) {
				expectServed(guard, model.decoder)
			}
		})

		test(`opens ${model.remote} on the app's own page`, async ({ page, guard }) => {
			await page.goto(`${INDEX}/apps/threedviewer/f/${readState().fileIds[model.kind]}`)

			await expectStandaloneLoaded(page)
			if (model.decoder) {
				expectServed(guard, model.decoder)
			}
		})
	})
}

test('the navigation icon is served', async ({ page }) => {
	// The icon is requested when the apps menu opens. Where Nextcloud writes its URL is the
	// server's doing (#211): on a custom_apps install it must not be under /apps/threedviewer/.
	const icon = page.waitForResponse((response) => /threedviewer.*\/app\.svg$|theming\/img\/threedviewer\//.test(response.url()))
	await page.goto(`${INDEX}/apps/files/`)
	await page.getByRole('button', { name: 'Open apps menu' }).first().click()

	const response = await icon
	expect(response.status(), response.url()).toBe(200)
})
