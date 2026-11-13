/**
 * A link to a model becomes a card, on a real server with the app in custom_apps/.
 *
 * The apps that draw link previews (Text, Talk, Collectives, Deck) are not installed here, so
 * the page that would load the card is stood in for by the Files page, given the same two
 * files RenderReferenceListener adds. What is real: the server resolving the link through its
 * own reference manager, the built card script and stylesheet served from custom_apps/ under
 * the server's Content-Security-Policy, and the card registering itself in the registry
 * `@nextcloud/vue` renders from and drawing what the server resolved.
 */
import { APP_ASSET_ROOT, BASE_URL, INDEX, MODELS, expect, expectServed, readState, test } from './helpers'

const SCRIPT = `${APP_ASSET_ROOT}js/threedviewer-reference.mjs`
const STYLE = `${APP_ASSET_ROOT}css/threedviewer-reference.css`

test('a link to a model is drawn as a card with a button that opens it', async ({ page, guard }) => {
	const fileId = readState().fileIds.stl
	const link = `${INDEX}/apps/threedviewer/f/${fileId}`

	await page.goto(`${INDEX}/apps/files/`)
	await page.addStyleTag({ url: STYLE })
	await page.addScriptTag({ url: SCRIPT, type: 'module' })
	await page.waitForFunction(() => (window as any)._vue_richtext_widgets?.threedviewer_model !== undefined)

	// As Text and Talk ask for it: the signed-in user's session, the OCS endpoint
	const reference = await page.evaluate(async ({ base, link }) => {
		const response = await fetch(`${base}/ocs/v2.php/references/resolve?format=json&reference=${encodeURIComponent(link)}`, {
			headers: { 'OCS-APIRequest': 'true', Accept: 'application/json' },
		})
		return (await response.json()).ocs.data.references[link]
	}, { base: BASE_URL, link })
	expect(reference?.richObjectType).toBe('threedviewer_model')
	expect(reference.richObject.name).toBe(MODELS.stl.remote)

	await page.evaluate((richObject) => {
		const host = document.createElement('div')
		host.id = 'tdv-e2e-card'
		document.body.prepend(host)
		;(window as any)._vue_richtext_widgets.threedviewer_model.callback(host, { richObject })
	}, reference.richObject)

	const card = page.locator('#tdv-e2e-card .threedviewer-reference')
	await expect(card).toBeVisible()
	await expect(card.locator('.threedviewer-reference-name')).toHaveText(MODELS.stl.remote)
	await expect(card.locator('.threedviewer-reference-details').first()).toContainText('STL')
	const open = card.getByRole('link', { name: 'Open in 3D Viewer' })
	await expect(open).toHaveAttribute('href', link)
	// The stylesheet's rules reached the card: a flex row, not three stacked inline boxes
	expect(await card.evaluate((element) => getComputedStyle(element).display)).toBe('flex')

	expectServed(guard, SCRIPT)
	expectServed(guard, STYLE)
})
