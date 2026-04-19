/**
 * Focus trap composable for modal dialogs.
 *
 * Traps Tab/Shift+Tab cycling inside the given container element while active,
 * moves initial focus into the container, and restores focus to the previously
 * focused element on deactivate.
 *
 * Usage:
 *   const containerRef = ref(null)
 *   const trap = useFocusTrap(containerRef)
 *   watch(() => props.isOpen, (open) => open ? trap.activate() : trap.deactivate())
 */

// Elements that are focusable by default when visible and not disabled.
// Matches the focus-trap library's default selector (simplified).
const FOCUSABLE_SELECTOR = [
	'a[href]',
	'area[href]',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'button:not([disabled])',
	'iframe',
	'object',
	'embed',
	'[contenteditable="true"]',
	'[tabindex]:not([tabindex="-1"])',
	'audio[controls]',
	'video[controls]',
].join(',')

function isVisible(el) {
	if (!el) return false
	if (el.hidden) return false
	if (el.getAttribute('aria-hidden') === 'true') return false
	// Layout-based display:none detection via getClientRects() is a best-effort
	// signal: in real browsers it's empty for display:none elements. Environments
	// without layout (e.g. jsdom) return an empty list for every element, so we
	// only apply the check when getClientRects() reports *something* for the
	// document root — otherwise every child would be considered hidden.
	if (typeof el.getClientRects === 'function'
		&& document.documentElement.getClientRects().length > 0
		&& el.getClientRects().length === 0) {
		return false
	}
	return true
}

function getFocusable(container) {
	if (!container || typeof container.querySelectorAll !== 'function') return []
	return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
		.filter(el => !el.hasAttribute('disabled') && isVisible(el))
}

export function useFocusTrap(containerRef) {
	let previouslyFocused = null
	let active = false

	const getContainer = () => {
		if (!containerRef) return null
		// Vue refs expose `value`; if the ref exists but is empty, return null
		// rather than falling back to the ref object itself.
		const ref = ('value' in containerRef) ? containerRef.value : containerRef
		if (!ref) return null
		// Support Vue component refs (.$el) and raw element refs
		if (typeof ref === 'object' && '$el' in ref) return ref.$el
		return ref
	}

	const handleKeydown = (event) => {
		if (!active || event.key !== 'Tab') return
		const container = getContainer()
		if (!container) return

		const focusable = getFocusable(container)
		if (focusable.length === 0) {
			// Nothing focusable — keep focus on the container itself.
			event.preventDefault()
			container.focus()
			return
		}

		const first = focusable[0]
		const last = focusable[focusable.length - 1]
		const current = document.activeElement

		if (event.shiftKey) {
			// Shift+Tab from first (or from outside the trap) → wrap to last.
			if (current === first || !container.contains(current)) {
				event.preventDefault()
				last.focus()
			}
		} else if (current === last || !container.contains(current)) {
			// Tab from last (or from outside the trap) → wrap to first.
			event.preventDefault()
			first.focus()
		}
	}

	const activate = () => {
		if (active) return
		const container = getContainer()
		if (!container) return

		previouslyFocused = document.activeElement
		active = true
		document.addEventListener('keydown', handleKeydown, true)

		// Move focus into the container. Prefer the first focusable child;
		// fall back to the container itself (needs tabindex="-1" on template).
		const focusable = getFocusable(container)
		if (focusable.length > 0) {
			focusable[0].focus()
		} else if (typeof container.focus === 'function') {
			container.focus()
		}
	}

	const deactivate = () => {
		if (!active) return
		active = false
		document.removeEventListener('keydown', handleKeydown, true)

		// Restore focus to the element that had it before activation.
		// Guard against the previously-focused element being removed from the DOM.
		if (previouslyFocused && typeof previouslyFocused.focus === 'function'
			&& document.contains(previouslyFocused)) {
			previouslyFocused.focus()
		}
		previouslyFocused = null
	}

	return { activate, deactivate }
}
