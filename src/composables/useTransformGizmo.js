/**
 * Transform gizmo composable
 * Provides translate / rotate / scale handles via Three.js TransformControls
 *
 * NOTE: Three.js r152+ changed TransformControls to extend Controls (not Object3D).
 * The visual helper must be obtained via tc.getHelper() and added to the scene separately.
 */

import { ref } from 'vue'
import { logger } from '../utils/logger.js'
import { MOVED_BY, ownTransformOf, rememberOwnTransform } from '../utils/viewerTransforms.js'

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
	 * Remember an object's transform as the one Reset returns it to: the loader's own
	 * rotation (3MF is turned Z-up to Y-up) and rescale (FBX and OBJ shrink a large model
	 * to fit), and the viewer's centring, not identity. Called when a model has been
	 * placed after loading; an object attached without one is remembered as it is when
	 * first attached. Kept in the registry of what viewer tools move (viewerTransforms),
	 * so a thumbnail draws the model as loaded, however the gizmo has turned it.
	 * @param {THREE.Object3D} object - The model root
	 */
	const rememberTransform = (object) => {
		rememberOwnTransform(object, MOVED_BY.gizmo)
	}

	/**
	 * Initialize transform controls.
	 * Call after scene, camera, and renderer are ready.
	 * @param rawScene
	 * @param rawCamera
	 * @param rawRenderer
	 * @param rawOrbitControls
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
	 * @param modelRoot
	 */
	const toggle = (modelRoot) => {
		if (!controls) {
			logger.warn('useTransformGizmo', 'Toggle called but controls not initialized')
			return
		}

		isActive.value = !isActive.value

		if (isActive.value && modelRoot) {
			rememberTransform(modelRoot)
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
	 * @param newMode
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
	 * Return the attached object to its transform as loaded. Identity would undo what the
	 * loader set: the FBX and OBJ rescale, whose factor sourceUnits.js still divides out,
	 * so readings came out 1/viewerScale too large, and the 3MF Z-up turn.
	 */
	const resetTransform = () => {
		if (!attachedObject) return
		const loaded = ownTransformOf(attachedObject)
		if (loaded) {
			attachedObject.position.copy(loaded.position)
			attachedObject.quaternion.copy(loaded.quaternion)
			attachedObject.scale.copy(loaded.scale)
		} else {
			attachedObject.position.set(0, 0, 0)
			attachedObject.rotation.set(0, 0, 0)
			attachedObject.scale.set(1, 1, 1)
		}
		attachedObject.updateMatrixWorld?.(true)
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
		rememberTransform,
		resetTransform,
		dispose,
	}
}
