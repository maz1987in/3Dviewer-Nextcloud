/**
 * @jest-environment jsdom
 */
import { useFocusTrap } from '../../../src/composables/useFocusTrap.js'

function buildModal() {
	// Trigger button lives outside the trap; it should receive focus back on deactivate.
	const trigger = document.createElement('button')
	trigger.textContent = 'Open'
	document.body.appendChild(trigger)

	const modal = document.createElement('div')
	modal.setAttribute('tabindex', '-1')
	const first = document.createElement('button')
	first.id = 'first'
	first.textContent = 'First'
	const mid = document.createElement('input')
	mid.id = 'mid'
	mid.type = 'text'
	const last = document.createElement('button')
	last.id = 'last'
	last.textContent = 'Last'
	modal.append(first, mid, last)
	document.body.appendChild(modal)
	return { trigger, modal }
}

describe('useFocusTrap', () => {
	afterEach(() => {
		// Clear all children between tests (safer than innerHTML reset).
		while (document.body.firstChild) {
			document.body.removeChild(document.body.firstChild)
		}
	})

	it('moves focus to the first focusable child on activate', () => {
		const { trigger, modal } = buildModal()
		trigger.focus()

		const trap = useFocusTrap({ value: modal })
		trap.activate()

		expect(document.activeElement.id).toBe('first')
		trap.deactivate()
	})

	it('restores focus to the previously focused element on deactivate', () => {
		const { trigger, modal } = buildModal()
		trigger.focus()
		expect(document.activeElement).toBe(trigger)

		const trap = useFocusTrap({ value: modal })
		trap.activate()
		expect(document.activeElement).not.toBe(trigger)

		trap.deactivate()
		expect(document.activeElement).toBe(trigger)
	})

	it('wraps Tab from the last focusable element to the first', () => {
		const { modal } = buildModal()
		const trap = useFocusTrap({ value: modal })
		trap.activate()

		document.getElementById('last').focus()
		const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
		document.dispatchEvent(event)

		expect(event.defaultPrevented).toBe(true)
		expect(document.activeElement.id).toBe('first')

		trap.deactivate()
	})

	it('wraps Shift+Tab from the first focusable element to the last', () => {
		const { modal } = buildModal()
		const trap = useFocusTrap({ value: modal })
		trap.activate()

		document.getElementById('first').focus()
		const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
		document.dispatchEvent(event)

		expect(event.defaultPrevented).toBe(true)
		expect(document.activeElement.id).toBe('last')

		trap.deactivate()
	})

	it('pulls focus back into the trap when Tab fires from outside', () => {
		const { trigger, modal } = buildModal()
		const trap = useFocusTrap({ value: modal })
		trap.activate()

		// Simulate something outside the trap stealing focus (e.g. programmatic focus).
		trigger.focus()
		const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
		document.dispatchEvent(event)

		expect(document.activeElement.id).toBe('first')
		trap.deactivate()
	})

	it('ignores non-Tab keys', () => {
		const { modal } = buildModal()
		const trap = useFocusTrap({ value: modal })
		trap.activate()

		document.getElementById('mid').focus()
		const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
		document.dispatchEvent(event)

		expect(event.defaultPrevented).toBe(false)
		expect(document.activeElement.id).toBe('mid')
		trap.deactivate()
	})

	it('stops trapping after deactivate', () => {
		const { modal } = buildModal()
		const trap = useFocusTrap({ value: modal })
		trap.activate()
		trap.deactivate()

		// After deactivate, a Tab from the last element should NOT be prevented
		// by our handler (browser default behavior resumes).
		document.getElementById('last').focus()
		const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
		document.dispatchEvent(event)

		expect(event.defaultPrevented).toBe(false)
	})

	it('is a no-op when activated without a container', () => {
		const trap = useFocusTrap({ value: null })
		expect(() => trap.activate()).not.toThrow()
		expect(() => trap.deactivate()).not.toThrow()
	})
})
