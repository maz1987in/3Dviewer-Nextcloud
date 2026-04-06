/**
 * WebXR composable
 *
 * Wraps the Three.js WebXR API to provide a simple, reactive interface for
 * entering / exiting immersive VR sessions. The composable handles feature
 * detection, session lifecycle, and reference space configuration so the
 * rest of the viewer can stay agnostic to XR specifics.
 *
 * Note: WebXR requires HTTPS in production, but localhost is exempt for
 * development. Without a real headset, sessions can be emulated via the
 * Chrome WebXR Device API Emulator extension.
 */

import { ref, computed } from 'vue'
import { logger } from '../utils/logger.js'

export function useWebXR() {
	const isSupported = ref(false)
	const isSessionActive = ref(false)
	const session = ref(null)
	const error = ref(null)

	// Session-state derived flags exposed to the UI
	const canEnter = computed(() => isSupported.value && !isSessionActive.value)
	const canExit = computed(() => isSessionActive.value)

	/**
	 * Check whether the browser advertises immersive-vr support.
	 * Result is stored in `isSupported` so the UI can render an appropriate
	 * button state. Safe to call multiple times.
	 */
	const checkSupport = async () => {
		if (typeof navigator === 'undefined' || !navigator.xr) {
			isSupported.value = false
			logger.info('useWebXR', 'navigator.xr unavailable')
			return false
		}

		try {
			const supported = await navigator.xr.isSessionSupported('immersive-vr')
			isSupported.value = !!supported
			logger.info('useWebXR', 'WebXR support check complete', { supported })
			return isSupported.value
		} catch (err) {
			isSupported.value = false
			logger.warn('useWebXR', 'WebXR support check failed', err)
			return false
		}
	}

	/**
	 * Request an immersive VR session and bind it to the provided renderer.
	 * @param {THREE.WebGLRenderer} renderer - Three.js renderer with xr enabled
	 * @return {Promise<boolean>} True if the session started successfully
	 */
	const enterVR = async (renderer) => {
		if (!renderer || !navigator.xr) {
			error.value = 'WebXR not available'
			return false
		}

		if (isSessionActive.value) {
			logger.warn('useWebXR', 'VR session already active')
			return true
		}

		try {
			const xrSession = await navigator.xr.requestSession('immersive-vr', {
				optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
			})

			// Wire session lifecycle events
			xrSession.addEventListener('end', () => {
				isSessionActive.value = false
				session.value = null
				logger.info('useWebXR', 'VR session ended')
			})

			// Three.js handles the rendering target swap and reference space
			await renderer.xr.setSession(xrSession)
			renderer.xr.setReferenceSpaceType('local-floor')

			session.value = xrSession
			isSessionActive.value = true
			error.value = null

			logger.info('useWebXR', 'VR session started')
			return true
		} catch (err) {
			error.value = err.message || 'Failed to start VR session'
			logger.error('useWebXR', 'Failed to start VR session', err)
			return false
		}
	}

	/**
	 * End the active VR session if any.
	 */
	const exitVR = async () => {
		if (!session.value) return
		try {
			await session.value.end()
		} catch (err) {
			logger.warn('useWebXR', 'Failed to end VR session cleanly', err)
		}
	}

	return {
		// State
		isSupported,
		isSessionActive,
		session,
		error,

		// Computed
		canEnter,
		canExit,

		// Methods
		checkSupport,
		enterVR,
		exitVR,
	}
}
