/**
 * The background thumbnailer draws a scan at the thumbnail budget (300,000 points), not
 * the desktop's twenty million: the loader picks it from the context's `thumbnail`
 * (pointCloudLoader.test.js), which only the worker sets.
 */
const { readFileSync } = require('fs')
const { join } = require('path')

const WORKER = readFileSync(join(__dirname, '../../../src/thumbnails/thumbnail.worker.js'), 'utf8')

test('the worker asks loaders for a thumbnail', () => {
	const context = /loadModelByExtension\(extension, buffer, \{([\s\S]*?)\}\)/.exec(WORKER)?.[1] ?? ''
	expect(context).toMatch(/\bthumbnail: true\b/)
})
