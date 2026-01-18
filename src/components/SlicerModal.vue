<template>
	<div v-if="isOpen" class="slicer-modal-backdrop" @click="handleBackdropClick">
		<div class="slicer-modal" :class="{ 'dark-theme': isDarkTheme }" @click.stop>
			<!-- Modal Header -->
			<div class="modal-header">
				<h2 class="modal-title">
					{{ t('threedviewer', 'Send to Slicer') }}
				</h2>
				<button class="close-btn"
					:aria-label="t('threedviewer', 'Close')"
					@click="closeModal">
					<span class="icon">×</span>
				</button>
			</div>

			<!-- Modal Content -->
			<div class="modal-content">
				<p class="modal-description">
					{{ t('threedviewer', 'Send your model to a slicer. Formats you mark as passthrough are sent as-is; everything else is converted to STL.') }}
				</p>

				<!-- Loading State -->
				<div v-if="exporting" class="loading-state">
					<div class="spinner" />
					<p>{{ exportMessage }}</p>
				</div>

				<!-- Error State -->
				<div v-if="errorMessage" class="error-state">
					<span class="error-icon">⚠️</span>
					<p>{{ errorMessage }}</p>
					<button class="retry-btn" @click="clearError">
						{{ t('threedviewer', 'Dismiss') }}
					</button>
				</div>

				<!-- Slicer Grid -->
				<div v-if="!exporting" class="slicer-grid">
					<div v-for="slicer in slicers"
						:key="slicer.id"
						class="slicer-card"
						:class="{ 'last-used': slicer.id === lastUsedSlicer }"
						:style="{ '--slicer-color': slicer.color }">
						<div class="slicer-icon">
							<img :src="slicer.icon"
								:alt="slicer.name"
								@error="handleImageError">
						</div>
						<div class="slicer-info">
							<h3 class="slicer-name">
								{{ slicer.name }}
								<span v-if="slicer.id === lastUsedSlicer" class="last-used-badge">
									{{ t('threedviewer', 'Last used') }}
								</span>
							</h3>
							<p class="slicer-description">
								{{ slicer.description }}
							</p>
						</div>
						<div class="slicer-actions">
							<button class="slicer-btn primary"
								:disabled="!modelObject"
								:title="t('threedviewer', 'Open directly in {name}', { name: slicer.name })"
								@click="handleOpenInSlicer(slicer.id)">
								<span class="btn-icon">🚀</span>
								{{ t('threedviewer', 'Open in {name}', { name: slicer.name }) }}
							</button>
						</div>
					</div>
				</div>

				<!-- Info Footer -->
				<div v-if="!exporting" class="modal-info">
					<p class="info-text">
						<span class="info-icon">💡</span>
						<strong>{{ t('threedviewer', 'Tip:') }}</strong> {{ t('threedviewer', 'The app creates a temporary Nextcloud share link that works with slicer applications. Link expires after 1 hour.') }}
					</p>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { showWarning } from '@nextcloud/dialogs'
import { useSlicerIntegration } from '../composables/useSlicerIntegration.js'
import { logger } from '../utils/logger.js'

export default {
	name: 'SlicerModal',

	props: {
		isOpen: {
			type: Boolean,
			default: false,
		},
		modelObject: {
			type: Object,
			default: null,
		},
		modelName: {
			type: String,
			default: 'model',
		},
		fileId: {
			type: [Number, String],
			default: null,
		},
		filename: {
			type: String,
			default: null,
		},
		passthroughFormats: {
			type: Array,
			default: () => [],
		},
		exportFormat: {
			type: String,
			default: 'stl',
			validator: (value) => ['stl', 'obj', 'ply'].includes(value),
		},
		isDarkTheme: {
			type: Boolean,
			default: false,
		},
	},

	emits: ['close', 'success', 'error'],

	setup(props, { emit }) {
		// Composables
		const slicerIntegration = useSlicerIntegration()

		// Local state
		const exporting = ref(false)
		const exportMessage = ref('')
		const errorMessage = ref(null)
		const tempBlobUrl = ref(null)
		const sourceExtension = computed(() => {
			if (!props.filename) return ''
			const parts = props.filename.split('.')
			return parts.length > 1 ? parts.pop().toLowerCase() : ''
		})

		// Get slicers from composable, with last used on top
		const slicers = computed(() => {
			const allSlicers = slicerIntegration.getSlicers()
			const lastUsed = slicerIntegration.lastUsedSlicer.value

			if (!lastUsed) {
				return allSlicers
			}

			// Sort to put last used slicer first
			return [...allSlicers].sort((a, b) => {
				if (a.id === lastUsed) return -1
				if (b.id === lastUsed) return 1
				return 0
			})
		})
		const lastUsedSlicer = computed(() => slicerIntegration.lastUsedSlicer.value)

		/**
		 * Close the modal
		 */
		const closeModal = () => {
			// Clean up any temporary blob URLs
			if (tempBlobUrl.value) {
				slicerIntegration.revokeBlobUrl(tempBlobUrl.value)
				tempBlobUrl.value = null
			}
			emit('close')
		}

		/**
		 * Handle backdrop click (close modal)
		 */
		const handleBackdropClick = () => {
			if (!exporting.value) {
				closeModal()
			}
		}

		/**
		 * Handle image load error (fallback to text)
		 * @param event
		 */
		const handleImageError = (event) => {
			// On error, replace with a simple colored circle
			event.target.style.display = 'none'
			const fallback = document.createElement('div')
			fallback.className = 'slicer-icon-fallback'
			fallback.textContent = '?'
			event.target.parentElement.appendChild(fallback)
		}

		/**
		 * Handle ESC key to close modal
		 * @param event
		 */
		const handleKeyPress = (event) => {
			if (event.key === 'Escape' && props.isOpen && !exporting.value) {
				closeModal()
			}
		}

		/**
		 * Export model in specified format and return blob
		 * @param {string} format - Export format ('stl', 'obj', or 'ply')
		 * @return {Promise<Blob>} Exported blob
		 */
		const exportModel = async (format = 'stl') => {
			if (!props.modelObject) {
				throw new Error('No model object provided')
			}

			exporting.value = true
			errorMessage.value = null
			const formatUpper = format.toUpperCase()
			exportMessage.value = t('threedviewer', 'Exporting model to {format}...', { format: formatUpper })

			try {
				let exportedBlob

				if (format === 'stl') {
					const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js')
					const exporter = new STLExporter()
					exportMessage.value = t('threedviewer', 'Converting to STL format...')
					await new Promise(resolve => setTimeout(resolve, 100))
					const result = exporter.parse(props.modelObject, { binary: true })
					exportMessage.value = t('threedviewer', 'Creating file...')
					await new Promise(resolve => setTimeout(resolve, 100))
					exportedBlob = new Blob([result], { type: 'application/octet-stream' })
				} else if (format === 'obj') {
					const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js')
					const exporter = new OBJExporter()
					exportMessage.value = t('threedviewer', 'Converting to OBJ format...')
					await new Promise(resolve => setTimeout(resolve, 100))
					const result = exporter.parse(props.modelObject)
					exportMessage.value = t('threedviewer', 'Creating file...')
					await new Promise(resolve => setTimeout(resolve, 100))
					exportedBlob = new Blob([result], { type: 'text/plain' })
				} else if (format === 'ply') {
					const { PLYExporter } = await import('three/examples/jsm/exporters/PLYExporter.js')
					const exporter = new PLYExporter()
					exportMessage.value = t('threedviewer', 'Converting to PLY format...')
					await new Promise(resolve => setTimeout(resolve, 100))
					const result = exporter.parse(props.modelObject, { binary: true })
					exportMessage.value = t('threedviewer', 'Creating file...')
					await new Promise(resolve => setTimeout(resolve, 100))
					exportedBlob = new Blob([result], { type: 'application/octet-stream' })
				} else {
					throw new Error(`Unsupported export format: ${format}`)
				}

				logger.info('SlicerModal', `${formatUpper} export complete`, {
					format,
					size: exportedBlob.size,
					sizeMB: (exportedBlob.size / 1024 / 1024).toFixed(2),
				})

				return exportedBlob
			} catch (error) {
				logger.error('SlicerModal', `Failed to export ${formatUpper}`, error)
				throw error
			}
		}

		/**
		 * Fetch the original file via backend (avoids STL reconversion for slicer-native formats).
		 */
		const fetchOriginalFile = async () => {
			if (!props.fileId) {
				throw new Error('No file ID available to fetch original file')
			}

			exporting.value = true
			errorMessage.value = null
			exportMessage.value = t('threedviewer', 'Preparing original file...')

			const response = await fetch(generateUrl(`/apps/threedviewer/api/file/${props.fileId}`), {
				method: 'GET',
				credentials: 'include',
			})

			if (!response.ok) {
				throw new Error(`Failed to fetch original file (HTTP ${response.status})`)
			}

			exportMessage.value = t('threedviewer', 'Reading file...')
			const blob = await response.blob()
			return blob
		}

		/**
		 * Handle opening model in slicer
		 * @param {string} slicerId - Slicer ID
		 */
		const handleOpenInSlicer = async (slicerId) => {
			try {
				const slicer = slicerIntegration.getSlicerById(slicerId)

				exportMessage.value = t('threedviewer', 'Preparing file for {name}...', { name: slicer.name })

				let blob
				const exportFormat = props.exportFormat || 'stl'
				let filename = `${props.modelName}_for_${slicer.name.replace(/\s+/g, '_')}.${exportFormat}`

				const passthroughList = Array.isArray(props.passthroughFormats)
					? props.passthroughFormats.map(f => String(f).toLowerCase())
					: []
				const ext = sourceExtension.value
				if (ext && passthroughList.includes(ext) && props.fileId) {
					blob = await fetchOriginalFile()
					filename = props.filename || filename
				} else {
					// Export in selected format
					blob = await exportModel(exportFormat)
				}

				// Upload to Nextcloud to get a public share URL
				// This uses Nextcloud's native share system (like sharing a file)
				exportMessage.value = t('threedviewer', 'Creating temporary share link...')

				try {
					const response = await fetch(generateUrl('/apps/threedviewer/api/slicer/temp') + `?filename=${encodeURIComponent(filename)}`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/octet-stream',
						},
						body: blob,
					})

					if (!response.ok) {
						throw new Error(`Server returned ${response.status}`)
					}

					const data = await response.json()

					if (!data.success || !data.downloadUrl) {
						throw new Error('Server did not return download URL')
					}

					logger.info('SlicerModal', 'Got public share URL', {
						url: data.downloadUrl,
						token: data.shareToken,
						expiresAt: data.expiresAt,
					})

					exportMessage.value = t('threedviewer', 'Opening in {name}...', { name: slicer.name })

					// Try to open in slicer with public Nextcloud URL
					// This will trigger the URL scheme and set up error detection
					slicerIntegration.openInSlicer(slicerId, data.downloadUrl)

					// Wait for the error detection timeout (2 seconds in useSlicerIntegration)
					await new Promise(resolve => setTimeout(resolve, 2500))

					// Check if there was an error (scheme not registered)
					if (slicerIntegration.error.value) {
						logger.info('SlicerModal', 'Detected slicer not installed, showing notification', {
							slicerId,
							hasError: !!slicerIntegration.error.value,
							error: slicerIntegration.error.value,
						})

						// Show error message to user with notification
						showWarning(
							t('threedviewer', '{name} is not installed on your system. Downloading the file instead...', { name: slicer.name }),
							{ timeout: 8000 },
						)

						exportMessage.value = t('threedviewer', '{name} not found - downloading file...', { name: slicer.name })

						// Wait a bit then offer download
						await new Promise(resolve => setTimeout(resolve, 500))

						// Auto-download as fallback
						window.open(data.downloadUrl, '_blank')
						logger.warn('SlicerModal', 'Slicer not installed, downloading file', { slicerId })

						await new Promise(resolve => setTimeout(resolve, 2000))
						exporting.value = false

						// Clear error for next attempt
						slicerIntegration.clearError()
						return
					}

					// If no error, slicer opened successfully
					const success = true

					if (success) {
						exportMessage.value = t('threedviewer', 'Opened in {name}!', { name: slicer.name })
						logger.info('SlicerModal', 'Slicer launched with URL', { slicerId })
					} else {
						exportMessage.value = t('threedviewer', 'Opening download link...', { name: slicer.name })
						// Fallback: Open in browser tab
						window.open(data.downloadUrl, '_blank')
						logger.info('SlicerModal', 'Opened in browser (URL scheme not supported)', { slicerId })
					}

					await new Promise(resolve => setTimeout(resolve, 2000))

					emit('success', { slicerId, method: success ? 'url-scheme' : 'download', shareToken: data.shareToken })
					exporting.value = false

					// Auto-cleanup after 2 minutes (share will auto-expire tomorrow anyway)
					setTimeout(() => {
						fetch(generateUrl(`/apps/threedviewer/api/slicer/temp/${data.fileId}`), {
							method: 'DELETE',
							credentials: 'include',
							headers: {
								'Content-Type': 'application/json',
							},
						}).catch(err => logger.warn('SlicerModal', 'Auto-cleanup failed', err))
					}, 120000)

				} catch (serverError) {
					// Server approach failed, fallback to direct download
					logger.warn('SlicerModal', 'Server upload failed, using direct download', serverError)

					exportMessage.value = t('threedviewer', 'Downloading file...')
					await new Promise(resolve => setTimeout(resolve, 200))

					const url = URL.createObjectURL(blob)
					const link = document.createElement('a')
					link.href = url
					link.download = filename
					link.style.display = 'none'
					document.body.appendChild(link)
					link.click()

					// Cleanup
					setTimeout(() => {
						document.body.removeChild(link)
						URL.revokeObjectURL(url)
					}, 100)

					slicerIntegration.saveLastUsedSlicer(slicerId)

					exportMessage.value = t('threedviewer', 'Downloaded! Open the file in {name}', { name: slicer.name })
					await new Promise(resolve => setTimeout(resolve, 2500))

					emit('success', { slicerId, method: 'download' })
					exporting.value = false

					logger.info('SlicerModal', 'STL downloaded to browser (fallback)', { slicerId, filename })
				}
			} catch (error) {
				logger.error('SlicerModal', 'Failed to open in slicer', error)
				errorMessage.value = t('threedviewer', 'Failed to prepare file: {error}', { error: error.message })
				exporting.value = false
				emit('error', error)
			}
		}

		/**
		 * Clear error message
		 */
		const clearError = () => {
			errorMessage.value = null
		}

		// Watch for modal close to cleanup
		watch(() => props.isOpen, (isOpen) => {
			if (!isOpen) {
				exporting.value = false
				errorMessage.value = null
				exportMessage.value = ''
			}
		})

		// Keyboard event listeners
		onMounted(() => {
			window.addEventListener('keydown', handleKeyPress)
		})

		onBeforeUnmount(() => {
			window.removeEventListener('keydown', handleKeyPress)
			// Cleanup blob URL
			if (tempBlobUrl.value) {
				slicerIntegration.revokeBlobUrl(tempBlobUrl.value)
			}
		})

		return {
			t,
			slicers,
			lastUsedSlicer,
			exporting,
			exportMessage,
			errorMessage,
			closeModal,
			handleBackdropClick,
			handleImageError,
			handleOpenInSlicer,
			clearError,
		}
	},
}
</script>

<style scoped>
/* Modal Backdrop */
.slicer-modal-backdrop {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.6);
	backdrop-filter: blur(4px);
	z-index: 10000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 20px;
	animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
	from {
		opacity: 0;
	}

	to {
		opacity: 1;
	}
}

/* Modal Container */

.slicer-modal {
	background: var(--color-main-background, #fff);
	border-radius: 12px;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	max-width: 800px;
	width: 100%;
	max-height: 90vh;
	display: flex;
	flex-direction: column;
	animation: slideUp 0.3s ease;
}

@keyframes slideUp {
	from {
		transform: translateY(20px);
		opacity: 0;
	}

	to {
		transform: translateY(0);
		opacity: 1;
	}
}

/* Modal Header */
.modal-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 20px 24px;
	border-bottom: 1px solid var(--color-border, #e0e0e0);
}

.modal-title {
	font-size: 22px;
	font-weight: 600;
	margin: 0;
	color: var(--color-main-text, #000);
}

.close-btn {
	background: transparent;
	border: none;
	color: var(--color-main-text, #000);
	font-size: 32px;
	line-height: 1;
	cursor: pointer;
	padding: 4px 8px;
	border-radius: 6px;
	transition: background 0.2s ease;
}

.close-btn:hover {
	background: var(--color-background-hover, #f0f0f0);
}

.close-btn .icon {
	display: block;
}

/* Modal Content */
.modal-content {
	flex: 1;
	overflow: auto;
	padding: 24px;
}

.modal-description {
	margin-bottom: 20px;
	color: var(--color-text-maxcontrast, #666);
	font-size: 14px;
	line-height: 1.5;
}

/* Loading State */
.loading-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 60px 20px;
	text-align: center;
}

.spinner {
	width: 48px;
	height: 48px;
	border: 4px solid var(--color-border, #e0e0e0);
	border-top-color: var(--color-primary-element, #0082c9);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
	margin-bottom: 16px;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.loading-state p {
	margin: 0;
	color: var(--color-main-text, #000);
	font-size: 14px;
}

/* Error State */
.error-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 40px 20px;
	background: rgba(220, 53, 69, 0.1);
	border-radius: 8px;
	margin-bottom: 20px;
}

.error-icon {
	font-size: 48px;
	margin-bottom: 12px;
}

.error-state p {
	margin: 0 0 16px;
	color: var(--color-error, #dc3545);
	font-size: 14px;
	text-align: center;
}

.retry-btn {
	padding: 8px 16px;
	background: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #fff);
	border: none;
	border-radius: 6px;
	cursor: pointer;
	font-size: 14px;
	font-weight: 500;
	transition: background 0.2s ease;
}

.retry-btn:hover {
	background: var(--color-primary-element-hover, #006aa3);
}

/* Slicer Grid */
.slicer-grid {
	display: grid;
	grid-template-columns: 1fr;
	gap: 16px;
	margin-bottom: 20px;
}

/* Slicer Card */
.slicer-card {
	display: grid;
	grid-template-columns: auto 1fr auto;
	gap: 16px;
	align-items: center;
	padding: 20px;
	background: var(--color-background-hover, #f8f8f8);
	border: 2px solid var(--color-border, #e0e0e0);
	border-radius: 10px;
	transition: all 0.2s ease;
}

.slicer-card:hover {
	border-color: var(--slicer-color, var(--color-primary-element, #0082c9));
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	transform: translateY(-2px);
}

.slicer-card.last-used {
	border-color: var(--slicer-color, var(--color-primary-element, #0082c9));
	background: var(--color-primary-element-light, rgba(0, 130, 201, 0.05));
}

.slicer-icon {
	width: 64px;
	height: 64px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--color-main-background, #fff);
	border-radius: 12px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
	padding: 8px;
}

.slicer-icon img {
	width: 100%;
	height: 100%;
	object-fit: contain;
	filter: grayscale(0.1);
	transition: filter 0.2s ease;
}

.slicer-card:hover .slicer-icon img {
	filter: grayscale(0);
}

.slicer-icon-fallback {
	width: 48px;
	height: 48px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--slicer-color, #666);
	color: white;
	border-radius: 50%;
	font-size: 24px;
	font-weight: bold;
}

.slicer-info {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.slicer-name {
	font-size: 16px;
	font-weight: 600;
	margin: 0;
	color: var(--color-main-text, #000);
	display: flex;
	align-items: center;
	gap: 8px;
}

.last-used-badge {
	display: inline-block;
	padding: 2px 8px;
	background: var(--slicer-color, var(--color-primary-element, #0082c9));
	color: white;
	font-size: 11px;
	font-weight: 600;
	border-radius: 10px;
	text-transform: uppercase;
}

.slicer-description {
	margin: 0;
	font-size: 13px;
	color: var(--color-text-maxcontrast, #666);
	line-height: 1.4;
}

.slicer-actions {
	display: flex;
	align-items: center;
	min-width: 150px;
}

.slicer-btn {
	padding: 12px 20px;
	border: none;
	border-radius: 6px;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s ease;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	white-space: nowrap;
	width: 100%;
}

.slicer-btn.primary {
	background: var(--slicer-color, var(--color-primary-element, #0082c9));
	color: white;
}

.slicer-btn.primary:hover:not(:disabled) {
	filter: brightness(1.1);
	transform: translateY(-1px);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.slicer-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.btn-icon {
	font-size: 16px;
}

/* Modal Info */
.modal-info {
	padding: 16px;
	background: var(--color-background-dark, #f0f0f0);
	border-radius: 8px;
	border-left: 4px solid var(--color-primary-element, #0082c9);
}

.info-text {
	margin: 0;
	font-size: 13px;
	color: var(--color-text-maxcontrast, #666);
	display: flex;
	align-items: flex-start;
	gap: 8px;
	line-height: 1.5;
}

.info-icon {
	font-size: 18px;
	flex-shrink: 0;
}

/* Dark Theme */
.slicer-modal.dark-theme {
	background: #2a2a2a;
}

.slicer-modal.dark-theme .modal-header {
	border-bottom-color: rgba(255, 255, 255, 0.1);
}

.slicer-modal.dark-theme .modal-title,
.slicer-modal.dark-theme .close-btn {
	color: #fff;
}

.slicer-modal.dark-theme .close-btn:hover {
	background: rgba(255, 255, 255, 0.1);
}

.slicer-modal.dark-theme .modal-description {
	color: rgba(255, 255, 255, 0.7);
}

.slicer-modal.dark-theme .slicer-card {
	background: #333;
	border-color: rgba(255, 255, 255, 0.2);
}

.slicer-modal.dark-theme .slicer-card:hover {
	border-color: var(--slicer-color);
}

.slicer-modal.dark-theme .slicer-card.last-used {
	background: rgba(66, 135, 245, 0.15);
}

.slicer-modal.dark-theme .slicer-icon {
	background: #1f1f1f;
}

.slicer-modal.dark-theme .slicer-name {
	color: #fff;
}

.slicer-modal.dark-theme .slicer-description {
	color: rgba(255, 255, 255, 0.6);
}

.slicer-modal.dark-theme .modal-info {
	background: rgba(255, 255, 255, 0.05);
	border-left-color: #4287f5;
}

.slicer-modal.dark-theme .info-text {
	color: rgba(255, 255, 255, 0.7);
}

.slicer-modal.dark-theme .spinner {
	border-color: rgba(255, 255, 255, 0.2);
	border-top-color: #4287f5;
}

.slicer-modal.dark-theme .loading-state p {
	color: #fff;
}

/* Responsive */
@media (max-width: 768px) {
	.slicer-modal {
		max-width: 95%;
		max-height: 95vh;
	}

	.modal-header {
		padding: 16px 20px;
	}

	.modal-title {
		font-size: 18px;
	}

	.modal-content {
		padding: 20px;
	}

	.slicer-card {
		grid-template-columns: auto 1fr;
		gap: 12px;
	}

	.slicer-actions {
		grid-column: 1 / -1;
		width: 100%;
	}

	.slicer-icon {
		width: 48px;
		height: 48px;
		padding: 6px;
	}
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
	.slicer-modal-backdrop,
	.slicer-modal,
	.slicer-card,
	.slicer-btn {
		animation: none;
		transition: none;
	}

	.slicer-card:hover,
	.slicer-btn:hover {
		transform: none;
	}
}
</style>
