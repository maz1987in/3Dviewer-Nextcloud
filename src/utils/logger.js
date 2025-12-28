/**
 * Centralized logging utility
 * Provides environment-aware logging with consistent formatting
 */

/**
 * Check if we're in development mode
 * @return {boolean}
 */
function isDevelopment() {
	// Check various environment indicators
	return (
		(typeof process !== 'undefined' && process.env?.NODE_ENV === 'development')
		|| window.location.hostname === 'localhost'
		|| window.location.hostname === '127.0.0.1'
		|| window.location.hostname.includes('local')
	)
}

/**
 * Format log message with context
 * @param {string} context - Component/module name
 * @param {string} message - Log message
 * @return {string}
 */
function formatMessage(context, message) {
	return `[${context}] ${message}`
}

/**
 * Logger instance
 */
export const logger = {
	/**
	 * Log informational message (development only)
	 * @param {string} context - Component/module name
	 * @param {string} message - Log message
	 * @param {*} data - Optional data to log
	 */
	info(context, message, data) {
		if (isDevelopment()) {
			if (data !== undefined) {
				console.info(formatMessage(context, message), data)
			} else {
				console.info(formatMessage(context, message))
			}
		}
	},

	/**
	 * Log warning message (development only)
	 * @param {string} context - Component/module name
	 * @param {string} message - Warning message
	 * @param {*} data - Optional data to log
	 */
	warn(context, message, data) {
		if (isDevelopment()) {
			if (data !== undefined) {
				console.warn(formatMessage(context, message), data)
			} else {
				console.warn(formatMessage(context, message))
			}
		}
	},

	/**
	 * Log error message (always logged, even in production)
	 * @param {string} context - Component/module name
	 * @param {string} message - Error message
	 * @param {Error|*} error - Error object or data
	 */
	error(context, message, error) {
		// Always log errors, even in production
		if (error !== undefined) {
			console.error(formatMessage(context, message), error)
		} else {
			console.error(formatMessage(context, message))
		}
	},

	/**
	 * Log debug message (development only, verbose)
	 * @param {string} context - Component/module name
	 * @param {string} message - Debug message
	 * @param {*} data - Optional data to log
	 */
	debug(context, message, data) {
		if (isDevelopment()) {
			if (data !== undefined) {
				console.debug(formatMessage(context, message), data)
			} else {
				console.debug(formatMessage(context, message))
			}
		}
	},

	/**
	 * Create a scoped logger for a specific context
	 * Useful for components/modules that log frequently
	 * @param {string} context - Component/module name
	 * @return {object} Scoped logger instance
	 */
	scope(context) {
		return {
			info: (message, data) => logger.info(context, message, data),
			warn: (message, data) => logger.warn(context, message, data),
			error: (message, error) => logger.error(context, message, error),
			debug: (message, data) => logger.debug(context, message, data),
		}
	},
}

/**
 * Default export
 */
export default logger
