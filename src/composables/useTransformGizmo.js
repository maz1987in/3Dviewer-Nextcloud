/**
 * Transform gizmo composable
 * Provides translate / rotate / scale handles via Three.js TransformControls
 *
 * NOTE: Three.js r152+ changed TransformControls to extend Controls (not Object3D).
 * The visual helper must be obtained via tc.getHelper() and added to the scene separately.
 */

import { ref } from 'vue'
import { logger } from '../utils/logger.js'

export function useTransformGizmo() {
	const isActive = ref(false)
	const mode = ref('translate') // 'translate' | 'rotate' | 'scale'

	// Plain JS references — keep Three.js objects out of Vue reactivity entirely
	let controls = null
	let helper = null
	let scene = null
	let orbitControls = null
	let attachedObject = null

	/**
	 * Initialize transform controls.
	 * Call after scene, camera, and renderer are ready.
	 */
	const init = async (rawScene, rawCamera, rawRenderer, rawOrbitControls) => {
		try {
			scene = rawScene
			orbitControls = rawOrbitControls

			const mod = await import('three/examples/jsm/controls/TransformControls.js')
			const TransformControls = mod.TransformControls || mod.default

			controls = new TransformControls(rawCamera, rawRenderer.domElement)
			controls.setMode(mode.value)
			controls.setSize(0.8)

			// The visual gizmo is a separate Object3D obtained via getHelper()
			helper = controls.getHelper()
			helper.visible = false
			scene.add(helper)

			// Disable orbit while dragging the gizmo
			controls.addEventListener('dragging-changed', (event) => {
				if (orbitControls) orbitControls.enabled = !event.value
			})

			logger.info('useTransformGizmo', 'Initialized')
		} catch (err) {
			logger.error('useTransformGizmo', 'Init failed', { error: err.message })
		}
	}

	/**
	 * Toggle the gizmo on/off.
	 * When turning on, attaches to the model root.
	 */
	const toggle = (modelRoot) => {
		if (!controls) {
			logger.warn('useTransformGizmo', 'Toggle called but controls not initialized')
			return
		}

		isActive.value = !isActive.value

		if (isActive.value && modelRoot) {
			controls.attach(modelRoot)
			attachedObject = modelRoot
			logger.info('useTransformGizmo', 'Attached', { mode: mode.value })
		} else {
			controls.detach()
			isActive.value = false
			attachedObject = null
			logger.info('useTransformGizmo', 'Detached')
		}
	}

	/**
	 * Switch gizmo mode.
	 */
	const setMode = (newMode) => {
		if (!['translate', 'rotate', 'scale'].includes(newMode)) return
		mode.value = newMode
		if (controls) {
			controls.setMode(newMode)
			logger.info('useTransformGizmo', 'Mode changed', { mode: newMode })
		}
	}

	/**
	 * Reset the attached object's transform to identity.
	 */
	const resetTransform = () => {
		if (!attachedObject) return
		attachedObject.position.set(0, 0, 0)
		attachedObject.rotation.set(0, 0, 0)
		attachedObject.scale.set(1, 1, 1)
		logger.info('useTransformGizmo', 'Transform reset')
	}

	/**
	 * Clean up resources.
	 */
	const dispose = () => {
		if (controls) {
			controls.detach()
			if (helper && scene) {
				scene.remove(helper)
			}
			controls.dispose()
			controls = null
			helper = null
		}
		scene = null
		orbitControls = null
		attachedObject = null
		isActive.value = false
	}

	return {
		isActive,
		mode,
		init,
		toggle,
		setMode,
		resetTransform,
		dispose,
	}
}
