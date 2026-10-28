<template>
	<!-- Teleported for the same reason as SlicerModal: see VersionPickerDialog.vue -->
	<Teleport to="body">
		<div class="turntable-backdrop" @click="closeUnlessRecording">
			<div ref="dialogRef"
				class="tdv-dialog turntable-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="turntable-title"
				tabindex="-1"
				@click.stop
				@keydown.esc.stop="closeUnlessRecording">
				<div class="tdv-dialog-header">
					<h2 id="turntable-title" class="turntable-title">
						{{ t('threedviewer', 'Record turntable') }}
					</h2>
					<button type="button"
						class="tdv-btn tdv-btn--icon turntable-close"
						:aria-label="t('threedviewer', 'Close')"
						:title="t('threedviewer', 'Close')"
						:disabled="recording"
						@click="closeUnlessRecording">
						<ViewerIcon name="close" :size="18" />
					</button>
				</div>

				<div class="tdv-dialog-body">
					<!-- Settings -->
					<template v-if="!recording && !result">
						<div class="turntable-field">
							<label for="turntable-length">{{ t('threedviewer', 'Length') }}</label>
							<div class="turntable-range">
								<input id="turntable-length"
									v-model.number="seconds"
									type="range"
									:min="TURNTABLE_SECONDS.min"
									:max="TURNTABLE_SECONDS.max"
									step="1">
								<output for="turntable-length">{{ t('threedviewer', '{seconds} s', { seconds }) }}</output>
							</div>
						</div>
						<div class="turntable-field">
							<label for="turntable-size">{{ t('threedviewer', 'Size') }}</label>
							<select id="turntable-size" v-model="size" class="tdv-select">
								<option value="720p">
									720p
								</option>
								<option value="1080p">
									1080p
								</option>
								<option value="window">
									{{ t('threedviewer', 'Window size') }}
								</option>
							</select>
						</div>
						<div class="turntable-directions" role="group" :aria-label="t('threedviewer', 'Direction')">
							<button v-for="option in DIRECTIONS"
								:key="option.value"
								type="button"
								class="turntable-toggle"
								:class="{ active: direction === option.value }"
								:aria-pressed="direction === option.value ? 'true' : 'false'"
								@click="direction = option.value">
								{{ option.label }}
							</button>
						</div>
					</template>

					<!-- What changed, read out once per stage: the percent changes every frame -->
					<div aria-live="polite">
						<p v-if="recording">
							{{ t('threedviewer', 'Recording…') }}
						</p>
						<template v-else-if="result">
							<p>{{ result.extension === 'mp4' ? t('threedviewer', 'Saved as MP4') : t('threedviewer', 'Saved as WebM') }}</p>
							<p v-if="!result.complete" class="tdv-secondary">
								{{ stoppedReason === 'hidden' ? t('threedviewer', 'Stopped early: the tab was hidden') : t('threedviewer', 'Stopped early') }}
							</p>
						</template>
					</div>

					<!-- Recording -->
					<template v-if="recording">
						<progress :value="progress" max="1" :aria-label="t('threedviewer', 'Recording')" />
						<p>{{ t('threedviewer', '{percent} %', { percent: Math.round(progress * 100) }) }}</p>
						<div class="turntable-actions">
							<button type="button" class="tdv-btn tdv-btn--secondary" @click="recorder.stop()">
								{{ t('threedviewer', 'Stop') }}
							</button>
						</div>
					</template>

					<div class="turntable-actions">
						<button v-if="!recording && !result"
							type="button"
							class="tdv-btn tdv-btn--primary"
							@click="start">
							{{ t('threedviewer', 'Record') }}
						</button>
						<template v-else-if="result">
							<button type="button" class="tdv-btn tdv-btn--primary" @click="download">
								{{ t('threedviewer', 'Download') }}
							</button>
							<button v-if="canSave"
								type="button"
								class="tdv-btn tdv-btn--secondary"
								:disabled="saving"
								@click="save">
								{{ t('threedviewer', 'Save next to the model') }}
							</button>
						</template>
					</div>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script>
import { ref, computed, unref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import ViewerIcon from './ViewerIcon.vue'
import { useFocusTrap } from '../composables/useFocusTrap.js'
import { TURNTABLE_DEFAULTS, TURNTABLE_SECONDS, turntableFileName } from '../utils/turntable.js'
import { canCreateIn, listNames, putFile } from '../utils/davFiles.js'

export default {
	name: 'TurntableDialog',
	components: {
		ViewerIcon,
	},

	props: {
		// The viewer's useTurntable()
		recorder: { type: Object, required: true },
		modelName: { type: String, default: 'model' },
		userId: { type: String, default: null },
		dirPath: { type: String, default: null },
		publicShare: { type: Boolean, default: false },
	},

	emits: ['close', 'saved', 'save-failed', 'record-failed'],
	setup(props, { emit }) {
		const dialogRef = ref(null)
		const focusTrap = useFocusTrap(dialogRef)
		const seconds = ref(TURNTABLE_DEFAULTS.seconds)
		const size = ref(TURNTABLE_DEFAULTS.size)
		const direction = ref(TURNTABLE_DEFAULTS.direction)
		const result = ref(null)
		const canSave = ref(false)
		const saving = ref(false)

		// unref: a recorder handed over inside a reactive object has its refs unwrapped already
		const recording = computed(() => unref(props.recorder.isRecording))
		const progress = computed(() => unref(props.recorder.progress))
		const stoppedReason = computed(() => unref(props.recorder.stoppedReason))

		onMounted(async () => {
			await nextTick()
			focusTrap.activate()
		})
		onBeforeUnmount(() => focusTrap.deactivate())

		const closeUnlessRecording = () => {
			if (!recording.value) {
				emit('close')
			}
		}

		const start = async () => {
			try {
				result.value = await props.recorder.record({ seconds: seconds.value, size: size.value, direction: direction.value })
			} catch (error) {
				emit('record-failed', error)
				return
			}
			// "Save next to the model" only for someone who may add files to that folder
			canSave.value = !props.publicShare && !!props.userId && props.dirPath !== null
				&& await canCreateIn(props.userId, props.dirPath)
		}

		const download = () => {
			const url = URL.createObjectURL(result.value.blob)
			const link = document.createElement('a')
			link.href = url
			link.download = turntableFileName(props.modelName, result.value.extension, [])
			link.style.display = 'none'
			document.body.appendChild(link)
			link.click()
			link.remove()
			setTimeout(() => URL.revokeObjectURL(url), 1000)
		}

		const save = async () => {
			saving.value = true
			try {
				const name = turntableFileName(props.modelName, result.value.extension, await listNames(props.userId, props.dirPath))
				await putFile(props.userId, props.dirPath, name, result.value.blob)
				emit('saved', name)
			} catch (error) {
				emit('save-failed', error)
			} finally {
				saving.value = false
			}
		}

		return {
			dialogRef,
			seconds,
			size,
			direction,
			result,
			canSave,
			saving,
			recording,
			progress,
			stoppedReason,
			start,
			download,
			save,
			closeUnlessRecording,
			TURNTABLE_SECONDS,
		}
	},

	computed: {
		DIRECTIONS() {
			return [
				{ value: 'cw', label: this.t('threedviewer', 'Clockwise') },
				{ value: 'ccw', label: this.t('threedviewer', 'Counter-clockwise') },
			]
		},
	},
}
</script>

<style scoped>
.turntable-backdrop {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 20px;
	background: rgb(0 0 0 / 35%);
}

.turntable-dialog {
	width: 100%;
	max-width: 420px;
	color: var(--tdv-color-text);
}

.turntable-dialog:focus-visible {
	outline: 2px solid var(--tdv-color-primary);
	outline-offset: 2px;
}

.turntable-title {
	margin: 0;
	font-size: inherit;
	font-weight: inherit;
}

.turntable-field {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.turntable-range {
	display: flex;
	gap: 8px;
	align-items: center;
}

.turntable-range input {
	flex: 1;
}

.turntable-directions {
	display: flex;
	gap: 6px;
}

.turntable-toggle.turntable-toggle {
	flex: 1;
	margin: 0;
	padding: 6px 8px;
	border: 1px solid var(--tdv-color-border);
	border-radius: var(--tdv-radius-control);
	background: transparent;
	color: var(--tdv-color-text);
	cursor: pointer;
}

.turntable-toggle.turntable-toggle.active {
	border-color: var(--tdv-color-primary);
	background: var(--tdv-color-primary-light);
	color: var(--tdv-color-primary-text);
}

.turntable-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	justify-content: flex-end;
}

.turntable-dialog progress {
	width: 100%;
}
</style>
