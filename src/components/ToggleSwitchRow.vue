<template>
	<!--
		A real switch. The rows it replaces were `<label @click.prevent>` around a bare track:
		a label with no control inside takes no keyboard focus, so a keyboard user could not
		reach them and a screen reader announced neither a switch nor whether it was on.

		A button takes Tab, answers Enter and Space with a click, and with role="switch" and
		aria-checked says what it is and what state it is in. The visible text is its name; the
		track is decoration, so it is hidden from assistive technology.
	-->
	<button type="button"
		class="toggle-row toggle-row--button"
		:class="{ 'toggle-row--compact': compact }"
		role="switch"
		:aria-checked="checked ? 'true' : 'false'"
		@click="$emit('toggle')">
		<span class="toggle-switch" :class="{ on: checked }" aria-hidden="true" />
		<span class="toggle-text">{{ label }}</span>
	</button>
</template>

<script>
export default {
	name: 'ToggleSwitchRow',

	props: {
		// Whether the switch is on
		checked: { type: Boolean, default: false },
		// The visible text, which is also the switch's accessible name
		label: { type: String, required: true },
		// The tighter row used beside a button, as the animation controls do
		compact: { type: Boolean, default: false },
	},

	emits: ['toggle'],
}
</script>

<style scoped>
/*
 * The class is doubled throughout: a switch is a <button>, and a single class loses to
 * Nextcloud's rules for every button (buttonSpecificity.test.js).
 */
.toggle-row.toggle-row {
	display: flex;
	align-items: center;
	gap: 12px;
	width: 100%;
	margin: 0 0 4px;
	padding: 10px 16px;
	border: none;
	border-radius: 6px;
	background: none;
	color: inherit;
	font: inherit;
	text-align: start;
	cursor: pointer;
	transition: background 0.15s ease;
}

/*
 * Beside a button, as the animation controls lay it out. That row is a flex row, where the
 * full width of an ordinary row would be the switch's basis: it would take the whole row and
 * squeeze Play to its minimum. The switch is as wide as its content and keeps that width.
 */
.toggle-row.toggle-row.toggle-row--compact {
	flex-shrink: 0;
	width: auto;
	margin-bottom: 0;
	padding: 6px 12px;
}

.toggle-row.toggle-row:hover,
.toggle-row.toggle-row:focus-visible {
	background: var(--tdv-color-hover-bg);
	color: inherit;
}

/* Keyboard focus is shown on the row, not left to whatever Nextcloud paints */
.toggle-row.toggle-row:focus-visible {
	outline: 2px solid var(--tdv-color-primary);
	outline-offset: 2px;
}

/* Nextcloud's pressed-button rule scores (0,4,1); a row has no pressed look of its own */
.toggle-row.toggle-row:active {
	background: var(--tdv-color-hover-bg) !important;
	color: inherit !important;
}

.toggle-switch {
	position: relative;
	width: 36px;
	height: 20px;
	background: var(--tdv-color-border);
	border-radius: 10px;
	flex-shrink: 0;
	transition: background 0.2s ease;
}

.toggle-switch::after {
	content: '';
	position: absolute;
	top: 2px;
	inset-inline-start: 2px;
	width: 16px;
	height: 16px;
	background: var(--tdv-color-surface);
	border-radius: 50%;
	transition: transform 0.2s ease;
	box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
}

.toggle-switch.on {
	background: var(--tdv-color-primary);
}

.toggle-switch.on::after {
	transform: translateX(16px);
}

[dir="rtl"] .toggle-switch.on::after {
	transform: translateX(-16px);
}

.toggle-text {
	font-size: 14px;
	color: var(--tdv-color-text);
}
</style>
