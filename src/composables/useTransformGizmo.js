/**
 * Transform gizmo composable
 * Provides translate / rotate / scale handles via Three.js TransformControls
 */

import { ref, shallowRef, toRaw, markRaw } from 'vue'
import { logger } from '../utils/logger.js'

export function useTransformGizmo() {
	const isActive = ref(false)
	const mode = ref('translate') // 'translate' | 'rotate' | 'scale'
	const controlsRef = shallowRef(null)
	const sceneRef = shallowRef(null)
	const cameraRef = shallowRef(null)
	const rendererRef = shallowRef(null)
	const orbitControlsRef = shallowRef(null)
	const attachedObject = shallowRef(null)

	/**
	 * Initialize transform controls.
	 * Call after scene, camera, and renderer are ready.
	 */
	const init = async (scene, camera, renderer, orbitControls) => {
		sceneRef.value = scene
		cameraRef.value = camera
		rendererRef.value = renderer
		orbitControlsRef.value = orbitControls

		const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js')

		const rawCamera = toRaw(camera)
		const rawRenderer = toRaw(renderer)
		const rawScene = toRaw(scene)

		const tc = markRaw(new TransformControls(rawCamera, rawRenderer.domElement))
		tc.setMode(mode.value)
		tc.setSize(0.8)

		// Disable orbit while dragging the gizmo
		tc.addEventListener('dragging-changed', (event) => {
			const orbit = toRaw(orbitControlsRef.value)
			if (orbit) orbit.enabled = !event.value
		})

		tc.visible = false
		tc.enabled = false
		rawScene.add(tc)

		controlsRef.value = tc
		logger.info('useTransformGizmo', 'Initialized')
	}

	/**
	 * Toggle the gizmo on/off.
	 * When turning on, attaches to the model root.
	 */
	const toggle = (modelRoot) => {
		if (!controlsRef.value) return

		const tc = toRaw(controlsRef.value)
		isActive.value = !isActive.value

		if (isActive.value && modelRoot) {
			const obj = toRaw(modelRoot)
			tc.attach(obj)
			tc.visible = true
			tc.enabled = true
			attachedObject.value = modelRoot
			logger.info('useTransformGizmo', 'Attached to model', { mode: mode.value })
		} else {
			tc.detach()
			tc.visible = false
			tc.enabled = false
			attachedObject.value = null
			logger.info('useTransformGizmo', 'Detached')
		}
	}

	/**
	 * Switch gizmo mode.
	 */
	const setMode = (newMode) => {
		if (!['translate', 'rotate', 'scale'].includes(newMode)) return
		mode.value = newMode
		if (controlsRef.value) {
			toRaw(controlsRef.value).setMode(newMode)
			logger.info('useTransformGizmo', 'Mode changed', { mode: newMode })
		}
	}

	/**
	 * Reset the attached object's transform to identity.
	 */
	const resetTransform = () => {
		if (!attachedObject.value) return
		const obj = toRaw(attachedObject.value)
		obj.position.set(0, 0, 0)
		obj.rotation.set(0, 0, 0)
		obj.scale.set(1, 1, 1)
		logger.info('useTransformGizmo', 'Transform reset')
	}

	/**
	 * Clean up resources.
	 */
	const dispose = () => {
		if (controlsRef.value) {
			const tc = toRaw(controlsRef.value)
			tc.detach()
			if (sceneRef.value) {
				toRaw(sceneRef.value).remove(tc)
			}
			tc.dispose()
			controlsRef.value = null
		}
		isActive.value = false
		attachedObject.value = null
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
