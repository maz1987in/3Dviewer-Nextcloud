/**
 * The viewer components hand a load's own file id and status to the capture.
 *
 * ViewerComponent's `fileid` watcher can start a second load in the same instance while
 * the first is still running. If the capture read `this.fileid` or the instance's current
 * status when the first load finished, file A's render would be stored under file B's id
 * and etag, and the write-once rule would keep it for good. Neither component can be
 * mounted here, so this reads the source for the one rule that prevents it.
 */

const { readFileSync } = require('fs')
const { join } = require('path')

const SRC = join(__dirname, '..', '..', '..', 'src')

/**
 * The text of one method of an Options API component, from its signature to the next
 * method's doc comment.
 *
 * @param {string} source - Component source
 * @param {string} signature - Start of the method, e.g. `captureThumbnail(`
 * @return {string} The method text
 */
function methodText(source, signature) {
	const start = source.indexOf(`\n\t\t${signature}`)
	expect(start).toBeGreaterThan(-1)
	const end = source.indexOf('\n\t\t/**', start)
	return source.slice(start, end === -1 ? undefined : end)
}

describe('ViewerComponent capture wiring', () => {
	const source = readFileSync(join(SRC, 'views', 'ViewerComponent.vue'), 'utf8')

	test('captureThumbnail takes the file id and status from its caller, not from the instance', () => {
		const body = methodText(source, 'captureThumbnail(')

		expect(body).toMatch(/captureThumbnail\(object3D, extension, fileId, statuses, sourceFiles = null\)/)
		expect(body).not.toMatch(/this\.fileid/)
	})

	test('every call passes the load\'s own file id and status', () => {
		const calls = source.match(/this\.captureThumbnail\([^)]*\)/g) ?? []

		expect(calls).toHaveLength(2)
		for (const call of calls) {
			expect(call).toMatch(/, extension, fileId, statuses(, result\.dependencies)?\)$/)
		}
	})

	test('loadModel reads the file id once, at the start, for the status and the downloads', () => {
		const loadModel = methodText(source, 'async loadModel(THREE)')
		const withFiles = methodText(source, 'async loadModelWithFiles(')

		expect(loadModel).toMatch(/const fileId = this\.fileid/)
		expect(loadModel.match(/this\.fileid/g)).toHaveLength(1)
		expect(withFiles).not.toMatch(/this\.fileid/)
	})

	test('loadModel awaits the status before either download starts', () => {
		const loadModel = methodText(source, 'async loadModel(THREE)')
		const awaited = loadModel.indexOf('await awaitStatusBeforeDownload(')

		expect(awaited).toBeGreaterThan(-1)
		expect(loadModel).not.toMatch(/startStatusFetch/)
		expect(awaited).toBeLessThan(loadModel.indexOf('loadModelWithDependencies('))
		expect(awaited).toBeLessThan(loadModel.indexOf('fetch(buildFileUrl(fileId))'))
	})

	test('the multi-file capture passes the companions, so a cached one skips it', () => {
		expect(source).toMatch(/this\.captureThumbnail\(modelResult\.object3D, extension, fileId, statuses, result\.dependencies\)/)
	})
})

describe('ThreeViewer capture wiring', () => {
	const source = readFileSync(join(SRC, 'components', 'ThreeViewer.vue'), 'utf8')

	test('awaits the status before the model download starts', () => {
		const awaited = source.indexOf('await awaitStatusBeforeDownload(')

		expect(awaited).toBeGreaterThan(-1)
		expect(source).not.toMatch(/startStatusFetch/)
		expect(awaited).toBeLessThan(source.indexOf('modelLoading.loadModelFromFileId('))
	})

	test('hands the capture the files the load used, so a cached companion skips it', () => {
		expect(source).toMatch(/sourceFiles: loadedModel\.sourceFiles,/)
	})

	test('captures the model this load produced, not whatever modelRoot holds later', () => {
		expect(source).toMatch(/const model = loadedModel\.object3D\s+scheduleCapture\(/)
		expect(source).not.toMatch(/const model = modelRoot\.value/)
	})
})
