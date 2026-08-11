/**
 * The format shown under the filename in the viewer's top bar.
 *
 * This exists because the first version of it was written inline in the component as
 * `props.modelName.lastIndexOf('.')`, with the prop declared `{ type: String, default:
 * '' }`. A prop default only applies when the prop is `undefined`, and `App.vue` declares
 * `filename: { type: String, default: null }` — so before a model is chosen the top bar
 * received `null`, and the whole bar threw on render.
 *
 * Nothing in the suite saw it. The unit tests do not mount components, the browser specs
 * ran against a fixture that mounts the viewer with no file, and the crash there was one
 * console error among the ones a bare fixture already produces. It took loading the app
 * on a real Nextcloud to see the bar was not there.
 *
 * `getFileExtension` already handled the empty cases correctly and had been sitting in
 * this module the whole time — which is the other half of the lesson.
 */

const { getFormatLabel } = require('../../../src/utils/fileHelpers.js')

describe('getFormatLabel', () => {
	it('shows the extension of a model, upper-cased', () => {
		expect(getFormatLabel('benchy-boat.glb')).toBe('GLB')
	})

	it('shows nothing when no file is loaded yet', () => {
		// The state the top bar is in every time the app opens.
		expect(getFormatLabel(null)).toBe('')
		expect(getFormatLabel(undefined)).toBe('')
		expect(getFormatLabel('')).toBe('')
	})

	it('shows nothing for a name with no extension', () => {
		expect(getFormatLabel('README')).toBe('')
	})

	it('reads the extension through a path', () => {
		expect(getFormatLabel('models/textures/chair.OBJ')).toBe('OBJ')
	})

	/**
	 * A label, not a parser. Anything longer than a real 3D format's extension is more
	 * likely to be part of a dotted filename — `scene.backup.2026-07-28` — and rendering
	 * that as a format badge states something false about the file.
	 */
	it('shows nothing when the trailing segment is not extension-shaped', () => {
		expect(getFormatLabel('scene.backup.2026-07-28')).toBe('')
		expect(getFormatLabel('archive.tar.gz.partial')).toBe('')
	})
})
