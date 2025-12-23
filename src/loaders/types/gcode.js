import * as THREE from 'three'
import { BaseLoader } from '../BaseLoader.js'

/**
 * G-code loader class for CNC/3D printing toolpath visualization
 */
class GCodeLoader extends BaseLoader {

	constructor() {
		super('GCodeLoader', ['gcode', 'gco', 'nc', 'acode', 'gx', 'g', 'g3drem', 'makerbot', 'thing'])
		this.loader = null
	}

	/**
	 * Load G-code file
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		// Check if this is a binary format
		const isBinary = this.detectBinaryFormat(arrayBuffer)

		let text
		if (isBinary) {
			// Try to extract text from binary format
			text = this.extractTextFromBinary(arrayBuffer)
			if (!text) {
				throw new Error('Binary G-code format not supported. Please export as plain .gcode format from your slicer.')
			}
		} else {
			// Decode as plain text G-code
			text = new TextDecoder('utf-8').decode(arrayBuffer)
		}

		if (!text || text.trim().length === 0) {
			throw new Error('Empty G-code file')
		}

		// Parse the G-code and generate geometry
		const { geometries, layers } = this.parseGCode(text)

		if (geometries.length === 0) {
			if (isBinary) {
				throw new Error('Could not extract G-code commands from binary format. Please export as plain .gcode format.')
			}
			throw new Error('No valid G-code movement commands found. File may be empty or use unsupported G-code dialect.')
		}

		// Create a group to hold all line segments
		const gcodeGroup = new THREE.Group()
		gcodeGroup.name = 'GCodeToolpath'

		// Resolve color mode options from context
		const colorMode = context?.gcodeOptions?.colorMode === 'single' ? 'single' : 'gradient'
		const singleColor = context?.gcodeOptions?.singleColor || '#ff5722'

		// Add each layer with appropriate coloring
		geometries.forEach((geometry, index) => {
			let color
			if (colorMode === 'single') {
				color = new THREE.Color(singleColor)
			} else {
				const hue = (index / layers.length) * 360
				color = new THREE.Color().setHSL(hue / 360, 0.8, 0.5)
			}

			const material = new THREE.LineBasicMaterial({
				color,
				linewidth: 2,
				transparent: true,
				opacity: 0.9,
			})

			const line = new THREE.Line(geometry, material)
			line.name = `Layer_${index + 1}`
			gcodeGroup.add(line)
		})

		this.logInfo('G-code loaded successfully', {
			lines: text.split('\n').length,
			layers: layers.length,
			segments: geometries.reduce((sum, geo) => sum + (geo.attributes.position?.count || 0), 0),
		})

		// Process the result
		return this.processModel(gcodeGroup, context)
	}

	/**
	 * Parse G-code text and extract movement commands
	 * @param {string} text - G-code content
	 * @return {object} Parsed geometries and layer information
	 */
	parseGCode(text) {
		const lines = text.split('\n')
		const geometries = []
		const layers = []

		let currentX = 0
		let currentY = 0
		let currentZ = 0
		let currentLayer = 0
		let lastZ = null

		let currentLayerPositions = []

		// Parse each line
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim()

			// Skip empty lines and comments
			if (!line || line.startsWith(';') || line.startsWith('(')) {
				continue
			}

			// Remove inline comments
			const cleanLine = line.split(';')[0].trim()

			// Parse G-code command
			const command = this.parseCommand(cleanLine)

			if (!command) {
				continue
			}

			// Handle movement commands
			if (command.type === 'G0' || command.type === 'G1') {
				const newX = command.x !== undefined ? command.x : currentX
				const newY = command.y !== undefined ? command.y : currentY
				const newZ = command.z !== undefined ? command.z : currentZ

				// Check for layer change (Z movement)
				if (newZ !== lastZ && lastZ !== null) {
					// New layer detected, save current layer
					if (currentLayerPositions.length > 0) {
						const geometry = new THREE.BufferGeometry()
						geometry.setAttribute('position',
							new THREE.Float32BufferAttribute(currentLayerPositions, 3))
						geometries.push(geometry)
						layers.push({ z: lastZ, points: currentLayerPositions.length / 3 })
						currentLayerPositions = []
					}
					currentLayer++
				}

				// Add line segment if there's movement
				if (newX !== currentX || newY !== currentY || newZ !== currentZ) {
					// Add start point
					currentLayerPositions.push(currentX, currentZ, -currentY) // Convert to Y-up
					// Add end point
					currentLayerPositions.push(newX, newZ, -newY)
				}

				currentX = newX
				currentY = newY
				currentZ = newZ
				lastZ = newZ
			}
		}

		// Add final layer
		if (currentLayerPositions.length > 0) {
			const geometry = new THREE.BufferGeometry()
			geometry.setAttribute('position',
				new THREE.Float32BufferAttribute(currentLayerPositions, 3))
			geometries.push(geometry)
			layers.push({ z: currentZ, points: currentLayerPositions.length / 3 })
		}

		return { geometries, layers }
	}

	/**
	 * Parse a single G-code command line
	 * @param {string} line - G-code command line
	 * @return {object|null} Parsed command object
	 */
	parseCommand(line) {
		if (!line) return null

		// Extract command type (G0, G1, etc.)
		const commandMatch = line.match(/^([GM]\d+)/)
		if (!commandMatch) return null

		const type = commandMatch[1]
		const command = { type }

		// Extract X, Y, Z coordinates
		const xMatch = line.match(/X([-+]?\d*\.?\d+)/)
		const yMatch = line.match(/Y([-+]?\d*\.?\d+)/)
		const zMatch = line.match(/Z([-+]?\d*\.?\d+)/)
		const eMatch = line.match(/E([-+]?\d*\.?\d+)/) // Extrusion
		const fMatch = line.match(/F([-+]?\d*\.?\d+)/) // Feed rate

		if (xMatch) command.x = parseFloat(xMatch[1])
		if (yMatch) command.y = parseFloat(yMatch[1])
		if (zMatch) command.z = parseFloat(zMatch[1])
		if (eMatch) command.e = parseFloat(eMatch[1])
		if (fMatch) command.f = parseFloat(fMatch[1])

		return command
	}

	/**
	 * Detect if this is a binary G-code format
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @return {boolean} True if binary format detected
	 */
	detectBinaryFormat(arrayBuffer) {
		const header = new Uint8Array(arrayBuffer.slice(0, 16))

		// Check for known binary signatures (e.g., Prusa-style "GCOD" headers)
		if (header[0] === 0x47 && header[1] === 0x43 && header[2] === 0x4F && header[3] === 0x44) { // "GCOD"
			return true
		}

		// Check for high ratio of non-printable characters (likely binary)
		const sample = new Uint8Array(arrayBuffer.slice(0, Math.min(1024, arrayBuffer.byteLength)))
		let nonPrintable = 0
		for (let i = 0; i < sample.length; i++) {
			const byte = sample[i]
			// Count bytes that aren't typical text characters
			if ((byte < 32 || byte > 126) && byte !== 10 && byte !== 13 && byte !== 9) {
				nonPrintable++
			}
		}

		// If more than 30% non-printable, likely binary
		return (nonPrintable / sample.length) > 0.3
	}

	/**
	 * Attempt to extract text from binary G-code format
	 * @param {ArrayBuffer} arrayBuffer - Binary file data
	 * @return {string|null} Extracted text or null if failed
	 */
	extractTextFromBinary(arrayBuffer) {
		// For now, try to find ASCII G-code commands in the binary data
		const data = new Uint8Array(arrayBuffer)
		const chunks = []
		let currentChunk = []
		const MAX_CHUNK_SIZE = 1000 // Prevent stack overflow with fromCharCode

		for (let i = 0; i < data.length; i++) {
			const byte = data[i]
			// Collect printable ASCII and newlines
			if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13) {
				currentChunk.push(byte)

				// Process chunk if it gets too large
				if (currentChunk.length >= MAX_CHUNK_SIZE) {
					chunks.push(String.fromCharCode.apply(null, currentChunk))
					currentChunk = []
				}
			} else if (currentChunk.length > 10) {
				// End of text chunk
				chunks.push(String.fromCharCode.apply(null, currentChunk))
				currentChunk = []
			} else {
				// Reset if chunk too small
				currentChunk = []
			}
		}

		// Add final chunk
		if (currentChunk.length > 10) {
			chunks.push(String.fromCharCode.apply(null, currentChunk))
		}

		const extracted = chunks.join('\n')

		// Verify we found G-code commands
		if (extracted.match(/[GM]\d+/)) {
			return extracted
		}

		return null
	}

}

// Export the class as default so the registry can instantiate it
export default GCodeLoader
