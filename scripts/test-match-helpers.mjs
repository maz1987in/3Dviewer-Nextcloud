/**
 * Multi-file matching helpers — edge case test suite
 *
 * Tests the texture/file matching strategies used when loading models with
 * external dependencies (MTL, textures, BIN files).
 *
 * Run: node scripts/test-match-helpers.mjs
 */

import {
	normalizeSpaces,
	removePrefix,
	normalizePlural,
	removeCommonWords,
	isPartialMatch,
	matchTexture,
	matchFile,
} from '../src/loaders/matchHelpers.js'

let passed = 0
let failed = 0

function assert(condition, label) {
	if (condition) {
		passed++
	} else {
		console.error(`  FAIL: ${label}`)
		failed++
	}
}

function eq(actual, expected, label) {
	if (actual === expected) {
		passed++
	} else {
		console.error(`  FAIL: ${label}  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
		failed++
	}
}

// ── normalizeSpaces ─────────────────────────────────────────────────────────
console.log('1. normalizeSpaces')
eq(normalizeSpaces('wolf eyes'), 'wolf_eyes', 'space to underscore')
eq(normalizeSpaces('wolf_eyes'), 'wolf_eyes', 'underscore unchanged')
eq(normalizeSpaces('wolf  eyes'), 'wolf__eyes', 'double space')
eq(normalizeSpaces('file'), 'file', 'no spaces')

// ── removePrefix ────────────────────────────────────────────────────────────
console.log('2. removePrefix')
eq(removePrefix('Wolf_Eyes'), 'Eyes', 'word prefix removed')
eq(removePrefix('model_diffuse'), 'diffuse', 'model prefix removed')
eq(removePrefix('texture'), 'texture', 'no prefix to remove')
eq(removePrefix('a_b_c'), 'b_c', 'first word removed only')

// ── normalizePlural ─────────────────────────────────────────────────────────
console.log('3. normalizePlural')
eq(normalizePlural('eyes'), 'eye', 'plural s removed')
eq(normalizePlural('eyes_2'), 'eye_2', 'plural with suffix')
eq(normalizePlural('box'), 'box', 'no plural')
eq(normalizePlural('s'), 's', 'single s unchanged')
eq(normalizePlural('textures'), 'texture', 'textures plural')

// ── removeCommonWords ───────────────────────────────────────────────────────
console.log('4. removeCommonWords')
eq(removeCommonWords('wolf_done_obj'), 'wolf_obj', 'done removed')
eq(removeCommonWords('model_final'), 'model', 'final removed')
eq(removeCommonWords('cube_v2_export'), 'cube_export', 'v2 removed')
eq(removeCommonWords('model_backup_old'), 'model_old', 'backup removed (old is separate match)')
eq(removeCommonWords('model_old'), 'model', 'old removed standalone')
eq(removeCommonWords('clean_name'), 'clean_name', 'no common words')

// ── isPartialMatch ──────────────────────────────────────────────────────────
console.log('5. isPartialMatch')
assert(isPartialMatch('wolf_body', 'wolf_bod', 0.3), 'substring near match')
assert(!isPartialMatch('wolf_body', 'body', 0.3), 'substring too different length')
assert(!isPartialMatch('abc', 'xyz'), 'no match')
assert(!isPartialMatch('a', 'abcdefghij'), 'length too different')
assert(isPartialMatch('wolf_eye', 'wolf_eyes', 0.3), 'near match')

// ── matchTexture ────────────────────────────────────────────────────────────
console.log('6. matchTexture — exact match')
eq(matchTexture('diffuse.jpg', ['diffuse.jpg', 'normal.jpg']), 'diffuse.jpg', 'exact match')

console.log('7. matchTexture — case insensitive')
eq(matchTexture('Diffuse.JPG', ['diffuse.jpg', 'normal.jpg']), 'diffuse.jpg', 'case insensitive')

console.log('8. matchTexture — space/underscore normalization')
eq(matchTexture('wolf eyes.jpg', ['wolf_eyes.jpg']), 'wolf_eyes.jpg', 'space→underscore')
eq(matchTexture('wolf_eyes.jpg', ['wolf eyes.jpg']), 'wolf eyes.jpg', 'underscore→space')

console.log('9. matchTexture — prefix removal')
eq(matchTexture('Wolf_Eyes.jpg', ['model_Eyes.jpg']), 'model_Eyes.jpg', 'different prefix same base')

console.log('10. matchTexture — plural normalization')
eq(matchTexture('eye_2.jpg', ['eyes_2.jpg']), 'eyes_2.jpg', 'singular→plural')
eq(matchTexture('eyes.png', ['eye.png']), 'eye.png', 'plural→singular')

console.log('11. matchTexture — partial match')
eq(matchTexture('wolf_body_d.jpg', ['wolf_body.jpg']), 'wolf_body.jpg', 'partial substring close length')

console.log('12. matchTexture — color/body mapping')
eq(matchTexture('wolf_col.jpg', ['wolf_body.jpg']), 'wolf_body.jpg', 'col→body')
eq(matchTexture('model_color.png', ['model_main.png']), 'model_main.png', 'color→main')

console.log('13. matchTexture — wrong extension rejected')
eq(matchTexture('texture.jpg', ['texture.png']), null, 'different ext no match')

console.log('14. matchTexture — no match')
eq(matchTexture('unrelated.jpg', ['diffuse.jpg', 'normal.jpg']), null, 'no match returns null')

console.log('15. matchTexture — mixed case extensions')
eq(matchTexture('Texture.JPG', ['texture.jpg']), 'texture.jpg', 'mixed case ext')

// ── matchFile (MTL matching) ────────────────────────────────────────────────
console.log('16. matchFile — exact match')
eq(matchFile('model.mtl', ['model.mtl']), 'model.mtl', 'exact MTL match')

console.log('17. matchFile — case insensitive')
eq(matchFile('Model.MTL', ['model.mtl']), 'model.mtl', 'case insensitive MTL')

console.log('18. matchFile — flexible substring')
eq(matchFile('wolf_done_obj.mtl', ['wolf_obj.mtl']), 'wolf_obj.mtl', 'flexible substring')

console.log('19. matchFile — common word removal')
eq(matchFile('cube_final.mtl', ['cube.mtl']), 'cube.mtl', 'final removed')
eq(matchFile('model_v2.mtl', ['model.mtl']), 'model.mtl', 'v2 removed')
eq(matchFile('mesh_backup.mtl', ['mesh.mtl']), 'mesh.mtl', 'backup removed')

console.log('20. matchFile — no match')
eq(matchFile('unrelated.mtl', ['model.mtl']), null, 'no match returns null')

console.log('21. matchFile — wrong extension')
eq(matchFile('model.obj', ['model.mtl']), null, 'wrong ext no match')

// ── Edge cases ──────────────────────────────────────────────────────────────
console.log('22. Edge cases')
eq(matchTexture('', ['a.jpg']), null, 'empty requested')
eq(matchTexture('a.jpg', []), null, 'empty available')
eq(matchFile('a.mtl', []), null, 'empty available for file')

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n' + '-'.repeat(50))
if (failed) {
	console.error(`\n[match-helpers] FAIL: ${failed} failed, ${passed} passed\n`)
	process.exit(1)
} else {
	console.log(`\n[match-helpers] PASS: All ${passed} tests passed\n`)
}
