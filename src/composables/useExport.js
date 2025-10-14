/**
 * Export composable for 3D model export functionality
 * Supports GLB, STL, and OBJ formats
 */

import { ref, readonly } from 'vue'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { logger } from '../utils/logger.js'

export function useExport() {
	// State
	const exporting = ref(false)
	const exportProgress = ref({ stage: '', percentage: 0 })
	const exportError = ref(null)

	/**
	 * Trigger file download
	 * @param {Blob} blob - File data
	 * @param {string} filename - Download filename
	 */
	const triggerDownload = (blob, filename) => {
		try {
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
			
			logger.info('useExport', 'Download triggered', { filename, size: blob.size })
		} catch (error) {
			logger.error('useExport', 'Failed to trigger download', error)
			throw new Error('Failed to trigger download: ' + error.message)
		}
	}

	/**
	 * Export model as GLB (binary glTF)
	 * @param {THREE.Object3D} object - 3D object to export
	 * @param {string} filename - Base filename (without extension)
	 * @return {Promise<void>}
	 */
	const exportAsGLB = async (object, filename = 'model') => {
		if (!object) {
			throw new Error('No object provided for export')
		}

		exporting.value = true
		exportError.value = null
		exportProgress.value = { stage: 'Preparing GLB export...', percentage: 0 }

		try {
			logger.info('useExport', 'Starting GLB export', { filename })

			// Small delay to show initial progress
			await new Promise(resolve => setTimeout(resolve, 100))

			const exporter = new GLTFExporter()

			return new Promise((resolve, reject) => {
				exportProgress.value = { stage: 'Exporting to GLB...', percentage: 30 }

				exporter.parse(
					object,
					async (result) => {
						try {
							exportProgress.value = { stage: 'Processing model data...', percentage: 60 }
							await new Promise(resolve => setTimeout(resolve, 100))

							exportProgress.value = { stage: 'Creating download file...', percentage: 80 }
							await new Promise(resolve => setTimeout(resolve, 100))

							// Result is ArrayBuffer for binary export
							const blob = new Blob([result], { type: 'model/gltf-binary' })
							
							// Check file size
							const sizeMB = (blob.size / 1024 / 1024).toFixed(2)
							logger.info('useExport', 'GLB export complete', { filename, sizeMB: `${sizeMB}MB` })
							
							if (blob.size > 100 * 1024 * 1024) { // 100MB warning
								logger.warn('useExport', 'Large file export', { sizeMB: `${sizeMB}MB` })
							}

							exportProgress.value = { stage: 'Triggering download...', percentage: 95 }
							await new Promise(resolve => setTimeout(resolve, 100))

							triggerDownload(blob, `${filename}.glb`)

							exportProgress.value = { stage: 'Export complete!', percentage: 100 }
							
							// Keep progress visible for a moment before closing
							await new Promise(resolve => setTimeout(resolve, 500))
							
							exporting.value = false
							resolve()
						} catch (error) {
							logger.error('useExport', 'Failed to create GLB blob', error)
							exporting.value = false
							reject(error)
						}
					},
					(error) => {
						logger.error('useExport', 'GLB export failed', error)
						exportError.value = error.message
						exporting.value = false
						reject(error)
					},
					{
						binary: true,
						embedImages: true,
						includeCustomExtensions: true,
						maxTextureSize: 4096,
					}
				)
			})
		} catch (error) {
			logger.error('useExport', 'GLB export error', error)
			exportError.value = error.message
			exporting.value = false
			throw error
		}
	}

	/**
	 * Export model as GLTF (JSON glTF)
	 * @param {THREE.Object3D} object - 3D object to export
	 * @param {string} filename - Base filename (without extension)
	 * @return {Promise<void>}
	 */
	const exportAsGLTF = async (object, filename = 'model') => {
		if (!object) {
			throw new Error('No object provided for export')
		}

		exporting.value = true
		exportError.value = null
		exportProgress.value = { stage: 'Preparing GLTF export...', percentage: 0 }

		try {
			logger.info('useExport', 'Starting GLTF export', { filename })

			await new Promise(resolve => setTimeout(resolve, 100))

			const exporter = new GLTFExporter()

			return new Promise((resolve, reject) => {
				exportProgress.value = { stage: 'Exporting to GLTF...', percentage: 30 }

				exporter.parse(
					object,
					async (result) => {
						try {
							exportProgress.value = { stage: 'Converting to JSON...', percentage: 60 }
							await new Promise(resolve => setTimeout(resolve, 100))

							// Result is JSON object for non-binary export
							const json = JSON.stringify(result, null, 2)
							
							exportProgress.value = { stage: 'Creating JSON file...', percentage: 80 }
							await new Promise(resolve => setTimeout(resolve, 100))
							
							const blob = new Blob([json], { type: 'application/json' })
							
							const sizeMB = (blob.size / 1024 / 1024).toFixed(2)
							logger.info('useExport', 'GLTF export complete', { filename, sizeMB: `${sizeMB}MB` })

							exportProgress.value = { stage: 'Triggering download...', percentage: 95 }
							await new Promise(resolve => setTimeout(resolve, 100))

							triggerDownload(blob, `${filename}.gltf`)

							exportProgress.value = { stage: 'Export complete!', percentage: 100 }
							await new Promise(resolve => setTimeout(resolve, 500))
							
							exporting.value = false
							resolve()
						} catch (error) {
							logger.error('useExport', 'Failed to create GLTF blob', error)
							exporting.value = false
							reject(error)
						}
					},
					(error) => {
						logger.error('useExport', 'GLTF export failed', error)
						exportError.value = error.message
						exporting.value = false
						reject(error)
					},
					{
						binary: false,
						embedImages: true,
						includeCustomExtensions: true,
					}
				)
			})
		} catch (error) {
			logger.error('useExport', 'GLTF export error', error)
			exportError.value = error.message
			exporting.value = false
			throw error
		}
	}

	/**
	 * Export model as STL (for 3D printing)
	 * @param {THREE.Object3D} object - 3D object to export
	 * @param {string} filename - Base filename (without extension)
	 * @return {Promise<void>}
	 */
	const exportAsSTL = async (object, filename = 'model') => {
		if (!object) {
			throw new Error('No object provided for export')
		}

		exporting.value = true
		exportError.value = null
		exportProgress.value = { stage: 'Preparing STL export...', percentage: 0 }

		try {
			logger.info('useExport', 'Starting STL export', { filename })

			await new Promise(resolve => setTimeout(resolve, 100))

			const exporter = new STLExporter()

			exportProgress.value = { stage: 'Exporting geometry to STL...', percentage: 40 }
			await new Promise(resolve => setTimeout(resolve, 150))

			// Parse with binary option for smaller file size
			const result = exporter.parse(object, { binary: true })

			exportProgress.value = { stage: 'Creating binary STL file...', percentage: 70 }
			await new Promise(resolve => setTimeout(resolve, 100))

			const blob = new Blob([result], { type: 'application/octet-stream' })
			
			const sizeMB = (blob.size / 1024 / 1024).toFixed(2)
			logger.info('useExport', 'STL export complete', { filename, sizeMB: `${sizeMB}MB` })

			exportProgress.value = { stage: 'Triggering download...', percentage: 95 }
			await new Promise(resolve => setTimeout(resolve, 100))

			triggerDownload(blob, `${filename}.stl`)

			exportProgress.value = { stage: 'Export complete!', percentage: 100 }
			await new Promise(resolve => setTimeout(resolve, 500))
			
			exporting.value = false
		} catch (error) {
			logger.error('useExport', 'STL export error', error)
			exportError.value = error.message
			exporting.value = false
			throw error
		}
	}

	/**
	 * Export model as OBJ (universal format)
	 * @param {THREE.Object3D} object - 3D object to export
	 * @param {string} filename - Base filename (without extension)
	 * @return {Promise<void>}
	 */
	const exportAsOBJ = async (object, filename = 'model') => {
		if (!object) {
			throw new Error('No object provided for export')
		}

		exporting.value = true
		exportError.value = null
		exportProgress.value = { stage: 'Preparing OBJ export...', percentage: 0 }

		try {
			logger.info('useExport', 'Starting OBJ export', { filename })

			await new Promise(resolve => setTimeout(resolve, 100))

			const exporter = new OBJExporter()

			exportProgress.value = { stage: 'Exporting geometry to OBJ...', percentage: 40 }
			await new Promise(resolve => setTimeout(resolve, 150))

			// Parse returns a string
			const result = exporter.parse(object)

			exportProgress.value = { stage: 'Creating text file...', percentage: 70 }
			await new Promise(resolve => setTimeout(resolve, 100))

			const blob = new Blob([result], { type: 'text/plain' })
			
			const sizeMB = (blob.size / 1024 / 1024).toFixed(2)
			logger.info('useExport', 'OBJ export complete', { filename, sizeMB: `${sizeMB}MB` })

			exportProgress.value = { stage: 'Triggering download...', percentage: 95 }
			await new Promise(resolve => setTimeout(resolve, 100))

			triggerDownload(blob, `${filename}.obj`)

			exportProgress.value = { stage: 'Export complete!', percentage: 100 }
			await new Promise(resolve => setTimeout(resolve, 500))
			
			exporting.value = false
		} catch (error) {
			logger.error('useExport', 'OBJ export error', error)
			exportError.value = error.message
			exporting.value = false
			throw error
		}
	}

	/**
	 * Clear error state
	 */
	const clearError = () => {
		exportError.value = null
	}

	return {
		// State (readonly to prevent external modification)
		exporting: readonly(exporting),
		exportProgress: readonly(exportProgress),
		exportError: readonly(exportError),

		// Methods
		exportAsGLB,
		exportAsGLTF,
		exportAsSTL,
		exportAsOBJ,
		clearError,
	}
}

