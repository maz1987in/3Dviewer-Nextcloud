/**
 * Exploded view composable
 * Animates multi-mesh models outward from their common centroid
 *
 * Each part's own position is recorded in the registry of what viewer tools move
 * (viewerTransforms) before it is first moved, so a thumbnail, and an export, can put
 * the parts back together.
 */

import { ref, shallowRef, computed } from 'vue'
import { Vector3, Box3 } from 'three'
import { logger } from '../utils/logger.js'
import { ownTransformOf, rememberOwnTransform } from '../utils/viewerTransforms.js'

export function useExplodedView() {
	const isActive = ref(false)
	const factor = ref(0) // 0 = assembled, 1 = fully exploded
	const meshData = ref([]) // { mesh, originalPos, direction }
	const modelRef = shallowRef(null)
	const centroid = new Vector3()
	// How many exports have the parts put back together: two at once must both finish
	// before the model explodes again
	let suspended = 0

	const hasMeshes = computed(() => meshData.value.length > 1)

	/**
	 * Collect all meshes and compute explosion directions from centroid
	 * @param {THREE.Object3D} model
	 */
	const init = (model) => {
		if (!model) return
		modelRef.value = model
		// An export still running holds the model it started with; this one is shown
		suspended = 0

		// Collect all meshes
		const meshes = []
		model.traverse((child) => {
			if (child.isMesh) {
				meshes.push(child)
			}
		})

		if (meshes.length < 2) {
			logger.info('useExplodedView', 'Model has fewer than 2 meshes, exploded view not useful')
			meshData.value = []
			// Nothing to take apart: the tool goes off rather than stay on with no effect
			isActive.value = false
			factor.value = 0
			return
		}

		// Compute centroid of all mesh centers
		centroid.set(0, 0, 0)
		const box = new Box3()
		const meshCenter = new Vector3()

		const entries = meshes.map((mesh) => {
			// Where the model puts the part, whatever moved it since
			rememberOwnTransform(mesh)
			const originalPos = ownTransformOf(mesh).position.clone()
			box.setFromObject(mesh)
			box.getCenter(meshCenter)
			return {
				mesh,
				center: meshCenter.clone(),
				originalPos,
			}
		})

		// Average of all mesh centers = model centroid
		entries.forEach((e) => centroid.add(e.center))
		centroid.divideScalar(entries.length)

		// Compute model size for scaling explosion distance
		const modelBox = new Box3().setFromObject(model)
		const modelSize = modelBox.getSize(new Vector3())
		const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z) || 1

		// For each mesh, compute direction from centroid and scale by model size
		meshData.value = entries.map((e) => {
			const direction = new Vector3().subVectors(e.center, centroid)
			const dist = direction.length()
			// Normalise direction; if mesh is at centroid, push it along a random axis
			if (dist < 0.001) {
				direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
			}
			direction.normalize()
			// Scale explosion distance proportional to model size
			direction.multiplyScalar(maxDim * 0.8)
			return {
				mesh: e.mesh,
				originalPos: e.originalPos,
				direction,
			}
		})

		// A view left exploded stays exploded for the next model, by the same amount, as
		// the panel shows it
		if (isActive.value) {
			applyExplosion()
		}

		logger.info('useExplodedView', 'Initialized', { meshCount: meshData.value.length })
	}

	/**
	 * Set the explosion factor and move meshes
	 * @param {number} newFactor 0..1
	 */
	const setFactor = (newFactor) => {
		factor.value = Math.max(0, Math.min(1, newFactor))
		applyExplosion()
	}

	/**
	 * Apply current factor to mesh positions
	 */
	const applyExplosion = () => {
		// While an export has the parts together, the slider moves nothing until it ends
		const amount = suspended > 0 ? 0 : factor.value
		meshData.value.forEach(({ mesh, originalPos, direction }) => {
			mesh.position.set(
				originalPos.x + direction.x * amount,
				originalPos.y + direction.y * amount,
				originalPos.z + direction.z * amount,
			)
		})
	}

	/**
	 * Put the parts back together for a while (an export written asynchronously, say)
	 * without leaving exploded view; `resume` explodes them again by the current amount.
	 */
	const suspend = () => {
		if (suspended++ === 0) {
			applyExplosion()
		}
	}

	const resume = () => {
		if (suspended === 0) {
			return
		}
		if (--suspended === 0) {
			applyExplosion()
		}
	}

	/**
	 * Toggle exploded view on/off
	 */
	const toggle = () => {
		if (!hasMeshes.value) return
		isActive.value = !isActive.value
		if (!isActive.value) {
			// Reset to assembled
			factor.value = 0
			applyExplosion()
		} else {
			// Default to half-exploded
			factor.value = 0.5
			applyExplosion()
		}
		logger.info('useExplodedView', 'Toggled', { active: isActive.value })
	}

	/**
	 * Clean up and reset positions
	 */
	const dispose = () => {
		// Restore original positions
		meshData.value.forEach(({ mesh, originalPos }) => {
			mesh.position.copy(originalPos)
		})
		meshData.value = []
		modelRef.value = null
		isActive.value = false
		factor.value = 0
		logger.info('useExplodedView', 'Disposed')
	}

	return {
		isActive,
		factor,
		hasMeshes,
		init,
		setFactor,
		toggle,
		suspend,
		resume,
		dispose,
	}
}
