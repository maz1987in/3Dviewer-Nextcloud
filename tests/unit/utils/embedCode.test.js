/**
 * The code a user pastes into another site to show a public link's model there.
 */
import { buildEmbedCode, embedUrl, embeddableShares } from '../../../src/utils/embedCode.js'
import { decodeView } from '../../../src/utils/viewLink.js'

jest.mock('@nextcloud/router')

test('the snippet, exactly', () => {
	expect(buildEmbedCode({ url: 'https://cloud.example/index.php/apps/threedviewer/embed/AbC', width: 640, height: 480, title: 'part.stl' }))
		.toBe('<iframe src="https://cloud.example/index.php/apps/threedviewer/embed/AbC" width="640" height="480" title="part.stl" style="border: 0" allow="fullscreen" allowfullscreen loading="lazy"></iframe>')
})

test('every value is escaped for an attribute', () => {
	const code = buildEmbedCode({ url: 'https://cloud.example/embed/AbC?view=1.x&y="z"', width: 640, height: 480, title: 'A "big" <part> & more' })

	expect(code).toContain('src="https://cloud.example/embed/AbC?view=1.x&amp;y=&quot;z&quot;"')
	expect(code).toContain('title="A &quot;big&quot; &lt;part&gt; &amp; more"')
})

test('width and height are whole numbers from 200 to 4000', () => {
	const sized = (width, height) => buildEmbedCode({ url: 'https://c.example/e', width, height, title: 't' })

	expect(sized(50, 99999)).toContain('width="200" height="4000"')
	expect(sized(640.7, '480')).toContain('width="641" height="480"')
	expect(sized('nonsense', NaN)).toContain('width="640" height="480"')
})

test('the embed URL is the instance\'s embed page for the token', () => {
	expect(embedUrl('https://cloud.example', 'AbC', null)).toBe('https://cloud.example/index.php/apps/threedviewer/embed/AbC')
})

test('with a view, the embed URL carries its camera and nothing else', () => {
	const camera = { position: [30, 40, 50], target: [5, 5, 5], zoom: 1, projection: 'perspective' }
	const url = new URL(embedUrl('https://cloud.example', 'AbC', { camera, renderMode: 'clay', wireframe: true, exploded: 0.5 }))

	expect(url.pathname).toBe('/index.php/apps/threedviewer/embed/AbC')
	expect(decodeView(url.searchParams.get('view'))).toEqual({ camera })
})

test('keeps only readable file shares without a password, newest first and unexpired', () => {
	const now = Date.parse('2026-11-01T00:00:00')
	const base = { url: '', label: '', expires: null, canDownload: true, isFile: true, canRead: true, hasPassword: false }
	const shares = [
		{ ...base, id: 'old', token: 'a', created: 100 },
		{ ...base, id: 'new', token: 'b', created: 200 },
		{ ...base, id: 'password', token: 'c', created: 300, hasPassword: true },
		{ ...base, id: 'folder', token: 'd', created: 300, isFile: false },
		{ ...base, id: 'upload-only', token: 'e', created: 300, canRead: false },
		{ ...base, id: 'expired', token: 'f', created: 300, expires: now - 1 },
	]

	expect(embeddableShares(shares, now).map((s) => s.id)).toEqual(['new', 'old'])
})
