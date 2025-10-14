/**
 * Math helper utilities
 * Provides common mathematical operations and calculations
 */

/**
 * Calculate average of array values
 * @param {Array<number>|Array<object>} array - Array of numbers or objects
 * @param {string|null} property - Property name if array contains objects
 * @returns {number} Average value (0 if array is empty)
 */
export function average(array, property = null) {
	if (!Array.isArray(array) || array.length === 0) {
		return 0
	}

	const sum = property !== null
		? array.reduce((acc, item) => acc + (item[property] || 0), 0)
		: array.reduce((acc, val) => acc + val, 0)

	return sum / array.length
}

/**
 * Calculate sum of array values
 * @param {Array<number>|Array<object>} array - Array of numbers or objects
 * @param {string|null} property - Property name if array contains objects
 * @returns {number} Sum of values
 */
export function sum(array, property = null) {
	if (!Array.isArray(array) || array.length === 0) {
		return 0
	}

	return property !== null
		? array.reduce((acc, item) => acc + (item[property] || 0), 0)
		: array.reduce((acc, val) => acc + val, 0)
}

/**
 * Calculate median of array values
 * @param {Array<number>} array - Array of numbers
 * @returns {number} Median value (0 if array is empty)
 */
export function median(array) {
	if (!Array.isArray(array) || array.length === 0) {
		return 0
	}

	const sorted = [...array].sort((a, b) => a - b)
	const middle = Math.floor(sorted.length / 2)

	if (sorted.length % 2 === 0) {
		return (sorted[middle - 1] + sorted[middle]) / 2
	} else {
		return sorted[middle]
	}
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value))
}

/**
 * Linear interpolation between two values
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(start, end, t) {
	return start + (end - start) * clamp(t, 0, 1)
}

/**
 * Map a value from one range to another
 * @param {number} value - Value to map
 * @param {number} inMin - Input range minimum
 * @param {number} inMax - Input range maximum
 * @param {number} outMin - Output range minimum
 * @param {number} outMax - Output range maximum
 * @returns {number} Mapped value
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
	return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
}

/**
 * Round a number to specified decimal places
 * @param {number} value - Value to round
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {number} Rounded value
 */
export function roundTo(value, decimals = 2) {
	const factor = Math.pow(10, decimals)
	return Math.round(value * factor) / factor
}

/**
 * Calculate percentage
 * @param {number} value - Part value
 * @param {number} total - Total value
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {number} Percentage (0-100)
 */
export function percentage(value, total, decimals = 0) {
	if (total === 0) return 0
	return roundTo((value / total) * 100, decimals)
}

/**
 * Calculate minimum value in array
 * @param {Array<number>|Array<object>} array - Array of numbers or objects
 * @param {string|null} property - Property name if array contains objects
 * @returns {number} Minimum value (Infinity if array is empty)
 */
export function min(array, property = null) {
	if (!Array.isArray(array) || array.length === 0) {
		return Infinity
	}

	if (property !== null) {
		return Math.min(...array.map(item => item[property] || Infinity))
	} else {
		return Math.min(...array)
	}
}

/**
 * Calculate maximum value in array
 * @param {Array<number>|Array<object>} array - Array of numbers or objects
 * @param {string|null} property - Property name if array contains objects
 * @returns {number} Maximum value (-Infinity if array is empty)
 */
export function max(array, property = null) {
	if (!Array.isArray(array) || array.length === 0) {
		return -Infinity
	}

	if (property !== null) {
		return Math.max(...array.map(item => item[property] || -Infinity))
	} else {
		return Math.max(...array)
	}
}

/**
 * Throttle a function to limit how often it can be called
 * @param {Function} func - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, delay) {
	let timeoutId = null
	let lastExecTime = 0

	return function (...args) {
		const currentTime = Date.now()

		if (currentTime - lastExecTime > delay) {
			func.apply(this, args)
			lastExecTime = currentTime
		} else {
			clearTimeout(timeoutId)
			timeoutId = setTimeout(() => {
				func.apply(this, args)
				lastExecTime = Date.now()
			}, delay - (currentTime - lastExecTime))
		}
	}
}

/**
 * Debounce a function to delay its execution until after a period of inactivity
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay) {
	let timeoutId = null

	return function (...args) {
		clearTimeout(timeoutId)
		timeoutId = setTimeout(() => {
			func.apply(this, args)
		}, delay)
	}
}
