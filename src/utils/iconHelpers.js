/**
 * Icon Helper Utilities
 * 
 * Provides utilities for accessing file format icons from SUPPORTED_FORMATS
 */

import { SUPPORTED_FORMATS } from '../config/viewer-config.js'

/**
 * Get icon path for a file extension
 * 
 * @param {string} ext - File extension (e.g., 'glb', 'obj', '3ds')
 * @returns {string} Icon path or fallback to generic 3D icon
 * 
 * @example
 * getFormatIcon('obj') // '/apps/threedviewer/img/filetypes/obj.svg'
 * getFormatIcon('unknown') // '/apps/threedviewer/img/file-3d.svg'
 */
export function getFormatIcon(ext) {
	if (!ext) {
		return '/apps/threedviewer/img/file-3d.svg'
	}
	
	const format = SUPPORTED_FORMATS[ext.toLowerCase()]
	return format?.icon || '/apps/threedviewer/img/file-3d.svg'
}

/**
 * Get complete format metadata including icon
 * 
 * @param {string} ext - File extension (e.g., 'glb', 'obj')
 * @returns {object|null} Format metadata object or null if not found
 * 
 * @example
 * getFormatMetadata('obj')
 * // {
 * //   name: 'OBJ',
 * //   description: 'Wavefront OBJ format',
 * //   icon: '/apps/threedviewer/img/filetypes/obj.svg',
 * //   ...
 * // }
 */
export function getFormatMetadata(ext) {
	if (!ext) {
		return null
	}
	
	return SUPPORTED_FORMATS[ext.toLowerCase()] || null
}

/**
 * Extract file extension from filename
 * 
 * @param {string} filename - Full filename or path
 * @returns {string} Lowercase file extension without dot
 * 
 * @example
 * getFileExtension('model.obj') // 'obj'
 * getFileExtension('/path/to/model.glb') // 'glb'
 * getFileExtension('model') // ''
 */
export function getFileExtension(filename) {
	if (!filename || typeof filename !== 'string') {
		return ''
	}
	
	const parts = filename.split('.')
	return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

/**
 * Get icon for a filename (convenience function)
 * 
 * @param {string} filename - Full filename or path
 * @returns {string} Icon path
 * 
 * @example
 * getIconForFilename('mymodel.obj') // '/apps/threedviewer/img/filetypes/obj.svg'
 */
export function getIconForFilename(filename) {
	const ext = getFileExtension(filename)
	return getFormatIcon(ext)
}

