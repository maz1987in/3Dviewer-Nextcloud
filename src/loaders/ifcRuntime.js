import * as WebIFC from 'web-ifc'
import { appAssetPath } from './appAssetPath.js'

/**
 * A web-ifc instance with its WASM ready, shared by the IFC loader and the reader of an
 * element's properties (ifcProperties.js).
 *
 * @return {Promise<WebIFC.IfcAPI>} The instance
 */
export async function createIfcApi() {
	const api = new WebIFC.IfcAPI()
	// `true` as 2nd arg = use path as absolute (don't prepend script URL).
	api.SetWasmPath(appAssetPath('web-ifc'), true)
	await api.Init()
	return api
}

/**
 * An IFC class name in words: "IfcWall" is "Wall", "IfcBuildingElementProxy" is
 * "Building Element Proxy".
 *
 * @param {string} className - web-ifc's name for a type code
 * @return {string} The words, or an empty string for no name
 */
export function ifcTypeLabel(className) {
	if (typeof className !== 'string' || className === '') {
		return ''
	}
	const bare = className.replace(/^ifc/i, '')
	// A name written in capitals (IFCWALL) has no word breaks to find
	const words = bare === bare.toUpperCase() ? bare.toLowerCase() : bare.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
	return words.charAt(0).toUpperCase() + words.slice(1)
}
