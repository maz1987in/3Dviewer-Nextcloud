/**
 * Three.js r184 deprecated PCFSoftShadowMap. WebGLShadowMap.render() now warns
 * and silently reassigns `this.type = PCFShadowMap` on the first shadow pass, so
 * the constant no longer buys soft shadows — it only buys a console warning on
 * every viewer session.
 *
 * Two checks, because the assignment happens in three places and only one of
 * them can be driven under jsdom: usePerformance's applyPerformanceSettings
 * takes a renderer, while useScene and ThreeViewer build a real WebGLRenderer.
 */
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { usePerformance } from '../../../src/composables/usePerformance.js'

/**
 * Minimal stand-in for the parts of WebGLRenderer that
 * applyPerformanceSettings touches.
 */
function fakeRenderer() {
	return {
		shadowMap: { enabled: false, type: null },
		setPixelRatio() {},
		setSize() {},
		getPixelRatio: () => 1,
		getSize: (target) => target.set(800, 600),
		getContext: () => ({ getContextAttributes: () => ({ antialias: true }) }),
	}
}

describe('shadow map type', () => {
	it('does not select the deprecated PCFSoftShadowMap when shadows are on', () => {
		const perf = usePerformance()
		perf.shadows.value = true
		const renderer = fakeRenderer()

		perf.applyPerformanceSettings(renderer)

		expect(renderer.shadowMap.enabled).toBe(true)
		expect(renderer.shadowMap.type).not.toBe(THREE.PCFSoftShadowMap)
		expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap)
	})

	it('still disables shadow filtering cost when shadows are off', () => {
		const perf = usePerformance()
		perf.shadows.value = false
		const renderer = fakeRenderer()

		perf.applyPerformanceSettings(renderer)

		expect(renderer.shadowMap.enabled).toBe(false)
		expect(renderer.shadowMap.type).toBe(THREE.BasicShadowMap)
	})

	it('is not assigned anywhere in src/', () => {
		const root = path.resolve(__dirname, '../../../src')
		const offenders = []

		// Comments are blanked before scanning, mirroring NoPrivateServerApiTest.php:
		// a note explaining why the constant is avoided must not read as a use of it.
		// Newlines are preserved so reported line numbers stay accurate.
		const stripComments = (source) => source
			.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
			.replace(/\/\/[^\n]*/g, '')

		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name)
				if (entry.isDirectory()) {
					walk(full)
				} else if (/\.(js|vue)$/.test(entry.name)) {
					stripComments(fs.readFileSync(full, 'utf8')).split('\n').forEach((line, i) => {
						if (line.includes('PCFSoftShadowMap')) {
							offenders.push(`${path.relative(root, full)}:${i + 1}`)
						}
					})
				}
			}
		}
		walk(root)

		expect(offenders).toEqual([])
	})
})
