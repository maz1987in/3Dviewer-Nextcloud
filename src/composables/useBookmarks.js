/**
 * View state bookmarks composable
 * Save and restore camera position + display toggles
 */

import { ref } from 'vue'
import { Vector3 } from 'three'
import { logger } from '../utils/logger.js'

const STORAGE_KEY = '3dviewer-bookmarks'

export function useBookmarks() {
	const bookmarks = ref([])
	const cameraRef = ref(null)
	const controlsRef = ref(null)

	/**
	 * Initialise with camera and controls references
	 * @param {THREE.Camera} camera
	 * @param {OrbitControls} controls
	 */
	const init = (camera, controls) => {
		cameraRef.value = camera
		controlsRef.value = controls
		loadFromStorage()
		logger.info('useBookmarks', 'Initialized', { count: bookmarks.value.length })
	}

	/**
	 * Save current view as a bookmark
	 * @param {string} name
	 * @param {object} displayState - { grid, axes, wireframe, backgroundColor }
	 */
	const addBookmark = (name, displayState = {}) => {
		const cam = cameraRef.value
		const ctrl = controlsRef.value
		if (!cam) {
			logger.warn('useBookmarks', 'Cannot save: no camera')
			return
		}

		const bookmark = {
			name: name || `View ${bookmarks.value.length + 1}`,
			camera: {
				x: cam.position.x,
				y: cam.position.y,
				z: cam.position.z,
			},
			target: ctrl ? {
				x: ctrl.target.x,
				y: ctrl.target.y,
				z: ctrl.target.z,
			} : { x: 0, y: 0, z: 0 },
			display: { ...displayState },
			createdAt: Date.now(),
		}

		bookmarks.value.push(bookmark)
		saveToStorage()
		logger.info('useBookmarks', 'Bookmark saved', { name: bookmark.name })
	}

	/**
	 * Restore a bookmarked view
	 * @param {number} index
	 * @returns {object|null} The display state to apply, or null
	 */
	const loadBookmark = (index) => {
		const bookmark = bookmarks.value[index]
		if (!bookmark) return null

		const cam = cameraRef.value
		const ctrl = controlsRef.value
		if (!cam) return null

		cam.position.set(bookmark.camera.x, bookmark.camera.y, bookmark.camera.z)
		if (ctrl && bookmark.target) {
			ctrl.target.set(bookmark.target.x, bookmark.target.y, bookmark.target.z)
			ctrl.update()
		}

		logger.info('useBookmarks', 'Bookmark loaded', { name: bookmark.name })
		return bookmark.display || null
	}

	/**
	 * Remove a bookmark by index
	 * @param {number} index
	 */
	const removeBookmark = (index) => {
		if (index >= 0 && index < bookmarks.value.length) {
			const removed = bookmarks.value.splice(index, 1)
			saveToStorage()
			logger.info('useBookmarks', 'Bookmark removed', { name: removed[0]?.name })
		}
	}

	/**
	 * Persist bookmarks to localStorage
	 */
	const saveToStorage = () => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks.value))
		} catch {
			// Silently ignore storage errors
		}
	}

	/**
	 * Load bookmarks from localStorage
	 */
	const loadFromStorage = () => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY)
			if (stored) {
				bookmarks.value = JSON.parse(stored)
			}
		} catch {
			bookmarks.value = []
		}
	}

	const dispose = () => {
		cameraRef.value = null
		controlsRef.value = null
		logger.info('useBookmarks', 'Disposed')
	}

	return {
		bookmarks,
		init,
		addBookmark,
		loadBookmark,
		removeBookmark,
		dispose,
	}
}
