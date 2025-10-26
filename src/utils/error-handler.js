/**
 * Standardized error handling utilities for the 3D viewer
 */

/**
 * Error types for consistent error categorization
 */
export const ERROR_TYPES = {
	NETWORK: 'network',
	FORMAT: 'format',
	PARSING: 'parsing',
	MEMORY: 'memory',
	PERMISSION: 'permission',
	VALIDATION: 'validation',
	UNKNOWN: 'unknown',
}

/**
 * Error severity levels
 */
export const ERROR_SEVERITY = {
	LOW: 'low',
	MEDIUM: 'medium',
	HIGH: 'high',
	CRITICAL: 'critical',
}

/**
 * Create a standardized loader error
 * @param {string} loaderName - Name of the loader
 * @param {Error} originalError - Original error object
 * @param {string} errorType - Type of error
 * @param {object} context - Additional context
 * @return {Error} Standardized error
 */
export function createLoaderError(loaderName, originalError, errorType = ERROR_TYPES.UNKNOWN, context = {}) {
	const error = new Error(`[${loaderName}] ${originalError.message}`)
	error.name = `${loaderName}Error`
	error.type = errorType
	error.loaderName = loaderName
	error.originalError = originalError
	error.context = context
	error.timestamp = new Date().toISOString()

	return error
}

/**
 * Log error with consistent formatting
 * @param {string} component - Component name
 * @param {string} message - Error message
 * @param {Error} error - Error object
 * @param {string} level - Log level (log, warn, error)
 */
export function logError(component, message, error, level = 'error') {
	const timestamp = new Date().toISOString()
	const errorInfo = {
		component,
		message,
		error: error?.message || error || 'Unknown error',
		stack: error?.stack || '',
		timestamp,
	}

	if (error?.type) {
		errorInfo.type = error.type
	}
	if (error?.loaderName) {
		errorInfo.loaderName = error.loaderName
	}

	// Log to console for debugging
	const logPrefix = `[${component}] ${message}`

	switch (level) {
	case 'warn':
		console.warn(logPrefix, errorInfo)
		break
	case 'info':
		console.info(logPrefix, errorInfo)
		break
	case 'log':
		console.log(logPrefix, errorInfo)
		break
	case 'error':
	default:
		console.error(logPrefix, errorInfo)
		break
	}
}

/**
 * Handle loader errors with consistent processing
 * @param {string} loaderName - Name of the loader
 * @param {Error} error - Error to handle
 * @param {object} context - Additional context
 * @return {Error} Processed error
 */
export function handleLoaderError(loaderName, error, context = {}) {
	let errorType = ERROR_TYPES.UNKNOWN
	let severity = ERROR_SEVERITY.MEDIUM

	// Categorize error based on message content
	if (error?.message?.includes('network') || error?.message?.includes('fetch')) {
		errorType = ERROR_TYPES.NETWORK
		severity = ERROR_SEVERITY.HIGH
	} else if (error?.message?.includes('format') || error?.message?.includes('unsupported')) {
		errorType = ERROR_TYPES.FORMAT
		severity = ERROR_SEVERITY.MEDIUM
	} else if (error?.message?.includes('parse') || error?.message?.includes('syntax')) {
		errorType = ERROR_TYPES.PARSING
		severity = ERROR_SEVERITY.HIGH
	} else if (error?.message?.includes('memory') || error?.message?.includes('allocation')) {
		errorType = ERROR_TYPES.MEMORY
		severity = ERROR_SEVERITY.CRITICAL
	} else if (error?.message?.includes('permission') || error?.message?.includes('unauthorized')) {
		errorType = ERROR_TYPES.PERMISSION
		severity = ERROR_SEVERITY.HIGH
	} else if (error?.message?.includes('validation') || error?.message?.includes('invalid')) {
		errorType = ERROR_TYPES.VALIDATION
		severity = ERROR_SEVERITY.MEDIUM
	}

	const processedError = createLoaderError(loaderName, error, errorType, context)
	processedError.severity = severity

	logError(loaderName, 'Error occurred', processedError)

	return processedError
}

/**
 * Create user-friendly error message
 * @param {Error} error - Error object
 * @return {string} User-friendly message
 */
export function createUserFriendlyMessage(error) {
	const messages = {
		[ERROR_TYPES.NETWORK]: 'Network connection failed. Please check your internet connection and try again.',
		[ERROR_TYPES.FORMAT]: 'This file format is not supported. Please try a different file.',
		[ERROR_TYPES.PARSING]: 'The file could not be parsed. The file may be corrupted or in an unsupported format.',
		[ERROR_TYPES.MEMORY]: 'Not enough memory to load this file. Please try a smaller file or close other applications.',
		[ERROR_TYPES.PERMISSION]: 'You do not have permission to access this file.',
		[ERROR_TYPES.VALIDATION]: 'The file is invalid or corrupted.',
		[ERROR_TYPES.UNKNOWN]: 'An unexpected error occurred. Please try again.',
	}

	return messages[error?.type] || messages[ERROR_TYPES.UNKNOWN]
}

/**
 * Create error suggestions based on error type
 * @param {Error} error - Error object
 * @return {string[]} Array of suggestions
 */
export function createErrorSuggestions(error) {
	const suggestions = {
		[ERROR_TYPES.NETWORK]: [
			'Check your internet connection',
			'Try refreshing the page',
			'Check if the file server is accessible',
		],
		[ERROR_TYPES.FORMAT]: [
			'Try converting the file to a supported format',
			'Check if the file extension is correct',
			'Verify the file is not corrupted',
		],
		[ERROR_TYPES.PARSING]: [
			'Try opening the file in another 3D application',
			'Check if the file is complete',
			'Try re-exporting the file from the original application',
		],
		[ERROR_TYPES.MEMORY]: [
			'Close other browser tabs',
			'Try a smaller file',
			'Restart your browser',
		],
		[ERROR_TYPES.PERMISSION]: [
			'Check if you have access to the file',
			'Contact the file owner for permission',
			'Try logging in again',
		],
		[ERROR_TYPES.VALIDATION]: [
			'Check if the file is complete',
			'Verify the file format',
			'Try re-uploading the file',
		],
		[ERROR_TYPES.UNKNOWN]: [
			'Try refreshing the page',
			'Check the browser console for more details',
			'Contact support if the problem persists',
		],
	}

	return suggestions[error?.type] || suggestions[ERROR_TYPES.UNKNOWN]
}

/**
 * Create comprehensive error state for UI display
 * @param {Error} error - Error object
 * @param {object} context - Additional context
 * @return {object} Error state object
 */
export function createErrorState(error, context = {}) {
	return {
		type: error?.type || ERROR_TYPES.UNKNOWN,
		message: createUserFriendlyMessage(error),
		details: error?.message || 'Unknown error',
		suggestions: createErrorSuggestions(error),
		severity: error?.severity || ERROR_SEVERITY.MEDIUM,
		canRetry: error?.type !== ERROR_TYPES.PERMISSION,
		timestamp: error?.timestamp || new Date().toISOString(),
		context,
	}
}

/**
 * Retry error handler with exponential backoff
 * @param {Function} operation - Operation to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @return {Promise} Promise that resolves with operation result
 */
export async function retryWithBackoff(operation, maxRetries = 3, baseDelay = 1000) {
	let lastError

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await operation()
		} catch (error) {
			lastError = error

			if (attempt === maxRetries) {
				throw error
			}

			const delay = baseDelay * Math.pow(2, attempt)
			await new Promise(resolve => setTimeout(resolve, delay))
		}
	}

	throw lastError
}

/**
 * Error boundary for async operations
 * @param {Function} operation - Async operation to wrap
 * @param {string} context - Context for error logging
 * @return {Promise} Promise that resolves with operation result or rejects with processed error
 */
export async function withErrorBoundary(operation, context = 'Unknown') {
	try {
		return await operation()
	} catch (error) {
		const processedError = handleLoaderError(context, error)
		throw processedError
	}
}
