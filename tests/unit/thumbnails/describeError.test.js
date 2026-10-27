/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describeError } from '../../../src/thumbnails/errors.js'

describe('describeError', () => {
	it('reads an Error by its message', () => {
		expect(describeError(new Error('Invalid 3D object loaded'))).toBe('Invalid 3D object loaded')
	})

	it('reads a DRACOLoader rejection, which is its decoder worker message', () => {
		expect(describeError({ type: 'error', id: 1, error: 'Draco: invalid header' })).toBe('Draco: invalid header')
	})

	it('falls back to the value itself', () => {
		expect(describeError('plain text')).toBe('plain text')
		expect(describeError(undefined)).toBe('undefined')
		expect(describeError({ message: '', error: '' })).toBe('[object Object]')
	})
})
