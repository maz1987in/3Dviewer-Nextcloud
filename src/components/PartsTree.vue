<template>
	<div class="parts" :style="{ '--parts-row': `${rowHeight}px` }">
		<p v-if="!parts" class="tdv-secondary parts-note" role="status">
			{{ t('threedviewer', 'Loading parts…') }}
		</p>
		<!-- An IFC model is named from its file the first time the list is shown -->
		<p v-else-if="summary.preparing" class="tdv-secondary parts-note" role="status">
			{{ t('threedviewer', 'Reading the model\'s elements…') }}
		</p>
		<template v-else>
			<input :value="parts.filter"
				type="search"
				class="parts-filter"
				:aria-label="t('threedviewer', 'Filter parts by name')"
				:placeholder="t('threedviewer', 'Filter parts')"
				autocomplete="off"
				@input="parts.setFilter($event.target.value)"
				@keydown.down.prevent="focusTree"
				@keydown.esc="onFilterEscape">

			<!-- Said aloud as it changes: a filter's result is not otherwise announced -->
			<p class="tdv-secondary parts-count" role="status">
				{{ countText }}
			</p>

			<p v-if="rows.length === 0" class="tdv-secondary parts-note">
				{{ summary.searching ? t('threedviewer', 'No part has that name.') : t('threedviewer', 'This model has no parts to list.') }}
			</p>

			<div v-show="rows.length > 0"
				ref="tree"
				class="parts-tree"
				role="tree"
				tabindex="0"
				:aria-label="t('threedviewer', 'Parts')"
				:aria-activedescendant="activeDomId"
				:style="{ height: `${treeHeight}px` }"
				@keydown="onKeydown"
				@focus="onFocus"
				@scroll.passive="onScroll">
				<div class="parts-spacer" :style="{ height: `${rows.length * rowHeight}px` }">
					<div v-for="item in windowed"
						:id="domId(item.row.id)"
						:key="item.row.id"
						role="treeitem"
						class="parts-row"
						:class="{
							'is-selected': item.row.selected,
							'is-active': item.row.id === activeId,
							'is-hidden': item.row.hidden || item.row.covered,
						}"
						:style="{ top: `${item.index * rowHeight}px`, paddingInlineStart: `${6 + (item.row.level - 1) * 14}px` }"
						:aria-level="item.row.level"
						:aria-posinset="item.row.posInSet"
						:aria-setsize="item.row.setSize"
						:aria-expanded="item.row.expandable ? String(item.row.expanded) : undefined"
						:aria-selected="item.row.selected ? 'true' : 'false'"
						:aria-label="rowName(item.row)"
						@click="onRowClick(item.row)"
						@dblclick="parts.zoomToPart(item.row.id)">
						<!-- The state is in the row's name, and the actions are in the group
						     below the list: what is drawn here is for a pointer -->
						<span class="parts-twisty"
							aria-hidden="true"
							@click.stop="onTwistyClick(item.row)">
							<ViewerIcon v-if="item.row.expandable"
								class="parts-twisty-icon"
								:class="{ collapsed: !item.row.expanded }"
								name="chevron"
								:size="16" />
						</span>
						<span class="parts-name" aria-hidden="true">
							<span class="parts-label">{{ item.row.label }}</span>
							<span v-if="item.row.path" class="parts-secondary">{{ item.row.path }}</span>
							<span v-else-if="item.row.secondary" class="parts-secondary">{{ item.row.secondary }}</span>
						</span>
						<span v-if="item.row.expandable" class="parts-badge" aria-hidden="true">{{ item.row.parts }}</span>
						<span class="parts-eye"
							:class="{ 'is-off': item.row.covered }"
							aria-hidden="true"
							@click.stop="onEyeClick(item.row)">
							<ViewerIcon :name="item.row.hidden || item.row.covered ? 'visibilityOff' : 'visibility'" :size="16" />
						</span>
					</div>
				</div>
			</div>

			<div class="parts-actions" role="group" :aria-label="t('threedviewer', 'Selected part')">
				<button type="button"
					class="parts-btn"
					:disabled="!selection || selection.covered"
					:title="selection && selection.covered ? t('threedviewer', 'A part above this one is hidden') : ''"
					@click="parts.toggleHidden(selection.id)">
					<ViewerIcon :name="selection && selection.hidden ? 'visibility' : 'visibilityOff'" :size="16" />
					{{ selection && selection.hidden ? t('threedviewer', 'Show') : t('threedviewer', 'Hide') }}
				</button>
				<button type="button"
					class="parts-btn"
					:class="{ active: selection && selection.isolated }"
					:disabled="!selection"
					:aria-pressed="selection && selection.isolated ? 'true' : 'false'"
					:title="t('threedviewer', 'Show only this part')"
					@click="parts.isolate(selection.id)">
					<ViewerIcon name="isolate" :size="16" />
					{{ t('threedviewer', 'Isolate') }}
				</button>
				<button type="button"
					class="parts-btn"
					:disabled="!selection"
					:title="t('threedviewer', 'Move the camera to this part')"
					@click="parts.zoomToPart(selection.id)">
					<ViewerIcon name="zoomIn" :size="16" />
					{{ t('threedviewer', 'Zoom to') }}
				</button>
				<button type="button"
					class="parts-btn"
					:disabled="summary.hidden === 0 && !summary.isolated"
					@click="parts.showAll()">
					{{ t('threedviewer', 'Show all') }}
				</button>
			</div>

			<div v-if="selection" class="parts-detail">
				<p class="parts-detail-name">
					{{ selection.ifc && selection.ifc.name ? selection.ifc.name : selection.label }}
				</p>
				<dl class="parts-facts">
					<template v-if="selection.ifc && selection.ifc.type">
						<dt>{{ t('threedviewer', 'Type') }}</dt>
						<dd>{{ selection.ifc.type }}</dd>
					</template>
					<template v-if="selection.ifc && selection.ifc.storey">
						<dt>{{ t('threedviewer', 'Storey') }}</dt>
						<dd>{{ selection.ifc.storey }}</dd>
					</template>
					<template v-if="selection.kind === 'group'">
						<dt>{{ t('threedviewer', 'Contains') }}</dt>
						<dd>{{ n('threedviewer', '%n part', '%n parts', selection.parts) }}</dd>
					</template>
					<template v-if="selection.path">
						<dt>{{ t('threedviewer', 'In') }}</dt>
						<dd>{{ selection.path }}</dd>
					</template>
					<template v-if="selection.ifc && selection.ifc.globalId">
						<dt>{{ t('threedviewer', 'Global ID') }}</dt>
						<dd class="parts-mono">
							{{ selection.ifc.globalId }}
						</dd>
					</template>
				</dl>
				<template v-if="selection.ifc">
					<p v-if="selection.ifc.state === 'loading'" class="tdv-secondary parts-note" role="status">
						{{ t('threedviewer', 'Reading properties…') }}
					</p>
					<p v-else-if="selection.ifc.state === 'error'" class="tdv-secondary parts-note" role="status">
						{{ t('threedviewer', 'The properties of this element could not be read.') }}
					</p>
					<p v-else-if="selection.ifc.state === 'none'" class="tdv-secondary parts-note" role="status">
						{{ t('threedviewer', 'This element has no properties in the file.') }}
					</p>
					<div v-else class="parts-sets">
						<details v-for="(set, i) in selection.ifc.sets"
							:key="`${i}-${set.name}`"
							class="parts-set"
							:open="i === 0">
							<summary>
								{{ set.name }}<span v-if="set.fromType" class="tdv-secondary"> · {{ t('threedviewer', 'from its type') }}</span>
							</summary>
							<dl class="parts-facts">
								<template v-for="(property, j) in set.properties" :key="j">
									<dt>{{ property.name }}</dt>
									<dd>{{ property.value }}</dd>
								</template>
							</dl>
						</details>
					</div>
				</template>
			</div>
		</template>
	</div>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t, translatePlural as n } from '@nextcloud/l10n'
import ViewerIcon from './ViewerIcon.vue'

/** Rows drawn above and below the visible ones, so a scroll does not show a gap */
const OVERSCAN = 4
/** How many rows the list shows before it scrolls */
const VISIBLE_ROWS = 9
const VISIBLE_ROWS_MOBILE = 5

/**
 * The tools panel's Parts section: a tree of the model's parts, for choosing one, hiding
 * it, showing only it, and moving the camera to it, and for an IFC element, its properties.
 * Loaded as its own chunk the first time the section is shown.
 *
 * The list is windowed: only the rows in view are in the page, however many the model
 * has. It follows the WAI-ARIA tree pattern with one tab stop and `aria-activedescendant`,
 * so a row that is scrolled out of view is still the one the keyboard is on. Arrow keys
 * move, Right and Left open and close, Home and End jump, Enter and Space choose; H, I
 * and Z hide, isolate and zoom, and the buttons under the list do the same for a
 * pointer or a screen reader's own commands.
 */
export default {
	name: 'PartsTree',

	components: { ViewerIcon },

	props: {
		// usePartsTree's API, or null until it has loaded
		parts: { type: Object, default: null },
		isMobile: { type: Boolean, default: false },
	},

	setup(props) {
		const tree = ref(null)
		const scrollTop = ref(0)
		// The row the keyboard is on, which is not always the chosen one
		const activeId = ref(null)

		const rowHeight = computed(() => (props.isMobile ? 40 : 32))
		const rows = computed(() => props.parts?.rows ?? [])
		const summary = computed(() => props.parts?.summary ?? { preparing: false, hidden: 0, isolated: false, searching: false, matches: 0, truncated: false, parts: 0 })
		const selection = computed(() => props.parts?.selection ?? null)
		const treeHeight = computed(() => Math.min(rows.value.length, props.isMobile ? VISIBLE_ROWS_MOBILE : VISIBLE_ROWS) * rowHeight.value)

		const activeIndex = computed(() => rows.value.findIndex((row) => row.id === activeId.value))

		const windowed = computed(() => {
			const all = rows.value
			const first = Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - OVERSCAN)
			const last = Math.min(all.length, Math.ceil((scrollTop.value + treeHeight.value) / rowHeight.value) + OVERSCAN)
			const items = []
			for (let index = first; index < last; index++) {
				items.push({ row: all[index], index })
			}
			// The row the keyboard is on is always in the page, so the tree's
			// aria-activedescendant names an element that exists
			if (activeIndex.value >= 0 && (activeIndex.value < first || activeIndex.value >= last)) {
				items.push({ row: all[activeIndex.value], index: activeIndex.value })
			}
			return items
		})

		const domId = (id) => `parts-row-${id}`
		const activeDomId = computed(() => (activeIndex.value >= 0 ? domId(activeId.value) : undefined))

		const countText = computed(() => {
			if (!props.parts) {
				return ''
			}
			if (summary.value.searching) {
				return summary.value.truncated
					? t('threedviewer', 'The first {count} matches', { count: summary.value.matches })
					: n('threedviewer', '%n match', '%n matches', summary.value.matches)
			}
			const total = n('threedviewer', '%n part', '%n parts', summary.value.parts)
			return summary.value.hidden > 0
				? t('threedviewer', '{total}, {hidden} hidden', { total, hidden: summary.value.hidden })
				: total
		})

		/**
		 * @param {object} row - A row
		 * @return {string} What a screen reader says for it: its name and what is true of it
		 */
		const rowName = (row) => {
			const said = [row.label]
			if (row.path) {
				said.push(row.path)
			} else if (row.secondary) {
				said.push(row.secondary)
			}
			if (row.expandable) {
				said.push(n('threedviewer', '%n part', '%n parts', row.parts))
			}
			if (row.covered) {
				said.push(t('threedviewer', 'hidden by a part above'))
			} else if (row.hidden) {
				said.push(t('threedviewer', 'hidden'))
			}
			if (row.isolated) {
				said.push(t('threedviewer', 'isolated'))
			}
			return said.join(', ')
		}

		/**
		 * Bring a row into the visible part of the list.
		 *
		 * @param {number} index - Its place in the list
		 */
		const scrollTo = (index) => {
			const element = tree.value
			if (!element || index < 0) {
				return
			}
			const top = index * rowHeight.value
			if (top < element.scrollTop) {
				element.scrollTop = top
			} else if (top + rowHeight.value > element.scrollTop + treeHeight.value) {
				element.scrollTop = top + rowHeight.value - treeHeight.value
			}
			scrollTop.value = element.scrollTop
		}

		const moveTo = (index) => {
			const row = rows.value[Math.max(0, Math.min(rows.value.length - 1, index))]
			if (row) {
				activeId.value = row.id
				scrollTo(rows.value.indexOf(row))
			}
		}

		const onScroll = (event) => {
			scrollTop.value = event.target.scrollTop
		}

		const focusTree = () => {
			tree.value?.focus()
		}

		const onFocus = () => {
			if (activeIndex.value < 0) {
				const chosen = rows.value.find((row) => row.selected) ?? rows.value[0]
				activeId.value = chosen ? chosen.id : null
			}
			scrollTo(activeIndex.value)
		}

		const activeRow = () => rows.value[activeIndex.value] ?? null

		const onKeydown = (event) => {
			if (event.ctrlKey || event.metaKey || event.altKey) {
				return
			}
			const row = activeRow()
			let handled = true
			switch (event.key) {
			case 'ArrowDown': moveTo(activeIndex.value + 1); break
			case 'ArrowUp': moveTo(activeIndex.value - 1); break
			case 'Home': moveTo(0); break
			case 'End': moveTo(rows.value.length - 1); break
			case 'PageDown': moveTo(activeIndex.value + VISIBLE_ROWS - 1); break
			case 'PageUp': moveTo(activeIndex.value - VISIBLE_ROWS + 1); break
			case 'ArrowRight':
				if (row?.expandable && !row.expanded) {
					props.parts.toggleExpanded(row.id, true)
				} else if (row?.expandable) {
					moveTo(activeIndex.value + 1)
				}
				break
			case 'ArrowLeft':
				if (row?.expandable && row.expanded) {
					props.parts.toggleExpanded(row.id, false)
				} else if (row && row.level > 1) {
					// The row above it that is one level up
					for (let i = activeIndex.value - 1; i >= 0; i--) {
						if (rows.value[i].level < row.level) {
							moveTo(i)
							break
						}
					}
				}
				break
			case 'Enter':
			case ' ':
				if (row) {
					props.parts.select(row.id)
				}
				break
			case 'h':
			case 'H':
				if (row) {
					props.parts.toggleHidden(row.id)
				}
				break
			case 'i':
			case 'I':
				if (row) {
					props.parts.isolate(row.id)
				}
				break
			case 'z':
			case 'Z':
				if (row) {
					props.parts.zoomToPart(row.id)
				}
				break
			default:
				handled = false
			}
			if (handled) {
				// The panel's own keys (a letter that is a shortcut, Space scrolling the
				// page) are not for a tree that has used the key
				event.preventDefault()
				event.stopPropagation()
			}
		}

		const onRowClick = (row) => {
			activeId.value = row.id
			props.parts.select(row.id)
		}
		const onTwistyClick = (row) => {
			activeId.value = row.id
			props.parts.toggleExpanded(row.id)
		}
		const onEyeClick = (row) => {
			activeId.value = row.id
			// Under a hidden part it does nothing: the part above would have to be shown
			if (!row.covered) {
				props.parts.toggleHidden(row.id)
			}
		}

		const onFilterEscape = (event) => {
			// A first Escape empties the filter; the panel keeps its own for the second
			if (props.parts?.filter) {
				event.stopPropagation()
				props.parts.setFilter('')
			}
		}

		// Clicks on the viewport choose a part while this list is on screen, and not otherwise;
		// `parts` arrives after the first render when the chunk loads
		watch(() => props.parts, (current, previous) => {
			previous?.setActive(false)
			current?.setActive(true)
		}, { immediate: true })
		onBeforeUnmount(() => props.parts?.setActive(false))

		// A part chosen in the viewport: the list follows it
		watch(() => props.parts?.selectedId, async (id) => {
			if (!id) {
				return
			}
			activeId.value = id
			await nextTick()
			scrollTo(rows.value.findIndex((row) => row.id === id))
		})

		// The list changed under the keyboard (a row collapsed away, a filter typed): the
		// active row is the chosen one, or the first
		watch(rows, (current) => {
			if (activeId.value !== null && !current.some((row) => row.id === activeId.value)) {
				activeId.value = current.find((row) => row.selected)?.id ?? current[0]?.id ?? null
			}
			// The list is shorter than it was: keep the scroll inside it
			if (tree.value && tree.value.scrollTop > Math.max(0, current.length * rowHeight.value - treeHeight.value)) {
				tree.value.scrollTop = Math.max(0, current.length * rowHeight.value - treeHeight.value)
				scrollTop.value = tree.value.scrollTop
			}
		})

		return {
			t,
			n,
			tree,
			rowHeight,
			rows,
			summary,
			selection,
			treeHeight,
			windowed,
			activeId,
			activeDomId,
			countText,
			domId,
			rowName,
			focusTree,
			onFocus,
			onKeydown,
			onScroll,
			onRowClick,
			onTwistyClick,
			onEyeClick,
			onFilterEscape,
		}
	},
}
</script>

<style scoped>
.parts {
	padding: 0 4px 8px;
}

.parts-note {
	margin: 4px 6px;
}

.parts-count {
	margin: 2px 6px 6px;
}

.parts-filter {
	width: 100%;
	margin: 4px 0 0;
	padding: 6px 10px;
	border: 1px solid var(--tdv-color-border);
	border-radius: var(--tdv-radius-row);
	background: var(--tdv-color-surface);
	color: var(--tdv-color-text);
	font-size: var(--tdv-font-size-secondary);
}

.parts-filter:focus-visible {
	outline: 2px solid var(--tdv-color-primary);
	outline-offset: 1px;
}

.parts-tree {
	position: relative;
	overflow: hidden auto;
	border: 1px solid var(--tdv-color-border);
	border-radius: var(--tdv-radius-row);
	background: var(--tdv-color-surface);
}

.parts-tree:focus-visible {
	outline: 2px solid var(--tdv-color-primary);
	outline-offset: 1px;
}

.parts-spacer {
	position: relative;
}

.parts-row {
	position: absolute;
	inset-inline: 0;
	display: flex;
	align-items: center;
	gap: 4px;
	height: var(--parts-row);
	padding-inline-end: 4px;
	color: var(--tdv-color-text);
	font-size: var(--tdv-font-size-secondary);
	cursor: pointer;
}

.parts-row:hover {
	background: var(--tdv-color-hover-bg);
}

.parts-row.is-selected {
	background: var(--tdv-color-primary-light);
	color: var(--tdv-color-primary-text);
}

/* Where the keyboard is: an outline, which forced-colors mode keeps */
.parts-tree:focus .parts-row.is-active {
	outline: 2px solid var(--tdv-color-primary);
	outline-offset: -2px;
}

.parts-row.is-hidden .parts-name {
	opacity: 0.55;
	text-decoration: line-through;
}

.parts-twisty {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	width: 18px;
	height: 100%;
	color: var(--tdv-color-text-secondary);
}

.parts-twisty-icon.collapsed {
	transform: rotate(-90deg);
}

[dir="rtl"] .parts-twisty-icon.collapsed {
	transform: rotate(90deg);
}

.parts-name {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
	line-height: 1.2;
}

.parts-label,
.parts-secondary {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.parts-secondary {
	color: var(--tdv-color-text-secondary);
	font-size: var(--tdv-font-size-label);
}

.parts-row.is-selected .parts-secondary {
	color: inherit;
}

.parts-badge {
	flex-shrink: 0;
	padding: 0 6px;
	border-radius: 9px;
	background: var(--tdv-color-surface-sunken);
	color: var(--tdv-color-text-secondary);
	font-size: var(--tdv-font-size-label);
}

.parts-eye {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 14px;
	color: var(--tdv-color-text-secondary);
}

.parts-eye:hover:not(.is-off) {
	background: var(--tdv-color-hover-bg);
	color: var(--tdv-color-text);
}

.parts-eye.is-off {
	opacity: 0.5;
	cursor: not-allowed;
}

.parts-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-top: 8px;
}

.parts-btn.parts-btn {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	margin: 0;
	padding: 4px 8px;
	border: 1px solid var(--tdv-color-border);
	border-radius: 4px;
	background: var(--tdv-color-surface);
	color: var(--tdv-color-text);
	cursor: pointer;
	font-size: 12px;
	font-weight: 600;
}

.parts-btn.parts-btn:hover:not(:disabled) {
	background: var(--tdv-color-hover-bg);
}

.parts-btn.parts-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.parts-btn.parts-btn.active {
	border-color: var(--tdv-color-primary);
	background: var(--tdv-color-primary);
	color: var(--tdv-color-on-primary);
}

.parts-btn.parts-btn:focus-visible {
	outline: 2px solid var(--tdv-color-primary);
	outline-offset: 2px;
}

.parts-detail {
	margin-top: 10px;
	padding: 0 6px;
}

.parts-detail-name {
	margin: 0 0 4px;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.parts-facts {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 2px 10px;
	margin: 0 0 6px;
	font-size: var(--tdv-font-size-secondary);
}

.parts-facts dt {
	color: var(--tdv-color-text-secondary);
}

.parts-facts dd {
	margin: 0;
	overflow-wrap: anywhere;
}

.parts-mono {
	font-family: var(--tdv-font-mono);
}

.parts-sets {
	max-height: 220px;
	overflow-y: auto;
}

.parts-set {
	margin-bottom: 4px;
	font-size: var(--tdv-font-size-secondary);
}

.parts-set summary {
	cursor: pointer;
	font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
	.parts-twisty-icon {
		transition: none;
	}
}
</style>
