/**
 * Copying text: the clipboard API where the page is a secure context, and the old textarea
 * route where it is not.
 */
import { copyText } from '../../../src/utils/clipboard.js'

describe('copyText', () => {
	const original = { clipboard: navigator.clipboard, secure: window.isSecureContext, exec: document.execCommand }

	afterEach(() => {
		Object.defineProperty(navigator, 'clipboard', { value: original.clipboard, configurable: true })
		Object.defineProperty(window, 'isSecureContext', { value: original.secure, configurable: true })
		document.execCommand = original.exec
	})

	it('uses the clipboard API in a secure context', async () => {
		const writeText = jest.fn().mockResolvedValue(undefined)
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
		Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
		await copyText('hello')
		expect(writeText).toHaveBeenCalledWith('hello')
	})

	it('falls back to a textarea, and removes it afterwards', async () => {
		Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
		Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
		let copied = null
		document.execCommand = jest.fn(() => {
			copied = document.activeElement?.value
			return true
		})
		await copyText('fallback')
		expect(document.execCommand).toHaveBeenCalledWith('copy')
		expect(copied).toBe('fallback')
		expect(document.querySelector('textarea')).toBeNull()
	})

	it('throws when the clipboard refuses', async () => {
		Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
		Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
		await expect(copyText('x')).rejects.toThrow('denied')
	})
})
