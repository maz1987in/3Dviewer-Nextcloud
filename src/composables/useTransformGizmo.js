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
		// Store raw references to avoid Vue proxy issues with Three.js
		const rawScene = toRaw(scene)
		const rawCamera = toRaw(camera)
		const rawRenderer = toRaw(renderer)

		sceneRef.value = rawScene
		cameraRef.value = rawCamera
		rendererRef.value = rawRenderer
		orbitControlsRef.value = toRaw(orbitControls)

		const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js')

		const tc = new TransformControls(rawCamera, rawRenderer.domElement)
		tc.setMode(mode.value)
		tc.setSize(0.8)

		// Disable orbit while dragging the gizmo
		tc.addEventListener('dragging-changed', (event) => {
			const orbit = orbitControlsRef.value
			if (orbit) orbit.enabled = !event.value
		})

		tc.visible = false
		tc.enabled = false
		rawScene.add(tc)

		// Store as markRaw to prevent Vue from wrapping it
		controlsRef.value = markRaw(tc)
		logger.info('useTransformGizmo', 'Initialized', { sceneChildren: rawScene.children.length })
	}

	/**
	 * Toggle the gizmo on/off.
	 * When turning on, attaches to the model root.
	 */
	const toggle = (modelRoot) => {
		if (!controlsRef.value) {
			logger.warn('useTransformGizmo', 'Toggle called but controls not initialized')
			return
		}

		const tc = controlsRef.value // already markRaw
		isActive.value = !isActive.value

		if (isActive.value && modelRoot) {
			const obj = toRaw(modelRoot)
			tc.attach(obj)
			tc.visible = true
			tc.enabled = true
			attachedObject.value = obj
			logger.info('useTransformGizmo', 'Attached to model', { mode: mode.value, isActive: isActive.value })
		} else {
			tc.detach()
			tc.visible = false
			tc.enabled = false
			isActive.value = false
			attachedObject.value = null
			logger.info('useTransformGizmo', 'Detached', { isActive: isActive.value })
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
