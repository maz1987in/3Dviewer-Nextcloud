<template>
	<div class="tdv-model-tab">
		<div v-if="busy" class="tdv-model-tab__busy" role="status">
			<NcLoadingIcon :size="20" />
			<span>{{ phase === 'measuring' ? t('threedviewer', 'Measuring this model…') : t('threedviewer', 'Loading…') }}</span>
		</div>

		<template v-else-if="phase === 'ready' && rows">
			<dl class="tdv-model-tab__list">
				<div class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Format') }}</dt>
					<dd>{{ format }}</dd>
				</div>

				<div class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Size') }}</dt>
					<dd>
						<bdi dir="ltr" data-test="size">{{ sizeText }}</bdi>
						<span class="tdv-model-tab__note" data-test="unit-source">{{ unitNote }}</span>
					</dd>
				</div>

				<div v-if="rows.area !== null" class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Surface area') }}</dt>
					<dd><bdi dir="ltr">{{ formatQuantity(rows.area) }} {{ rows.unit.suffix }}²</bdi></dd>
				</div>
				<div v-if="rows.volume !== null" class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Volume') }}</dt>
					<dd>
						<bdi dir="ltr" data-test="volume">{{ formatQuantity(rows.volume) }} {{ rows.unit.suffix }}³</bdi>
						<span v-if="rows.watertight === null" class="tdv-model-tab__note" data-test="volume-note">{{ t('threedviewer', 'Assumes the model is closed') }}</span>
					</dd>
				</div>

				<div v-if="rows.triangles !== null" class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Triangles') }}</dt>
					<dd data-test="triangles">{{ formatCount(rows.triangles) }}</dd>
				</div>
				<div v-if="rows.vertices !== null" class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Vertices') }}</dt>
					<dd data-test="vertices">{{ formatCount(rows.vertices) }}</dd>
				</div>
				<div v-if="rows.points !== null" class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Points') }}</dt>
					<dd data-test="points">{{ formatCount(rows.points) }}</dd>
				</div>
				<div v-if="rows.splats !== null" class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Splats') }}</dt>
					<dd data-test="splats">{{ formatCount(rows.splats) }}</dd>
				</div>
				<div v-if="rows.layers !== null" class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Layers') }}</dt>
					<dd data-test="layers">{{ formatCount(rows.layers) }}</dd>
				</div>
				<div v-if="rows.printSeconds !== null" class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Print time') }}</dt>
					<dd data-test="print-time">{{ formatDuration(rows.printSeconds) }}</dd>
				</div>

				<div v-if="rows.parts !== null" class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Parts') }}</dt>
					<dd data-test="parts">{{ formatCount(rows.parts) }}</dd>
				</div>
				<div v-if="rows.materials !== null" class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Materials') }}</dt>
					<dd data-test="materials">{{ formatCount(rows.materials) }}</dd>
				</div>
				<div v-if="rows.textures !== null" class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Textures') }}</dt>
					<dd data-test="textures">{{ formatCount(rows.textures) }}</dd>
				</div>

				<div class="tdv-model-tab__row">
					<dt>{{ t('threedviewer', 'Notes') }}</dt>
					<dd data-test="notes">
						<template v-if="noteCount > 0">
							<a class="tdv-model-tab__link" :href="notesUrl" @click="openViewer($event, notesUrl)">
								{{ n('threedviewer', '%n note', '%n notes', noteCount) }}
							</a>
						</template>
						<template v-else>
							{{ t('threedviewer', 'No notes yet') }}
						</template>
					</dd>
				</div>
			</dl>

			<p v-if="state.incomplete" class="tdv-model-tab__note" data-test="incomplete">
				{{ t('threedviewer', 'Some files this model refers to were not found, so the materials and textures may be incomplete.') }}
			</p>
		</template>

		<NcNoteCard v-else-if="phase === 'too-large'" type="info" data-test="too-large">
			<p>{{ t('threedviewer', 'This model is too large to measure here. Open it in 3D Viewer to see its details.') }}</p>
		</NcNoteCard>

		<NcNoteCard v-else-if="phase === 'failed'" type="warning" data-test="failed">
			<p>{{ t('threedviewer', 'This model could not be measured here. Open it in 3D Viewer to see whether it loads.') }}</p>
		</NcNoteCard>

		<NcNoteCard v-else-if="phase === 'unavailable'" type="info" data-test="unavailable">
			<p>{{ t('threedviewer', 'No details are available for this file.') }}</p>
		</NcNoteCard>

		<div v-else-if="phase === 'idle'" class="tdv-model-tab__idle" data-test="idle">
			<p>{{ t('threedviewer', 'This file type is only measured when you ask, because other programs use it too.') }}</p>
			<NcButton variant="secondary" @click="measure(true)">
				{{ t('threedviewer', 'Measure this file') }}
			</NcButton>
		</div>

		<NcButton v-if="canOpen"
			class="tdv-model-tab__open"
			variant="primary"
			wide
			:href="viewerUrl"
			@click="openViewer($event, viewerUrl)">
			{{ t('threedviewer', 'Open in 3D Viewer') }}
		</NcButton>
	</div>
</template>

<script>
import { NcButton, NcLoadingIcon, NcNoteCard } from '@nextcloud/vue'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { getCanonicalLocale, translate, translatePlural } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { describeStats } from '../../stats/describeStats.js'
import { loadTabState } from '../../stats/loadTabState.js'
import { formatDuration } from '../../printCheck/formatDuration.js'
import { formatLength } from '../../utils/sourceUnits.js'

/**
 * The "3D" tab of the Files sidebar: what a model measures, from the numbers stored for the
 * file's current version, or measured here in the browser, within the user's thumbnail
 * limits, when there are none yet (stats/loadTabState.js). The tab only works when it is
 * the one showing: the sidebar mounts every tab of a file in some Nextcloud versions, and
 * a model nobody looks at is not downloaded for it.
 */
export default {
	name: 'ModelStatsTab',

	components: { NcButton, NcLoadingIcon, NcNoteCard },

	props: {
		/** The model's Nextcloud file id */
		fileId: { type: Number, required: true },
		/** File name, whose extension names the format */
		name: { type: String, required: true },
		/** The folder it is in, relative to the user's home */
		dir: { type: String, default: '/' },
		/** Whether this tab is the one showing; nothing is fetched or measured before */
		active: { type: Boolean, default: true },
		/** What the tab talks to; tests hand in their own */
		deps: { type: Object, default: null },
	},

	data() {
		return {
			phase: 'loading',
			state: { phase: 'loading', info: null, stats: null },
			// Told to ignore the answer of a file the tab has since been pointed away from
			generation: 0,
			controller: null,
		}
	},

	computed: {
		busy() {
			return this.phase === 'loading' || this.phase === 'measuring'
		},
		extension() {
			const dot = this.name.lastIndexOf('.')
			return dot === -1 ? '' : this.name.slice(dot + 1).toLowerCase()
		},
		format() {
			return this.extension.toUpperCase()
		},
		rows() {
			if (this.phase !== 'ready' || !this.state.stats) {
				return null
			}
			return describeStats(this.state.stats, this.state.info?.settings, this.extension)
		},
		sizeText() {
			const { width, depth, height } = this.rows.dimensions
			const numbers = [width, depth, height].map((value) => this.formatQuantity(value)).join(' × ')
			return `${numbers} ${this.rows.unit.suffix}`
		},
		unitNote() {
			switch (this.rows.unit.source) {
			case 'chosen':
				return this.t('threedviewer', 'Width × depth × height, in the unit set for this file')
			case 'default':
				return this.t('threedviewer', 'Width × depth × height. This format records no unit, so {unit} is a guess; it can be set on the file in 3D Viewer.', { unit: this.rows.unit.suffix })
			default:
				return this.t('threedviewer', 'Width × depth × height, in the unit the file records')
			}
		},
		noteCount() {
			return this.state.info?.notes.count ?? 0
		},
		viewerUrl() {
			return generateUrl('/apps/threedviewer/f/{fileId}', { fileId: this.fileId })
		},
		notesUrl() {
			const firstId = this.state.info?.notes.firstId
			return firstId ? `${this.viewerUrl}?note=${firstId}` : this.viewerUrl
		},
		canOpen() {
			return this.phase !== 'loading' && this.phase !== 'unavailable'
		},
	},

	watch: {
		// The sidebar points the tab at another file, or the tab is shown or hidden
		fileId() {
			this.refresh()
		},
		active() {
			this.refresh()
		},
	},

	mounted() {
		this.refresh()
	},

	beforeUnmount() {
		this.generation++
		this.controller?.abort()
	},

	methods: {
		t: translate,
		n: translatePlural,

		/**
		 * Show the file's numbers, once the tab is the one showing.
		 */
		refresh() {
			this.generation++
			this.controller?.abort()
			this.controller = null
			if (!this.active) {
				return
			}
			this.measure(false)
		},

		/**
		 * @param {boolean} force - Measure a file type that is only measured when asked
		 */
		async measure(force) {
			const generation = ++this.generation
			this.controller?.abort()
			this.controller = new AbortController()
			const { signal } = this.controller
			this.phase = 'loading'
			this.state = { phase: 'loading', info: null, stats: null }

			const deps = this.deps ?? (await defaultDeps())
			const state = await loadTabState(
				{ fileId: this.fileId, name: this.name, dir: this.dir },
				deps,
				{
					force,
					signal,
					onMeasuring: () => {
						if (generation === this.generation) {
							this.phase = 'measuring'
						}
					},
				},
			)
			if (generation !== this.generation) {
				return
			}
			this.state = state
			this.phase = state.phase
		},

		/**
		 * Open the model in the Viewer over the Files list when the Viewer app is there, and
		 * on its own page when it is not (or when the link was meant for a new tab).
		 *
		 * @param {MouseEvent} event - The click
		 * @param {string} url - Where the link goes
		 */
		openViewer(event, url) {
			const viewer = window.OCA?.Viewer
			const plain = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0
			if (plain || url !== this.viewerUrl || typeof viewer?.open !== 'function') {
				return
			}
			event.preventDefault()
			viewer.open({ path: `${this.dir === '/' ? '' : this.dir}/${this.name}` })
		},

		/**
		 * @param {number} value - A length, area or volume in the file's unit
		 * @return {string} The number as the viewer's panels write it
		 */
		formatQuantity(value) {
			return formatLength(value, 2)
		},

		/**
		 * @param {number} value - A count
		 * @return {string} The number with the user's digit grouping
		 */
		formatCount(value) {
			return new Intl.NumberFormat(getCanonicalLocale()).format(value)
		},

		formatDuration,
	},
}

/**
 * What the tab talks to. The measuring code (the loader and the worker's client) loads the
 * first time a model has to be measured: a model that has its numbers does not need it.
 *
 * @return {Promise<object>} The dependencies of `loadTabState`
 */
async function defaultDeps() {
	const { fetchModelInfo, uploadModelStats } = await import('../../stats/statsApi.js')
	return {
		fetchModelInfo,
		uploadModelStats,
		async measure(file, signal) {
			const { measureWithDefaults } = await import('../../stats/measureWithDefaults.js')
			return measureWithDefaults(file, signal)
		},
	}
}
</script>

<style scoped>
.tdv-model-tab {
	display: flex;
	flex-direction: column;
	gap: calc(var(--default-grid-baseline, 4px) * 3);
	padding-block: calc(var(--default-grid-baseline, 4px) * 2);
}

.tdv-model-tab__busy {
	display: flex;
	align-items: center;
	gap: calc(var(--default-grid-baseline, 4px) * 2);
	color: var(--tdv-color-text-secondary);
}

.tdv-model-tab__list {
	display: flex;
	flex-direction: column;
	margin: 0;
}

.tdv-model-tab__row {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	gap: calc(var(--default-grid-baseline, 4px) * 3);
	padding-block: calc(var(--default-grid-baseline, 4px) * 2);
	border-block-end: 1px solid var(--tdv-color-border);
}

.tdv-model-tab__row dt {
	flex: 0 0 auto;
	color: var(--tdv-color-text-secondary);
}

.tdv-model-tab__row dd {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	min-width: 0;
	margin: 0;
	text-align: end;
	overflow-wrap: anywhere;
}

.tdv-model-tab__note {
	margin: 0;
	color: var(--tdv-color-text-secondary);
	font-size: var(--font-size-small, 13px);
}

.tdv-model-tab__link {
	color: var(--tdv-color-primary-text);
	text-decoration: underline;
}

.tdv-model-tab__link:focus-visible {
	outline: 2px solid var(--tdv-color-text);
	outline-offset: 2px;
	border-radius: var(--border-radius-small, 4px);
}

.tdv-model-tab__idle {
	display: flex;
	flex-direction: column;
	gap: calc(var(--default-grid-baseline, 4px) * 2);
	align-items: flex-start;
}

.tdv-model-tab__idle p {
	margin: 0;
}
</style>
