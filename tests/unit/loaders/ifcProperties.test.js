/**
 * An IFC element's properties, as the Parts panel shows them: how web-ifc's wrapped values
 * are written out, which of a property's fields is its value, and that an element's
 * property sets (and those of its type) are read from the lines that belong to it.
 */
import { formatValue, openIfcProperties, propertyRow } from '../../../src/loaders/ifcProperties.js'
import { createIfcApi, ifcTypeLabel } from '../../../src/loaders/ifcRuntime.js'

// The WASM build is not loaded here
jest.mock('web-ifc', () => ({ IfcAPI: class {}, IFCRELCONTAINEDINSPATIALSTRUCTURE: 1 }))
jest.mock('../../../src/loaders/ifcRuntime.js', () => ({
	...jest.requireActual('../../../src/loaders/ifcRuntime.js'),
	createIfcApi: jest.fn(),
}))

const wrap = (value, name = 'IFCLABEL') => ({ value, type: 1, name })

describe('ifcTypeLabel', () => {
	it('writes a class name in words', () => {
		expect(ifcTypeLabel('IfcWall')).toBe('Wall')
		expect(ifcTypeLabel('IfcBuildingElementProxy')).toBe('Building Element Proxy')
		expect(ifcTypeLabel('IFCWALLSTANDARDCASE')).toBe('Wallstandardcase')
		expect(ifcTypeLabel('')).toBe('')
		expect(ifcTypeLabel(undefined)).toBe('')
	})
})

describe('values', () => {
	it('unwraps what web-ifc wraps a value in', () => {
		expect(formatValue(wrap('2HR'))).toBe('2HR')
		expect(formatValue({ type: 3, name: 'IFCBOOLEAN', value: true })).toBe('Yes')
		expect(formatValue({ type: 3, name: 'IFCBOOLEAN', value: false })).toBe('No')
		expect(formatValue(wrap(0.30000000000000004, 'IFCREAL'))).toBe('0.3')
		expect(formatValue(null)).toBe('')
		expect(formatValue(undefined)).toBe('')
		expect(formatValue([wrap('a'), wrap('b')])).toBe('a, b')
	})

	it('reads the value of a single value, a quantity and an enumeration', () => {
		expect(propertyRow({ Name: wrap('FireRating'), NominalValue: wrap('2HR') })).toEqual({ name: 'FireRating', value: '2HR' })
		expect(propertyRow({ Name: wrap('Length'), LengthValue: wrap(4, 'IFCLENGTHMEASURE') })).toEqual({ name: 'Length', value: '4' })
		expect(propertyRow({ Name: wrap('Finish'), EnumerationValues: [wrap('Matte'), wrap('Smooth')] })).toEqual({ name: 'Finish', value: 'Matte, Smooth' })
		expect(propertyRow({ Name: wrap('Range'), LowerBoundValue: wrap(1, 'IFCREAL'), UpperBoundValue: wrap(5, 'IFCREAL') })).toEqual({ name: 'Range', value: '1 – 5' })
	})

	it('leaves out a property with no name or no value', () => {
		expect(propertyRow({ Name: wrap('Empty'), NominalValue: null })).toBeNull()
		expect(propertyRow({ NominalValue: wrap('x') })).toBeNull()
		expect(propertyRow(null)).toBeNull()
	})
})

describe('describing the elements', () => {
	const fakeModel = () => {
		const lines = {
			26: { Name: wrap('North wall'), GlobalId: wrap('g26') },
			30: { Name: null, GlobalId: wrap('g30') },
			17: { Name: wrap('Level 1') },
			60: { Name: wrap('Rel') , RelatingStructure: { value: 17 }, RelatedElements: [{ value: 26 }, { value: 30 }] },
		}
		const types = { 26: 'IfcWall', 30: 'IfcBuildingElementProxy', 17: 'IfcBuildingStorey' }
		return {
			OpenModel: jest.fn().mockReturnValue(7),
			CloseModel: jest.fn(),
			GetLine: jest.fn((model, id) => lines[id]),
			GetLineType: jest.fn((model, id) => id),
			GetNameFromTypeCode: jest.fn((id) => types[id]),
			GetLineIDsWithType: jest.fn(() => ({ size: () => 1, get: () => 60 })),
			properties: { getPropertySets: jest.fn(async () => []) },
		}
	}

	it('names each element and its type, and says which storey holds it', async () => {
		createIfcApi.mockResolvedValue(fakeModel())
		const reader = await openIfcProperties({ arrayBuffer: async () => new ArrayBuffer(8) })

		const { elements, containerOf, containers } = reader.describe([26, 30])

		expect(elements.get(26)).toEqual({ expressID: 26, typeLabel: 'Wall', name: 'North wall', globalId: 'g26' })
		expect(elements.get(30)).toEqual({ expressID: 30, typeLabel: 'Building Element Proxy', name: '', globalId: 'g30' })
		expect(containerOf.get(26)).toBe(17)
		expect(containers.get(17)).toEqual({ expressID: 17, typeLabel: 'Building Storey', name: 'Level 1' })
	})

	it('reads only the elements it is asked about, and the relations, not every line', async () => {
		const api = fakeModel()
		createIfcApi.mockResolvedValue(api)
		const reader = await openIfcProperties({ arrayBuffer: async () => new ArrayBuffer(8) })
		reader.describe([26])
		// The element, the one relation and its storey
		expect(api.GetLine).toHaveBeenCalledTimes(3)
	})

	it('lists the elements flat when the file\'s spatial structure cannot be read', async () => {
		const api = fakeModel()
		api.GetLineIDsWithType.mockImplementation(() => { throw new Error('unsupported') })
		createIfcApi.mockResolvedValue(api)
		const reader = await openIfcProperties({ arrayBuffer: async () => new ArrayBuffer(8) })
		const { elements, containerOf } = reader.describe([26])
		expect(elements.get(26).name).toBe('North wall')
		expect(containerOf.size).toBe(0)
	})
})

describe('reading an element', () => {
	/** A web-ifc stand-in with the lines of the test fixture's wall */
	const fakeApi = () => {
		const lines = {
			26: { Name: wrap('North wall'), Description: wrap('Exterior wall'), ObjectType: null, Tag: null },
			32: { Name: wrap('FireRating'), NominalValue: wrap('2HR') },
			33: { Name: wrap('IsExternal'), NominalValue: { type: 3, value: true } },
			40: { Name: wrap('Width'), LengthValue: wrap(0.2, 'IFCLENGTHMEASURE') },
		}
		const psets = [{ Name: wrap('Pset_WallCommon'), HasProperties: [{ value: 32 }, { value: 33 }] }]
		const typePsets = [{ Name: wrap('Pset_TypeCommon'), HasProperties: [{ value: 40 }] }, { Name: wrap('Empty'), HasProperties: [] }]
		return {
			OpenModel: jest.fn().mockReturnValue(7),
			CloseModel: jest.fn(),
			GetLine: jest.fn((model, id) => lines[id]),
			properties: {
				getPropertySets: jest.fn(async (model, id, recursive, includeTypes) => (includeTypes ? typePsets : psets)),
			},
		}
	}

	const file = () => ({ arrayBuffer: async () => new ArrayBuffer(8) })

	it('lists its attributes and its property sets, and those of its type', async () => {
		const api = fakeApi()
		createIfcApi.mockResolvedValue(api)

		const reader = await openIfcProperties(file())
		const result = await reader.read(26)

		expect(api.OpenModel).toHaveBeenCalledTimes(1)
		expect(result.sets).toEqual([
			{ name: 'Attributes', fromType: false, properties: [{ name: 'Description', value: 'Exterior wall' }] },
			{ name: 'Pset_WallCommon', fromType: false, properties: [{ name: 'FireRating', value: '2HR' }, { name: 'IsExternal', value: 'Yes' }] },
			// A set with nothing in it is not listed
			{ name: 'Pset_TypeCommon', fromType: true, properties: [{ name: 'Width', value: '0.2' }] },
		])
	})

	it('opens the file once however many elements are read, and frees it once', async () => {
		const api = fakeApi()
		createIfcApi.mockResolvedValue(api)
		const reader = await openIfcProperties(file())

		await reader.read(26)
		await reader.read(26)
		expect(api.OpenModel).toHaveBeenCalledTimes(1)

		reader.dispose()
		reader.dispose()
		expect(api.CloseModel).toHaveBeenCalledTimes(1)
		expect(await reader.read(26)).toEqual({ sets: [] })
	})

	it('still lists the instance\'s sets when web-ifc throws for its type', async () => {
		const api = fakeApi()
		api.properties.getPropertySets.mockImplementation(async (model, id, recursive, includeTypes) => {
			if (includeTypes) throw new TypeError('t.HasPropertySets is not iterable')
			return [{ Name: wrap('Pset_WallCommon'), HasProperties: [{ value: 32 }] }]
		})
		createIfcApi.mockResolvedValue(api)
		const reader = await openIfcProperties(file())
		const { sets } = await reader.read(26)
		expect(sets.map((set) => set.name)).toEqual(['Attributes', 'Pset_WallCommon'])
	})
})
