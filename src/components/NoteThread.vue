<template>
	<div class="note-thread" :data-note-state="resolved ? 'resolved' : 'open'">
		<div v-if="resolved || canReview" class="note-thread-state">
			<p v-if="resolved" class="canvas-panel-hint note-thread-resolved">
				<span class="note-thread-badge">{{ resolvedLabel }}</span>
				<span v-if="resolvedWhen">{{ resolvedWhen }}</span>
			</p>
			<button v-if="canReview"
				type="button"
				class="canvas-panel-outline note-thread-toggle"
				:disabled="busy"
				@click="toggleState">
				{{ resolved ? t('threedviewer', 'Reopen') : t('threedviewer', 'Resolve') }}
			</button>
		</div>

		<ol v-if="replies.length > 0" class="note-replies" :aria-label="t('threedviewer', 'Replies')">
			<li v-for="reply in replies"
				:key="reply.id"
				class="note-reply"
				:data-reply-id="reply.id">
				<p class="note-reply-meta">
					<span v-if="reply.author" class="note-reply-author">{{ reply.author.displayName }}</span>
					<span v-if="reply.author && timeOf(reply)"> · </span>
					<span v-if="timeOf(reply)">{{ timeOf(reply) }}</span>
				</p>
				<template v-if="editingId === reply.id">
					<NoteMentionField :modelValue="editDraft"
						multiline
						:label="t('threedviewer', 'Edit reply')"
						:names="reply.mentions"
						:findPeople="search"
						@update:modelValue="editDraft = $event"
						:send="() => saveEdit(reply)" />
					<div class="canvas-panel-actions">
						<button type="button"
							class="canvas-panel-outline"
							:disabled="busy || !canSave"
							@click="saveEdit(reply)">
							{{ t('threedviewer', 'Save') }}
						</button>
						<button type="button" class="canvas-panel-outline" @click="editingId = null">
							{{ t('threedviewer', 'Cancel') }}
						</button>
					</div>
				</template>
				<template v-else>
					<p class="note-reply-text">
						<template v-for="(piece, index) in pieces(reply)" :key="index">
							<span v-if="piece.mention" class="note-mention">{{ piece.text }}</span>
							<template v-else>
								{{ piece.text }}
							</template>
						</template>
					</p>
					<div v-if="canReview" class="canvas-panel-actions note-reply-actions">
						<button type="button"
							class="canvas-panel-outline"
							:disabled="busy"
							@click="startEdit(reply)">
							{{ t('threedviewer', 'Edit') }}
						</button>
						<button type="button"
							class="canvas-panel-danger"
							:disabled="busy"
							@click="removeReply(reply)">
							{{ t('threedviewer', 'Delete') }}
						</button>
					</div>
				</template>
			</li>
		</ol>

		<div v-if="canReview" class="note-reply-composer">
			<NoteMentionField :modelValue="draft"
				multiline
				:label="t('threedviewer', 'Reply')"
				:placeholder="t('threedviewer', 'Reply… type @ to mention someone')"
				:findPeople="search"
				@update:modelValue="draft = $event"
				:send="send" />
			<button type="button"
				class="canvas-panel-outline note-reply-send"
				:disabled="busy || !canSend"
				@click="send">
				{{ t('threedviewer', 'Reply') }}
			</button>
		</div>
	</div>
</template>

<script>
import { computed, ref } from 'vue'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import NoteMentionField from './NoteMentionField.vue'
import { formatNoteTime } from '../utils/noteThreadFormat.js'
import { isResolved, segments } from '../utils/noteReview.js'

/**
 * The thread under a note: whether it is resolved, who resolved it and when, the replies,
 * and for someone who may add notes, the means to resolve, reopen and reply.
 *
 * It draws what the note's `meta` holds and asks `review` — useSharedNotes — to change it, so
 * it never shows a state or a reply the server did not accept. Replies are text only: they
 * are drawn as plain text with the people they mention picked out, never as markup.
 */
export default {
	name: 'NoteThread',
	components: { NoteMentionField },
	props: {
		/** The note as the panel lists it: an annotation or a measurement */
		item: { type: Object, required: true },
		/** 'annotation' or 'measurement' */
		kind: { type: String, required: true },
		/** Whether this user may resolve, reply, and edit and delete replies */
		canReview: { type: Boolean, default: false },
		/** useSharedNotes: setState, addReply, updateReply, removeReply, findPeople */
		review: { type: Object, required: true },
	},

	setup(props) {
		const draft = ref('')
		const editDraft = ref('')
		const editingId = ref(null)
		const busy = ref(false)

		const resolved = computed(() => isResolved(props.item))
		const replies = computed(() => (Array.isArray(props.item.meta?.replies) ? props.item.meta.replies : []))
		const canSend = computed(() => draft.value.trim() !== '')
		const canSave = computed(() => editDraft.value.trim() !== '')

		// Who resolved it is not known on a public link, which names nobody
		const resolvedLabel = computed(() => {
			const name = props.item.meta?.resolvedBy?.displayName
			return name ? t('threedviewer', 'Resolved by {name}', { name }) : t('threedviewer', 'Resolved')
		})
		const resolvedWhen = computed(() => formatNoteTime(props.item.meta?.resolvedAt))

		const timeOf = (reply) => formatNoteTime(reply.createdAt)
		const pieces = (reply) => segments(reply.text, reply.mentions)
		const search = (query) => props.review.findPeople(props.item, query)

		/**
		 * Run a change with the buttons held, so a double click is one request.
		 *
		 * @param change
		 */
		const hold = async (change) => {
			busy.value = true
			try {
				return await change()
			} finally {
				busy.value = false
			}
		}

		const toggleState = () => hold(() => props.review.setState(props.kind, props.item, resolved.value ? 'open' : 'resolved'))

		const send = async () => {
			if (!canSend.value || busy.value) { return }
			const saved = await hold(() => props.review.addReply(props.item, draft.value.trim()))
			// Kept when it failed, so what was written is not lost with the error
			if (saved) { draft.value = '' }
		}

		const startEdit = (reply) => {
			editDraft.value = reply.text
			editingId.value = reply.id
		}

		const saveEdit = async (reply) => {
			if (!canSave.value || busy.value) { return }
			const saved = await hold(() => props.review.updateReply(props.item, reply.id, editDraft.value.trim()))
			if (saved) { editingId.value = null }
		}

		const removeReply = (reply) => hold(() => props.review.removeReply(props.item, reply.id))

		return {
			draft, editDraft, editingId, busy, resolved, replies, canSend, canSave, resolvedLabel, resolvedWhen,
			timeOf, pieces, search, toggleState, send, startEdit, saveEdit, removeReply,
		}
	},
}
</script>

<style scoped>
.note-thread {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: 4px;
	padding-top: 8px;
	border-top: 1px solid var(--tdv-hud-border);
}

.note-thread-state {
	display: flex;
	gap: 8px;
	align-items: center;
	justify-content: space-between;
}

.note-thread-resolved {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	align-items: center;
}

.note-thread-badge {
	padding: 2px 9px;
	background: var(--tdv-hud-chip-bg);
	border-radius: 10px;
	color: var(--tdv-hud-success);
	font-size: 11px;
	font-weight: var(--tdv-font-weight-bold);
}

.note-thread-toggle {
	margin-inline-start: auto;
}

.note-replies {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.note-reply {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-inline-start: 10px;
	border-inline-start: 2px solid var(--tdv-hud-border);
}

.note-reply-meta {
	margin: 0;
	color: var(--tdv-hud-text-secondary);
	font-size: var(--tdv-font-size-secondary);
}

.note-reply-author {
	color: var(--tdv-hud-text);
	font-weight: var(--tdv-font-weight-bold);
}

.note-reply-text {
	margin: 0;
	color: var(--tdv-hud-text);
	font-size: var(--tdv-font-size-body);
	overflow-wrap: anywhere;
	white-space: pre-wrap;
}

.note-mention {
	padding: 0 4px;
	background: var(--tdv-hud-chip-bg);
	border-radius: 6px;
	font-weight: var(--tdv-font-weight-bold);
}

.note-reply-composer {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.note-reply-send {
	align-self: flex-end;
}
</style>
