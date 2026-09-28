/**
 * Export composable for 3D model export functionality
 * Supports GLB, STL, OBJ, PLY, 3MF and USDZ formats
 */

import { ref, readonly } from 'vue'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { logger } from '../utils/logger.js'

/**
 * Count vertices and triangles in an object hierarchy.
 * @param {THREE.Object3D} object
 * @return {{ vertices: number, triangles: number }}
 */
export function getGeometryStats(object) {
	let vertices = 0
	let triangles = 0
	object.traverse((child) => {
		if (child.isMesh && child.geometry) {
			const pos = child.geometry.attributes.position
			if (pos) vertices += pos.count
			if (child.geometry.index) {
				triangles += child.geometry.index.count / 3
			} else if (pos) {
				triangles += pos.count / 3
			}
		}
	})
	return { vertices: Math.round(vertices), triangles: Math.round(triangles) }
}

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
					},
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
					},
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

			const blob = new Blob([result], { type: 'model/stl' })

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

			const blob = new Blob([result], { type: 'model/obj' })

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
	 * Run one export: produce the file's bytes, then hand them to the browser as a
	 * download, tracking progress and errors the same way for every format.
	 * @param {object} spec
	 * @param {string} spec.label - format name for progress and logs
	 * @param {THREE.Object3D} spec.object - what to export
	 * @param {string} spec.filename - base filename, without extension
	 * @param {string} spec.extension - file extension, without the dot
	 * @param {string} spec.mimeType - MIME type of the file
	 * @param {Function} spec.produce - async (object) => file contents
	 * @return {Promise<void>}
	 */
	const runExport = async ({ label, object, filename, extension, mimeType, produce }) => {
		if (!object) {
			throw new Error('No object provided for export')
		}

		exporting.value = true
		exportError.value = null
		exportProgress.value = { stage: `Preparing ${label} export...`, percentage: 0 }

		try {
			logger.info('useExport', `Starting ${label} export`, { filename })

			exportProgress.value = { stage: `Exporting geometry to ${label}...`, percentage: 40 }
			const result = await produce(object)

			const blob = new Blob([result], { type: mimeType })
			const sizeMB = (blob.size / 1024 / 1024).toFixed(2)
			logger.info('useExport', `${label} export complete`, { filename, sizeMB: `${sizeMB}MB` })

			exportProgress.value = { stage: 'Triggering download...', percentage: 95 }
			triggerDownload(blob, `${filename}.${extension}`)

			exportProgress.value = { stage: 'Export complete!', percentage: 100 }
			exporting.value = false
		} catch (error) {
			logger.error('useExport', `${label} export error`, error)
			exportError.value = error.message
			exporting.value = false
			throw error
		}
	}

	/**
	 * Export model as binary PLY (meshes with vertex colours; common for scans)
	 * @param {THREE.Object3D} object - 3D object to export
	 * @param {string} filename - Base filename (without extension)
	 * @return {Promise<void>}
	 */
	const exportAsPLY = (object, filename = 'model') => runExport({
		label: 'PLY',
		object,
		filename,
		extension: 'ply',
		mimeType: 'model/ply',
		produce: async (obj) => {
			const { PLYExporter } = await import('three/examples/jsm/exporters/PLYExporter.js')
			// parse(object, onDone, options): the options are the third argument
			return new PLYExporter().parse(obj, null, { binary: true, littleEndian: true })
		},
	})

	/**
	 * Export model as 3MF (the slicers' native format; Z-up, millimetres)
	 * @param {THREE.Object3D} object - 3D object to export
	 * @param {string} filename - Base filename (without extension)
	 * @return {Promise<void>}
	 */
	const exportAs3MF = (object, filename = 'model') => runExport({
		label: '3MF',
		object,
		filename,
		extension: '3mf',
		mimeType: 'model/3mf',
		produce: async (obj) => {
			const { build3MF } = await import('../utils/threeMFWriter.js')
			return build3MF(obj)
		},
	})

	/**
	 * Export model as USDZ (opens in AR Quick Look on iPhone and iPad)
	 * @param {THREE.Object3D} object - 3D object to export
	 * @param {string} filename - Base filename (without extension)
	 * @return {Promise<void>}
	 */
	const exportAsUSDZ = (object, filename = 'model') => runExport({
		label: 'USDZ',
		object,
		filename,
		extension: 'usdz',
		mimeType: 'model/vnd.usdz+zip',
		produce: async (obj) => {
			const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js')
			return new USDZExporter().parseAsync(obj)
		},
	})

	/**
	 * Export source files as a ZIP archive (model + textures + materials)
	 * @param {File[]} sourceFiles - Array of File objects from loading pipeline
	 * @param {string} filename - Base filename (without extension)
	 * @return {Promise<void>}
	 */
	const exportAsZIP = async (sourceFiles, filename = 'model') => {
		if (!sourceFiles || sourceFiles.length === 0) {
			throw new Error('No source files available for ZIP export')
		}

		exporting.value = true
		exportError.value = null
		exportProgress.value = { stage: 'Preparing ZIP archive...', percentage: 0 }

		try {
			logger.info('useExport', 'Starting ZIP export', { filename, fileCount: sourceFiles.length })

			// Dynamic import of fflate (bundled with Three.js)
			const { zipSync } = await import('three/examples/jsm/libs/fflate.module.js')

			const zipData = {}
			const totalFiles = sourceFiles.length

			for (let i = 0; i < totalFiles; i++) {
				const file = sourceFiles[i]
				const progress = Math.round(((i + 1) / totalFiles) * 80)
				exportProgress.value = {
					stage: `Packing ${file.name} (${i + 1}/${totalFiles})...`,
					percentage: progress,
				}

				const buffer = await file.arrayBuffer()
				// Prefer the relative path (preserves subdirectory layout) when present;
				// fall back to the basename for files at the model's root.
				const entryPath = file._relativePath || file.name
				zipData[entryPath] = new Uint8Array(buffer)
			}

			exportProgress.value = { stage: 'Compressing...', percentage: 85 }
			await new Promise(resolve => setTimeout(resolve, 50))

			const zipped = zipSync(zipData, { level: 6 })

			exportProgress.value = { stage: 'Creating download file...', percentage: 95 }
			await new Promise(resolve => setTimeout(resolve, 50))

			const blob = new Blob([zipped], { type: 'application/zip' })
			const sizeMB = (blob.size / 1024 / 1024).toFixed(2)
			logger.info('useExport', 'ZIP export complete', {
				filename,
				files: totalFiles,
				sizeMB: `${sizeMB}MB`,
			})

			triggerDownload(blob, `${filename}.zip`)

			exportProgress.value = { stage: 'Export complete!', percentage: 100 }
			await new Promise(resolve => setTimeout(resolve, 500))

			exporting.value = false
		} catch (error) {
			logger.error('useExport', 'ZIP export error', error)
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
		exportAsPLY,
		exportAs3MF,
		exportAsUSDZ,
		exportAsZIP,
		clearError,
	}
}
