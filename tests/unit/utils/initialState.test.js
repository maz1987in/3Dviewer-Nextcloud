/**
 * Reading what the server put in the page with IInitialState.
 */
import { readInitialState } from '../../../src/utils/initialState.js'

function provide(key, value) {
	const input = document.createElement('input')
	input.type = 'hidden'
	input.id = `initial-state-threedviewer-${key}`
	input.value = value
	document.body.appendChild(input)
}

afterEach(() => document.body.replaceChildren())

test('reads the value the server provided', () => {
	provide('embed', btoa(JSON.stringify({ enabled: true })))

	expect(readInitialState('embed')).toEqual({ enabled: true })
})

test('is null when the page has no such state', () => {
	expect(readInitialState('embed')).toBeNull()
})

test('is null on anything malformed', () => {
	provide('broken', 'not base64 json')
	provide('empty', '')

	expect(readInitialState('broken')).toBeNull()
	expect(readInitialState('empty')).toBeNull()
})
