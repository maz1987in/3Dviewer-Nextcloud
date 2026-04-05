/**
 * Pure matching helpers extracted from multiFileHelpers.js
 * for testability and reuse.
 */

/**
 * Normalize spaces and underscores to underscores.
 * @param {string} str
 * @return {string}
 */
export function normalizeSpaces(str) {
	return str.replace(/[\s_]/g, '_')
}

/**
 * Remove common word prefix (first word before underscore/space).
 * e.g. "Wolf_Eyes" → "Eyes", "model_diffuse" → "diffuse"
 * @param {string} str
 * @return {string}
 */
export function removePrefix(str) {
	const match = str.match(/^[a-z]+[_\s](.+)$/i)
	return match ? match[1] : str
}

/**
 * Normalize singular/plural: "eyes_2" → "eye_2", "eyes" → "eye"
 * @param {string} str
 * @return {string}
 */
export function normalizePlural(str) {
	const pluralMatch = str.match(/^(.+?)(s)(_\d+)?$/i)
	if (pluralMatch && pluralMatch[1].length > 0) {
		return pluralMatch[3] ? `${pluralMatch[1]}${pluralMatch[3]}` : pluralMatch[1]
	}
	return str
}

/**
 * Remove common version/status suffixes like _done, _final, _v1.
 * @param {string} str
 * @return {string}
 */
export function removeCommonWords(str) {
	return str.replace(/_(done|final|v\d+|version\d+|old|new|backup|copy)(_|$)/gi, '_')
		.replace(/^_+|_+$/g, '')
}

/**
 * Check if two strings are a partial match within a length tolerance.
 * @param {string} a
 * @param {string} b
 * @param {number} tolerance — max fractional length difference (default 0.3)
 * @return {boolean}
 */
export function isPartialMatch(a, b, tolerance = 0.3) {
	if (!a.includes(b) && !b.includes(a)) return false
	const diff = Math.abs(a.length - b.length)
	const avg = (a.length + b.length) / 2
	return avg > 0 && diff / avg < tolerance
}

const COLOR_TERMS = ['col', 'color', 'colour', 'diffuse', 'base', 'albedo']
const BODY_TERMS = ['body', 'diffuse', 'base', 'albedo', 'main']

/**
 * Match a requested texture filename against a list of available files.
 * Implements the full fallback chain: exact → normalized spaces → prefix removal →
 * plural normalization → partial match → color/body mapping.
 *
 * @param {string} requested — filename being looked for (e.g. "eye_2.jpg")
 * @param {string[]} available — list of filenames on disk
 * @return {string|null} matched filename or null
 */
export function matchTexture(requested, available) {
	const reqLower = requested.toLowerCase()
	const reqWithoutExt = reqLower.replace(/\.[^.]+$/, '')
	const reqExt = reqLower.split('.').pop()

	// Exact match (case-insensitive)
	const exact = available.find(f => f.toLowerCase() === reqLower)
	if (exact) return exact

	for (const candidate of available) {
		const candLower = candidate.toLowerCase()
		const candWithoutExt = candLower.replace(/\.[^.]+$/, '')
		const candExt = candLower.split('.').pop()

		if (candExt !== reqExt) continue

		// Strategy 1: Normalize spaces/underscores
		const reqNorm = normalizeSpaces(reqWithoutExt)
		const candNorm = normalizeSpaces(candWithoutExt)
		if (reqNorm === candNorm) return candidate

		// Strategy 2 & 3: Prefix removal + plural normalization
		const reqBase = normalizeSpaces(reqWithoutExt)
		const candBase = normalizeSpaces(candWithoutExt)
		const reqNoPrefix = normalizeSpaces(removePrefix(reqWithoutExt))
		const candNoPrefix = normalizeSpaces(removePrefix(candWithoutExt))

		const combos = [
			[reqBase, candBase],
			[reqNoPrefix, candBase],
			[reqBase, candNoPrefix],
			[reqNoPrefix, candNoPrefix],
		]

		for (const [a, b] of combos) {
			if (normalizePlural(a) === normalizePlural(b)) return candidate
			// Strategy 4: Partial match
			if (isPartialMatch(normalizePlural(a), normalizePlural(b))) return candidate
		}

		// Strategy 5: Color/body mapping
		const reqIsColor = COLOR_TERMS.some(t => reqNoPrefix.includes(t) || reqBase.includes(t))
		const candIsBody = BODY_TERMS.some(t => candNoPrefix.includes(t) || candBase.includes(t))
		if (reqIsColor && candIsBody) return candidate
	}

	return null
}

/**
 * Match a requested non-image file (e.g. MTL) against available files.
 * Uses flexible substring + common-word removal matching.
 *
 * @param {string} requested — filename being looked for
 * @param {string[]} available — list of filenames on disk
 * @return {string|null} matched filename or null
 */
export function matchFile(requested, available) {
	const reqLower = requested.toLowerCase()
	const reqWithoutExt = reqLower.replace(/\.[^.]+$/, '')
	const reqExt = reqLower.split('.').pop()

	// Exact match (case-insensitive)
	const exact = available.find(f => f.toLowerCase() === reqLower)
	if (exact) return exact

	for (const candidate of available) {
		const candLower = candidate.toLowerCase()
		const candWithoutExt = candLower.replace(/\.[^.]+$/, '')
		const candExt = candLower.split('.').pop()

		if (candExt !== reqExt) continue

		// Strategy 1: Substring match within length tolerance
		if (isPartialMatch(reqWithoutExt, candWithoutExt, 0.5)) return candidate

		// Strategy 2: Remove common words and compare
		const normReq = removeCommonWords(reqWithoutExt)
		const normCand = removeCommonWords(candWithoutExt)
		if (normReq === normCand && normReq.length > 0) return candidate
	}

	return null
}
