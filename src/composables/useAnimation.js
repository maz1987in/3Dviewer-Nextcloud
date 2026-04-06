import { ref, shallowRef, computed } from 'vue'
import { AnimationMixer, LoopRepeat, LoopOnce } from 'three'
import { logger } from '../utils/logger.js'

/**
 * Composable for managing 3D model animations
 * Handles AnimationMixer creation, playback control, and updates
 */
export function useAnimation() {
	// Animation state
	const mixer = shallowRef(null)
	const actions = ref([])
	const isPlaying = ref(false)
	const isLooping = ref(true) // Default to looping
	const currentTime = ref(0)
	const duration = ref(0)
	const activeClipIndex = ref(0)
	const clipNames = ref([])

	// Computed properties
	const hasAnimations = computed(() => mixer.value !== null && actions.value.length > 0)
	const canPlay = computed(() => hasAnimations.value && !isPlaying.value)
	const canPause = computed(() => hasAnimations.value && isPlaying.value)

	/**
	 * Initialize animations for a model
	 * @param {THREE.Object3D} object3D - The model object
	 * @param {Array<THREE.AnimationClip>} animations - Array of animation clips
	 */
	const initAnimations = (object3D, animations) => {
		if (!object3D || !animations || animations.length === 0) {
			logger.warn('useAnimation', 'Cannot initialize animations: invalid input', {
				hasObject3D: !!object3D,
				animationsCount: animations?.length || 0,
			})
			return
		}

		try {
			// Dispose existing mixer if any
			dispose()

			// Create new AnimationMixer
			mixer.value = new AnimationMixer(object3D)

			// Store clip names for the selector UI
			clipNames.value = animations.map((clip, i) => clip.name || `Animation ${i + 1}`)

			// Create clip actions for all animations (but don't play them yet)
			actions.value = animations.map((clip) => {
				const action = mixer.value.clipAction(clip)
				action.setLoop(LoopRepeat)
				action.clampWhenFinished = true
				return action
			})

			// Update isPlaying when a LoopOnce action finishes
			mixer.value.addEventListener('finished', () => {
				isPlaying.value = false
				logger.info('useAnimation', 'Animation finished')
			})

			// Default to the first clip
			activeClipIndex.value = 0
			duration.value = animations[0].duration

			logger.info('useAnimation', 'Animations initialized', {
				count: animations.length,
				duration: duration.value,
				clips: clipNames.value,
			})

			// Auto-play only the first clip
			playClip(0)
		} catch (error) {
			logger.error('useAnimation', 'Failed to initialize animations', error)
			dispose()
		}
	}

	/**
	 * Play the active animation clip
	 */
	const play = () => {
		if (!hasAnimations.value) {
			logger.warn('useAnimation', 'Cannot play: no animations initialized')
			return
		}

		const action = actions.value[activeClipIndex.value]
		if (action) {
			// If the action finished (LoopOnce), reset it before playing
			if (!action.isRunning()) {
				action.reset()
			}
			action.paused = false
			action.play()
		}

		isPlaying.value = true
		logger.info('useAnimation', 'Animation started', { clip: clipNames.value[activeClipIndex.value] })
	}

	/**
	 * Switch to and play a specific animation clip
	 * @param {number} index - Index of the clip to play
	 */
	const playClip = (index) => {
		if (!hasAnimations.value || index < 0 || index >= actions.value.length) return

		// Stop all actions
		actions.value.forEach((action) => {
			action.stop()
			action.reset()
		})

		// Update active index and duration
		activeClipIndex.value = index
		const clip = actions.value[index]
		duration.value = clip.getClip().duration
		currentTime.value = 0

		// Play the selected clip
		const loopMode = isLooping.value ? LoopRepeat : LoopOnce
		clip.setLoop(loopMode)
		clip.play()

		isPlaying.value = true
		logger.info('useAnimation', 'Switched to clip', { index, name: clipNames.value[index] })
	}

	/**
	 * Pause the active animation
	 */
	const pause = () => {
		if (!hasAnimations.value) {
			logger.warn('useAnimation', 'Cannot pause: no animations initialized')
			return
		}

		const action = actions.value[activeClipIndex.value]
		if (action) {
			action.paused = true
		}

		isPlaying.value = false
		logger.info('useAnimation', 'Animation paused')
	}

	/**
	 * Stop and reset the active animation
	 */
	const stop = () => {
		if (!hasAnimations.value) {
			return
		}

		actions.value.forEach((action) => {
			action.stop()
			action.reset()
		})

		isPlaying.value = false
		currentTime.value = 0
		logger.info('useAnimation', 'Animations stopped')
	}

	/**
	 * Toggle play/pause
	 */
	const togglePlay = () => {
		if (isPlaying.value) {
			pause()
		} else {
			play()
		}
	}

	/**
	 * Seek to a specific time in the animation
	 * @param {number} time - Time in seconds to seek to
	 */
	const seek = (time) => {
		if (!hasAnimations.value) return

		const clampedTime = Math.max(0, Math.min(time, duration.value))
		const action = actions.value[activeClipIndex.value]
		if (!action) return

		// Ensure action is active, set its local time, then pause
		action.play()
		action.time = clampedTime
		action.paused = true

		// Force mixer to render the pose at this time
		mixer.value.update(0)
		currentTime.value = clampedTime
		isPlaying.value = false
	}

	/**
	 * Step forward by a fraction of the duration
	 * @param {number} fraction - Fraction of duration to step (default 1/30 ≈ one frame at 30fps)
	 */
	const stepForward = (fraction = 1 / 30) => {
		if (!hasAnimations.value) return
		seek(currentTime.value + duration.value * fraction)
	}

	/**
	 * Step backward by a fraction of the duration
	 * @param {number} fraction - Fraction of duration to step
	 */
	const stepBackward = (fraction = 1 / 30) => {
		if (!hasAnimations.value) return
		seek(currentTime.value - duration.value * fraction)
	}

	/**
	 * Toggle loop mode
	 */
	const toggleLoop = () => {
		if (!hasAnimations.value) {
			return
		}

		isLooping.value = !isLooping.value
		const loopMode = isLooping.value ? LoopRepeat : LoopOnce

		const action = actions.value[activeClipIndex.value]
		if (action) {
			action.setLoop(loopMode)
			// If switching back to loop and the action had finished, restart it
			if (isLooping.value && !isPlaying.value) {
				action.reset()
				action.play()
				isPlaying.value = true
			}
		}

		logger.info('useAnimation', 'Loop mode toggled', { looping: isLooping.value })
	}

	/**
	 * Update animation mixer (call from animation loop)
	 * @param {number} deltaTime - Time delta in seconds
	 */
	const update = (deltaTime) => {
		if (mixer.value && isPlaying.value) {
			mixer.value.update(deltaTime)

			// Update current time from active clip
			const action = actions.value[activeClipIndex.value]
			if (action && action.time !== undefined) {
				currentTime.value = action.time
			}
		}
	}

	/**
	 * Dispose of animation resources
	 */
	const dispose = () => {
		if (mixer.value) {
			// Stop all actions
			actions.value.forEach((action) => {
				action.stop()
			})

			// Clear actions
			actions.value = []

			// Dispose mixer
			mixer.value = null
		}

		isPlaying.value = false
		isLooping.value = true
		currentTime.value = 0
		duration.value = 0
		activeClipIndex.value = 0
		clipNames.value = []

		logger.info('useAnimation', 'Animations disposed')
	}

	return {
		// State
		mixer,
		actions,
		isPlaying,
		isLooping,
		currentTime,
		duration,
		activeClipIndex,
		clipNames,

		// Computed
		hasAnimations,
		canPlay,
		canPause,

		// Methods
		initAnimations,
		play,
		playClip,
		pause,
		stop,
		togglePlay,
		toggleLoop,
		seek,
		stepForward,
		stepBackward,
		update,
		dispose,
	}
}
