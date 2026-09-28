/**
 * Render mode composable
 * Draws the model in an inspection shading instead of its own materials:
 *
 * - clay:    a lit clay look (matcap) that shows surface form, keeping each part's colour
 * - normals: surface direction as colour, which makes dents, seams and flipped faces obvious
 * - xray:    the model's own materials made see-through, to look inside assemblies
 *
 * The model's materials are set aside, never changed, and put back when the mode
 * returns to standard, when the model is exported, and when the next model loads.
 */

import { ref, readonly } from 'vue'
import {
	CanvasTexture,
	Color,
	DoubleSide,
	MeshMatcapMaterial,
	MeshNormalMaterial,
	SRGBColorSpace,
} from 'three'
import { logger } from '../utils/logger.js'

export const RENDER_MODES = ['standard', 'clay', 'normals', 'xray']

// How much of a part an x-ray lets through
const XRAY_OPACITY = 0.25

/**
 * A clay matcap drawn on a canvas, so no image has to ship with the app: a warm
 * highlight up and to the left, falling off to a cool shadow at the rim.
 * @return {CanvasTexture|null} null where there is no 2D canvas (tests, workers)
 */
function createClayMatcap() {
	if (typeof document === 'undefined') return null
	const size = 256
	const canvas = document.createElement('canvas')
	canvas.width = size
	canvas.height = size
	const ctx = canvas.getContext('2d')
	if (!ctx) return null

	const gradient = ctx.createRadialGradient(size * 0.38, size * 0.32, size * 0.02, size / 2, size / 2, size / 2)
	gradient.addColorStop(0, '#ffffff')
	gradient.addColorStop(0.35, '#d9d4cc')
	gradient.addColorStop(0.75, '#8a8580')
	gradient.addColorStop(1, '#3a3d44')
	ctx.fillStyle = gradient
	ctx.fillRect(0, 0, size, size)

	const texture = new CanvasTexture(canvas)
	texture.colorSpace = SRGBColorSpace
	return texture
}

export function useRenderMode() {
	const mode = ref('standard')

	// Scene objects, kept out of reactive state
	let root = null
	let suspended = false
	const originals = new Map() // mesh -> its own material (or array of them)
	const overrides = new Map() // own material -> what stands in for it
	let clayMatcap = null

	const makeOverride = (original, m) => {
		const shared = {
			side: original.side,
			wireframe: original.wireframe,
		}
		if (m === 'clay') {
			if (!clayMatcap) clayMatcap = createClayMatcap()
			return new MeshMatcapMaterial({
				...shared,
				matcap: clayMatcap,
				color: original.color ? original.color.clone() : new Color(0xffffff),
				vertexColors: Boolean(original.vertexColors),
			})
		}
		if (m === 'normals') {
			return new MeshNormalMaterial(shared)
		}
		// X-ray: the part's own look, see-through, with nothing hiding what is behind it
		const xray = original.clone()
		xray.transparent = true
		xray.opacity = XRAY_OPACITY * (original.opacity ?? 1)
		xray.depthWrite = false
		xray.side = DoubleSide
		return xray
	}

	const overrideFor = (original) => {
		if (!original) return original
		if (!overrides.has(original)) {
			overrides.set(original, makeOverride(original, mode.value))
		}
		return overrides.get(original)
	}

	// Put the current mode's materials on every mesh of the model
	const apply = () => {
		if (!root || mode.value === 'standard') return
		root.traverse((child) => {
			if (!child.isMesh || !child.material) return
			if (!originals.has(child)) originals.set(child, child.material)
			const own = originals.get(child)
			child.material = Array.isArray(own) ? own.map(overrideFor) : overrideFor(own)
		})
	}

	// Give every mesh its own material back
	const restore = () => {
		originals.forEach((own, mesh) => {
			// Wireframe is switched on whatever material is showing; carry it back
			const shown = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
			const ownList = Array.isArray(own) ? own : [own]
			ownList.forEach((material, i) => {
				if (material && shown[i]) material.wireframe = shown[i].wireframe
			})
			mesh.material = own
		})
		originals.clear()
		overrides.forEach((material) => material.dispose())
		overrides.clear()
	}

	/**
	 * Switch the whole model to a render mode.
	 * @param {string} newMode - one of RENDER_MODES
	 */
	const setMode = (newMode) => {
		if (!RENDER_MODES.includes(newMode)) {
			throw new Error(`Invalid render mode: ${newMode}. Available modes: ${RENDER_MODES.join(', ')}`)
		}
		if (newMode === mode.value) return
		restore()
		mode.value = newMode
		if (!suspended) apply()
		logger.info('useRenderMode', 'Mode changed', { mode: newMode })
	}

	/**
	 * Take over a newly loaded model, keeping the mode the viewer was in.
	 * @param {THREE.Object3D} model
	 */
	const init = (model) => {
		restore()
		root = model || null
		suspended = false
		apply()
	}

	/**
	 * Put the model's own materials back for a while (an export, say) without
	 * leaving the mode; `resume` shows the mode again.
	 */
	const suspend = () => {
		restore()
		suspended = true
	}

	const resume = () => {
		suspended = false
		apply()
	}

	const dispose = () => {
		restore()
		root = null
		suspended = false
		clayMatcap?.dispose()
		clayMatcap = null
	}

	return {
		mode: readonly(mode),
		setMode,
		init,
		suspend,
		resume,
		dispose,
	}
}
