/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Array manipulation and Promise result filtering utilities
 */

/**
 * Filter fulfilled Promise.allSettled results and extract values
 * @param {Array<PromiseSettledResult>} results - Results from Promise.allSettled
 * @param {boolean} filterNull - Whether to filter out null/undefined values (default: true)
 * @return {Array} Array of fulfilled values
 *
 * @example
 * const results = await Promise.allSettled(promises)
 * const values = getFulfilledValues(results)
 */
export function getFulfilledValues(results, filterNull = true) {
	if (!Array.isArray(results)) {
		return []
	}

	const fulfilled = results
		.filter(r => r.status === 'fulfilled')
		.map(r => r.value)

	if (filterNull) {
		return fulfilled.filter(v => v != null)
	}

	return fulfilled
}

/**
 * Filter rejected Promise.allSettled results and extract reasons
 * @param {Array<PromiseSettledResult>} results - Results from Promise.allSettled
 * @return {Array} Array of rejection reasons
 *
 * @example
 * const results = await Promise.allSettled(promises)
 * const errors = getRejectedReasons(results)
 */
export function getRejectedReasons(results) {
	if (!Array.isArray(results)) {
		return []
	}

	return results
		.filter(r => r.status === 'rejected')
		.map(r => r.reason)
}

/**
 * Get both fulfilled values and rejected reasons from Promise.allSettled
 * @param {Array<PromiseSettledResult>} results - Results from Promise.allSettled
 * @return {object} Object with { fulfilled, rejected } arrays
 *
 * @example
 * const results = await Promise.allSettled(promises)
 * const { fulfilled, rejected } = partitionResults(results)
 */
export function partitionResults(results) {
	if (!Array.isArray(results)) {
		return { fulfilled: [], rejected: [] }
	}

	return {
		fulfilled: getFulfilledValues(results, false),
		rejected: getRejectedReasons(results),
	}
}

/**
 * Chunk an array into smaller arrays of specified size
 * @param {Array} array - Array to chunk
 * @param {number} size - Size of each chunk
 * @return {Array<Array>} Array of chunks
 *
 * @example
 * chunkArray([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 */
export function chunkArray(array, size) {
	if (!Array.isArray(array) || size <= 0) {
		return []
	}

	const chunks = []
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size))
	}
	return chunks
}

/**
 * Partition an array into two arrays based on a predicate
 * @param {Array} array - Array to partition
 * @param {Function} predicate - Function that returns true/false for each element
 * @return {object} Object with { pass, fail } arrays
 *
 * @example
 * const { pass, fail } = partition([1, 2, 3, 4], n => n % 2 === 0)
 * // pass: [2, 4], fail: [1, 3]
 */
export function partition(array, predicate) {
	if (!Array.isArray(array) || typeof predicate !== 'function') {
		return { pass: [], fail: [] }
	}

	const pass = []
	const fail = []

	for (const item of array) {
		if (predicate(item)) {
			pass.push(item)
		} else {
			fail.push(item)
		}
	}

	return { pass, fail }
}

/**
 * Remove duplicate items from array
 * @param {Array} array - Array to deduplicate
 * @param {Function|string} [key] - Optional key function or property name for object deduplication
 * @return {Array} Array with duplicates removed
 *
 * @example
 * unique([1, 2, 2, 3]) // [1, 2, 3]
 * unique([{id: 1}, {id: 2}, {id: 1}], 'id') // [{id: 1}, {id: 2}]
 * unique([{id: 1}, {id: 2}], obj => obj.id) // [{id: 1}, {id: 2}]
 */
export function unique(array, key = null) {
	if (!Array.isArray(array)) {
		return []
	}

	if (!key) {
		return [...new Set(array)]
	}

	const seen = new Set()
	const result = []

	for (const item of array) {
		const keyValue = typeof key === 'function' ? key(item) : item[key]

		if (!seen.has(keyValue)) {
			seen.add(keyValue)
			result.push(item)
		}
	}

	return result
}

/**
 * Flatten nested arrays to a single level
 * @param {Array} array - Array to flatten
 * @param {number} [depth] - Depth to flatten (default: 1 level)
 * @return {Array} Flattened array
 *
 * @example
 * flatten([[1, 2], [3, 4]]) // [1, 2, 3, 4]
 * flatten([[[1]], [[2]]], 2) // [1, 2]
 */
export function flatten(array, depth = 1) {
	if (!Array.isArray(array)) {
		return []
	}

	if (depth === Infinity) {
		return array.flat(Infinity)
	}

	return array.flat(depth)
}

/**
 * Group array items by a key
 * @param {Array} array - Array to group
 * @param {Function|string} key - Key function or property name
 * @return {object} Object with grouped items
 *
 * @example
 * groupBy([{type: 'a', val: 1}, {type: 'b', val: 2}, {type: 'a', val: 3}], 'type')
 * // {a: [{type: 'a', val: 1}, {type: 'a', val: 3}], b: [{type: 'b', val: 2}]}
 */
export function groupBy(array, key) {
	if (!Array.isArray(array)) {
		return {}
	}

	const groups = {}

	for (const item of array) {
		const groupKey = typeof key === 'function' ? key(item) : item[key]

		if (!groups[groupKey]) {
			groups[groupKey] = []
		}
		groups[groupKey].push(item)
	}

	return groups
}

/**
 * Compact array by removing falsy values (false, null, 0, "", undefined, NaN)
 * @param {Array} array - Array to compact
 * @return {Array} Array with falsy values removed
 *
 * @example
 * compact([0, 1, false, 2, '', 3, null]) // [1, 2, 3]
 */
export function compact(array) {
	if (!Array.isArray(array)) {
		return []
	}

	return array.filter(Boolean)
}

/**
 * Sample random items from array
 * @param {Array} array - Array to sample from
 * @param {number} count - Number of items to sample (default: 1)
 * @return {Array|*} Sampled item(s)
 *
 * @example
 * sample([1, 2, 3, 4, 5]) // random single item
 * sample([1, 2, 3, 4, 5], 3) // array of 3 random items
 */
export function sample(array, count = 1) {
	if (!Array.isArray(array) || array.length === 0) {
		return count === 1 ? undefined : []
	}

	if (count === 1) {
		return array[Math.floor(Math.random() * array.length)]
	}

	const sampled = []
	const copy = [...array]
	const sampleSize = Math.min(count, array.length)

	for (let i = 0; i < sampleSize; i++) {
		const index = Math.floor(Math.random() * copy.length)
		sampled.push(copy.splice(index, 1)[0])
	}

	return sampled
}
