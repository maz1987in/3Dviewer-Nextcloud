<template>
	<section class="tdv-panel tdv-panel--floating tdv-panel--hud print-check-card" aria-labelledby="print-check-title">
		<div class="tdv-panel-header print-check-header">
			<h3 id="print-check-title">
				{{ t('threedviewer', 'Print check') }}
			</h3>
			<button type="button"
				class="tdv-btn tdv-btn--icon print-check-close"
				:aria-label="t('threedviewer', 'Close')"
				:title="t('threedviewer', 'Close')"
				@click="$emit('close')">
				<ViewerIcon name="close" :size="16" />
			</button>
		</div>

		<div class="print-check-body" aria-live="polite">
			<p v-if="state.assumesMm" class="tdv-secondary print-check-note">
				{{ t('threedviewer', 'Sizes assume millimetres, because this file doesn\'t record a unit.') }}
			</p>

			<!-- A toolpath: the slicer has already worked out what matters -->
			<template v-if="state.kind === 'gcode'">
				<ul v-if="hasSlicerNumbers" class="print-check-lines">
					<li v-if="summary.printSeconds !== null">
						{{ t('threedviewer', 'Print time: {time}', { time: formatDuration(summary.printSeconds) }) }}
					</li>
					<li v-if="summary.filamentMm !== null">
						{{ t('threedviewer', 'Filament: {metres} m', { metres: round(summary.filamentMm / 1000, 2) }) }}
					</li>
					<li v-if="summary.filamentGrams !== null">
						{{ t('threedviewer', 'Filament: {grams} g', { grams: round(summary.filamentGrams, 2) }) }}
					</li>
					<li v-if="summary.slicer" class="tdv-secondary">
						{{ t('threedviewer', 'Sliced with {slicer}', { slicer: summary.slicer }) }}
					</li>
				</ul>
				<p v-else class="tdv-secondary">
					{{ t('threedviewer', 'This file doesn\'t include the slicer\'s estimates') }}
				</p>
			</template>

			<template v-else>
				<div class="print-check-section">
					<label for="print-check-printer" class="tdv-section-label">{{ t('threedviewer', 'Printer') }}</label>
					<select id="print-check-printer"
						class="tdv-select print-check-select"
						:value="state.settings.printerId"
						@change="$emit('set-printer', $event.target.value)">
						<option v-for="printer in PRINTERS" :key="printer.id" :value="printer.id">
							{{ printer.name }} ({{ printer.width }} × {{ printer.depth }} × {{ printer.height }} mm)
						</option>
						<option value="custom">
							{{ t('threedviewer', 'Custom') }}
						</option>
					</select>
					<div v-if="state.settings.printerId === 'custom'" class="print-check-custom">
						<div v-for="side in SIDES" :key="side.key" class="print-check-field">
							<label :for="`print-check-${side.key}`">{{ side.label }}</label>
							<input :id="`print-check-${side.key}`"
								type="number"
								min="10"
								max="2000"
								step="1"
								:value="state.settings.custom[side.key]"
								@change="$emit('set-custom', { [side.key]: Number($event.target.value) })">
						</div>
					</div>
				</div>

				<div class="print-check-section">
					<div class="print-check-up" role="group" :aria-label="t('threedviewer', 'Which way is up')">
						<button v-for="axis in ['y', 'z']"
							:key="axis"
							type="button"
							class="print-check-toggle"
							:class="{ active: state.up === axis }"
							:aria-pressed="state.up === axis ? 'true' : 'false'"
							@click="$emit('set-up', axis)">
							{{ axis === 'y' ? t('threedviewer', 'Y up') : t('threedviewer', 'Z up') }}
						</button>
					</div>
					<p v-if="state.fit" class="print-check-fit" :class="{ 'print-check-warn': !state.fit.fits }">
						<template v-if="state.fit.fits">
							{{ t('threedviewer', 'Fits the build volume') }}
						</template>
						<template v-else>
							<span v-for="line in overLines" :key="line" class="print-check-over">{{ line }}</span>
							<span v-if="state.fit.fitsTurned" class="tdv-secondary">{{ t('threedviewer', 'Fits if turned 90°') }}</span>
						</template>
					</p>
				</div>

				<template v-if="state.kind === 'mesh'">
					<div class="print-check-section">
						<label for="print-check-angle" class="tdv-section-label">{{ t('threedviewer', 'Overhang angle') }}</label>
						<div class="print-check-range">
							<input id="print-check-angle"
								type="range"
								:min="OVERHANG_ANGLE_RANGE.min"
								:max="OVERHANG_ANGLE_RANGE.max"
								step="1"
								:value="state.settings.overhangAngle"
								@input="$emit('set-overhang-angle', Number($event.target.value))">
							<output for="print-check-angle">{{ state.settings.overhangAngle }}°</output>
						</div>
						<p v-if="state.overhang">
							{{ t('threedviewer', '{percent} % of the surface overhangs', { percent: Math.round(state.overhang.share * 100) }) }}
						</p>
					</div>

					<div class="print-check-section">
						<span class="tdv-section-label">{{ t('threedviewer', 'Filament') }}</span>
						<div class="print-check-pair">
							<div class="print-check-field">
								<label for="print-check-infill">{{ t('threedviewer', 'Infill (%)') }}</label>
								<input id="print-check-infill"
									type="number"
									min="0"
									max="100"
									step="1"
									:value="state.settings.infill"
									@change="$emit('set-infill', Number($event.target.value))">
							</div>
							<div class="print-check-field">
								<label for="print-check-material">{{ t('threedviewer', 'Material') }}</label>
								<select id="print-check-material"
									class="tdv-select"
									:value="state.settings.material"
									@change="$emit('set-material', $event.target.value)">
									<option v-for="material in MATERIALS" :key="material.id" :value="material.id">
										{{ material.name }}
									</option>
								</select>
							</div>
						</div>
						<p v-if="state.closed === 'checking'" class="tdv-secondary">
							{{ t('threedviewer', 'Checking…') }}
						</p>
						<p v-else-if="state.closed === 'open'" class="print-check-warn">
							{{ n('threedviewer', 'Needs a closed model: %n part has holes', 'Needs a closed model: %n parts have holes', state.openParts) }}
						</p>
						<p v-else-if="state.estimate">
							{{ t('threedviewer', 'About {grams} g · {metres} m of filament (estimate)', { grams: fixed(state.estimate.grams, 1), metres: fixed(state.estimate.metres, 2) }) }}
						</p>
					</div>

					<div class="print-check-section">
						<span class="tdv-section-label">{{ t('threedviewer', 'Wall thickness') }}</span>
						<div class="print-check-field">
							<label for="print-check-min">{{ t('threedviewer', 'Minimum (mm)') }}</label>
							<input id="print-check-min"
								type="number"
								min="0.1"
								max="10"
								step="0.1"
								:value="state.settings.minThickness"
								@change="$emit('set-min-thickness', Number($event.target.value))">
						</div>
						<div v-if="state.thickness.state === 'running'" class="print-check-progress">
							<progress :value="state.thickness.progress"
								max="1"
								:aria-label="t('threedviewer', 'Checking wall thickness')" />
							<button type="button" class="tdv-btn tdv-btn--secondary" @click="$emit('cancel-thickness')">
								{{ t('threedviewer', 'Cancel') }}
							</button>
						</div>
						<button v-else
							type="button"
							class="tdv-btn tdv-btn--secondary print-check-run"
							@click="$emit('run-thickness')">
							{{ t('threedviewer', 'Check wall thickness') }}
						</button>
						<template v-if="state.thickness.state === 'done'">
							<ul class="print-check-legend">
								<li><span class="print-check-swatch print-check-swatch--thin" aria-hidden="true" />{{ t('threedviewer', 'Thinner than {min} mm', { min: state.settings.minThickness }) }}</li>
								<li><span class="print-check-swatch print-check-swatch--near" aria-hidden="true" />{{ t('threedviewer', 'Under {near} mm', { near: round(state.settings.minThickness * NEAR_THIN_FACTOR, 2) }) }}</li>
							</ul>
							<p>{{ t('threedviewer', '{percent} % of the surface is thinner than {min} mm', { percent: Math.round(state.thickness.share * 100), min: state.settings.minThickness }) }}</p>
							<p v-if="state.thickness.sampled" class="tdv-secondary">
								{{ t('threedviewer', 'Checked a sample of points on this large model') }}
							</p>
							<p v-if="state.thickness.warnOpen" class="print-check-warn">
								{{ t('threedviewer', 'This model has holes, so the thickness may be wrong') }}
							</p>
							<p v-if="state.hoverMm !== null" class="tdv-secondary">
								{{ t('threedviewer', '{mm} mm thick', { mm: round(state.hoverMm, 2) }) }}
							</p>
						</template>
						<p v-else-if="state.thickness.state === 'error'" class="print-check-warn">
							{{ t('threedviewer', 'Could not check the wall thickness') }}
						</p>
					</div>
				</template>
			</template>
		</div>
	</section>
</template>

<script>
import ViewerIcon from './ViewerIcon.vue'
import { PRINTERS, MATERIALS, OVERHANG_ANGLE_RANGE, NEAR_THIN_FACTOR } from '../printCheck/printers.js'
import { formatDuration } from '../printCheck/formatDuration.js'

export default {
	name: 'PrintCheckCard',
	components: {
		ViewerIcon,
	},
	props: {
		// What usePrintCheck holds, unwrapped, plus `hoverMm` under the pointer
		state: { type: Object, required: true },
	},
	emits: ['close', 'set-printer', 'set-custom', 'set-up', 'set-overhang-angle', 'set-infill', 'set-material', 'set-min-thickness', 'run-thickness', 'cancel-thickness'],
	data() {
		return { PRINTERS, MATERIALS, OVERHANG_ANGLE_RANGE, NEAR_THIN_FACTOR }
	},
	computed: {
		SIDES() {
			return [
				{ key: 'width', label: this.t('threedviewer', 'Width (mm)') },
				{ key: 'depth', label: this.t('threedviewer', 'Depth (mm)') },
				{ key: 'height', label: this.t('threedviewer', 'Height (mm)') },
			]
		},
		summary() {
			return this.state.slicerSummary || { slicer: null, printSeconds: null, filamentMm: null, filamentGrams: null }
		},
		hasSlicerNumbers() {
			const { printSeconds, filamentMm, filamentGrams } = this.summary
			return printSeconds !== null || filamentMm !== null || filamentGrams !== null
		},
		overLines() {
			const over = this.state.fit?.over || {}
			return [
				over.width > 0 && this.t('threedviewer', '{amount} mm too wide', { amount: this.round(over.width, 1) }),
				over.depth > 0 && this.t('threedviewer', '{amount} mm too deep', { amount: this.round(over.depth, 1) }),
				over.height > 0 && this.t('threedviewer', '{amount} mm too tall', { amount: this.round(over.height, 1) }),
			].filter(Boolean)
		},
	},
	methods: {
		formatDuration,
		/**
		 * @param {number} value - A number
		 * @param {number} decimals - At most this many decimals
		 * @return {string} It rounded, without trailing zeros: 80, 12.4
		 */
		round(value, decimals) {
			return String(Number(value.toFixed(decimals)))
		},
		/**
		 * @param {number} value - A number
		 * @param {number} decimals - Exactly this many decimals
		 * @return {string} It rounded, trailing zeros kept: 1.0
		 */
		fixed(value, decimals) {
			return value.toFixed(decimals)
		},
	},
}
</script>

<style scoped>
.print-check-card {
	position: absolute;
	top: 80px;
	inset-inline-start: 20px;
	z-index: 300;
	display: flex;
	flex-direction: column;
	width: 320px;

	/* Ends above the performance HUD in the bottom corner, which is drawn over it: the
	   card scrolls instead of putting its last controls under the HUD */
	max-height: calc(100% - 300px);
	min-height: 160px;
}

.print-check-card.beside-stats {
	inset-inline-start: 360px;
}

.print-check-header {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: space-between;
	padding: 12px 10px 12px 18px;
}

.print-check-header h3 {
	margin: 0;
	font-size: var(--tdv-font-size-heading);
	font-weight: var(--tdv-font-weight-bold);
}

.print-check-body {
	overflow: auto;
	padding: 0 18px 16px;
	color: var(--tdv-color-text);
}

.print-check-body p {
	margin: 6px 0;
}

.print-check-section {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 0;
	border-top: 1px solid var(--tdv-color-border);
}

.print-check-note {
	margin-top: 0;
}

.print-check-select,
.print-check-field input,
.print-check-field select {
	width: 100%;
}

.print-check-custom,
.print-check-pair {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 8px;
}

.print-check-pair {
	grid-template-columns: 1fr 1fr;
}

.print-check-field {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: var(--tdv-font-size-small);
}

.print-check-up {
	display: flex;
	gap: 6px;
}

.print-check-toggle.print-check-toggle {
	flex: 1;
	margin: 0;
	padding: 4px 8px;
	border: 1px solid var(--tdv-color-border);
	border-radius: var(--tdv-radius-control);
	background: transparent;
	color: var(--tdv-color-text);
	cursor: pointer;
}

.print-check-toggle.print-check-toggle.active {
	border-color: var(--tdv-color-primary);
	background: var(--tdv-color-primary-light);
	color: var(--tdv-color-primary-text);
}

.print-check-fit {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.print-check-warn {
	color: var(--tdv-color-error);
}

.print-check-range {
	display: flex;
	gap: 8px;
	align-items: center;
}

.print-check-range input {
	flex: 1;
}

.print-check-progress {
	display: flex;
	gap: 8px;
	align-items: center;
}

.print-check-progress progress {
	flex: 1;
}

.print-check-run.print-check-run {
	align-self: flex-start;
}

.print-check-lines,
.print-check-legend {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.print-check-legend li {
	display: flex;
	gap: 6px;
	align-items: center;
}

.print-check-swatch {
	width: 12px;
	height: 12px;
	border-radius: 2px;
}

.print-check-swatch--thin {
	background: var(--tdv-color-error);
}

.print-check-swatch--near {
	background: var(--tdv-color-warning);
}
</style>
