import { ref, computed } from 'vue'
import { AnimationMixer } from 'three'
import { logger } from '../utils/logger.js'

/**
 * Composable for managing 3D model animations
 * Handles AnimationMixer creation, playback control, and updates
 */
export function useAnimation() {
	// Animation state
	const mixer = ref(null)
	const actions = ref([])
	const isPlaying = ref(false)
	const isLooping = ref(true) // Default to looping
	const currentTime = ref(0)
	const duration = ref(0)

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

			// Create clip actions for all animations
			actions.value = animations.map((clip) => {
				const action = mixer.value.clipAction(clip)
				action.setLoop(AnimationMixer.LoopRepeat) // Default to looping
				return action
			})

			// Calculate total duration (max of all clips)
			duration.value = Math.max(...animations.map(clip => clip.duration), 0)

			logger.info('useAnimation', 'Animations initialized', {
				count: animations.length,
				duration: duration.value,
				clips: animations.map(clip => clip.name || 'unnamed'),
			})

			// Auto-play animations
			play()
		} catch (error) {
			logger.error('useAnimation', 'Failed to initialize animations', error)
			dispose()
		}
	}

	/**
	 * Play all animations
	 */
	const play = () => {
		if (!hasAnimations.value) {
			logger.warn('useAnimation', 'Cannot play: no animations initialized')
			return
		}

		actions.value.forEach((action) => {
			action.paused = false
			action.play()
		})

		isPlaying.value = true
		logger.info('useAnimation', 'Animations started')
	}

	/**
	 * Pause all animations
	 */
	const pause = () => {
		if (!hasAnimations.value) {
			logger.warn('useAnimation', 'Cannot pause: no animations initialized')
			return
		}

		actions.value.forEach((action) => {
			action.paused = true
		})

		isPlaying.value = false
		logger.info('useAnimation', 'Animations paused')
	}

	/**
	 * Stop and reset all animations
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
	 * Toggle loop mode
	 */
	const toggleLoop = () => {
		if (!hasAnimations.value) {
			return
		}

		isLooping.value = !isLooping.value
		const loopMode = isLooping.value
			? AnimationMixer.LoopRepeat
			: AnimationMixer.LoopOnce

		actions.value.forEach((action) => {
			action.setLoop(loopMode)
		})

		logger.info('useAnimation', 'Loop mode toggled', { looping: isLooping.value })
	}

	/**
	 * Update animation mixer (call from animation loop)
	 * @param {number} deltaTime - Time delta in seconds
	 */
	const update = (deltaTime) => {
		if (mixer.value && isPlaying.value) {
			mixer.value.update(deltaTime)

			// Update current time (use first action's time as reference)
			if (actions.value.length > 0 && actions.value[0].time !== undefined) {
				currentTime.value = actions.value[0].time
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

		// Computed
		hasAnimations,
		canPlay,
		canPause,

		// Methods
		initAnimations,
		play,
		pause,
		stop,
		togglePlay,
		toggleLoop,
		update,
		dispose,
	}
}

