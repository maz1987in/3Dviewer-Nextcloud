/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * View in AR on Android Chrome and other WebXR browsers: a live `immersive-ar` session.
 * The camera shows through, a ring follows the floor (WebXR hit-test), a tap on the floor
 * puts the open model there at its real size, and a tap somewhere else moves it. A tap
 * goes where the finger touched; where the browser cannot say what is under a finger, it
 * goes where the ring is. Loaded when the button is pressed.
 *
 * The model is not moved out of the viewer's scene. The scene itself is scaled to metres
 * and moved to the spot, and put back when the session ends, so every tool that holds the
 * model finds it where it left it. Everything else in the scene (grid, axes, lights,
 * markers, gizmos) is hidden for the session, and the model is lit by lights of its own.
 */

import {
	Box3,
	DirectionalLight,
	HemisphereLight,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	Quaternion,
	RingGeometry,
	Vector3,
} from 'three'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { logger } from '../utils/logger.js'

const UP = new Vector3(0, 1, 0)

/** Radii of the ring that follows the floor, in metres. */
const RETICLE = Object.freeze({ inner: 0.12, outer: 0.15 })

/**
 * @param {?HTMLElement} overlay - The page's own controls, shown over the camera
 * @return {object} What `navigator.xr.requestSession('immersive-ar', …)` is asked for
 */
export function sessionInit(overlay) {
	return {
		requiredFeatures: ['hit-test'],
		// Without it the session still runs; the Exit button is then the browser's own
		optionalFeatures: ['dom-overlay'],
		domOverlay: { root: overlay },
	}
}

/**
 * Where the scene goes so the model stands on the spot the person tapped, at real size.
 *
 * The model's bottom centre is put on the spot, and it is turned about the upright so
 * its front (+Z, as glTF has it) faces the person. The box is the model's, taken while
 * the scene was as the viewer has it.
 *
 * @param {THREE.Box3} box - The model's bounds, in scene units
 * @param {number} scale - Metres a scene unit is
 * @param {THREE.Vector3} spot - The spot on the floor, in metres
 * @param {number} [yaw] - How far to turn the model about the upright, in radians
 * @return {{position: THREE.Vector3, quaternion: THREE.Quaternion}} What the scene is set to
 */
export function scenePlacement(box, scale, spot, yaw = 0) {
	const quaternion = new Quaternion().setFromAxisAngle(UP, yaw)
	const centre = box.getCenter(new Vector3())
	// The model's bottom centre, in scene units, and where scale and turn take it
	const anchor = new Vector3(centre.x, box.min.y, centre.z).multiplyScalar(scale).applyQuaternion(quaternion)
	return { position: spot.clone().sub(anchor), quaternion }
}

/**
 * The turn that faces the model's front at someone.
 *
 * @param {THREE.Vector3} spot - Where the model stands
 * @param {?THREE.Vector3} viewer - Where the person's head is
 * @return {number} Radians about the upright; 0 when there is no head to face
 */
export function yawToward(spot, viewer) {
	return viewer ? Math.atan2(viewer.x - spot.x, viewer.z - spot.z) : 0
}

/**
 * The controls shown over the camera: a line saying what to do, and Exit AR. Hidden until
 * the session starts. A tap on them is not a tap on the floor.
 *
 * @param {Document} doc - The page
 * @param {Function} onExit - Called when Exit AR is pressed
 * @return {{root: HTMLElement, setHint: Function}} The element, and a way to change the line
 */
export function createOverlay(doc, onExit) {
	const root = doc.createElement('div')
	root.setAttribute('role', 'region')
	root.setAttribute('aria-label', t('threedviewer', 'View in AR'))
	root.style.cssText = 'display: none; position: absolute; inset: 0; pointer-events: none; font-family: var(--font-face, sans-serif);'
	// A tap on a control is not a select: the model would move under the finger
	root.addEventListener('beforexrselect', (event) => event.preventDefault())

	const hint = doc.createElement('p')
	hint.setAttribute('role', 'status')
	hint.style.cssText = 'position: absolute; left: 16px; right: 16px; bottom: max(24px, env(safe-area-inset-bottom)); margin: 0; padding: 12px 16px; border-radius: var(--border-radius-large, 12px); background: rgba(0, 0, 0, 0.7); color: #fff; text-align: center; font-size: 16px; line-height: 1.4; pointer-events: none;'

	const exit = doc.createElement('button')
	exit.type = 'button'
	exit.textContent = t('threedviewer', 'Exit AR')
	exit.style.cssText = 'position: absolute; top: max(16px, env(safe-area-inset-top)); right: 16px; min-width: 44px; min-height: 44px; padding: 0 20px; border: 2px solid #fff; border-radius: var(--border-radius-element, 22px); background: rgba(0, 0, 0, 0.7); color: #fff; font-size: 16px; font-weight: bold; pointer-events: auto; cursor: pointer;'
	exit.addEventListener('click', onExit)

	root.append(hint, exit)
	return { root, setHint: (text) => { hint.textContent = text } }
}

/**
 * Start the session and take the scene over for it. Must be called in the tap that
 * asked for it: the browser asks for a session only in answer to one.
 *
 * @param {object} options - Options
 * @param {THREE.WebGLRenderer} options.renderer - The viewer's renderer, with `xr` enabled
 * @param {THREE.Scene} options.scene - The viewer's scene
 * @param {THREE.Object3D} options.model - The open model, in the scene
 * @param {number} options.metresPerUnit - Metres a scene unit is (utils/viewInAr.js)
 * @param {Function} options.renderFrame - Draws a frame, as the viewer's loop does: (time) => void
 * @param {Function} options.onEnd - Called once the session is over and the scene is back
 * @param {THREE.Camera} [options.camera] - The viewer's camera. The session moves it to
 *   the phone's place in the room on every frame and the browser leaves it there, so it
 *   is put back where the viewer had it.
 * @param {object} [options.xr] - `navigator.xr`
 * @param {Document} [options.doc] - The page
 * @return {Promise<{end: Function}>} The running session
 * @throws {Error} When the browser refuses the session, or it fails to come up; the scene
 *   is as it was
 */
export async function startArSession({ renderer, scene, model, metresPerUnit, renderFrame, onEnd, camera = null, xr = navigator.xr, doc = document }) {
	const overlay = createOverlay(doc, () => session?.end())
	doc.body.appendChild(overlay.root)

	let session = null
	try {
		session = await xr.requestSession('immersive-ar', sessionInit(overlay.root))
	} catch (error) {
		overlay.root.remove()
		throw error
	}

	// What the session changes, to put back
	const kept = {
		background: scene.background,
		fog: scene.fog,
		position: scene.position.clone(),
		quaternion: scene.quaternion.clone(),
		scale: scene.scale.clone(),
		modelVisible: model.visible,
		hidden: [],
		camera: camera && {
			position: camera.position.clone(),
			quaternion: camera.quaternion.clone(),
			scale: camera.scale.clone(),
		},
	}
	const added = []
	let hitTestSource = null
	let touchSource = null
	let cleaned = false
	let announced = false

	const cleanup = () => {
		if (cleaned) return
		cleaned = true
		hitTestSource?.cancel?.()
		touchSource?.cancel?.()
		renderer.setAnimationLoop(null)
		added.forEach((object) => {
			scene.remove(object)
			object.geometry?.dispose?.()
			object.material?.dispose?.()
			object.dispose?.()
		})
		kept.hidden.forEach(([object, visible]) => { object.visible = visible })
		model.visible = kept.modelVisible
		scene.background = kept.background
		scene.fog = kept.fog
		scene.position.copy(kept.position)
		scene.quaternion.copy(kept.quaternion)
		scene.scale.copy(kept.scale)
		scene.updateMatrix()
		scene.updateMatrixWorld(true)
		if (kept.camera) {
			camera.position.copy(kept.camera.position)
			camera.quaternion.copy(kept.camera.quaternion)
			camera.scale.copy(kept.camera.scale)
			camera.updateMatrixWorld(true)
		}
		renderer.xr.setReferenceSpaceType('local-floor')
		overlay.root.remove()
	}

	session.addEventListener('end', () => {
		cleanup()
		if (announced) {
			announced = false
			logger.info('ar', 'AR session ended')
			onEnd()
		}
	})

	try {
		// The model's bounds as the viewer has it, before the scene is moved: a tap puts
		// its bottom centre on the spot
		scene.updateMatrixWorld(true)
		const box = new Box3().setFromObject(model)
		if (box.isEmpty()) {
			throw new Error('The model has nothing to place')
		}

		renderer.xr.setReferenceSpaceType('local')
		await renderer.xr.setSession(session)
		const viewerSpace = await session.requestReferenceSpace('viewer')
		hitTestSource = await session.requestHitTestSource({ space: viewerSpace })
		// What is under a finger on the screen, so a tap places the model there and not only
		// where the ring is. Optional: without it, a tap goes to the ring.
		try {
			touchSource = await session.requestHitTestSourceForTransientInput?.({ profile: 'generic-touchscreen' }) ?? null
		} catch (error) {
			logger.warn('ar', 'No hit test for touches; a tap places the model at the ring', error)
			touchSource = null
		}

		scene.background = null
		scene.fog = null
		scene.children.forEach((child) => {
			if (child !== model) {
				kept.hidden.push([child, child.visible])
				child.visible = false
			}
		})

		const lights = [new HemisphereLight(0xffffff, 0x8d8d8d, 1.8), new DirectionalLight(0xffffff, 1.4)]
		lights[1].position.set(1, 2, 1)
		const reticle = new Mesh(
			new RingGeometry(RETICLE.inner, RETICLE.outer, 40).rotateX(-Math.PI / 2),
			new MeshBasicMaterial({ color: 0xffffff }),
		)
		reticle.name = 'ar-reticle'
		reticle.matrixAutoUpdate = false
		reticle.visible = false
		reticle.frustumCulled = false
		// The light's target is in the scene, so the light turns and scales with it
		const extras = [...lights, lights[1].target, reticle]
		extras.forEach((object) => { scene.add(object); added.push(object) })

		// Until the first tap there is nothing to see but the ring
		model.visible = false

		const hit = new Matrix4()
		const spot = new Vector3()
		// The floor under each finger now on the screen, from the last frame. A select comes
		// between frames, and its own frame cannot be asked for hit results.
		const touched = new Map()
		const viewer = new Vector3()
		const sceneInverse = new Matrix4()
		let hasHit = false
		let hasViewer = false
		let placed = false
		let hinted = ''

		const say = (key, text) => {
			if (hinted !== key) {
				hinted = key
				overlay.setHint(text)
			}
		}
		say('looking', t('threedviewer', 'Move your phone slowly to find the floor.'))

		const onSelect = (event) => {
			const target = touched.get(event?.inputSource) ?? (hasHit ? spot : null)
			if (!target) return
			const { position, quaternion } = scenePlacement(box, metresPerUnit, target, yawToward(target, hasViewer ? viewer : null))
			scene.scale.setScalar(metresPerUnit)
			scene.position.copy(position)
			scene.quaternion.copy(quaternion)
			scene.updateMatrix()
			sceneInverse.copy(scene.matrix).invert()
			model.visible = true
			placed = true
			say('placed', t('threedviewer', 'Placed at real size. Tap somewhere else to move it.'))
		}
		session.addEventListener('select', onSelect)

		const onFrame = (frame) => {
			if (!frame) return
			const space = renderer.xr.getReferenceSpace()
			const viewerPose = space ? frame.getViewerPose(space) : null
			hasViewer = !!viewerPose
			if (viewerPose) {
				const { x, y, z } = viewerPose.transform.position
				viewer.set(x, y, z)
			}
			touched.clear()
			if (space && touchSource && frame.getHitTestResultsForTransientInput) {
				for (const { inputSource, results } of frame.getHitTestResultsForTransientInput(touchSource)) {
					const touchPose = results[0]?.getPose(space)
					if (touchPose) {
						touched.set(inputSource, new Vector3().setFromMatrixPosition(new Matrix4().fromArray(touchPose.transform.matrix)))
					}
				}
			}
			const result = space ? frame.getHitTestResults(hitTestSource)[0] : null
			const pose = result?.getPose(space)
			hasHit = !!pose
			reticle.visible = hasHit
			if (pose) {
				hit.fromArray(pose.transform.matrix)
				spot.setFromMatrixPosition(hit)
				// The ring is drawn in the scene, which is scaled and moved once placed
				reticle.matrix.copy(sceneInverse).multiply(hit)
				reticle.matrixWorldNeedsUpdate = true
				if (!placed) {
					say('found', t('threedviewer', 'Tap to place the model.'))
				}
			} else if (!placed) {
				say('looking', t('threedviewer', 'Move your phone slowly to find the floor.'))
			}
		}

		renderer.setAnimationLoop((time, frame) => {
			onFrame(frame)
			renderFrame(time)
		})
		overlay.root.style.display = ''
		announced = true
		logger.info('ar', 'AR session started', { metresPerUnit })
	} catch (error) {
		cleanup()
		try {
			await session.end()
		} catch {
			// Already over
		}
		throw error
	}

	return { end: () => session.end() }
}
