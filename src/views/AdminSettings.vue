<template>
	<NcSettingsSection
		:name="t('threedviewer', 'Embedding')"
		:description="t('threedviewer', 'Show public links to 3D files on other websites, such as a shop or a blog. Only the sites listed here can show them; with none listed, embedding is off.')">
		<div class="embed-admin">
			<label for="threedviewer-embed-origins" class="embed-admin-label">
				{{ t('threedviewer', 'Sites allowed to embed') }}
			</label>
			<textarea id="threedviewer-embed-origins"
				v-model="text"
				class="embed-admin-origins"
				rows="4"
				spellcheck="false"
				autocomplete="off"
				aria-describedby="threedviewer-embed-origins-hint" />
			<p id="threedviewer-embed-origins-hint" class="embed-admin-hint">
				{{ t('threedviewer', 'One site per line, such as https://shop.example.com. Only https addresses are accepted, and http://localhost for testing. Anyone can see this list: browsers are sent it with every embed.') }}
			</p>
			<p v-if="invalid.length" role="alert" class="embed-admin-invalid">
				{{ t('threedviewer', 'Not a site address: {entries}', { entries: invalid.join(', ') }) }}
			</p>
			<div class="embed-admin-actions">
				<NcButton :disabled="saving" @click="save">
					{{ t('threedviewer', 'Save') }}
				</NcButton>
				<p role="status" class="embed-admin-status">
					{{ statusText }}
				</p>
			</div>
			<h3 class="embed-admin-heading">
				{{ t('threedviewer', 'Web server') }}
			</h3>
			<p class="embed-admin-hint">
				{{ t('threedviewer', 'If embedded models stay blank, check your web server. The embed page sends frame-ancestors, which browsers obey instead of X-Frame-Options, so the X-Frame-Options header Nextcloud\'s own setup adds does no harm. A Content-Security-Policy header that your web server adds itself is obeyed as well: remove its frame-ancestors for /apps/threedviewer/embed/.') }}
			</p>
		</div>
	</NcSettingsSection>
</template>

<script>
import { NcSettingsSection, NcButton } from '@nextcloud/vue'
import { generateUrl } from '@nextcloud/router'
import axios from '@nextcloud/axios'
import { readInitialState } from '../utils/initialState.js'

/**
 * The admin's Embedding section: the sites allowed to show public links in a frame.
 * The server normalises and checks each line; what it stored is shown back.
 */
export default {
	name: 'AdminSettings',

	components: { NcSettingsSection, NcButton },

	data() {
		const origins = readInitialState('embed-admin')?.origins
		return {
			text: Array.isArray(origins) ? origins.join('\n') : '',
			saving: false,
			// '', 'saved', 'off' or 'failed'
			status: '',
			invalid: [],
		}
	},

	computed: {
		statusText() {
			switch (this.status) {
			case 'saved':
				return this.t('threedviewer', 'Saved')
			case 'off':
				return this.t('threedviewer', 'Embedding is off')
			case 'failed':
				return this.t('threedviewer', 'Couldn\'t save the list')
			default:
				return ''
			}
		},
	},

	methods: {
		async save() {
			const origins = this.text.split('\n').map((line) => line.trim()).filter(Boolean)
			this.saving = true
			this.status = ''
			this.invalid = []
			try {
				const { data } = await axios.put(generateUrl('/apps/threedviewer/admin/embed-origins'), { origins })
				this.text = data.origins.join('\n')
				this.status = data.origins.length ? 'saved' : 'off'
			} catch (error) {
				const invalid = error?.response?.status === 400 ? error.response.data?.invalid : null
				this.invalid = Array.isArray(invalid) ? invalid : []
				this.status = 'failed'
			} finally {
				this.saving = false
			}
		},
	},
}
</script>

<style scoped>
.embed-admin {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-width: 800px;
}

.embed-admin p,
.embed-admin h3 {
	margin: 0;
}

.embed-admin-label {
	font-weight: bold;
}

.embed-admin-origins {
	width: 100%;
	min-height: 6em;
	font-family: var(--tdv-font-mono);
}

.embed-admin-hint {
	color: var(--tdv-color-text-secondary);
}

.embed-admin-invalid {
	color: var(--tdv-color-error);
}

.embed-admin-actions {
	display: flex;
	align-items: center;
	gap: 12px;
}

.embed-admin .embed-admin-heading {
	margin-top: 12px;
	font-size: 1em;
	font-weight: bold;
}
</style>
