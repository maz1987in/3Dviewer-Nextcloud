/**
 * Exploded view composable
 * Animates multi-mesh models outward from their common centroid
 */

import { ref, shallowRef, computed } from 'vue'
import { Vector3, Box3 } from 'three'
import { logger } from '../utils/logger.js'

export function useExplodedView() {
	const isActive = ref(false)
	const factor = ref(0) // 0 = assembled, 1 = fully exploded
	const meshData = ref([]) // { mesh, originalPos, direction }
	const modelRef = shallowRef(null)
	const centroid = new Vector3()

	const hasMeshes = computed(() => meshData.value.length > 1)

	/**
	 * Collect all meshes and compute explosion directions from centroid
	 * @param {THREE.Object3D} model
	 */
	const init = (model) => {
		if (!model) return
		modelRef.value = model

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
			return
		}

		// Compute centroid of all mesh centers
		centroid.set(0, 0, 0)
		const box = new Box3()
		const meshCenter = new Vector3()

		const entries = meshes.map((mesh) => {
			box.setFromObject(mesh)
			box.getCenter(meshCenter)
			return {
				mesh,
				center: meshCenter.clone(),
				originalPos: mesh.position.clone(),
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
		meshData.value.forEach(({ mesh, originalPos, direction }) => {
			mesh.position.set(
				originalPos.x + direction.x * factor.value,
				originalPos.y + direction.y * factor.value,
				originalPos.z + direction.z * factor.value,
			)
		})
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
		dispose,
	}
}
