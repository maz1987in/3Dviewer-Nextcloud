<template>
	<div class="note-mention-field">
		<!--
			`:value` and an event, never `v-model`: the notes the panel lists come through
			`readonly()`, and the field is redrawn from the stored text on every keystroke —
			see the long note on the plain field in ThreeViewer.vue, which this one keeps to.
		-->
		<component :is="multiline ? 'textarea' : 'input'"
			ref="field"
			:value="shown"
			:class="inputClass"
			:rows="multiline ? 3 : null"
			:type="multiline ? null : 'text'"
			:maxlength="maxChars"
			:aria-label="label"
			:placeholder="placeholder"
			role="combobox"
			aria-autocomplete="list"
			aria-haspopup="listbox"
			:aria-expanded="open ? 'true' : 'false'"
			:aria-controls="listId"
			:aria-activedescendant="open && people.length ? optionId(active) : null"
			@input="onInput"
			@keydown="onKeydown"
			@keyup="refreshTrigger"
			@click="refreshTrigger"
			@blur="close" />
		<ul v-if="open && people.length"
			:id="listId"
			class="note-mention-list"
			role="listbox"
			:aria-label="t('threedviewer', 'People you can mention')">
			<li v-for="(person, index) in people"
				:id="optionId(index)"
				:key="person.id"
				class="note-mention-option"
				:class="{ 'is-active': index === active }"
				role="option"
				:aria-selected="index === active ? 'true' : 'false'"
				@mousedown.prevent="choose(person)">
				<span class="note-mention-name">{{ person.label }}</span>
				<span class="note-mention-id">{{ person.id }}</span>
			</li>
		</ul>
	</div>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { MAX_TEXT_CHARS, canMention, findTrigger, insertMention, toDisplay, toStored } from '../utils/mentionText.js'

let instances = 0

/** How long to wait for the typing to pause before asking who matches */
const SEARCH_DELAY_MS = 150

/**
 * A text field that offers the people who can open the model when an @ is typed.
 *
 * The text it is given and the text it gives back are the stored form, with each person's id
 * (`@alice`); the field itself shows their name (`@Alice Smith`). Who it can turn back into an
 * id is who it has been told about: the people the text mentions already (`names`) and the
 * people it has offered since. It is a plain input or textarea, so it types, selects and
 * announces like any other.
 */
export default {
	name: 'NoteMentionField',
	props: {
		/** The text, with the ids of the people it mentions as stored */
		modelValue: { type: String, default: '' },
		/** id => display name of people the text mentions already */
		names: { type: Object, default: () => ({}) },
		/** async (search) => [{ id, label }]: who to offer for what was typed after the @ */
		findPeople: { type: Function, required: true },
		/**
		 * (names) => void: told who was offered, as id => display name. A note's label in
		 * the scene names its mentions, so the note it belongs to learns them; a reply has
		 * no such label and passes nothing.
		 */
		rememberPeople: { type: Function, default: () => {} },
		/** () => void: called on Ctrl+Enter, which sends a reply; a note's text has nothing to send */
		send: { type: Function, default: null },
		label: { type: String, default: '' },
		placeholder: { type: String, default: '' },
		multiline: { type: Boolean, default: false },
		inputClass: { type: String, default: '' },
	},

	emits: ['update:modelValue'],
	setup(props, { emit }) {
		const field = ref(null)
		const people = ref([])
		const active = ref(0)
		const open = ref(false)
		const offered = ref({})
		const id = ++instances
		const listId = `note-mention-list-${id}`
		let trigger = null
		let searchTimer = null
		let searchToken = 0

		// Everyone the field can turn from a name back into an id
		const known = computed(() => ({ ...props.names, ...offered.value }))
		const shown = computed(() => toDisplay(props.modelValue, known.value))
		const optionId = (index) => `${listId}-${index}`

		const close = () => {
			open.value = false
			trigger = null
			clearTimeout(searchTimer)
			searchToken++
		}

		const search = (query) => {
			clearTimeout(searchTimer)
			const token = ++searchToken
			searchTimer = setTimeout(async () => {
				const found = (await props.findPeople(query)).filter((person) => canMention(person.id))
				// The caret has moved on, or the @ is gone: what came back is no longer wanted
				if (token !== searchToken) { return }
				people.value = found
				active.value = 0
				open.value = found.length > 0
			}, SEARCH_DELAY_MS)
		}

		const refreshTrigger = () => {
			const element = field.value
			if (!element) { return }
			const found = findTrigger(element.value, element.selectionStart ?? element.value.length)
			if (!found) {
				close()
				return
			}
			if (trigger?.start !== found.start || trigger?.query !== found.query) {
				trigger = found
				search(found.query)
			}
		}

		const onInput = (event) => {
			const element = event.target
			const stored = toStored(element.value, known.value)
			// The server refuses more than it can hold; the typing that would pass it is not taken
			if (Array.from(stored).length > MAX_TEXT_CHARS) {
				element.value = shown.value
				return
			}
			emit('update:modelValue', stored)
			refreshTrigger()
		}

		const choose = async (person) => {
			const element = field.value
			if (!element || !trigger) { return }
			const caret = element.selectionStart ?? element.value.length
			const result = insertMention(element.value, trigger, caret, person)
			const names = { [person.id]: person.label }
			offered.value = { ...offered.value, ...names }
			props.rememberPeople(names)
			close()
			emit('update:modelValue', toStored(result.text, { ...known.value, ...names }))
			await nextTick()
			element.focus()
			element.setSelectionRange(result.caret, result.caret)
		}

		const onKeydown = (event) => {
			if (open.value && people.value.length) {
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
					event.preventDefault()
					const step = event.key === 'ArrowDown' ? 1 : -1
					active.value = (active.value + step + people.value.length) % people.value.length
					return
				}
				if (event.key === 'Enter' || event.key === 'Tab') {
					event.preventDefault()
					choose(people.value[active.value])
					return
				}
			}
			if (event.key === 'Escape' && open.value) {
				// The list is closed; the panel the field is in stays
				event.stopPropagation()
				close()
				return
			}
			// Ctrl+Enter sends a reply; Enter alone is a line break in a reply and does nothing in a note's text
			if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && props.send) {
				event.preventDefault()
				props.send()
			}
		}

		onBeforeUnmount(() => {
			clearTimeout(searchTimer)
			searchToken++
		})

		return { field, people, active, open, listId, shown, maxChars: MAX_TEXT_CHARS, optionId, onInput, onKeydown, refreshTrigger, close, choose, t }
	},
}
</script>

<style scoped>
.note-mention-field {
	position: relative;
	width: 100%;
}

.note-mention-field :is(input, textarea) {
	width: 100%;
	box-sizing: border-box;
	padding: 8px 12px;
	background: var(--tdv-hud-sunken-bg);
	border: 2px solid var(--tdv-hud-border);
	border-radius: 8px;
	color: var(--tdv-hud-text);
	font-family: inherit;
	font-size: var(--tdv-font-size-body);
}

.note-mention-field textarea {
	min-height: 64px;
	resize: vertical;
}

.note-mention-field :is(input, textarea)::placeholder {
	color: var(--tdv-hud-text-secondary);
}

.note-mention-field :is(input, textarea):focus {
	outline: none;
	border-color: var(--tdv-hud-text);
}

.note-mention-list {
	position: absolute;
	inset-inline: 0;
	top: 100%;
	z-index: 10;
	margin: 4px 0 0;
	padding: 4px;
	max-height: 180px;
	overflow-y: auto;
	list-style: none;
	background: var(--tdv-color-surface);
	border: 1px solid var(--tdv-color-border);
	border-radius: 8px;
	box-shadow: 0 4px 16px rgb(0 0 0 / 25%);
}

.note-mention-option {
	display: flex;
	gap: 8px;
	align-items: baseline;
	justify-content: space-between;
	padding: 6px 8px;
	border-radius: 6px;
	color: var(--tdv-color-text);
	cursor: pointer;
}

.note-mention-option.is-active,
.note-mention-option:hover {
	background: var(--tdv-color-hover-bg);
}

.note-mention-id {
	color: var(--tdv-color-text-secondary);
	font-size: var(--tdv-font-size-secondary);
}
</style>
