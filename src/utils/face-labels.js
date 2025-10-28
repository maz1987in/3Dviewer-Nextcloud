/**
 * Face labels utility
 * Creates text labels for cube faces (TOP, BOTTOM, FRONT, BACK, LEFT, RIGHT)
 */

import * as THREE from 'three'
import { logger } from './logger.js'

/**
 * Create a text sprite with the given text
 * @param {string} text - Text to display
 * @param {object} options - Sprite options
 * @return {THREE.Sprite} Text sprite
 */
function createTextSprite(text, options = {}) {
	const {
		fontFace = 'Arial',
		fontSize = 64,
		fontWeight = 'bold',
		textColor = '#ffffff',
		backgroundColor = 'rgba(0, 0, 0, 0.7)',
		borderColor = '#00ff00',
		borderThickness = 4,
		padding = 20,
	} = options

	// Create canvas
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('2d')

	// Set font to measure text
	context.font = `${fontWeight} ${fontSize}px ${fontFace}`
	const metrics = context.measureText(text)
	const textWidth = metrics.width

	// Set canvas size with padding
	canvas.width = textWidth + padding * 2 + borderThickness * 2
	canvas.height = fontSize + padding * 2 + borderThickness * 2

	// Reset font after resizing canvas
	context.font = `${fontWeight} ${fontSize}px ${fontFace}`
	context.textAlign = 'center'
	context.textBaseline = 'middle'

	// Draw background
	context.fillStyle = backgroundColor
	context.fillRect(0, 0, canvas.width, canvas.height)

	// Draw border
	context.strokeStyle = borderColor
	context.lineWidth = borderThickness
	context.strokeRect(
		borderThickness / 2,
		borderThickness / 2,
		canvas.width - borderThickness,
		canvas.height - borderThickness,
	)

	// Draw text
	context.fillStyle = textColor
	context.fillText(text, canvas.width / 2, canvas.height / 2)

	// Create texture from canvas
	const texture = new THREE.CanvasTexture(canvas)
	texture.needsUpdate = true

	// Create sprite material
	const spriteMaterial = new THREE.SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false,
		depthWrite: false,
	})

	// Create sprite
	const sprite = new THREE.Sprite(spriteMaterial)

	// Scale sprite to maintain aspect ratio
	const aspect = canvas.width / canvas.height
	const scale = options.scale || 1
	sprite.scale.set(aspect * scale, 1 * scale, 1)

	return sprite
}

/**
 * Create face labels for a cube
 * @param {object} options - Label options
 * @return {THREE.Group} Group containing all face labels
 */
export function createFaceLabels(options = {}) {
	const {
		size = 2,
		offset = 0.1,
		scale = 1,
		showTop = true,
		showBottom = true,
		showFront = true,
		showBack = true,
		showLeft = true,
		showRight = true,
	} = options

	const group = new THREE.Group()
	group.name = 'FaceLabels'

	const halfSize = size / 2
	const labelDistance = halfSize + offset

	// TOP face
	if (showTop) {
		const topLabel = createTextSprite('TOP', {
			...options,
			scale,
			borderColor: '#ff0000',
		})
		topLabel.position.set(0, labelDistance, 0)
		topLabel.name = 'TopLabel'
		group.add(topLabel)
	}

	// BOTTOM face
	if (showBottom) {
		const bottomLabel = createTextSprite('BOTTOM', {
			...options,
			scale,
			borderColor: '#ff00ff',
		})
		bottomLabel.position.set(0, -labelDistance, 0)
		bottomLabel.name = 'BottomLabel'
		group.add(bottomLabel)
	}

	// FRONT face
	if (showFront) {
		const frontLabel = createTextSprite('FRONT', {
			...options,
			scale,
			borderColor: '#00ff00',
		})
		frontLabel.position.set(0, 0, labelDistance)
		frontLabel.name = 'FrontLabel'
		group.add(frontLabel)
	}

	// BACK face
	if (showBack) {
		const backLabel = createTextSprite('BACK', {
			...options,
			scale,
			borderColor: '#0000ff',
		})
		backLabel.position.set(0, 0, -labelDistance)
		backLabel.name = 'BackLabel'
		group.add(backLabel)
	}

	// LEFT face
	if (showLeft) {
		const leftLabel = createTextSprite('LEFT', {
			...options,
			scale,
			borderColor: '#ffff00',
		})
		leftLabel.position.set(-labelDistance, 0, 0)
		leftLabel.name = 'LeftLabel'
		group.add(leftLabel)
	}

	// RIGHT face
	if (showRight) {
		const rightLabel = createTextSprite('RIGHT', {
			...options,
			scale,
			borderColor: '#00ffff',
		})
		rightLabel.position.set(labelDistance, 0, 0)
		rightLabel.name = 'RightLabel'
		group.add(rightLabel)
	}

	logger.info('FaceLabels', 'Face labels created', {
		labelCount: group.children.length,
		size,
		scale,
	})

	return group
}

/**
 * Create face labels for a model's bounding box
 * @param {THREE.Object3D} model - Model to label
 * @param {object} options - Label options
 * @return {THREE.Group} Group containing all face labels
 */
export function createModelFaceLabels(model, options = {}) {
	if (!model) {
		logger.warn('FaceLabels', 'No model provided for face labels')
		return null
	}

	// Calculate bounding box
	const box = new THREE.Box3().setFromObject(model)
	const size = box.getSize(new THREE.Vector3())
	const center = box.getCenter(new THREE.Vector3())

	const maxDim = Math.max(size.x, size.y, size.z)
	const avgDim = (size.x + size.y + size.z) / 3

	// Create labels scaled to model size
	const labelGroup = createFaceLabels({
		...options,
		size: maxDim,
		scale: avgDim * 0.15, // Scale labels based on model size
		offset: maxDim * 0.05, // Offset based on model size
	})

	// Position label group at model center
	labelGroup.position.copy(center)

	logger.info('FaceLabels', 'Model face labels created', {
		modelSize: { x: size.x, y: size.y, z: size.z },
		center: { x: center.x, y: center.y, z: center.z },
		maxDim,
	})

	return labelGroup
}

/**
 * Create a reference cube with face labels
 * @param {object} options - Cube options
 * @return {THREE.Group} Group containing cube and labels
 */
export function createLabeledCube(options = {}) {
	const {
		size = 2,
		cubeColor = 0x808080,
		opacity = 0.3,
		wireframe = false,
		showCube = true,
	} = options

	const group = new THREE.Group()
	group.name = 'LabeledCube'

	// Create cube geometry
	if (showCube) {
		const geometry = new THREE.BoxGeometry(size, size, size)
		const material = new THREE.MeshStandardMaterial({
			color: cubeColor,
			transparent: true,
			opacity,
			wireframe,
			side: THREE.DoubleSide,
		})
		const cube = new THREE.Mesh(geometry, material)
		cube.name = 'ReferenceCube'
		group.add(cube)
	}

	// Create face labels
	const labels = createFaceLabels({ ...options, size })
	group.add(labels)

	logger.info('FaceLabels', 'Labeled cube created', { size, showCube })

	return group
}

/**
 * Update face label visibility
 * @param {THREE.Group} labelGroup - Label group
 * @param {object} visibility - Visibility settings
 */
export function updateLabelVisibility(labelGroup, visibility = {}) {
	if (!labelGroup) return

	const {
		top = true,
		bottom = true,
		front = true,
		back = true,
		left = true,
		right = true,
	} = visibility

	labelGroup.traverse((child) => {
		if (child.name === 'TopLabel') child.visible = top
		if (child.name === 'BottomLabel') child.visible = bottom
		if (child.name === 'FrontLabel') child.visible = front
		if (child.name === 'BackLabel') child.visible = back
		if (child.name === 'LeftLabel') child.visible = left
		if (child.name === 'RightLabel') child.visible = right
	})

	logger.info('FaceLabels', 'Label visibility updated', visibility)
}

/**
 * Remove face labels from scene
 * @param {THREE.Scene} scene - Scene to remove labels from
 */
export function removeFaceLabels(scene) {
	if (!scene) return

	const labelsToRemove = []
	scene.traverse((child) => {
		if (child.name === 'FaceLabels' || child.name === 'LabeledCube') {
			labelsToRemove.push(child)
		}
	})

	labelsToRemove.forEach((label) => {
		scene.remove(label)
		// Dispose of resources
		label.traverse((child) => {
			if (child.material) {
				if (child.material.map) child.material.map.dispose()
				child.material.dispose()
			}
			if (child.geometry) {
				child.geometry.dispose()
			}
		})
	})

	logger.info('FaceLabels', 'Face labels removed', { count: labelsToRemove.length })
}
