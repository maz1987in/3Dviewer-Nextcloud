<template>
	<div v-if="canShare" class="embed-code">
		<button ref="opener"
			class="tool-btn"
			:aria-expanded="String(open)"
			aria-controls="embed-code-options"
			:title="t('threedviewer', 'Copy code that shows this model on another website')"
			@click="open = !open">
			<ViewerIcon class="tool-icon" name="embedCode" :size="17" />
			<span class="tool-label">{{ t('threedviewer', 'Copy embed code') }}</span>
		</button>
		<!-- Escape closes the options only, not the whole panel -->
		<div v-if="open"
			id="embed-code-options"
			class="embed-code-options"
			@keydown.esc.stop="close">
			<template v-if="embeddable.length">
				<template v-if="embeddable.length > 1">
					<label for="embed-code-share" class="tool-label-small">{{ t('threedviewer', 'Public link') }}</label>
					<select id="embed-code-share" v-model="shareId" class="embed-code-field">
						<option v-for="share in embeddable" :key="share.id" :value="share.id">
							{{ share.label || t('threedviewer', 'Public link') }} · {{ formatShareDate(share.created) }}
						</option>
					</select>
				</template>
				<div class="embed-code-size">
					<label for="embed-code-width" class="tool-label-small">{{ t('threedviewer', 'Width') }}</label>
					<input id="embed-code-width"
						v-model.number="width"
						class="embed-code-field"
						type="number"
						min="200"
						max="4000"
						step="10"
						@change="width = embedSize(width, 640)">
					<label for="embed-code-height" class="tool-label-small">{{ t('threedviewer', 'Height') }}</label>
					<input id="embed-code-height"
						v-model.number="height"
						class="embed-code-field"
						type="number"
						min="200"
						max="4000"
						step="10"
						@change="height = embedSize(height, 480)">
				</div>
				<div class="embed-code-check">
					<input id="embed-code-view" v-model="includeView" type="checkbox">
					<label for="embed-code-view">{{ t('threedviewer', 'Show the model from this angle') }}</label>
				</div>
				<button type="button" class="tool-btn embed-code-copy" @click="copy">
					<ViewerIcon class="tool-icon" name="copy" :size="17" />
					<span class="tool-label">{{ t('threedviewer', 'Copy') }}</span>
				</button>
			</template>
			<template v-else>
				<p class="tdv-secondary embed-code-note">
					{{ t('threedviewer', 'Embedding needs a public link to this file without a password.') }}
				</p>
				<a class="embed-code-link" :href="sidebarUrl">{{ t('threedviewer', 'Open the Sharing sidebar') }}</a>
			</template>
		</div>
	</div>
</template>

<script>
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { getCurrentUser } from '@nextcloud/auth'
import { generateUrl } from '@nextcloud/router'
import { canShare } from '../utils/davFiles.js'
import { embeddableShares, embedSize } from '../utils/embedCode.js'
import ViewerIcon from './ViewerIcon.vue'

/**
 * "Copy embed code" in the tools panel: the frame's size, whether it opens from the
 * current angle and, when the model has several, which public link it shows. With none
 * that can be embedded, it says what is needed and where to make it; it never makes one.
 *
 * Shown only to someone who may share the model, so may make that link: a view-only
 * colleague would be sent to a Sharing sidebar that cannot help them. The control asks
 * WebDAV itself, so the viewer carries none of this while embedding is off.
 */
export default {
	name: 'EmbedCodeControl',

	components: { ViewerIcon },

	props: {
		// The model's link shares this user manages (linkShares.listLinkShares)
		shares: { type: Array, required: true },
		// The model's path in the user's files, to ask whether they may share it
		modelPath: { type: String, required: true },
		fileId: { type: [Number, String], required: true },
	},

	emits: ['copy'],

	data() {
		return {
			canShare: false,
			open: false,
			shareId: null,
			width: 640,
			height: 480,
			includeView: true,
		}
	},

	computed: {
		// Readable links to the file itself without a password, as the server allows
		embeddable() {
			return embeddableShares(this.shares)
		},

		sidebarUrl() {
			return generateUrl('/apps/files/files/{fileId}', { fileId: this.fileId }) + '?opendetails=true'
		},
	},

	watch: {
		embeddable: {
			handler(shares) {
				if (!shares.some((share) => share.id === this.shareId)) {
					this.shareId = shares[0]?.id ?? null
				}
			},

			immediate: true,
		},

		modelPath: {
			async handler(path) {
				this.canShare = false
				const uid = getCurrentUser()?.uid
				const shareable = uid ? await canShare(uid, path) : false
				// Another model may have opened while this was asked
				if (path === this.modelPath) {
					this.canShare = shareable
				}
			},

			immediate: true,
		},
	},

	methods: {
		// Shown as the snippet will have it, once the field is left
		embedSize,

		close() {
			this.open = false
			this.$refs.opener?.focus()
		},

		copy() {
			const token = this.embeddable.find((share) => share.id === this.shareId)?.token
			if (token) {
				this.$emit('copy', { token, width: this.width, height: this.height, includeView: this.includeView })
			}
			this.close()
		},

		formatShareDate(seconds) {
			return new Date(seconds * 1000).toLocaleDateString()
		},
	},
}
</script>

<style scoped>
.embed-code-options {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 6px 4px 8px 12px;
}

.embed-code-options p {
	margin: 0;
}

.embed-code-size {
	display: grid;
	grid-template-columns: auto 1fr;
	align-items: center;
	gap: 4px 8px;
}

.embed-code-field {
	min-width: 0;
	width: 100%;
}

.embed-code-check {
	display: flex;
	align-items: center;
	gap: 6px;
}

.embed-code-link {
	color: var(--tdv-color-primary-text);
	text-decoration: underline;
}
</style>
