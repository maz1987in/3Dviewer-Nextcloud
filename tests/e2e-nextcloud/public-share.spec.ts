/**
 * A visitor with no account opens a model through a public link.
 *
 * The share page is built by the server apart from the Files app, and so is its
 * Content-Security-Policy; a decoder that starts in the Files app can still be refused here.
 * This runs with an empty browser context: no session cookie from the user who made the link.
 */
import { MODELS, INDEX, expectModelShown, expectServed, readState, test } from './helpers'

test.use({ storageState: { cookies: [], origins: [] } })

for (const kind of ['stl', 'step'] as const) {
	test(`shows ${MODELS[kind].remote} to a visitor who is not logged in`, async ({ page, guard }) => {
		const token = readState().shares[kind]
		await page.goto(`${INDEX}/s/${token}`)

		await expectModelShown(page)
		const { decoder } = MODELS[kind]
		if (decoder) {
			expectServed(guard, decoder)
		}
	})
}
