/**
 * Send to Slicer exports the live model, render mode and all; it draws its file inside
 * withOwnMaterials, so what the slicer gets is the model's own materials.
 */
import * as THREE from 'three'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { useRenderMode } from '../../../src/composables/useRenderMode.js'
import { ownMaterialOf, withOwnMaterials } from '../../../src/utils/materialStandIns.js'

function model() {
	const group = new THREE.Group()
	const own = new THREE.MeshPhongMaterial({ name: 'Bracket_Steel' })
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(), own)
	group.add(mesh)
	return { group, mesh, own }
}

it.each(['clay', 'normals', 'xray'])('an OBJ written in %s mode names the part\'s own material', (m) => {
	const { group, mesh, own } = model()
	const rm = useRenderMode()
	rm.init(group)
	rm.setMode(m)
	const standIn = mesh.material

	const obj = withOwnMaterials(group, () => new OBJExporter().parse(group))

	expect(obj).toContain('usemtl Bracket_Steel')
	expect(mesh.material).toBe(standIn)
	expect(ownMaterialOf(mesh)).toBe(own)
})

it('returns what the callback returns, and gives the stand-ins back when it throws', () => {
	const { group, mesh } = model()
	const rm = useRenderMode()
	rm.init(group)
	rm.setMode('clay')
	const standIn = mesh.material

	expect(withOwnMaterials(group, () => 42)).toBe(42)
	expect(() => withOwnMaterials(group, () => { throw new Error('boom') })).toThrow('boom')
	expect(mesh.material).toBe(standIn)
})

it('forgets a mesh once its mode is gone', () => {
	const { group, mesh, own } = model()
	const rm = useRenderMode()
	rm.init(group)
	rm.setMode('normals')
	rm.setMode('standard')
	expect(mesh.material).toBe(own)
	expect(ownMaterialOf(mesh)).toBe(own)
	rm.dispose()
})
