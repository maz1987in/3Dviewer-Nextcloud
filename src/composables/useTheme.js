/**
 * Theme management composable
 * Handles theme switching (light/dark/auto) and RTL support
 */

import { ref, computed, watch, onMounted } from 'vue'
import { logger } from '../utils/logger.js'
import { THEME_SETTINGS } from '../config/viewer-config.js'

export function useTheme() {
	// State
	const currentTheme = ref('auto') // 'auto', 'light', 'dark'
	const direction = ref('ltr') // 'ltr', 'rtl'
	const systemTheme = ref('light')

	// Computed
	const resolvedTheme = computed(() => {
		if (currentTheme.value === 'auto') {
			return systemTheme.value
		}
		return currentTheme.value
	})

	const isRTL = computed(() => direction.value === 'rtl')

	/**
	 * Detect system theme preference
	 * @return {string} 'light' or 'dark'
	 */
	const detectSystemTheme = () => {
		if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
			return 'dark'
		}
		return 'light'
	}

	/**
	 * Detect language direction from document or locale
	 * @return {string} 'ltr' or 'rtl'
	 */
	const detectLanguageDirection = () => {
		// Check html[dir] attribute
		const htmlDir = document.documentElement.getAttribute('dir')
		if (htmlDir === 'rtl' || htmlDir === 'ltr') {
			return htmlDir
		}

		// Check document.dir
		if (document.dir === 'rtl' || document.dir === 'ltr') {
			return document.dir
		}

		// Check locale/language for RTL languages
		const locale = document.documentElement.lang || navigator.language || 'en'
		const rtlLanguages = ['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd'] // Arabic, Hebrew, Persian, Urdu, Yiddish, Pashto, Sindhi

		const lang = locale.split('-')[0].toLowerCase()
		if (rtlLanguages.includes(lang)) {
			return 'rtl'
		}

		return 'ltr'
	}

	/**
	 * Apply theme colors to CSS variables
	 * @param {string} theme - 'light' or 'dark'
	 */
	const applyThemeColors = (theme) => {
		const root = document.documentElement
		const themeColors = THEME_SETTINGS[theme] || THEME_SETTINGS.light

		// Apply theme colors to CSS variables
		// Note: We primarily use Nextcloud's existing CSS variables
		// These are supplementary for 3D viewer specific elements
		if (themeColors.background) {
			root.style.setProperty('--viewer-background', themeColors.background)
		}
		if (themeColors.gridColor) {
			root.style.setProperty('--viewer-grid-color', themeColors.gridColor)
		}
		if (themeColors.toolbarBg) {
			root.style.setProperty('--viewer-toolbar-bg', themeColors.toolbarBg)
		}
		if (themeColors.toolbarText) {
			root.style.setProperty('--viewer-toolbar-text', themeColors.toolbarText)
		}

		// Add theme class to body for CSS selectors
		document.body.classList.remove('theme--light', 'theme--dark')
		document.body.classList.add(`theme--${theme}`)

		logger.info('useTheme', 'Theme colors applied', { theme, colors: themeColors })
	}

	/**
	 * Apply text direction
	 * @param {string} dir - 'ltr' or 'rtl'
	 */
	const applyDirection = (dir) => {
		if (dir !== 'ltr' && dir !== 'rtl') {
			logger.warn('useTheme', 'Invalid direction, defaulting to ltr', { dir })
			dir = 'ltr'
		}

		// Set direction on document
		document.documentElement.setAttribute('dir', dir)
		document.body.setAttribute('dir', dir)

		// Add RTL class for additional styling
		if (dir === 'rtl') {
			document.body.classList.add('rtl-mode')
		} else {
			document.body.classList.remove('rtl-mode')
		}

		direction.value = dir

		logger.info('useTheme', 'Direction applied', { direction: dir })
	}

	/**
	 * Set theme mode
	 * @param {string} mode - 'auto', 'light', or 'dark'
	 */
	const setTheme = (mode) => {
		const validModes = ['auto', 'light', 'dark']
		if (!validModes.includes(mode)) {
			logger.error('useTheme', 'Invalid theme mode', { mode })
			return
		}

		currentTheme.value = mode

		// Apply the resolved theme
		const themeToApply = mode === 'auto' ? systemTheme.value : mode
		applyThemeColors(themeToApply)

		// Save to localStorage
		try {
			localStorage.setItem('threedviewer:theme', mode)
			logger.info('useTheme', 'Theme saved to localStorage', { mode })
		} catch (error) {
			logger.warn('useTheme', 'Failed to save theme preference', error)
		}

		logger.info('useTheme', 'Theme changed', { mode, resolved: themeToApply })
	}

	/**
	 * Toggle RTL mode
	 * @param {string} dir - 'ltr' or 'rtl'
	 */
	const setDirection = (dir) => {
		applyDirection(dir)

		// Save to localStorage
		try {
			localStorage.setItem('threedviewer:direction', dir)
			logger.info('useTheme', 'Direction saved to localStorage', { dir })
		} catch (error) {
			logger.warn('useTheme', 'Failed to save direction preference', error)
		}
	}

	/**
	 * Initialize theme system
	 */
	const initTheme = () => {
		// Detect system theme
		systemTheme.value = detectSystemTheme()

		// Load saved theme preference or default to 'auto'
		let savedTheme = 'auto'

		// Check VIEWER_CONFIG first (backend settings)
		if (THEME_SETTINGS.mode && ['auto', 'light', 'dark'].includes(THEME_SETTINGS.mode)) {
			savedTheme = THEME_SETTINGS.mode
		} else {
			// Fallback to localStorage
			try {
				const stored = localStorage.getItem('threedviewer:theme')
				if (stored && ['auto', 'light', 'dark'].includes(stored)) {
					savedTheme = stored
				}
			} catch (error) {
				logger.warn('useTheme', 'Failed to load theme preference', error)
			}
		}

		// Load saved direction or detect from locale
		let savedDirection = null
		try {
			const stored = localStorage.getItem('threedviewer:direction')
			if (stored && ['ltr', 'rtl'].includes(stored)) {
				savedDirection = stored
			}
		} catch (error) {
			logger.warn('useTheme', 'Failed to load direction preference', error)
		}

		// Use saved direction or auto-detect
		const detectedDirection = savedDirection || detectLanguageDirection()

		// Apply theme and direction
		currentTheme.value = savedTheme
		applyThemeColors(savedTheme === 'auto' ? systemTheme.value : savedTheme)
		applyDirection(detectedDirection)

		// Watch for system theme changes (only relevant in auto mode)
		if (window.matchMedia) {
			const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')

			const handleSystemThemeChange = (e) => {
				systemTheme.value = e.matches ? 'dark' : 'light'

				// Only apply if in auto mode
				if (currentTheme.value === 'auto') {
					applyThemeColors(systemTheme.value)
					logger.info('useTheme', 'System theme changed, auto-applying', {
						newTheme: systemTheme.value,
					})
				}
			}

			// Modern browsers
			if (darkModeQuery.addEventListener) {
				darkModeQuery.addEventListener('change', handleSystemThemeChange)
			} else if (darkModeQuery.addListener) {
				// Legacy browsers
				darkModeQuery.addListener(handleSystemThemeChange)
			}
		}

		logger.info('useTheme', 'Theme system initialized', {
			currentTheme: currentTheme.value,
			resolvedTheme: resolvedTheme.value,
			systemTheme: systemTheme.value,
			direction: direction.value,
		})
	}

	/**
	 * Get theme display text
	 * @return {string} Display text for current theme
	 */
	const getThemeText = () => {
		switch (currentTheme.value) {
		case 'light': return 'Light'
		case 'dark': return 'Dark'
		case 'auto':
		default: return 'Auto'
		}
	}

	/**
	 * Get theme icon
	 * @return {string} Icon for current theme
	 */
	const getThemeIcon = () => {
		switch (currentTheme.value) {
		case 'light': return '☀️'
		case 'dark': return '🌙'
		case 'auto':
		default: return '🌓'
		}
	}

	return {
		// State (readonly)
		currentTheme: computed(() => currentTheme.value),
		resolvedTheme,
		systemTheme: computed(() => systemTheme.value),
		direction: computed(() => direction.value),
		isRTL,

		// Methods
		setTheme,
		setDirection,
		initTheme,
		detectSystemTheme,
		detectLanguageDirection,
		applyThemeColors,
		applyDirection,
		getThemeText,
		getThemeIcon,
	}
}
