/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What an IFC file says about its elements, read when the Parts panel asks.
 *
 * The loader reads geometry and nothing else, so opening a model costs what it always did.
 * This opens the file again, once, when the Parts panel is first shown for it, and reads
 * what the tree needs to name and group the elements (`describe`: name, type and storey),
 * then, only for an element that is chosen, its property sets and quantities (`read`).
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { IFCRELCONTAINEDINSPATIALSTRUCTURE } from 'web-ifc'
import { createIfcApi, ifcTypeLabel } from './ifcRuntime.js'

/** A model with more property sets or properties than this is read to here only. */
const MAX_SETS = 40
const MAX_PROPERTIES = 200

/** The fields of an IFC property or quantity that hold its value, in the order to look. */
const VALUE_FIELDS = ['NominalValue', 'LengthValue', 'AreaValue', 'VolumeValue', 'CountValue', 'WeightValue', 'TimeValue', 'EnumerationValues', 'ListValues']

/** The attributes of an element worth listing beside its property sets. */
const ATTRIBUTES = ['Description', 'ObjectType', 'Tag', 'PredefinedType']

/**
 * What web-ifc wraps a value in, as text.
 *
 * @param {object|Array|string|number|boolean|null} [wrapped] - A `{value}` object, an array of
 *   them, or a plain value
 * @return {string} The value in words; an empty string for none
 */
export function formatValue(wrapped) {
	if (wrapped === null || wrapped === undefined) {
		return ''
	}
	if (Array.isArray(wrapped)) {
		return wrapped.map(formatValue).filter((part) => part !== '').join(', ')
	}
	const value = typeof wrapped === 'object' && 'value' in wrapped ? wrapped.value : wrapped
	if (typeof value === 'boolean') {
		return value ? t('threedviewer', 'Yes') : t('threedviewer', 'No')
	}
	if (typeof value === 'number') {
		return String(Number(value.toPrecision(6)))
	}
	return typeof value === 'string' ? value : ''
}

/**
 * @param {object} line - An IfcProperty or an IfcPhysicalQuantity
 * @return {?{name: string, value: string}} It as a row; null for one with no name or value
 */
export function propertyRow(line) {
	const name = formatValue(line?.Name)
	if (name === '') {
		return null
	}
	let value = ''
	for (const field of VALUE_FIELDS) {
		value = formatValue(line[field])
		if (value !== '') {
			break
		}
	}
	if (value === '' && (line.LowerBoundValue || line.UpperBoundValue)) {
		value = `${formatValue(line.LowerBoundValue)} – ${formatValue(line.UpperBoundValue)}`
	}
	return value === '' ? null : { name, value }
}

/**
 * Open an IFC file to read element properties from.
 *
 * @param {Blob} file - The IFC file
 * @return {Promise<{describe: Function, read: (expressID: number) => Promise<object>, dispose: () => void}>}
 *   `describe(expressIDs)` gives what the tree names and groups elements by;
 *   `read(expressID)` resolves to `{sets: [{name, fromType, properties: [{name, value}]}]}`;
 *   `dispose()` frees the model, which holds the file's memory
 */
export async function openIfcProperties(file) {
	const api = await createIfcApi()
	const modelID = api.OpenModel(new Uint8Array(await file.arrayBuffer()))
	let open = true

	/**
	 * @param {object} set - An IfcPropertySet or IfcElementQuantity
	 * @param {boolean} fromType - Whether it belongs to the element's type
	 * @return {?{name: string, fromType: boolean, properties: {name: string, value: string}[]}}
	 */
	const readSet = (set, fromType) => {
		const members = set.HasProperties ?? set.Quantities ?? []
		const properties = []
		for (const member of members.slice(0, MAX_PROPERTIES)) {
			const row = propertyRow(api.GetLine(modelID, member.value, false))
			if (row) {
				properties.push(row)
			}
		}
		const name = formatValue(set.Name) || t('threedviewer', 'Properties')
		return properties.length > 0 ? { name, fromType, properties } : null
	}

	/**
	 * @param {number} expressID - A line of the file
	 * @return {string} Its type in words, such as "Wall"
	 */
	const typeLabelOf = (expressID) => {
		try {
			return ifcTypeLabel(api.GetNameFromTypeCode(api.GetLineType(modelID, expressID)))
		} catch {
			return ''
		}
	}

	return {
		/**
		 * The name, type and global ID of each element, and which storey, building or space
		 * contains it. One relation lists many elements, so the containers are a handful of
		 * lines, not one per element.
		 *
		 * @param {Iterable<number>} expressIDs - The elements the model drew
		 * @return {{elements: Map<number, object>, containerOf: Map<number, number>, containers: Map<number, object>}} The elements,
		 *   the container of each, and each container's name and type
		 */
		describe(expressIDs) {
			const elements = new Map()
			const containerOf = new Map()
			const containers = new Map()
			if (!open) {
				return { elements, containerOf, containers }
			}
			for (const expressID of expressIDs) {
				let line = null
				try {
					line = api.GetLine(modelID, expressID, false)
				} catch { /* a line it cannot read is listed by its type */ }
				elements.set(expressID, {
					expressID,
					typeLabel: typeLabelOf(expressID),
					name: typeof line?.Name?.value === 'string' ? line.Name.value : '',
					globalId: typeof line?.GlobalId?.value === 'string' ? line.GlobalId.value : '',
				})
			}
			try {
				const relations = api.GetLineIDsWithType(modelID, IFCRELCONTAINEDINSPATIALSTRUCTURE)
				for (let i = 0; i < relations.size(); i++) {
					const relation = api.GetLine(modelID, relations.get(i), false)
					const container = relation?.RelatingStructure?.value
					if (!Number.isFinite(container)) {
						continue
					}
					if (!containers.has(container)) {
						const line = api.GetLine(modelID, container, false)
						containers.set(container, {
							expressID: container,
							typeLabel: typeLabelOf(container),
							name: line?.Name?.value || line?.LongName?.value || typeLabelOf(container),
						})
					}
					for (const element of relation.RelatedElements ?? []) {
						containerOf.set(element.value, container)
					}
				}
			} catch {
				// Without the spatial structure the elements are listed flat
			}
			return { elements, containerOf, containers }
		},

		async read(expressID) {
			if (!open) {
				return { sets: [] }
			}
			const sets = []
			const attributes = []
			const line = api.GetLine(modelID, expressID, false)
			for (const key of ATTRIBUTES) {
				const value = formatValue(line?.[key])
				if (value !== '') {
					attributes.push({ name: key, value })
				}
			}
			if (attributes.length > 0) {
				sets.push({ name: t('threedviewer', 'Attributes'), fromType: false, properties: attributes })
			}
			for (const [fromType, includeTypes] of [[false, false], [true, true]]) {
				let found = []
				try {
					found = await api.properties.getPropertySets(modelID, expressID, false, includeTypes)
				} catch {
					// A type that lists no property sets makes web-ifc throw: nothing from it
				}
				for (const set of found.slice(0, MAX_SETS)) {
					const read = readSet(set, fromType)
					if (read) {
						sets.push(read)
					}
				}
			}
			return { sets }
		},

		dispose() {
			if (open) {
				open = false
				try { api.CloseModel(modelID) } catch { /* already closed */ }
			}
		},
	}
}
