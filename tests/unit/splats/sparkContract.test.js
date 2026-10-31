/**
 * The Spark names the splat code uses, read from Spark's own type declarations, so an
 * upgrade that renames one fails here rather than in a browser.
 */
import fs from 'node:fs'
import path from 'node:path'

const TYPES = path.resolve(__dirname, '../../../node_modules/@sparkjsdev/spark/dist/types')
const declarations = (name) => fs.readFileSync(path.join(TYPES, `${name}.d.ts`), 'utf8')

const NAMES = {
	SplatMesh: [/packedSplats\?: PackedSplats;/, /initialized: Promise<SplatMesh>;/, /dispose\(\): void;/],
	PackedSplats: [
		/fileBytes\?: Uint8Array \| ArrayBuffer;/,
		/fileType\?: SplatFileType;/,
		/fileName\?: string;/,
		/initialized: Promise<PackedSplats>;/,
		/numSplats: number;/,
		/extractSplats\(indices: Uint32Array, pageColoring: boolean\): PackedSplats;/,
		/getSplat\(index: number\)/,
		/dispose\(\): void;/,
	],
	SparkRenderer: [/renderer: THREE\.WebGLRenderer;/, /update\(\{ scene, camera, \}: \{[^}]*\}\): Promise<void>;/, /dispose\(\): void;/],
	defines: [/enum SplatFileType \{[^}]*SPLAT = "splat"/],
}

describe('the Spark this app is built against', () => {
	it('is pinned at exactly 2.4.0', () => {
		const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'))
		expect(pkg.dependencies['@sparkjsdev/spark']).toBe('2.4.0')
	})

	for (const [file, patterns] of Object.entries(NAMES)) {
		it(`declares what the splat code uses from ${file}`, () => {
			const text = declarations(file)
			for (const pattern of patterns) {
				expect(text).toMatch(pattern)
			}
		})
	}
})
